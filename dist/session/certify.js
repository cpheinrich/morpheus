import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
import { contentLines, mergeRanges, readEvidence, runnerSession, subtractRanges, } from "./evidence.js";
const exec = promisify(execFile);
/** Every checkout of this repository: evidence is about content, not about which checkout held it. */
async function checkouts(root) {
    try {
        const { stdout } = await exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: root, timeout: 15_000, env: gitSubprocessEnv() });
        const paths = stdout.split("\0").filter((f) => f.startsWith("worktree ")).map((f) => f.slice("worktree ".length));
        return [...new Set([root, ...paths])];
    }
    catch {
        return [root];
    }
}
/**
 * Decide the mode, and gather this session's evidence from every checkout of
 * the repository.
 *
 * Evidence is keyed by record id and content fingerprint, so a record read in
 * the primary checkout is read in the task worktree `pm claim` prepares at the
 * same trunk — requiring a second 35k-token read of identical content is the
 * waste this item exists to remove.
 */
export async function evidenceMode(root, env = process.env) {
    if (env["MORPHEUS_READ_EVIDENCE"] === "off")
        return { kind: "override" };
    const runner = runnerSession(env);
    if (!runner) {
        return { kind: "unhooked", reason: "this process is not a Claude Code or Codex session the read hook can identify" };
    }
    const reads = [];
    let live = false;
    let malformed = 0;
    for (const checkout of await checkouts(root)) {
        const log = await readEvidence(checkout);
        malformed += log.malformed;
        for (const entry of log.entries) {
            if (entry.session !== runner.tag)
                continue;
            if (entry.kind === "live")
                live = true;
            else
                reads.push(entry);
        }
    }
    if (!live) {
        return {
            kind: "unhooked",
            reason: "no read hook has recorded a tool result in this session — the project may not wire it, " +
                "a Codex hook may be untrusted, or hooks changed after the session started",
        };
    }
    return { kind: "recorded", provider: runner.provider, reads, malformed };
}
/**
 * Line hunks from `before` to `after`, from Git's own diff.
 *
 * Considered `diff` (jsdiff): maintained, zero dependencies. Git is already a
 * hard dependency of every session command and its Myers diff is the one the
 * agent will see in review, so this adds no package. Null when Git cannot
 * answer — the caller then asks for the whole record rather than guessing
 * that nothing changed.
 */
export async function changedHunks(before, after) {
    const dir = await mkdtemp(join(tmpdir(), "morpheus-delta-"));
    try {
        await writeFile(join(dir, "a"), before, "utf8");
        await writeFile(join(dir, "b"), after, "utf8");
        let out;
        try {
            const result = await exec("git", ["diff", "--no-index", "--no-color", "--no-ext-diff", "--unified=0", "--", "a", "b"], { cwd: dir, timeout: 15_000, env: gitSubprocessEnv(), maxBuffer: 64 * 1024 * 1024 });
            out = result.stdout;
        }
        catch (error) {
            // `--no-index` exits 1 when the files differ, which is the case here.
            const failure = error;
            if (failure.code !== 1 || typeof failure.stdout !== "string")
                return null;
            out = failure.stdout;
        }
        const hunks = [];
        let current = null;
        for (const line of out.split("\n")) {
            const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
            if (header) {
                const start = Number(header[1]);
                const count = header[2] === undefined ? 1 : Number(header[2]);
                // A pure deletion reports the line *before* it on the new side.
                current = count === 0 ? { from: start + 1, to: start, removed: [] } : { from: start, to: start + count - 1, removed: [] };
                hunks.push(current);
                continue;
            }
            if (current && line.startsWith("-") && !line.startsWith("---"))
                current.removed.push(line.slice(1));
        }
        return hunks;
    }
    finally {
        await rm(dir, { recursive: true, force: true });
    }
}
/**
 * Per record, what must be covered by read evidence at its current content.
 *
 * Unchanged since `previous` → nothing. Changed, with the previous content in
 * the snapshot → the changed hunks. Otherwise → the whole record. Records with
 * no content are skipped: they are unresolvable, which the lease reports, and
 * no amount of reading clears them.
 */
export async function requirements(previous, snapshot, current, reads) {
    const out = [];
    for (const record of current) {
        if (record.content === null)
            continue;
        const before = previous?.inputs.find((i) => i.id === record.id)?.fingerprint;
        if (before !== undefined && before === record.fingerprint)
            continue;
        const lines = contentLines(record.content).length;
        const old = before === undefined ? undefined : snapshot.get(record.id);
        const hunks = old && old.fingerprint === before ? await changedHunks(old.content, record.content) : null;
        const needed = hunks
            ? mergeRanges(hunks.filter((h) => h.to >= h.from).map(({ from, to }) => ({ from, to })))
            : lines > 0 ? [{ from: 1, to: lines }] : [];
        const covered = reads
            .filter((r) => r.record === record.id && r.fingerprint === record.fingerprint)
            .map(({ from, to }) => ({ from, to }));
        out.push({
            id: record.id,
            lines,
            reason: hunks ? "changed" : "full",
            needed,
            missing: subtractRanges(needed, covered),
            ...(hunks ? { hunks } : {}),
        });
    }
    return out;
}
/**
 * The content a receipt was taken on, so the next refresh can diff against it.
 * Beside the lease, local and ignored, overwritten with each receipt.
 */
export function snapshotPath(root, leaseId) {
    return join(root, "local", "sessions", `${leaseId}.records.json`);
}
export async function readSnapshot(root, leaseId) {
    const map = new Map();
    let parsed;
    try {
        parsed = JSON.parse(await readFile(snapshotPath(root, leaseId), "utf8"));
    }
    catch {
        return map;
    }
    const records = parsed?.records;
    if (parsed?.v !== 1 || !Array.isArray(records))
        return map;
    for (const r of records) {
        if (r && typeof r.id === "string" && typeof r.fingerprint === "string" && typeof r.content === "string") {
            map.set(r.id, { fingerprint: r.fingerprint, content: r.content });
        }
    }
    return map;
}
export async function writeSnapshot(root, leaseId, records) {
    const path = snapshotPath(root, leaseId);
    await mkdir(dirname(path), { recursive: true });
    const body = { v: 1, records: records.filter((r) => r.content !== null) };
    const staging = `${path}.${process.pid}.tmp`;
    await writeFile(staging, JSON.stringify(body) + "\n", "utf8");
    await rename(staging, path);
}
//# sourceMappingURL=certify.js.map