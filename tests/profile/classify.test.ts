import { describe, expect, it } from "vitest";
import {
  classifyCommand,
  classifyTool,
  COMMAND_LIMIT,
  displayCommand,
  redactCommand,
  truncateCommand,
} from "../../src/profile/classify.js";
import { activeTime, deriveItem, deriveRepo, IDLE_THRESHOLD_MS, MAX_CREDIBLE_SPAN_MS, percentile } from "../../src/profile/derive.js";

describe("command phase rules", () => {
  it.each([
    ["morpheus context refresh", "context"],
    ["pnpm morpheus pm index", "context"],
    ["node dist/cli/index.js heartbeat --json", "context"],
    ["morpheus pm claims 2>&1 | head -30", "context"],
    ["morpheus check pr", "checks"],
    ["cd /repo && pnpm typecheck && pnpm test", "checks"],
    ["pnpm -C apps/web test", "checks"],
    ["pnpm exec vitest run tests/profile", "checks"],
    ["CI=1 npx tsc --noEmit", "checks"],
    [".venv/bin/pytest -q tests/test_x.py", "checks"],
    ["uv run --project apps/backend pytest -q", "checks"],
    ["python3 -m pytest", "checks"],
    ["xcodebuild test -scheme Evo -destination 'platform=iOS Simulator'", "checks"],
    ["xcodebuild -scheme Evo build", "build"],
    ["pnpm install --frozen-lockfile", "build"],
    ["gh pr checks 12 --watch --fail-fast", "ci-wait"],
    ["git push && gh run watch 123 --exit-status", "ci-wait"],
    ["until gh pr checks 12 | grep -q pass; do sleep 30; done", "ci-wait"],
    ["morpheus review prepare --base origin/main", "review"],
    ["git status --short", "git"],
    ["gh pr view 12 --json state", "gh"],
    ["xcrun simctl boot 'iPhone 17'", "simulator"],
    ["sleep 30", "wait"],
    ["rg -n 'pnpm test' src", "read/search"],
    ["sed -n '1,40p' src/cli/args.ts", "read/search"],
    ["python3 script.py", "other"],
    ["", "other"],
  ])("%s → %s", (command, phase) => {
    expect(classifyCommand(command)).toBe(phase);
  });

  it("lets the higher-priority rule win regardless of position", () => {
    // `git` appears first, but the call is spent waiting on CI.
    expect(classifyCommand("git push origin HEAD; gh pr checks 1 --watch")).toBe("ci-wait");
    // A search for a check command is still a search.
    expect(classifyCommand("grep -rn 'pnpm typecheck' docs")).toBe("read/search");
  });
});

describe("tool phase rules", () => {
  it.each([
    ["Read", { file_path: "/r/src/index.ts" }, "read/search"],
    ["Read", { file_path: "/r/.agent/decisions.md" }, "context"],
    ["Read", { file_path: "/r/hq/team/cpheinrich.md" }, "context"],
    ["Edit", {}, "edit"],
    ["Agent", { subagent_type: "general-purpose", description: "Independent review of PR" }, "review"],
    ["Agent", { subagent_type: "Explore", description: "Find callers" }, "subagent"],
    ["Monitor", {}, "wait"],
    ["mcp__Claude_Browser__navigate", {}, "browser"],
    ["mcp__Claude_Code_iOS_Simulator__control", {}, "simulator"],
    ["mcp__codebase-memory-mcp__search_graph", {}, "read/search"],
    ["mcp__unknown__thing", {}, "other"],
    ["Bash", { command: "pnpm test" }, "checks"],
    ["Bash", null, "other"],
  ])("%s %j → %s", (tool, input, phase) => {
    expect(classifyTool(tool, input)).toBe(phase);
  });
});

describe("command display", () => {
  it("drops the leading cd and variable prefixes a worktree repeats on every call", () => {
    expect(displayCommand("cd /long/worktree/path && pnpm test")).toBe("pnpm test");
    expect(displayCommand("W=/long/path; cd $W && git status")).toBe("git status");
    // A bare `cd` is the whole command, and stays.
    expect(displayCommand("cd /tmp")).toBe("cd /tmp");
  });

  it("truncates at the limit to one line", () => {
    const long = `echo ${"x".repeat(300)}`;
    const out = truncateCommand(long);
    expect(out.length).toBe(COMMAND_LIMIT);
    expect(out.endsWith("…")).toBe(true);
    expect(truncateCommand("git\n  status")).toBe("git status");
  });

  it("masks credential-shaped values", () => {
    expect(redactCommand("GITHUB_TOKEN=ghp_abcdefghijklmnop1234 gh api user")).toBe("GITHUB_TOKEN=*** gh api user");
    expect(redactCommand("curl -H 'Authorization: Bearer abcdefghijklmnop1234567'")).toBe("curl -H 'Authorization: Bearer ***'");
    expect(redactCommand("tool --password hunter2 run")).toBe("tool --password *** run");
    expect(redactCommand("echo sk-ant-abcdefghijklmnopqrstuv")).toBe("echo ***");
    expect(redactCommand("git status")).toBe("git status");
  });
});

