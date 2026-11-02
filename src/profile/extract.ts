import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { pipeline, type Readable } from "node:stream";
// A namespace import, not a named one: zstd arrived in Node 22.15, and a named import of an export
// an older runtime lacks fails the whole module at link time instead of one file at read time.
import * as zlib from "node:zlib";
import { ClaudeTranscript, type ParsedSession, type SubagentMeta } from "./claude.js";
import { CodexTranscript } from "./codex.js";
import type { ProfileIssue, ProfileRow, SessionRow, SessionSource, SpanRow } from "./types.js";

export interface ExtractOptions {
  /** `YYYY-MM-DD`; sessions that started before local midnight of this day are skipped. */
  since?: string;
  /**
   * Substring of each session's derived repository name, case-insensitive. Not
   * matched against the path: every task worktree sits under
   * `.morpheus-worktrees/` and every scratchpad under a path naming its parent
   * project, so `--repo morpheus` would otherwise pull in all of them.
   */
  repo?: string;
  claudeDir?: string;
  /** Live Codex rollouts, `~/.codex/sessions/YYYY/MM/DD/`. */
  codexDir?: string;
  /** Archived Codex rollouts, `~/.codex/archived_sessions/`, a flat directory. */
  codexArchivedDir?: string;
  roots?: string[];
  home?: string;
}

export interface Extraction {
  sessions: SessionRow[];
  spans: SpanRow[];
  issues: ProfileIssue[];
  files: number;
  /** Extra copies of a kept Codex session found in a second file, each counted once. */
  duplicates: number;
}

/** Parse `--since`. Returns null for a malformed date so the caller can refuse it. */
export function sinceMs(since: string | undefined): number | null | undefined {
  if (since === undefined) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(since);
  if (!m) return null;
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
  // `Date` rolls an impossible day over — 2026-02-30 becomes March 2 — so the
  // parsed fields must read back unchanged, or the date did not exist.
  const d = new Date(year, month - 1, day);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return d.getTime();
}

async function list(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

/**
 * Codex compresses older rollouts in place to `.jsonl.zst`, under `sessions/` and in
 * `archived_sessions/` alike. Reading only `.jsonl` found zero Codex sessions for a fortnight that
 * an earlier run had found fourteen in: nothing was missing, it had only been compressed.
 */
const ROLLOUT = /\.jsonl(?:\.zst)?$/;

async function walkRollouts(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkRollouts(p, out);
    else if (e.isFile() && ROLLOUT.test(e.name)) out.push(p);
  }
}

interface ClaudeFile {
  path: string;
  subagent?: SubagentMeta;
}

/**
 * `~/.claude/projects/<encoded-cwd>/<session>.jsonl`, plus subagents at
 * `<encoded-cwd>/<session>/subagents/agent-<id>.jsonl` with a sibling
 * `.meta.json` naming the agent type and the description it was given.
 */
