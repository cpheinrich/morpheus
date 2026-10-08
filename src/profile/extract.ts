import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { ClaudeTranscript, type ParsedSession, type SubagentMeta } from "./claude.js";
import { CodexTranscript } from "./codex.js";
import type { ProfileIssue, ProfileRow, SessionRow, SpanRow } from "./types.js";

export interface ExtractOptions {
  /** `YYYY-MM-DD`; sessions that started before local midnight of this day are skipped. */
  since?: string;
  /** Substring matched against each session's repo and cwd. */
  repo?: string;
  claudeDir?: string;
  codexDir?: string;
  roots?: string[];
  home?: string;
}

export interface Extraction {
  sessions: SessionRow[];
  spans: SpanRow[];
  issues: ProfileIssue[];
  files: number;
}

/** Parse `--since`. Returns null for a malformed date so the caller can refuse it. */
export function sinceMs(since: string | undefined): number | null | undefined {
  if (since === undefined) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const t = new Date(`${since}T00:00:00`).getTime();
  return Number.isNaN(t) ? null : t;
}

async function list(dir: string): Promise<string[]> {
  try {
    return (await readdir(dir)).sort();
  } catch {
    return [];
  }
}

async function walkJsonl(dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await walkJsonl(p, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
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

async function streamLines(path: string, push: (line: string) => void): Promise<void> {
  const rl = createInterface({ input: createReadStream(path, { encoding: "utf8" }), crlfDelay: Infinity });
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
  if (repo && !`${session.repo ?? ""}\u0000${session.cwd ?? ""}`.toLowerCase().includes(repo.toLowerCase())) return false;
  return true;
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
  const result: Extraction = { sessions: [], spans: [], issues: [], files: 0 };

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

  const codexFiles: string[] = [];
  await walkJsonl(options.codexDir ?? join(home, ".codex", "sessions"), codexFiles);
  for (const path of codexFiles.sort()) {
    if (!(await modifiedSince(path, from))) continue;
    result.files++;
    const t = new CodexTranscript({ file: path, roots, home });
    try {
      await streamLines(path, (l) => t.push(l));
    } catch (error) {
      result.issues.push({ file: path, line: null, message: `unreadable: ${(error as Error).message}` });
      continue;
    }
    accept(t.finish());
  }

  return result;
}

export function toJsonl(rows: ProfileRow[]): string {
  return rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : "");
}
