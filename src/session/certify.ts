import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
import type { ContextReceipt } from "./lease.js";
import type { RecordContent } from "./inputs.js";
import {
  contentLines,
  mergeRanges,
  readEvidence,
  runnerSession,
  subtractRanges,
  type Provider,
  type Range,
  type ReadEntry,
} from "./evidence.js";

const exec = promisify(execFile);

/**
 * How `context refresh` certifies reading in this process.
 *
 * - `recorded` — a read hook has run in this provider session and understood
 *   its results, so a record is certified only where the log covers it.
 * - `unhooked` — no hook can be shown to be watching (a human terminal, a tool
 *   without hooks, a project without them, a Codex hook not yet trusted).
 *   Refresh falls back to the old assertion and says so.
 * - `override` — `MORPHEUS_READ_EVIDENCE=off`, the declared escape for a hook
 *   that runs but cannot see a read. The receipt records `asserted`.
 */
export type EvidenceMode =
  | { kind: "recorded"; provider: Provider; reads: ReadEntry[]; malformed: number }
  | { kind: "unhooked"; reason: string }
  | { kind: "override" };

/** Every checkout of this repository: evidence is about content, not about which checkout held it. */
async function checkouts(root: string): Promise<string[]> {
  try {
    const { stdout } = await exec("git", ["worktree", "list", "--porcelain", "-z"], { cwd: root, timeout: 15_000, env: gitSubprocessEnv() });
    const paths = stdout.split("\0").filter((f) => f.startsWith("worktree ")).map((f) => f.slice("worktree ".length));
    return [...new Set([root, ...paths])];
  } catch {
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
export async function evidenceMode(root: string, env: NodeJS.ProcessEnv = process.env): Promise<EvidenceMode> {
  if (env["MORPHEUS_READ_EVIDENCE"] === "off") return { kind: "override" };
  const runner = runnerSession(env);
  if (!runner) {
    return { kind: "unhooked", reason: "this process is not a Claude Code or Codex session the read hook can identify" };
  }
  const reads: ReadEntry[] = [];
  let live = false;
  let malformed = 0;
  for (const checkout of await checkouts(root)) {
    const log = await readEvidence(checkout);
    malformed += log.malformed;
    for (const entry of log.entries) {
      if (entry.session !== runner.tag) continue;
      if (entry.kind === "live") live = true;
      else reads.push(entry);
    }
  }
  if (!live) {
    return {
      kind: "unhooked",
      reason:
        "no read hook has recorded a tool result in this session — the project may not wire it, " +
        "a Codex hook may be untrusted, or hooks changed after the session started",
    };
  }
  return { kind: "recorded", provider: runner.provider, reads, malformed };
}

/** The new-side lines a change added or rewrote, and what it removed. */
export interface Hunk {
  /** New-side range; `to < from` for a pure deletion before line `from`. */
  from: number;
  to: number;
  removed: string[];
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
export async function changedHunks(before: string, after: string): Promise<Hunk[] | null> {
  const dir = await mkdtemp(join(tmpdir(), "morpheus-delta-"));
  try {
    await writeFile(join(dir, "a"), before, "utf8");
    await writeFile(join(dir, "b"), after, "utf8");
    let out: string;
    try {
      const result = await exec("git", ["diff", "--no-index", "--no-color", "--no-ext-diff", "--unified=0", "--", "a", "b"], { cwd: dir, timeout: 15_000, env: gitSubprocessEnv(), maxBuffer: 64 * 1024 * 1024 });
      out = result.stdout;
    } catch (error) {
      // `--no-index` exits 1 when the files differ, which is the case here.
      const failure = error as { code?: number; stdout?: string };
      if (failure.code !== 1 || typeof failure.stdout !== "string") return null;
      out = failure.stdout;
    }
    const hunks: Hunk[] = [];
    let current: Hunk | null = null;
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
      if (current && line.startsWith("-") && !line.startsWith("---")) current.removed.push(line.slice(1));
    }
    return hunks;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** What one record still needs read before refresh can certify it. */
export interface Requirement {
  id: string;
  lines: number;
  /** `full` without a usable baseline; `changed` for a delta against the last receipt. */
  reason: "full" | "changed";
  needed: Range[];
  missing: Range[];
  hunks?: Hunk[];
}

/**
 * Per record, what must be covered by read evidence at its current content.
 *
 * Unchanged since `previous` → nothing. Changed, with the previous content in
 * the snapshot → the changed hunks. Otherwise → the whole record. Records with
 * no content are skipped: they are unresolvable, which the lease reports, and
 * no amount of reading clears them.
 */
export async function requirements(
  previous: ContextReceipt | null,
  snapshot: ReadonlyMap<string, { fingerprint: string; content: string }>,
  current: readonly RecordContent[],
  reads: readonly ReadEntry[],
): Promise<Requirement[]> {
  const out: Requirement[] = [];
  for (const record of current) {
    if (record.content === null) continue;
    const before = previous?.inputs.find((i) => i.id === record.id)?.fingerprint;
    if (before !== undefined && before === record.fingerprint) continue;
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
export function snapshotPath(root: string, leaseId: string): string {
  return join(root, "local", "sessions", `${leaseId}.records.json`);
}

export async function readSnapshot(root: string, leaseId: string): Promise<Map<string, { fingerprint: string; content: string }>> {
  const map = new Map<string, { fingerprint: string; content: string }>();
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(snapshotPath(root, leaseId), "utf8"));
  } catch {
    return map;
  }
  const records = (parsed as { v?: unknown; records?: unknown })?.records;
  if ((parsed as { v?: unknown })?.v !== 1 || !Array.isArray(records)) return map;
  for (const r of records) {
    if (r && typeof r.id === "string" && typeof r.fingerprint === "string" && typeof r.content === "string") {
      map.set(r.id, { fingerprint: r.fingerprint, content: r.content });
    }
  }
  return map;
}

export async function writeSnapshot(root: string, leaseId: string, records: readonly RecordContent[]): Promise<void> {
  const path = snapshotPath(root, leaseId);
  await mkdir(dirname(path), { recursive: true });
  const body = { v: 1, records: records.filter((r) => r.content !== null) };
  const staging = `${path}.${process.pid}.tmp`;
  await writeFile(staging, JSON.stringify(body) + "\n", "utf8");
  await rename(staging, path);
}
