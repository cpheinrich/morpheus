import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { extract, sinceMs } from "../../src/profile/extract.js";
import { buildReport, commandKey, renderReport } from "../../src/profile/report.js";
import { emptyTokens, type SessionRow, type SpanRow } from "../../src/profile/types.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const dirs = { claudeDir: join(FIXTURES, "claude"), codexDir: join(FIXTURES, "codex"), home: "/Users/x" };

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
    byModel: [], costUSD: null, file: "f", ...over,
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
    for (const heading of ["Time and tokens by phase", "By repository", "By role", "By model × effort", "First-turn context", "Slowest commands", "Most repeated commands"]) {
      expect(text).toContain(`### ${heading}`);
    }
    expect(text).toContain("| 1m01s | context | r | `morpheus pm claims \\| head` |");
  });
});
