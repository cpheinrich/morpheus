import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeTranscript } from "../../src/profile/claude.js";
import { parseCodexTranscript } from "../../src/profile/codex.js";

const FIXTURES = join(import.meta.dirname, "fixtures");
const read = (rel: string) => readFileSync(join(FIXTURES, rel), "utf8");

describe("Claude transcript", () => {
  const file = "claude/-Users-x-code-morpheus/S1.jsonl";
  const { session, spans, issues } = parseClaudeTranscript(read(file), { file });

  it("identifies the session, its repository and its roadmap item", () => {
    expect(session).toMatchObject({
      provider: "claude",
      sessionId: "S1",
      parentSessionId: null,
      isSidechain: false,
      role: "main",
      repo: "morpheus",
      branch: "mo-26-10-07-20.55.11-profile-agent-sessions",
      item: "MO-26-10-07-20.55.11",
      start: "2026-10-07T10:00:00.000Z",
      end: "2026-10-07T11:22:20.000Z",
      wallMs: 4_940_000,
      costUSD: 1.25,
    });
  });

  it("counts usage once per message id, not once per content-block line", () => {
    // msg_1 appears on three lines; summing per line would give input 30, output 300.
    expect(session!.tokens).toEqual({ input: 16, cacheRead: 5100, cacheCreation: 500, output: 170, thinking: 40 });
    expect(session!.requests).toBe(3);
    expect(session!.firstTurnContextTokens).toBe(1510);
  });

  it("excludes synthetic messages from models and requests", () => {
    expect(session!.models).toEqual(["claude-opus-5-5", "claude-sonnet-5-5"]);
    expect(session!.efforts).toEqual(["high", "medium"]);
    expect(session!.byModel).toEqual([
      { model: "claude-opus-5-5", effort: "high", requests: 2, tokens: { input: 15, cacheRead: 3000, cacheCreation: 500, output: 150, thinking: 40 } },
      { model: "claude-sonnet-5-5", effort: "medium", requests: 1, tokens: { input: 1, cacheRead: 2100, cacheCreation: 0, output: 20, thinking: 0 } },
    ]);
  });

  it("caps the hour-long pause at five minutes but counts the twenty-minute CI watch in full", () => {
    // Gaps: 5+1+0+1+119+4 s, then 1200 s inside `gh pr checks --watch`, 5 s,
    // 3600 s idle capped to 300 s, 5 s.
    expect(session!.activeMs).toBe(1_640_000);
  });

  it("times each tool call from its call to its result and classifies it", () => {
    expect(spans.map((s) => [s.tool, s.phase, s.durationMs, s.command])).toEqual([
      ["Bash", "checks", 120_000, "pnpm test"],
      ["Read", "context", 1_000, null],
      ["Bash", "ci-wait", 1_200_000, "gh pr checks 12 --watch --fail-fast"],
    ]);
  });

  it("splits the issuing request's tokens across the calls it made", () => {
    expect(spans.map((s) => [s.inputTokens, s.outputTokens])).toEqual([
      [755, 50],
      [755, 50],
      [2005, 50],
    ]);
  });

  it("reports malformed lines as issues instead of throwing", () => {
    expect(issues).toEqual([
      { file, line: 12, message: "unparseable JSON" },
      { file, line: 13, message: "assistant line without a message" },
    ]);
  });

  it("never copies prompt text or tool output into a row", () => {
    const rows = JSON.stringify([session, ...spans]);
    expect(rows).not.toContain("prompt text is never read");
    expect(rows).not.toContain("file contents are never read");
    expect(rows).not.toContain("all checks passed");
  });
});