export async function discoverClaude(root: string): Promise<{ files: ClaudeFile[]; issues: ProfileIssue[] }> {
  const files: ClaudeFile[] = [];
  const issues: ProfileIssue[] = [];
  for (const project of await list(root)) {
    const projectDir = join(root, project);
    for (const entry of await list(projectDir)) {
      if (entry.endsWith(".jsonl")) {
        files.push({ path: join(projectDir, entry) });
        continue;
      }
      const subDir = join(projectDir, entry, "subagents");
      for (const sub of await list(subDir)) {
        if (!sub.endsWith(".jsonl")) continue;
        const agentId = sub.replace(/^agent-/, "").replace(/\.jsonl$/, "");
        const metaPath = join(subDir, sub.replace(/\.jsonl$/, ".meta.json"));
        let meta: Record<string, unknown> = {};
        try {
          meta = JSON.parse(await readFile(metaPath, "utf8")) as Record<string, unknown>;
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
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

function openText(path: string): Readable {
  if (!path.endsWith(".zst")) return createReadStream(path, { encoding: "utf8" });
  const decompress = (zlib as Partial<typeof zlib>).createZstdDecompress;
  if (!decompress) throw new Error(`zstd-compressed, and this Node (${process.version}) has no zstd; use Node 22.15 or later`);
  const text = decompress();
  // `pipeline`, not `pipe`: a read error on the file must reach the stream readline consumes, and
  // a corrupt frame must close the file. The error itself surfaces through readline.
  pipeline(createReadStream(path), text, () => {});
  return text.setEncoding("utf8");
}

async function streamLines(path: string, push: (line: string) => void): Promise<void> {
  const rl = createInterface({ input: openText(path), crlfDelay: Infinity });
  for await (const line of rl) push(line);
}

async function modifiedSince(path: string, from: number | undefined): Promise<boolean> {
  if (from === undefined) return true;
  try {
    return (await stat(path)).mtimeMs >= from;
  } catch {
    return false;
  }
}

function keep(session: SessionRow, from: number | undefined, repo: string | undefined): boolean {
  if (from !== undefined && (session.start === null || Date.parse(session.start) < from)) return false;
  if (repo) {
    // The working directory stands in only when no repository could be derived from it.
    const subject = session.repo ?? session.cwd ?? "";
    if (!subject.toLowerCase().includes(repo.toLowerCase())) return false;
  }
  return true;
}

/**
 * Which of two copies of one Codex session to keep: the one written last, then the one holding
 * more. A tie keeps the copy seen first, and live rollouts are read before archived ones.
 */
function fuller(candidate: SessionRow, incumbent: SessionRow): boolean {
  const end = (s: SessionRow) => (s.end === null ? -Infinity : Date.parse(s.end));
  if (end(candidate) !== end(incumbent)) return end(candidate) > end(incumbent);
  if (candidate.requests !== incumbent.requests) return candidate.requests > incumbent.requests;
  return candidate.toolCalls > incumbent.toolCalls;
}

/**
 * Read every transcript under the two providers' directories and return
 * session and span rows. A file not modified since `since` cannot hold a
 * session that started after it, so it is skipped unread.
 */
export async function extract(options: ExtractOptions = {}): Promise<Extraction> {
  const home = options.home ?? homedir();
  const from = sinceMs(options.since) ?? undefined;
  const roots = options.roots ?? [];
  const result: Extraction = { sessions: [], spans: [], issues: [], files: 0, duplicates: 0 };

  const accept = (parsed: ParsedSession) => {
    result.issues.push(...parsed.issues);
    if (parsed.session && keep(parsed.session, from, options.repo)) {
      result.sessions.push(parsed.session);
      result.spans.push(...parsed.spans);
    }
  };

  const claude = await discoverClaude(options.claudeDir ?? join(home, ".claude", "projects"));
  result.issues.push(...claude.issues);
  for (const f of claude.files) {
    if (!(await modifiedSince(f.path, from))) continue;
    result.files++;
    const t = new ClaudeTranscript({ file: f.path, subagent: f.subagent, roots, home });
    try {
      await streamLines(f.path, (l) => t.push(l));
    } catch (error) {
      result.issues.push({ file: f.path, line: null, message: `unreadable: ${(error as Error).message}` });
      continue;
    }
    accept(t.finish());
  }

  // A session can exist in both places — archived, then resumed — so copies are collected by id
  // before any is accepted, and each session is counted once.
  const codex = new Map<string, { parsed: ParsedSession; copies: number }>();
  const locations: Array<[string, Extract<SessionSource, `codex-${string}`>]> = [
    [options.codexDir ?? join(home, ".codex", "sessions"), "codex-sessions"],
    [options.codexArchivedDir ?? join(home, ".codex", "archived_sessions"), "codex-archived"],
  ];
  for (const [dir, source] of locations) {
    const files: string[] = [];
    await walkRollouts(dir, files);
    for (const path of files.sort()) {
      if (!(await modifiedSince(path, from))) continue;
      result.files++;
      const t = new CodexTranscript({ file: path, roots, home, source });
      try {
        await streamLines(path, (l) => t.push(l));
      } catch (error) {
        result.issues.push({ file: path, line: null, message: `unreadable: ${(error as Error).message}` });
        continue;
      }
      const parsed = t.finish();
      result.issues.push(...parsed.issues);
      if (!parsed.session) continue;
      const seen = codex.get(parsed.session.sessionId);
      if (!seen) codex.set(parsed.session.sessionId, { parsed, copies: 1 });
      else {
        seen.copies++;
        if (fuller(parsed.session, seen.parsed.session!)) seen.parsed = parsed;
      }
    }
  }
  for (const { parsed, copies } of codex.values()) {
    const kept = result.sessions.length;
    accept({ ...parsed, issues: [] });
    if (result.sessions.length > kept) result.duplicates += copies - 1;
  }

  return result;
}

export function toJsonl(rows: ProfileRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}
