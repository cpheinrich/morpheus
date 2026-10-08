import { describe, expect, it } from "vitest";
import {
  type Check,
  checkRunOutcome,
  counts,
  dedupe,
  exitCode,
  formatDuration,
  jobIdFromUrl,
  parseDuration,
  parseRollup,
  settled,
  statusOutcome,
  verdict,
} from "../../src/wait-ci/checks.js";
import { rollup, run } from "./helpers.js";

const check = (outcome: Check["outcome"], name: string = outcome): Check => ({ name, outcome, required: false });

describe("check outcomes", () => {
  it.each([
    ["QUEUED", null, "pending"],
    ["IN_PROGRESS", null, "pending"],
    ["COMPLETED", "SUCCESS", "pass"],
    ["COMPLETED", "NEUTRAL", "pass"],
    ["COMPLETED", "SKIPPED", "skipped"],
    ["COMPLETED", "FAILURE", "fail"],
    ["COMPLETED", "TIMED_OUT", "fail"],
    ["COMPLETED", "STARTUP_FAILURE", "fail"],
    ["COMPLETED", "ACTION_REQUIRED", "fail"],
    ["COMPLETED", "CANCELLED", "cancelled"],
    ["COMPLETED", "STALE", "cancelled"],
    // An unknown conclusion on a finished run is surfaced, never read as success.
    ["COMPLETED", "SOMETHING_NEW", "fail"],
    ["COMPLETED", null, "fail"],
  ])("check run %s/%s is %s", (status, conclusion, outcome) => {
    expect(checkRunOutcome(status, conclusion)).toBe(outcome);
  });

  it.each([
    ["SUCCESS", "pass"],
    ["FAILURE", "fail"],
    ["ERROR", "fail"],
    ["PENDING", "pending"],
    ["EXPECTED", "pending"],
  ])("commit status %s is %s", (state, outcome) => {
    expect(statusOutcome(state)).toBe(outcome);
  });

  it("takes the job id from an Actions details URL and nothing else", () => {
    expect(jobIdFromUrl("https://github.com/o/r/actions/runs/37713000146/job/113102994989")).toBe("113102994989");
    expect(jobIdFromUrl("https://vercel.com/team/project/deployments/abc")).toBeUndefined();
    expect(jobIdFromUrl(null)).toBeUndefined();
  });
});

describe("parseRollup", () => {
  it("reads head SHA, check runs and commit statuses from one response", () => {
    const snap = parseRollup(
      rollup("59cb7d56ee05e3784d640a0497b7a8e03a5c4219", [
        run("node / check", "COMPLETED", "SUCCESS", { required: true }),
        run("agent-review / review", "COMPLETED", "SKIPPED"),
        { __typename: "StatusContext", context: "Vercel", state: "PENDING", targetUrl: "https://vercel.com/x", createdAt: "2026-10-08T03:43:00Z", isRequired: false },
      ]),
    );
    expect(snap).toEqual({
      pr: 354,
      url: "https://github.com/cpheinrich/morpheus/pull/354",
      headSha: "59cb7d56ee05e3784d640a0497b7a8e03a5c4219",
      truncated: false,
      checks: [
        { name: "node / check", workflow: "CI", outcome: "pass", url: "https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/113138012168", required: true, startedAt: "2026-10-08T03:43:05Z", jobId: "113138012168" },
        { name: "agent-review / review", workflow: "CI", outcome: "skipped", url: "https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/113138012168", required: false, startedAt: "2026-10-08T03:43:05Z", jobId: "113138012168" },
        { name: "Vercel", outcome: "pending", url: "https://vercel.com/x", required: false, startedAt: "2026-10-08T03:43:00Z" },
      ],
    });
  });

  it("flags a second page of contexts rather than silently dropping it", () => {
    expect(parseRollup(rollup("abc", [], true))).toMatchObject({ truncated: true, checks: [] });
  });

  it("returns a commit with no rollup yet as zero checks, not an error", () => {
    const json = rollup("abc", []) as { data: { repository: { pullRequest: { commits: { nodes: { commit: { statusCheckRollup: unknown } }[] } } } } };
    json.data.repository.pullRequest.commits.nodes[0]!.commit.statusCheckRollup = null;
    expect(parseRollup(json)).toMatchObject({ headSha: "abc", checks: [] });
  });

  it("reports GraphQL errors and missing pull requests as errors", () => {
    expect(parseRollup({ errors: [{ message: "Could not resolve to a PullRequest" }] })).toEqual({ error: "Could not resolve to a PullRequest" });
    expect(parseRollup({ data: { repository: { pullRequest: null } } })).toEqual({ error: "pull request not found in the response" });
    expect(parseRollup(null)).toEqual({ error: "pull request not found in the response" });
  });
});

