import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Read evidence: what a provider's tool hook saw this session read.
 *
 * `context refresh` used to be the agent's bare assertion that it had read
 * the records, and transcripts showed agents taking it without reading —
 * `cat … >/dev/null && morpheus context refresh`. A hook that runs after each
 * Read or shell call appends what the model was actually shown, and refresh
 * certifies a record only where that log covers it at the record's current
 * content.
 *
 * Deliberately node builtins only: this module sits on the hook's hot path,
 * which runs after every Read and shell call in every session.
 */

/** Per-worktree and gitignored, beside the lease — local observation, never a shared claim. */
export const READS_LOG = join("local", "sessions", "reads.jsonl");

/** Past this size the log is rewritten keeping only recent entries. */
const LOG_CAP_BYTES = 256 * 1024;
const LOG_KEEP_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * A run of matched lines counts only once it carries this much text. Blank
 * lines and `---` appear everywhere; a run that short says nothing about
 * which record was on screen. Records smaller than this need the whole record.
 */
export const MIN_RUN_CHARS = 16;

export type Provider = "claude" | "codex";

/** 1-based, inclusive. */
export interface Range {
  from: number;
  to: number;
}

export interface ReadEntry {
  v: 1;
  kind: "read";
  at: string;
  /** `sessionTag` of the provider session id — hashed, never the raw id. */
  session: string;
  /** The required record's id, worktree-relative (`.agent/decisions.md`). */
  record: string;
  /** `fingerprint()` of the whole record at the moment it was read. */
  fingerprint: string;
  from: number;
  to: number;
  /** The record's line count at that fingerprint. */
  lines: number;
  via: string;
}

/**
 * The hook ran in this session **and understood a tool result**. Refresh
 * enforces evidence only once this exists: a hook that is wired but untrusted
 * (Codex), added mid-session (Claude snapshots hooks at start) or unable to
 * parse a provider's payload must degrade to the old assertion with a warning,
 * never lock a session out.
 */
export interface LiveEntry {
  v: 1;
  kind: "live";
  at: string;
  session: string;
  provider: Provider;
}

export type EvidenceEntry = ReadEntry | LiveEntry;

export function sessionTag(id: string): string {
  return createHash("sha256").update(id).digest("hex").slice(0, 16);
}

/**
 * Which provider session is running this process, from the environment each
 * provider exports to its shell tool. Claude Code sets `CLAUDECODE=1` and
 * `CLAUDE_CODE_SESSION_ID`; Codex sets `CODEX_THREAD_ID`. Null for a human
 * terminal or any other tool — refresh then falls back to the assertion.
 */
export function runnerSession(
  env: NodeJS.ProcessEnv = process.env,
): { provider: Provider; tag: string } | null {
  const claude = env["CLAUDE_CODE_SESSION_ID"];
  if (env["CLAUDECODE"] === "1" && claude) return { provider: "claude", tag: sessionTag(claude) };
  const codex = env["CODEX_THREAD_ID"];
  if (codex) return { provider: "codex", tag: sessionTag(codex) };
  return null;
}

/** A record's lines as an editor numbers them: a trailing newline ends the last line. */
export function contentLines(text: string): string[] {
  if (text === "") return [];
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;
const isText = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 512;

function asEntry(value: unknown): EvidenceEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const e = value as Record<string, unknown>;
  if (e["v"] !== 1 || !isText(e["at"]) || !isText(e["session"])) return null;
  if (e["kind"] === "live") {
    if (e["provider"] !== "claude" && e["provider"] !== "codex") return null;
    return { v: 1, kind: "live", at: e["at"], session: e["session"], provider: e["provider"] };
  }
  if (e["kind"] !== "read") return null;
  if (!isText(e["record"]) || !isText(e["fingerprint"]) || !isText(e["via"])) return null;
  const { from, to, lines } = e;
  if (!isCount(from) || !isCount(to) || !isCount(lines) || from < 1 || to < from || to > lines) return null;
  return {
    v: 1, kind: "read", at: e["at"], session: e["session"], record: e["record"],
    fingerprint: e["fingerprint"], from, to, lines, via: e["via"],
  };
}

/**
 * Parse the log, **counting** what could not be parsed rather than dropping it
 * in silence. A malformed line is missing evidence, which fails toward
 * refusing — but the refusal has to say the log was damaged, or the agent
 * re-reads a record whose evidence was there and unreadable.
 */
export function parseEvidence(text: string): { entries: EvidenceEntry[]; malformed: number } {
  const entries: EvidenceEntry[] = [];
  let malformed = 0;
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformed++;
      continue;
    }
    const entry = asEntry(parsed);
    if (entry) entries.push(entry);
    else malformed++;
  }
  return { entries, malformed };
}