describe("active time", () => {
  const T = IDLE_THRESHOLD_MS;
  it("counts a gap up to the threshold in full and caps one beyond it", () => {
    expect(activeTime([0, T - 1])).toBe(T - 1);
    expect(activeTime([0, T])).toBe(T);
    expect(activeTime([0, T + 1])).toBe(T);
    expect(activeTime([0, 10 * T])).toBe(T);
  });

  it("sums several gaps regardless of input order", () => {
    expect(activeTime([2000, 0, 1000])).toBe(2000);
    expect(activeTime([])).toBe(0);
    expect(activeTime([5])).toBe(0);
  });

  it("counts a long gap in full only when a running tool call covers all of it", () => {
    expect(activeTime([0, 2 * T], [{ start: 0, end: 2 * T }])).toBe(2 * T);
    // One millisecond short of covering the gap: capped.
    expect(activeTime([0, 2 * T], [{ start: 0, end: 2 * T - 1 }])).toBe(T);
    // Overlapping calls merge into one cover.
    expect(activeTime([0, 2 * T], [{ start: 0, end: T }, { start: T - 5, end: 2 * T }])).toBe(2 * T);
  });

  it("keeps the credibility ceiling above the longest legitimate waits", () => {
    expect(MAX_CREDIBLE_SPAN_MS).toBe(4 * 60 * 60 * 1000);
  });
});

describe("repository and item derivation", () => {
  it.each([
    ["/Users/x/code/morpheus/.claude/worktrees/profiling-dc3d6c", "morpheus"],
    ["/Users/x/code/morpheus/local/worktrees/pr-check", "morpheus"],
    ["/Users/x/code/.morpheus-worktrees/evo-b44b2f5bc3a9/ev-26-10-02-13-20-53-VTtnOY", "evo"],
    ["/Users/x/code/.morpheus-worktrees/cpheinrich.com-0856b538bae9/cph-26-10-01-10-00-00-abc", "cpheinrich.com"],
    ["/Users/x/code/.pace-worktrees/pace-commitment-entGAR", "pace"],
    ["/Users/x/.codex/worktrees/0ec5/evo", "evo"],
    ["/Users/x/Documents/Codex/2026-10-02/ca", "(chat)"],
    ["/private/tmp/claude-501/scratchpad", "(scratch)"],
    ["/Users/x", "(home)"],
    ["/Users/x/code/lakina", "lakina"],
    ["file:///Users/x/code/kairos/", "kairos"],
  ])("%s → %s", (cwd, repo) => {
    expect(deriveRepo(cwd, [], "/Users/x")).toBe(repo);
  });

  it("attributes a subdirectory to its registered project root", () => {
    expect(deriveRepo("/Users/x/code/evo/apps/ios", ["/Users/x/code/evo", "/Users/x/code/evolve"])).toBe("evo");
    expect(deriveRepo("/Users/x/code/evo/apps/ios")).toBe("ios");
    expect(deriveRepo(null)).toBeNull();
  });

  it("normalises roadmap ids from branches and from dashed worktree names", () => {
    expect(deriveItem("mo-26-10-07-20.37.19-reduce-review")).toBe("MO-26-10-07-20.37.19");
    expect(deriveItem("claude/x", "/w/.morpheus-worktrees/evo-b44b2f5bc3a9/ev-26-10-02-13-20-53-VTtnOY")).toBe("EV-26-10-02-13.20.53");
    expect(deriveItem("main", "chris/scheme-change", null)).toBeNull();
    // A legacy integer id is not a dated id.
    expect(deriveItem("mo-045-something")).toBeNull();
  });
});

describe("percentile", () => {
  it("uses nearest rank", () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(values, 50)).toBe(50);
    expect(percentile(values, 90)).toBe(90);
    expect(percentile([7], 90)).toBe(7);
    expect(percentile([], 50)).toBeNull();
  });
});