describe("dedupe", () => {
  it("keeps the most recently started check of a name, across workflows, as branch protection does", () => {
    const raced = { name: "pr / conventions", workflow: "CI", outcome: "fail" as const, required: true, startedAt: "2026-10-08T04:19:14Z" };
    const relabelled = { name: "pr / conventions", workflow: "Review metadata", outcome: "pass" as const, required: true, startedAt: "2026-10-08T04:19:19Z" };
    expect(dedupe([raced, relabelled])).toEqual([relabelled]);
    expect(dedupe([relabelled, raced])).toEqual([relabelled]);
  });

  it("lets the later row win a tie, and keeps distinct names", () => {
    const a = { name: "x", outcome: "fail" as const, required: false, startedAt: "t" };
    const b = { name: "x", outcome: "pass" as const, required: false, startedAt: "t" };
    expect(dedupe([a, b, check("pass", "y")])).toEqual([b, check("pass", "y")]);
  });
});

describe("verdict and exit code", () => {
  it("never calls an empty check list green", () => {
    expect(verdict([])).toBe("no-checks");
    expect(settled([])).toBe(false);
    expect(exitCode("no-checks")).toBe(2);
  });

  it.each([
    [["pass", "skipped"], "green", 0, true],
    [["pass", "pending"], "pending", 2, false],
    [["pass", "fail"], "failed", 1, true],
    [["pass", "cancelled"], "failed", 1, true],
    // A failure is decisive while other checks still run.
    [["fail", "pending"], "failed", 1, false],
  ] as const)("%j → %s, exit %i", (outcomes, v, code, done) => {
    const checks = outcomes.map((o, i) => check(o, `c${i}`));
    expect(verdict(checks)).toBe(v);
    expect(exitCode(verdict(checks))).toBe(code);
    expect(settled(checks)).toBe(done);
  });

  it("counts every outcome", () => {
    expect(counts([check("pass"), check("pass", "p2"), check("cancelled"), check("pending")])).toEqual({ pass: 2, skipped: 0, fail: 0, cancelled: 1, pending: 1 });
  });
});

describe("parseDuration", () => {
  it.each([
    ["45m", 2_700_000],
    ["90s", 90_000],
    ["1s", 1_000],
    ["1h30m", 5_400_000],
    ["2h", 7_200_000],
    ["45", 2_700_000],
    ["1", 60_000],
    [" 10m ", 600_000],
  ])("%s is %i ms", (text, ms) => {
    expect(parseDuration(text)).toBe(ms);
  });

  it.each(["0", "0m", "0s0m", "", "-5", "45x", "1.5h", "m", "1h1h", "45 m", "1d"])("refuses %j", (text) => {
    expect(parseDuration(text)).toBeNull();
  });

  it("refuses a missing value", () => {
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [59_499, "59s"],
    [59_500, "1m00s"],
    [60_000, "1m00s"],
    [372_000, "6m12s"],
    [3_599_000, "59m59s"],
    [3_600_000, "1h00m"],
    [5_430_000, "1h30m"],
  ])("%i ms is %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text);
  });
});
