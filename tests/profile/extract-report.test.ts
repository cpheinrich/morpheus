import { cpSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// A namespace import, as in the source: zstd arrived in Node 22.15, and a named import of it would
// fail this whole file at link time on an older Node rather than skip the one test that needs it.
import * as zlib from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { extract, sinceMs, type Extraction } from "../../src/profile/extract.js";
import { buildReport, commandKey, renderReport, summarizeIssues } from "../../src/profile/report.js";
import { emptyTokens, type SessionRow, type SpanRow } from "../../src/profile/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const dirs = { claudeDir: join(FIXTURES, "claude"), codexDir: join(FIXTURES, "codex"), home: "/Users/x" };
const ARCHIVED = join(FIXTURES, "codex-archived");
const LIVE_C1 = "2026/10/07/rollout-2026-10-07T09-00-00-C1.jsonl";
const LIVE_C2 = "2026/10/07/rollout-2026-10-07T09-01-00-C2.jsonl";
const ARCHIVED_C1 = "rollout-2026-10-07T09-00-00-C1.jsonl";
const ARCHIVED_A1 = "rollout-2026-10-06T08-00-00-A1.jsonl";

let scratch: string | undefined;
afterEach(() => {
  if (scratch) rmSync(scratch, { recursive: true, force: true });
  scratch = undefined;
});
/** A scratch copy of the live and archived Codex fixtures, to rearrange per test. */
function codexCopy(): { live: string; archived: string } {
  scratch = mkdtempSync(join(tmpdir(), "profile-codex-"));
  const live = join(scratch, "sessions");
  const archived = join(scratch, "archived_sessions");
  cpSync(join(FIXTURES, "codex"), live, { recursive: true });
  cpSync(ARCHIVED, archived, { recursive: true });
  return { live, archived };
}
const zstdCompressSync = (zlib as Partial<typeof zlib>).zstdCompressSync;
/** Compress a rollout in place, as Codex does: `x.jsonl` becomes `x.jsonl.zst`. */
function compress(path: string): void {
  writeFileSync(`${path}.zst`, zstdCompressSync!(readFileSync(path)));
  unlinkSync(path);
}
/** Rows without the path they were read from, so two layouts of the same data compare equal. */
function content(x: Extraction) {
  const sessions = x.sessions.map(({ file: _file, ...rest }) => rest).sort((a, b) => a.sessionId.localeCompare(b.sessionId));
  const spans = [...x.spans].sort((a, b) => a.sessionId.localeCompare(b.sessionId) || a.start.localeCompare(b.start));
  return { sessions, spans };
}

describe("extract", () => {
  it("finds main and subagent transcripts for both providers", async () => {
    const x = await extract(dirs);
    expect(x.sessions.map((s) => [s.provider, s.sessionId, s.parentSessionId, s.role]).sort()).toEqual([
      ["claude", "S1", null, "main"],
      ["claude", "S1:abc123", "S1", "reviewer"],
      ["codex", "C1", null, "main"],
      ["codex", "C2", "C1", "reviewer"],
    ]);
    expect(x.spans).toHaveLength(8);
    expect(x.issues.map((i) => i.message).sort()).toEqual([
      "assistant line without a message",
      "unparseable JSON",
      "unparseable JSON",
    ]);
  });

  it("filters by session start and by repository substring", async () => {
    const late = await extract({ ...dirs, since: "2099-01-01" });
    expect(late.sessions).toEqual([]);
    const evo = await extract({ ...dirs, repo: "EVO" });
    expect(evo.sessions.map((s) => s.sessionId).sort()).toEqual(["C1", "C2"]);
    expect(evo.spans.every((s) => s.sessionId === "C1")).toBe(true);
  });

  it("matches --repo against the derived repository, never against the path", async () => {
    // C1's worktree path contains "claude" and S1's contains "morpheus-worktrees/morpheus";
    // the evo reviewer C2 sits under no morpheus path, and must stay excluded either way.
    const morpheus = await extract({ ...dirs, repo: "morpheus" });
    expect(morpheus.sessions.map((s) => s.sessionId).sort()).toEqual(["S1", "S1:abc123"]);
    const pathOnly = await extract({ ...dirs, repo: ".claude" });
    expect(pathOnly.sessions).toEqual([]);
    const crossRepo = await extract({ ...dirs, repo: "morpheus", claudeDir: join(FIXTURES, "cross-repo") });
    expect(crossRepo.sessions.map((s) => [s.sessionId, s.repo])).toEqual([]);
  });

  it("reads archived Codex rollouts and counts a session found in both places once", async () => {
    const x = await extract({ ...dirs, codexArchivedDir: ARCHIVED });
    expect(x.sessions.map((s) => [s.provider, s.sessionId, s.source]).sort()).toEqual([
      ["claude", "S1", "claude"],
      ["claude", "S1:abc123", "claude"],
      ["codex", "A1", "codex-archived"],
      ["codex", "C1", "codex-sessions"],
      ["codex", "C2", "codex-sessions"],
    ]);
    expect(x.duplicates).toBe(1);
    // The archived C1 is an older snapshot ending at its first command; the live copy is kept whole.
    const c1 = x.sessions.find((s) => s.sessionId === "C1")!;
    expect([c1.file, c1.requests, c1.toolCalls]).toEqual([join(dirs.codexDir, LIVE_C1), 2, 4]);
    // 8 spans as before, plus A1's one command; the archived C1's command is not counted again.
    expect(x.spans).toHaveLength(9);
    expect(x.spans.filter((s) => s.sessionId === "C1")).toHaveLength(4);
    expect(x.files).toBe(6);
  });

  it("counts a duplicate only when its session is in scope", async () => {
    const morpheus = await extract({ ...dirs, codexArchivedDir: ARCHIVED, repo: "morpheus" });
    expect(morpheus.sessions.map((s) => s.sessionId).sort()).toEqual(["S1", "S1:abc123"]);
    expect(morpheus.duplicates).toBe(0);
  });

  it("keeps the fuller copy wherever it is, so archiving cannot shorten a session", async () => {
    const { live, archived } = codexCopy();
    // Swap: the live directory now holds the snapshot, the archive the whole session.
    cpSync(join(ARCHIVED, ARCHIVED_C1), join(live, LIVE_C1));
    cpSync(join(FIXTURES, "codex", LIVE_C1), join(archived, ARCHIVED_C1));
    const x = await extract({ ...dirs, codexDir: live, codexArchivedDir: archived });
    const c1 = x.sessions.filter((s) => s.sessionId === "C1");
    expect(c1.map((s) => [s.source, s.file, s.toolCalls])).toEqual([["codex-archived", join(archived, ARCHIVED_C1), 4]]);
    expect(x.duplicates).toBe(1);
    expect(x.spans).toHaveLength(9);
  });

  // Node before 22.15 has no zstd: there the extractor reports each compressed file as unreadable,
  // which the corrupt-file test below still covers, and this one cannot build its input.
  it.skipIf(!zstdCompressSync)("reads zstd-compressed rollouts, live and archived, exactly as their plain text", async () => {
    const plain = await extract({ ...dirs, codexArchivedDir: ARCHIVED });
    const { live, archived } = codexCopy();
    compress(join(live, LIVE_C2));
    compress(join(archived, ARCHIVED_A1));
    compress(join(archived, ARCHIVED_C1));
    const x = await extract({ ...dirs, codexDir: live, codexArchivedDir: archived });
    expect(x.sessions.find((s) => s.sessionId === "A1")!.file).toBe(join(archived, `${ARCHIVED_A1}.zst`));
    expect(x.sessions.find((s) => s.sessionId === "C2")!.file).toBe(join(live, `${LIVE_C2}.zst`));
    expect(content(x)).toEqual(content(plain));
    expect(x.duplicates).toBe(1);
    expect(x.issues.map((i) => i.message).sort()).toEqual(plain.issues.map((i) => i.message).sort());
  });

  it("reports a corrupt compressed rollout as unreadable rather than aborting the run", async () => {
    const { live, archived } = codexCopy();
    const bad = join(archived, "rollout-2026-10-05T00-00-00-BAD.jsonl.zst");
    writeFileSync(bad, "not zstd");
    const x = await extract({ ...dirs, codexDir: live, codexArchivedDir: archived });
    expect(x.sessions.map((s) => s.sessionId).sort()).toEqual(["A1", "C1", "C2", "S1", "S1:abc123"]);
    expect(x.issues.filter((i) => i.message.startsWith("unreadable:")).map((i) => i.file)).toEqual([bad]);
  });

  it("refuses a malformed --since rather than silently including everything", () => {
    expect(sinceMs("2026-9-1")).toBeNull();
    expect(sinceMs(undefined)).toBeUndefined();
    expect(sinceMs("2026-09-01")).toBe(new Date("2026-09-01T00:00:00").getTime());
  });
});

function session(over: Partial<SessionRow>): SessionRow {
  return {
    kind: "session", provider: "claude", sessionId: "s", parentSessionId: null, isSidechain: false, role: "main",
    agentType: null, cwd: null, repo: "r", branch: null, item: null, models: [], efforts: [], start: null, end: null,
    wallMs: 0, activeMs: 0, requests: 0, toolCalls: 0, tokens: emptyTokens(), firstTurnContextTokens: null,
    byModel: [], costUSD: null, file: "f", source: "claude", ...over,
  };
}

function span(over: Partial<SpanRow>): SpanRow {
  return {
    kind: "span", provider: "claude", sessionId: "s", isSidechain: false, role: "main", repo: "r", tool: "Bash",
    phase: "other", start: "2026-10-07T00:00:00.000Z", durationMs: 0, command: null, background: false,
    inputTokens: null, outputTokens: null, ...over,
  };
}

describe("report", () => {
  it("aggregates the extracted fixtures into exact figures", async () => {
    const x = await extract(dirs);
    const r = buildReport(x.sessions, x.spans);
    expect(r.sessions).toBe(4);
    expect(r.mainSessions).toBe(2);
    // 1 640 000 + 60 000 (Claude) + 152 000 + 40 000 (Codex reviewer: 09:01:00 → 09:01:40).
    expect(r.activeMs).toBe(1_892_000);
    expect(r.costUSD).toBe(1.25);
    expect(r.byPhase.find((p) => p.phase === "ci-wait")).toEqual({
      phase: "ci-wait", calls: 1, mainMs: 1_200_000, sidechainMs: 0, tokens: 2055, outputTokens: 50,
    });
    expect(r.byPhase.find((p) => p.phase === "git")).toMatchObject({ calls: 1, mainMs: 0, sidechainMs: 2000 });
    expect(r.byRepo.map((g) => [g.key, g.sessions, g.activeMs])).toEqual([
      ["morpheus", 2, 1_700_000],
      ["evo", 2, 192_000],
    ]);
    expect(r.byRole.map((g) => [g.key, g.sessions])).toEqual([
      ["main", 2],
      ["reviewer", 2],
    ]);
    expect(r.firstTurn).toEqual([
      { provider: "claude", sessions: 1, p50: 1510, p90: 1510, max: 1510 },
      { provider: "codex", sessions: 1, p50: 1000, p90: 1000, max: 1000 },
    ]);
    expect(r.slowest.map((s) => [s.command, s.durationMs])).toEqual([
      ["gh pr checks 12 --watch --fail-fast", 1_200_000],
      ["pnpm test", 120_000],
      ["pnpm typecheck", 12_500],
      ["git diff origin/main...HEAD", 2_000],
    ]);
    // Subagent share: (60 000 + 40 000) / 1 892 000 of active time.
    expect(r.sidechainShare.activeTime).toBeCloseTo(100_000 / 1_892_000, 10);
  });

  it("reports how many sessions came from each source, and totals by provider", async () => {
    const x = await extract({ ...dirs, codexArchivedDir: ARCHIVED });
    const r = buildReport(x.sessions, x.spans, { duplicates: x.duplicates });
    expect(r.bySource).toEqual([
      { source: "claude", sessions: 2, mainSessions: 1 },
      { source: "codex-sessions", sessions: 2, mainSessions: 1 },
      { source: "codex-archived", sessions: 1, mainSessions: 1 },
    ]);
    expect(r.duplicates).toBe(1);
    // Claude 1 640 000 + 60 000; Codex 152 000 + 40 000 + A1's 10 000 (08:00:00 → 08:00:10).
    expect(r.byProvider.map((g) => [g.key, g.sessions, g.activeMs])).toEqual([
      ["claude", 2, 1_700_000],
      ["codex", 3, 202_000],
    ]);
    const text = renderReport(r, "Profile");
    expect(text).toContain("| codex-archived | 1 | 1 | 0 |");
    expect(text).toContain("| codex-sessions | 2 | 1 | 1 |");
    expect(text).toContain("1 further copy of a Codex session found in a second file, counted once.");
  });

  it("lists every source even when one contributed nothing", () => {
    const r = buildReport([session({})], []);
    expect(r.bySource.map((s) => [s.source, s.sessions])).toEqual([["claude", 1], ["codex-sessions", 0], ["codex-archived", 0]]);
    expect(r.duplicates).toBe(0);
    expect(renderReport(r, "Profile")).not.toContain("counted once");
  });

  it("leaves an incredible span out of every time figure and names it", () => {
    const r = buildReport(
      [session({})],
      [
        span({ phase: "gh", tool: "mcp__ccd_pr__bind_pr", durationMs: 4 * 3600_000 + 1 }),
        span({ phase: "gh", command: "gh pr view 1", durationMs: 4 * 3600_000 }),
      ],
    );
    expect(r.byPhase).toEqual([{ phase: "gh", calls: 2, mainMs: 4 * 3600_000, sidechainMs: 0, tokens: 0, outputTokens: 0 }]);
    expect(r.outliers).toEqual([{ tool: "mcp__ccd_pr__bind_pr", durationMs: 4 * 3600_000 + 1, repo: "r", start: "2026-10-07T00:00:00.000Z" }]);
    expect(r.slowest.map((s) => s.durationMs)).toEqual([4 * 3600_000]);
  });

  it("does not count a background launch as time spent", () => {
    const r = buildReport([session({})], [span({ phase: "checks", command: "pnpm test", durationMs: 9000, background: true })]);
    expect(r.byPhase[0]!.mainMs).toBe(0);
    expect(r.slowest).toEqual([]);
  });

  it("groups repeated commands across worktrees and ranks by count", () => {
    expect(commandKey("cd /a/worktree && pnpm test")).toBe("pnpm test");
    const r = buildReport(
      [session({})],
      [
        span({ command: "cd /a && pnpm test", durationMs: 1000, phase: "checks" }),
        span({ command: "cd /b && pnpm test", durationMs: 3000, phase: "checks" }),
        span({ command: "git status", durationMs: 10, phase: "git" }),
      ],
    );
    expect(r.repeated).toEqual([{ command: "pnpm test", calls: 2, totalMs: 4000, maxMs: 3000, phase: "checks" }]);
  });

  it("attributes a session's active time to its most-used model and effort", () => {
    const tokens = { input: 1, cacheRead: 0, cacheCreation: 0, output: 1, thinking: 0 };
    const r = buildReport(
      [
        session({
          activeMs: 600_000,
          byModel: [
            { model: "a", effort: "high", requests: 1, tokens },
            { model: "b", effort: null, requests: 5, tokens },
          ],
        }),
      ],
      [],
    );
    expect(r.byModel.map((m) => [m.model, m.effort, m.requests, m.activeMs])).toEqual([
      ["a", "high", 1, 0],
      ["b", "-", 5, 600_000],
    ]);
  });

  it("renders every section, with pipes in commands escaped for the table", () => {
    const text = renderReport(
      buildReport([session({ activeMs: 61_000 })], [span({ command: "morpheus pm claims | head", durationMs: 61_000, phase: "context" })]),
      "Profile",
    );
    for (const heading of ["Sources", "Time and tokens by phase", "By provider", "By repository", "By role", "By model × effort", "First-turn context", "Slowest commands", "Most repeated commands"]) {
      expect(text).toContain(`### ${heading}`);
    }
    expect(text).toContain("| 1m01s | context | r | `morpheus pm claims \\| head` |");
  });
});

describe("skipped lines", () => {
  it("names the file and line of every unparseable line, so the count can be acted on", async () => {
    const x = await extract(dirs);
    const claude = join(dirs.claudeDir, "-Users-x-code-morpheus", "S1.jsonl");
    const codex = join(dirs.codexDir, LIVE_C1);
    expect(summarizeIssues(x.issues)).toEqual([
      "3 unreadable line(s) or file(s) skipped:",
      "  2 × unparseable JSON",
      `      ${claude} — line 12`,
      `      ${codex} — line 12`,
      "  1 × assistant line without a message",
      `      ${claude} — line 13`,
    ]);
  });

  it("shortens the home directory, groups lines per file and caps what it names", () => {
    const issues = [
      ...[1, 2, 3, 4, 5, 6, 7].map((line) => ({ file: "/Users/x/.claude/projects/p/a.jsonl", line, message: "unparseable JSON" })),
      ...["b", "c", "d"].map((f) => ({ file: `/Users/x/.codex/sessions/${f}.jsonl`, line: 1, message: "unparseable JSON" })),
      { file: "/elsewhere/e.jsonl.zst", line: null, message: "unreadable: bad frame" },
    ];
    expect(summarizeIssues(issues, { home: "/Users/x", maxFiles: 2 })).toEqual([
      "11 unreadable line(s) or file(s) skipped:",
      "  10 × unparseable JSON",
      "      ~/.claude/projects/p/a.jsonl — lines 1, 2, 3, 4, 5, +2 more",
      "      ~/.codex/sessions/b.jsonl — line 1",
      "      … and 2 more file(s)",
      "  1 × unreadable: bad frame",
      "      /elsewhere/e.jsonl.zst",
    ]);
    expect(summarizeIssues([])).toEqual([]);
  });
});
