import { access, readFile, realpath, stat } from "node:fs/promises";
import { dirname, isAbsolute, join, parse, resolve } from "node:path";
import { CANONICAL_INPUTS } from "./lease.js";
import { fingerprint, readRecords } from "./inputs.js";
import { projectPolicy } from "./policy.js";
import { appendEvidence, contentLines, creditRuns, readEvidence, sessionTag, } from "./evidence.js";
/**
 * The PostToolUse hook: append what this tool call showed the model of the
 * project's required records to `local/sessions/reads.jsonl`.
 *
 * It never prints and never fails the tool call — a hook error on every Read
 * would be noise in every session, and missing evidence already fails safe:
 * refresh asks for the read rather than certifying it.
 */
/**
 * Shell output past these sizes is not credited. Claude Code keeps ~30,000
 * characters of a large Bash result in `tool_response.stdout` while showing
 * the model a 2 KB persisted preview (measured in local transcripts: stdout
 * 29,620–29,984 characters beside previews of 1,326–2,396), so text near that
 * size is not evidence of anything the model saw. Codex truncates tool output
 * for the model on its own, smaller terms; its cap is lower and line-bounded.
 */
export const CLAUDE_TEXT_CAP_BYTES = 20_000;
export const OTHER_TEXT_CAP_BYTES = 8_000;
export const OTHER_TEXT_CAP_LINES = 200;
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;
const isObject = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const isCount = (n) => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
/**
 * Claude Code's Read result: `tool_response` is the tool's own output,
 * `{ type: "text", file: { filePath, content, startLine, numLines, totalLines } }`
 * — the same object transcripts record as `toolUseResult`. `content` is the raw
 * lines without numbering, so it can be compared to the file.
 */
export function fileRead(payload) {
    if (payload["tool_name"] !== "Read")
        return null;
    const input = isObject(payload["tool_input"]) ? payload["tool_input"] : {};
    const response = payload["tool_response"];
    const file = isObject(response) && isObject(response["file"]) ? response["file"] : null;
    const path = typeof file?.["filePath"] === "string" ? file["filePath"] : input["file_path"];
    if (typeof path !== "string" || !path)
        return null;
    if (file && typeof file["content"] === "string" && isCount(file["startLine"]) && isCount(file["numLines"])) {
        return { path, from: Math.max(1, file["startLine"]), count: file["numLines"], content: file["content"] };
    }
    // An image, PDF or notebook result is not lines of a record.
    if (isObject(response) && typeof response["type"] === "string" && response["type"] !== "text")
        return null;
    if (isObject(response) && file === null && "type" in response)
        return null;
    // A payload without the recorded shape still names the range it asked for.
    const offset = isCount(input["offset"]) ? input["offset"] : 1;
    const limit = isCount(input["limit"]) && input["limit"] > 0 ? input["limit"] : 2000;
    return { path, from: Math.max(1, offset), count: limit };
}
/**
 * Text a shell-like tool returned. Claude's Bash result is
 * `{ stdout, stderr, … }`; Codex's payload shape for its shell tools is not
 * documented, so the common spellings are accepted and anything else is
 * treated as not understood — which keeps the session on the old assertion
 * rather than refusing reads the hook could not see.
 */
export function outputText(response) {
    if (typeof response === "string")
        return response;
    if (!isObject(response))
        return null;
    for (const key of ["stdout", "output", "aggregated_output", "formatted_output"]) {
        if (typeof response[key] === "string")
            return response[key];
    }
    return null;
}
function withinCap(text, provider) {
    const bytes = Buffer.byteLength(text, "utf8");
    if (provider === "claude")
        return bytes <= CLAUDE_TEXT_CAP_BYTES;
    return bytes <= OTHER_TEXT_CAP_BYTES && contentLines(text).length <= OTHER_TEXT_CAP_LINES;
}
const exists = (path) => access(path).then(() => true, () => false);
/**
 * The Morpheus checkout containing `start`, without spawning Git — this runs
 * after every tool call. A worktree's `.git` is a file and a main checkout's a
 * directory; either marks the root.
 *
 * Only a checkout that ignores `local/` qualifies. The log must never become an
 * untracked file in a repository that did not opt into local session state.
 */