describe("Claude subagent transcript", () => {
  const file = "claude/-Users-x-code-morpheus/S1/subagents/agent-abc123.jsonl";
  const { session, spans } = parseClaudeTranscript(read(file), {
    file,
    subagent: { parentSessionId: "S1", agentId: "abc123", agentType: "general-purpose", description: "Independent review of profile command" },
  });

  it("is attributed to its parent session and recognised as a reviewer", () => {
    expect(session).toMatchObject({
      sessionId: "S1:abc123",
      parentSessionId: "S1",
      isSidechain: true,
      role: "reviewer",
      agentType: "general-purpose",
      activeMs: 60_000,
      firstTurnContextTokens: 30_003,
      tokens: { input: 5, cacheRead: 30_000, cacheCreation: 30_000, output: 1000, thinking: 0 },
    });
    expect(spans).toMatchObject([{ sessionId: "S1:abc123", isSidechain: true, role: "reviewer", phase: "git", durationMs: 2000 }]);
  });

  it("is a plain subagent when nothing says review", () => {
    const plain = parseClaudeTranscript(read(file), {
      file,
      subagent: { parentSessionId: "S1", agentId: "abc123", agentType: "Explore", description: "Find the parser" },
    });
    expect(plain.session!.role).toBe("subagent");
  });
});

describe("Codex rollout", () => {
  const file = "codex/2026/10/07/rollout-2026-10-07T09-00-00-C1.jsonl";
  const { session, spans, issues } = parseCodexTranscript(read(file), { file });

  it("reads identity, model and effort per turn", () => {
    expect(session).toMatchObject({
      provider: "codex",
      sessionId: "C1",
      parentSessionId: null,
      isSidechain: false,
      role: "main",
      repo: "evo",
      branch: "ev-26-10-02-13.20.53-fix-captured-meal",
      item: "EV-26-10-02-13.20.53",
      models: ["gpt-5.6-sol", "gpt-6-sol"],
      efforts: ["medium", "high"],
      wallMs: 152_000,
      activeMs: 152_000,
      costUSD: null,
    });
  });

  it("counts a response only when the cumulative total moves, and splits cached input out", () => {
    expect(session!.requests).toBe(2);
    expect(session!.tokens).toEqual({ input: 250, cacheRead: 1300, cacheCreation: 0, output: 100, thinking: 10 });
    expect(session!.firstTurnContextTokens).toBe(1000);
    expect(session!.byModel.map((m) => [m.model, m.effort, m.requests, m.tokens.output])).toEqual([
      ["gpt-5.6-sol", "medium", 1, 50],
      ["gpt-6-sol", "high", 1, 50],
    ]);
  });

  it("turns completed items into timed spans", () => {
    expect(spans.map((s) => [s.tool, s.phase, s.durationMs, s.command, s.start])).toEqual([
      ["exec_command", "checks", 12_500, "pnpm typecheck", "2026-10-07T09:00:07.500Z"],
      ["mcp__codebase-memory-mcp__search_graph", "read/search", 3_000, null, "2026-10-07T09:00:22.000Z"],
      ["FileChange", "edit", null, null, "2026-10-07T09:00:26.000Z"],
      ["collab:wait", "wait", 60_000, null, "2026-10-07T09:01:30.000Z"],
    ]);
    expect(JSON.stringify(spans)).not.toContain("never read");
  });

  it("reports the malformed line", () => {
    expect(issues).toEqual([{ file, line: 12, message: "unparseable JSON" }]);
  });

  it("recognises a spawned reviewer and its parent", () => {
    const sub = "codex/2026/10/07/rollout-2026-10-07T09-01-00-C2.jsonl";
    const parsed = parseCodexTranscript(read(sub), { file: sub });
    expect(parsed.session).toMatchObject({
      sessionId: "C2",
      parentSessionId: "C1",
      isSidechain: true,
      role: "reviewer",
      agentType: "/root/reviewer",
      tokens: { input: 5000, cacheRead: 0, cacheCreation: 0, output: 300, thinking: 100 },
    });
  });

  it("refuses a file with no session_meta as an issue, not a row", () => {
    const parsed = parseCodexTranscript('{"type":"turn_context","payload":{"model":"m"}}\n', { file: "x.jsonl" });
    expect(parsed.session).toBeNull();
    expect(parsed.issues).toEqual([{ file: "x.jsonl", line: null, message: "no session_meta with an id" }]);
  });
});