export async function readEvidence(root: string): Promise<{ entries: EvidenceEntry[]; malformed: number }> {
  try {
    return parseEvidence(await readFile(join(root, READS_LOG), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { entries: [], malformed: 0 };
    // Unreadable is not empty: report it as damage so a refusal can say so.
    return { entries: [], malformed: 1 };
  }
}

/**
 * Append entries, pruning old ones once the log passes its cap. Appends are
 * single `write` calls well under the pipe-atomic size, so two hooks finishing
 * at once interleave whole lines rather than tearing one.
 */
export async function appendEvidence(root: string, entries: readonly EvidenceEntry[], now = new Date()): Promise<void> {
  if (!entries.length) return;
  const path = join(root, READS_LOG);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, entries.map((e) => JSON.stringify(e)).join("\n") + "\n", "utf8");
  const size = await stat(path).then((s) => s.size, () => 0);
  if (size <= LOG_CAP_BYTES) return;
  const { entries: kept } = parseEvidence(await readFile(path, "utf8"));
  const cutoff = now.getTime() - LOG_KEEP_MS;
  const recent = kept.filter((e) => Date.parse(e.at) >= cutoff);
  const staging = `${path}.${process.pid}.tmp`;
  await writeFile(staging, recent.map((e) => JSON.stringify(e)).join("\n") + (recent.length ? "\n" : ""), "utf8");
  await rename(staging, path);
}

/** Sort and coalesce ranges, joining adjacent ones (`1–3` and `4–6` are `1–6`). */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = [...ranges].filter((r) => r.to >= r.from).sort((a, b) => a.from - b.from || a.to - b.to);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.from <= last.to + 1) last.to = Math.max(last.to, r.to);
    else out.push({ ...r });
  }
  return out;
}

/** What of `needed` is not inside `covered`. */
export function subtractRanges(needed: readonly Range[], covered: readonly Range[]): Range[] {
  const have = mergeRanges(covered);
  const missing: Range[] = [];
  for (const want of mergeRanges(needed)) {
    let cursor = want.from;
    for (const c of have) {
      if (c.to < cursor) continue;
      if (c.from > want.to) break;
      if (c.from > cursor) missing.push({ from: cursor, to: Math.min(c.from - 1, want.to) });
      cursor = Math.max(cursor, c.to + 1);
      if (cursor > want.to) break;
    }
    if (cursor <= want.to) missing.push({ from: cursor, to: want.to });
  }
  return missing;
}

export function formatRanges(ranges: readonly Range[]): string {
  return ranges.map((r) => (r.from === r.to ? `${r.from}` : `${r.from}–${r.to}`)).join(", ");
}

const nonSpace = (line: string): number => line.replace(/\s/g, "").length;

/**
 * Which of a record's lines appear, verbatim and in order, in text a tool
 * returned — credit by **content**, not by parsing the command.
 *
 * Parsing shell commands for `>/dev/null`, `| head`, `| wc` would be a guess
 * about what reached the model; the tool's own output is the answer. A
 * discarded or truncated read leaves nothing to match, so it earns nothing,
 * and `cat -n`/`grep -n` prefixes do not match either — conservative in the
 * direction that costs a re-read rather than a false certification.
 *
 * Runs start only at non-blank lines (blank lines repeat everywhere and would
 * make this quadratic) and then extend backwards over matching blank lines, so
 * a record's blank lines are still creditable as part of a real run.
 */
export function creditRuns(recordLines: readonly string[], outputLines: readonly string[]): Range[] {
  if (!recordLines.length || !outputLines.length) return [];
  const at = new Map<string, number[]>();
  recordLines.forEach((line, i) => {
    if (!line.trim()) return;
    const list = at.get(line);
    if (list) list.push(i);
    else at.set(line, [i]);
  });
  const total = recordLines.reduce((n, l) => n + nonSpace(l), 0);
  const threshold = Math.min(MIN_RUN_CHARS, total);

  const runs: Range[] = [];
  // Per diagonal (output index minus record index), the last output line a
  // found run already covers — so a run is measured once, from its first
  // non-blank line, not again from every line inside it.
  const covered = new Map<number, number>();
  for (let i = 0; i < outputLines.length; i++) {
    const starts = at.get(outputLines[i]!);
    if (!starts) continue;
    for (const j of starts) {
      if ((covered.get(i - j) ?? -1) >= i) continue;
      let end = 0;
      while (i + end < outputLines.length && j + end < recordLines.length && outputLines[i + end] === recordLines[j + end]) end++;
      let back = 0;
      while (i - back - 1 >= 0 && j - back - 1 >= 0 && !recordLines[j - back - 1]!.trim() && outputLines[i - back - 1] === recordLines[j - back - 1]) back++;
      covered.set(i - j, i + end - 1);
      const from = j - back;
      const to = j + end - 1;
      let chars = 0;
      for (let k = from; k <= to; k++) chars += nonSpace(recordLines[k]!);
      if (chars >= threshold && chars > 0) runs.push({ from: from + 1, to: to + 1 });
    }
  }
  return mergeRanges(runs);
}