export async function projectRoot(start) {
    let dir;
    try {
        dir = await realpath(start);
        if (!(await stat(dir)).isDirectory())
            dir = dirname(dir);
    }
    catch {
        return null;
    }
    const top = parse(dir).root;
    for (;;) {
        if (await exists(join(dir, ".git")))
            break;
        if (dir === top)
            return null;
        dir = dirname(dir);
    }
    if (!(await exists(join(dir, "morpheus.json"))))
        return null;
    const ignore = await readFile(join(dir, ".gitignore"), "utf8").catch(() => "");
    const ignoresLocal = ignore.split("\n").some((l) => /^\/?local(\/\*?)?$/.test(l.trim()));
    return ignoresLocal ? dir : null;
}
async function requiredIds(root) {
    return (await projectPolicy(root)).requiredInputs ?? CANONICAL_INPUTS;
}
/** Evidence from one Read of a file, if that file is a required record. */
async function fromFileRead(read, cwd, session, at) {
    const absolute = isAbsolute(read.path) ? read.path : resolve(cwd, read.path);
    const target = await realpath(absolute).catch(() => null);
    if (!target)
        return { root: null, entries: [] };
    const root = await projectRoot(dirname(target));
    if (!root)
        return { root: null, entries: [] };
    const ids = await requiredIds(root);
    const entries = [];
    // `CLAUDE.md` is a symlink to `AGENTS.md`: reading either is reading the record.
    for (const record of await readRecords(root, ids)) {
        if (record.content === null)
            continue;
        if ((await realpath(join(root, record.id)).catch(() => null)) !== target)
            continue;
        const lines = contentLines(record.content);
        const from = read.from;
        const end = read.from + read.count - 1;
        // What the tool returned must be what is on disk now; otherwise the file
        // changed between the read and this hook, and the hash would vouch for
        // text the model never saw. Compared in the tool's own numbering: Claude
        // Code counts a trailing newline as one more, empty line, so a Read that
        // reaches end-of-file returns the text *with* its final newline and a
        // `totalLines` one above an editor's. Comparing editor-numbered lines
        // discarded every such Read — the whole-file read and, worst, the tail
        // where new records are appended.
        if (read.content !== undefined && record.content.split("\n").slice(from - 1, end).join("\n") !== read.content)
            continue;
        // Credit in an editor's numbering; the phantom last line is no line.
        const to = Math.min(lines.length, end);
        if (to < from)
            continue;
        entries.push({ v: 1, kind: "read", at, session, record: record.id, fingerprint: fingerprint(record.content), from, to, lines: lines.length, via: "Read" });
    }
    return { root, entries };
}
/** Evidence from text a shell-like tool returned, matched against every required record. */
async function fromText(text, root, session, at, via) {
    const output = contentLines(text);
    const entries = [];
    for (const record of await readRecords(root, await requiredIds(root))) {
        if (record.content === null)
            continue;
        const lines = contentLines(record.content);
        for (const run of creditRuns(lines, output)) {
            entries.push({ v: 1, kind: "read", at, session, record: record.id, fingerprint: record.fingerprint, from: run.from, to: run.to, lines: lines.length, via });
        }
    }
    return entries;
}
/**
 * Handle one hook payload. Returns what it appended, per checkout, for tests;
 * the CLI discards it.
 */
export async function recordRead(raw, now = new Date()) {
    const written = new Map();
    let payload;
    try {
        payload = JSON.parse(raw);
    }
    catch {
        return written;
    }
    if (!isObject(payload))
        return written;
    const id = payload["session_id"];
    if (typeof id !== "string" || !id)
        return written;
    const session = sessionTag(id);
    // `turn_id` is required in Codex's PostToolUse input and absent from Claude's.
    const provider = "turn_id" in payload ? "codex" : "claude";
    const cwd = typeof payload["cwd"] === "string" && payload["cwd"] ? payload["cwd"] : process.cwd();
    const at = now.toISOString();
    const add = (root, entries) => written.set(root, [...(written.get(root) ?? []), ...entries]);
    const cwdRoot = await projectRoot(cwd);
    // A failed Read showed the model an error, not the file.
    const failed = payload["hook_event_name"] === "PostToolUseFailure";
    const read = provider === "claude" && !failed ? fileRead(payload) : null;
    if (failed && payload["tool_name"] === "Read")
        return written;
    if (read) {
        const result = await fromFileRead(read, cwd, session, at);
        if (result.root)
            add(result.root, result.entries);
    }
    else {
        // Claude Code reports a shell command that exits non-zero as a failed
        // tool call: no `tool_response`, and the model is shown `error` instead —
        // which is where `context refresh` prints the lines it is refusing over.
        const text = payload["hook_event_name"] === "PostToolUseFailure"
            ? typeof payload["error"] === "string" ? payload["error"] : null
            : outputText(payload["tool_response"]);
        // Not understood: no liveness either. A hook that cannot see results must
        // leave the session on the assertion, not lock it out.
        if (text === null)
            return written;
        const via = typeof payload["tool_name"] === "string" ? payload["tool_name"].slice(0, 64) || "tool" : "tool";
        if (cwdRoot)
            add(cwdRoot, withinCap(text, provider) ? await fromText(text, cwdRoot, session, at, via) : []);
    }
    if (cwdRoot && !written.has(cwdRoot))
        add(cwdRoot, []);
    for (const [root, entries] of written) {
        const { entries: logged } = await readEvidence(root);
        const live = logged.some((e) => e.kind === "live" && e.session === session);
        const all = live ? entries : [{ v: 1, kind: "live", at, session, provider }, ...entries];
        written.set(root, all);
        await appendEvidence(root, all, now);
    }
    return written;
}
/** CLI entry: read the payload from stdin, record, and always exit 0. */
export async function runReadHook() {
    try {
        const chunks = [];
        let size = 0;
        for await (const chunk of process.stdin) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
            size += buffer.length;
            if (size > MAX_PAYLOAD_BYTES)
                return 0;
            chunks.push(buffer);
        }
        await recordRead(Buffer.concat(chunks).toString("utf8"));
    }
    catch {
        // Missing evidence fails toward a refusal that names the read; a hook
        // error would only add noise to the tool call it follows.
    }
    return 0;
}
//# sourceMappingURL=read-hook.js.map