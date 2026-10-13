import { describe, expect, it } from "vitest";
import { humanDenial, parseClaudeTranscript } from "../../src/profile/claude.js";
import { classifyCommand, classifyTool } from "../../src/profile/classify.js";
import { activeTime, IDLE_THRESHOLD_MS, overlap } from "../../src/profile/derive.js";
import { sinceMs } from "../../src/profile/extract.js";
import { buildReport } from "../../src/profile/report.js";

const at = (hms: string) => `2026-10-07T${hms}.000Z`;
const usage = { input_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 1 };

function call(id: string, time: string, name: string, input: Record<string, unknown>) {
  return { type: "assistant", sessionId: "H1", timestamp: at(time), message: { id: `msg_${id}`, model: "claude-opus-5-5", usage, content: [{ type: "tool_use", id, name, input }] } };
}

function result(id: string, time: string, extra: Record<string, unknown> = {}) {
  return { type: "user", sessionId: "H1", timestamp: at(time), message: { content: [{ type: "tool_result", tool_use_id: id, content: "x" }] }, ...extra };
}

/**
 * The line shapes current Claude Code writes: `AskUserQuestion` is a plain
 * tool call; a refused permission prompt is a tool result carrying
 * `toolDenialKind: "user-rejected"`; an auto-mode classifier refusal carries
 * `"automode-blocked"` and involved nobody.
 */
const transcript = [
  { type: "user", sessionId: "H1", timestamp: at("10:00:00"), message: { content: "go" } },
  call("t1", "10:00:05", "AskUserQuestion", { questions: [] }),
  result("t1", "10:02:05"),
  call("t2", "10:02:10", "Bash", { command: "pnpm test" }),
  result("t2", "10:02:40"),
  call("t3", "10:02:45", "Bash", { command: "rm -rf build" }),
  result("t3", "10:06:45", { toolDenialKind: "user-rejected", toolUseResult: "User rejected tool use" }),
  call("t4", "10:06:50", "Bash", { command: "git push" }),
  result("t4", "10:06:52", { toolDenialKind: "automode-blocked", toolUseResult: "Error: Permission for this action was denied by the Claude Code auto mode classifier." }),
]
  .map((o) => JSON.stringify(o))
  .join("\n");

describe("human waits in a Claude transcript", () => {
  const { session, spans } = parseClaudeTranscript(transcript, { file: "H1.jsonl" });

  it("puts questions and refused permission prompts in human-wait, and nothing else", () => {
    expect(spans.map((s) => [s.tool, s.phase, s.durationMs])).toEqual([
      ["AskUserQuestion", "human-wait", 120_000],
      ["Bash", "checks", 30_000],
      ["Bash", "human-wait", 240_000],
      // The auto-mode classifier refused it; no person was waited on.
      ["Bash", "git", 2_000],
    ]);
  });

  it("leaves the waits out of active time even though each is under the idle cap", () => {
    // Gaps: 5 s, 120 s answered question, 5 s, 30 s test, 5 s, 240 s refused
    // prompt, 5 s, 2 s. Both waits are under five minutes, so before they were
    // excluded the session read as 412 s active.
    expect(session!.activeMs).toBe(52_000);
    expect(session!.wallMs).toBe(412_000);
  });

  it("reports human-wait as its own phase line", () => {
    const report = buildReport([session!], spans);
    expect(report.byPhase.find((p) => p.phase === "human-wait")).toMatchObject({ calls: 2, mainMs: 360_000 });
    expect(report.byPhase.find((p) => p.phase === "other")).toBeUndefined();
  });

  it("recognises a refusal by its kind or, from older versions, its string alone", () => {
    expect(humanDenial({ toolDenialKind: "user-rejected" })).toBe(true);
    expect(humanDenial({ toolUseResult: "User rejected tool use" })).toBe(true);
    expect(humanDenial({ toolDenialKind: "automode-blocked", toolUseResult: "Error: Permission for this action was denied" })).toBe(false);
    expect(humanDenial({ toolDenialKind: "permission-rule" })).toBe(false);
    expect(humanDenial({ toolDenialKind: "interrupted", toolUseResult: "[Request interrupted by user for tool use]" })).toBe(false);
    expect(humanDenial({})).toBe(false);
  });
});

describe("tool and command phases", () => {
  it.each([
    ["AskUserQuestion", "human-wait"],
    ["ExitPlanMode", "human-wait"],
  ])("%s is %s", (tool, phase) => {
    expect(classifyTool(tool, {})).toBe(phase);
  });

  it.each(["morpheus wait-ci 357", "pnpm morpheus wait-ci --timeout 30m", "node dist/cli/index.js wait-ci", "git push && morpheus wait-ci"])(
    "%s is ci-wait",
    (command) => {
      expect(classifyCommand(command)).toBe("ci-wait");
    },
  );
});

describe("activeTime with human waits", () => {
  const T = IDLE_THRESHOLD_MS;
  it("subtracts the waited part of a gap before applying the cap", () => {
    expect(activeTime([0, 120_000], [], T, [{ start: 0, end: 120_000 }])).toBe(0);
    expect(activeTime([0, 120_000], [], T, [{ start: 30_000, end: 90_000 }])).toBe(60_000);
    // A wait reaching past the gap only removes what lies inside it.
    expect(activeTime([0, 120_000], [], T, [{ start: 100_000, end: 500_000 }])).toBe(100_000);
    // 20 minutes with 10 waited leaves 10, which the five-minute cap then limits.
    expect(activeTime([0, 4 * T], [], T, [{ start: 0, end: 2 * T }])).toBe(T);
    // 10 minutes with 6 waited leaves 4, under the cap.
    expect(activeTime([0, 2 * T], [], T, [{ start: 0, end: 1.2 * T }])).toBe(0.8 * T);
  });

  it("a wait inside a busy gap is still removed, and the busy rest is not capped", () => {
    // A 20-minute gap fully covered by a running tool, 2 minutes of it waiting on a person.
    expect(activeTime([0, 4 * T], [{ start: 0, end: 4 * T }], T, [{ start: T, end: T + 120_000 }])).toBe(4 * T - 120_000);
  });

  it("is unchanged with no waits", () => {
    expect(activeTime([0, 60_000, 120_000], [], T, [])).toBe(120_000);
  });

  it("measures overlap at its boundaries", () => {
    const merged = [{ start: 10, end: 20 }, { start: 30, end: 40 }];
    expect(overlap(merged, 0, 10)).toBe(0);
    expect(overlap(merged, 0, 11)).toBe(1);
    expect(overlap(merged, 20, 30)).toBe(0);
    expect(overlap(merged, 15, 35)).toBe(10);
    expect(overlap(merged, 0, 100)).toBe(20);
  });
});

describe("--since is a real calendar date", () => {
  it.each(["2026-02-30", "2026-02-29", "2026-04-31", "2026-13-01", "2026-00-10", "2026-01-00", "2026-01-32"])("refuses %s", (since) => {
    expect(sinceMs(since)).toBeNull();
  });

  it.each([
    ["2026-02-28", 2026, 1, 28],
    ["2028-02-29", 2028, 1, 29],
    ["2026-04-30", 2026, 3, 30],
    ["2026-12-31", 2026, 11, 31],
    ["2026-01-01", 2026, 0, 1],
  ])("accepts %s as local midnight", (since, y, m, d) => {
    expect(sinceMs(since)).toBe(new Date(y, m, d).getTime());
  });
});
