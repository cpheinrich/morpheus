import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ClaudeTranscript } from "./claude.js";
import { CodexTranscript } from "./codex.js";
/** Parse `--since`. Returns null for a malformed date so the caller can refuse it. */
export function sinceMs(since) {
    if (since === undefined)
        return undefined;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since);
    if (!m)
        return null;
    const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    // `Date` rolls an impossible day over — 2026-02-30 becomes March 2 — so the
    // parsed fields must read back unchanged, or the date did not exist.
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day)
        return null;
    return d.getTime();
}
async function list(dir) {
    try {
        return (await readdir(dir)).sort();
    }
    catch {
        return [];
    }
}
async function walkJsonl(dir, out) {
    let entries;
    try {
        entries = await readdir(dir, { withFileTypes: true });
    }
    catch {
        return;
    }
    for (const e of entries) {
        const p = join(dir, e.name);
        if (e.isDirectory())
            await walkJsonl(p, out);
        else if (e.isFile() && e.name.endsWith(".jsonl"))
            out.push(p);
    }
}
/**
 * `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, plus subagents at
 * `<encoded-cwd>/<session>/subagents/agent-<id>.jsonl` with a sibling
 * `.meta.json` naming the agent type and the description it was given.
 */
export async function discoverClaude(root) {
    const files = [];
    const issues = [];
    for (const project of await list(root)) {
        const projectDir = join(root, project);
        for (const entry of await list(projectDir)) {
            if (entry.endsWith(".jsonl")) {
                files.push({ path: join(projectDir, entry) });
                continue;
            }
            const subDir = join(projectDir, entry, "subagents");
            for (const sub of await list(subDir)) {
                if (!sub.endsWith(".jsonl"))
                    continue;
                const agentId = sub.replace(/^agent-/, "").replace(/\.jsonl$/, "");
                const metaPath = join(subDir, sub.replace(/\.jsonl$/, ".meta.json"));
                let meta = {};
                try {
                    meta = JSON.parse(await readFile(metaPath, "utf8"));
                }
                catch (error) {
                    if (error.code !== "ENOENT") {
                        issues.push({ file: metaPath, line: null, message: "unreadable subagent meta" });
                    }
                }
                files.push({
                    path: join(subDir, sub),
                    subagent: {
                        parentSessionId: entry,
                        agentId,
                        agentType: typeof meta.agentType === "string" ? meta.agentType : null,
                        description: typeof meta.description === "string" ? meta.description : null,
                    },
                });
            }
        }
    }
    return { files, issues };
}
async function streamLines(path, push) {
    const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
    for await (const line of rl)
        push(line);
}
async function modifiedSince(path, from) {
    if (from === undefined)
        return true;
    try {
        return (await stat(path)).mtimeMs >= from;
    }
    catch {
        return false;
    }
}
function keep(session, from, repo) {
    if (from !== undefined && (session.start === null || Date.parse(session.start) < from))
        return false;
    if (repo) {
        // The working directory stands in only when no repository could be derived from it.
        const subject = session.repo ?? session.cwd ?? "";
        if (!subject.toLowerCase().includes(repo.toLowerCase()))
            return false;
    }
    return true;
}
/**
 * Read every transcript under the two providers' directories and return
 * session and span rows. A file not modified since `since` cannot hold a
 * session that started after it, so it is skipped unread.
 */
export async function extract(options = {}) {
    const home = options.home ?? homedir();
    const from = sinceMs(options.since) ?? undefined;
    const roots = options.roots ?? [];
    const result = { sessions: [], spans: [], issues: [], files: 0 };
    const accept = (parsed) => {
        result.issues.push(...parsed.issues);
        if (parsed.session && keep(parsed.session, from, options.repo)) {
            result.sessions.push(parsed.session);
            result.spans.push(...parsed.spans);
        }
    };
    const claude = await discoverClaude(options.claudeDir ?? join(home, ".claude", "projects"));
    result.issues.push(...claude.issues);
    for (const f of claude.files) {
        if (!(await modifiedSince(f.path, from)))
            continue;
        result.files++;
        const t = new ClaudeTranscript({ file: f.path, subagent: f.subagent, roots, home });
        try {
            await streamLines(f.path, (l) => t.push(l));
        }
        catch (error) {
            result.issues.push({ file: f.path, line: null, message: `unreadable: ${error.message}` });
            continue;
        }
        accept(t.finish());
    }
    const codexFiles = [];
    await walkJsonl(options.codexDir ?? join(home, ".codex", "sessions"), codexFiles);
    for (const path of codexFiles.sort()) {
        if (!(await modifiedSince(path, from)))
            continue;
        result.files++;
        const t = new CodexTranscript({ file: path, roots, home });
        try {
            await streamLines(path, (l) => t.push(l));
        }
        catch (error) {
            result.issues.push({ file: path, line: null, message: `unreadable: ${error.message}` });
            continue;
        }
        accept(t.finish());
    }
    return result;
}
export function toJsonl(rows) {
    return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}
//# sourceMappingURL=extract.js.map