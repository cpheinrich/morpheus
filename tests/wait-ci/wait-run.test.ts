import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { usageError, waitCiCommand, type WaitCiFlags } from "../../src/cli/wait-ci.js";
import { jobCheck, latestRun, parseRun, parseRunList, repoFromRunUrl, RUN_FIELDS, RUN_VIEW_FIELDS, type RunSnapshot, runVerdict } from "../../src/wait-ci/runs.js";
import { FIRST_DELAY_MS, type GhResult, NO_CHECKS_GRACE_MS, type WaitDeps } from "../../src/wait-ci/wait.js";
import { ALREADY_COMPLETE_SETTLE_MS, waitRun } from "../../src/wait-ci/wait-run.js";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const ok = (stdout: unknown): GhResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
const fail = (stderr: string): GhResult => ({ code: 1, stdout: "", stderr });

/** `gh run view 40756483538 --json …` against cpheinrich/morpheus, steps dropped: a real failed CI run. */
const FAILED = JSON.parse(fixture("run-failed.json")) as Record<string, unknown>;
const SHA = "d9ca0a1ffa7abdae5c7e46e30302c267181400e9";

function runJson(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { ...FAILED, ...overrides };
}
const inProgress = (overrides: Record<string, unknown> = {}) =>
  runJson({
    status: "in_progress",
    conclusion: "",
    jobs: [
      { name: "build", status: "completed", conclusion: "success", databaseId: 1, url: "https://github.com/cpheinrich/morpheus/actions/runs/40756483538/job/1" },
      { name: "upload", status: "in_progress", conclusion: "", databaseId: 2, url: "https://github.com/cpheinrich/morpheus/actions/runs/40756483538/job/2" },
    ],
    ...overrides,
  });
const succeeded = (overrides: Record<string, unknown> = {}) =>
  runJson({
    status: "completed",
    conclusion: "success",
    jobs: [
      { name: "build", status: "completed", conclusion: "success", databaseId: 1 },
      { name: "upload", status: "completed", conclusion: "success", databaseId: 2 },
      { name: "notify", status: "completed", conclusion: "skipped", databaseId: 3 },
    ],
    ...overrides,
  });
/** A `gh run list` row: no jobs. */
const row = (id: number, status: string, conclusion: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  databaseId: id,
  status,
  conclusion,
  headSha: SHA,
  headBranch: "main",
  event: "workflow_dispatch",
  workflowName: "TestFlight",
  url: `https://github.com/acme/app/actions/runs/${id}`,
  createdAt,
  attempt: 1,
  ...extra,
});

/**
 * A scripted `gh`: `run view <id>` takes the next scripted view (the last
 * repeats), `run list` the next scripted list, and `run view --job` answers
 * from `logs`. Every call is recorded with the clock it happened at.
 */
function fakeGh(views: GhResult[], lists: GhResult[] = [], logs: Record<string, GhResult> = {}) {
  const calls: string[][] = [];
  const sleeps: number[] = [];
  let t = 0;
  let v = 0;
  let l = 0;
  const deps: WaitDeps = {
    gh: async (args) => {
      calls.push(args);
      if (args[0] === "run" && args[1] === "list") return lists[Math.min(l++, lists.length - 1)]!;
      if (args[0] === "run" && args[1] === "view" && args.includes("--job")) return logs[args[args.indexOf("--job") + 1]!] ?? fail("no log scripted");
      if (args[0] === "run" && args[1] === "view") return views[Math.min(v++, views.length - 1)]!;
      throw new Error(`unexpected gh ${args.join(" ")}`);
    },
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
    now: () => t,
  };
  return { deps, calls, sleeps };
}

const opts = { timeoutMs: 45 * 60_000 };

describe("reading runs", () => {
  it("parses a real failed run into jobs with outcomes and job ids", () => {
    const run = parseRun(FAILED) as RunSnapshot;
    expect(run).toMatchObject({ id: 40756483538, status: "completed", conclusion: "failure", headSha: SHA, workflow: "CI", attempt: 1, event: "pull_request" });
    expect(run.jobs!.map((j) => `${j.name}=${j.outcome}`)).toEqual([
      "changes=pass",
      "pr / conventions=fail",
      "pm / pm=pass",
      "agent-review / review=skipped",
      "agent-review / delivery=skipped",
      "artifact-abi=pass",
      "qa-browser=pass",
      "codex-claude=pass",
      "node / check=pass",
    ]);
    expect(run.jobs![1]!.jobId).toBe("123056649367");
    expect(runVerdict(run)).toBe("failed");
  });

  it("maps gh's lowercase job states through the one outcome table", () => {
    expect(jobCheck({ status: "queued", conclusion: "" }).outcome).toBe("pending");
    expect(jobCheck({ status: "waiting", conclusion: "" }).outcome).toBe("pending");
    expect(jobCheck({ status: "completed", conclusion: "cancelled" }).outcome).toBe("cancelled");
    expect(jobCheck({ status: "completed", conclusion: "timed_out" }).outcome).toBe("fail");
    // A completed job with no conclusion is not evidence of success.
    expect(jobCheck({ status: "completed", conclusion: "" }).outcome).toBe("fail");
  });

  it.each([
    ["in_progress", "", "pending"],
    ["queued", "", "pending"],
    ["completed", "success", "green"],
    ["completed", "neutral", "green"],
    ["completed", "skipped", "green"],
    ["completed", "failure", "failed"],
    ["completed", "cancelled", "failed"],
    ["completed", "startup_failure", "failed"],
    ["completed", "action_required", "failed"],
    ["completed", "some_new_value", "failed"],
  ])("a %s run concluding %j is %s", (status, conclusion, verdict) => {
    expect(runVerdict(parseRun(runJson({ status, conclusion })) as RunSnapshot)).toBe(verdict);
  });

  it("decides by the run's conclusion, not a continue-on-error job", () => {
    const run = parseRun(runJson({ conclusion: "success" })) as RunSnapshot;
    expect(run.jobs!.some((j) => j.outcome === "fail")).toBe(true);
    expect(runVerdict(run)).toBe("green");
  });

  it("rejects a malformed row instead of dropping it from the list", () => {
    expect(parseRunList([row(1, "completed", "success", "2026-10-28T10:00:00Z"), { status: "completed" }])).toEqual({ error: "a run row has no databaseId, status or headSha" });
    expect(parseRunList({})).toEqual({ error: "gh run list did not return an array" });
  });

  it("selects the newest run by creation time, then id, whatever order gh returned", () => {
    const runs = parseRunList([
      row(10, "completed", "success", "2026-10-28T10:00:00Z"),
      row(30, "in_progress", "", "2026-10-28T12:00:00Z"),
      row(20, "completed", "failure", "2026-10-28T12:00:00Z"),
    ]) as RunSnapshot[];
    expect(latestRun(runs)!.id).toBe(30);
    expect(latestRun([...runs].reverse())!.id).toBe(30);
    expect(latestRun([])).toBeUndefined();
  });

  it("reads the repository from a run URL", () => {
    expect(repoFromRunUrl("https://github.com/acme/app/actions/runs/123")).toBe("acme/app");
    expect(repoFromRunUrl("https://example.com/x")).toBeUndefined();
  });
});

describe("waitRun --run", () => {
  it("waits silently with backoff and returns one green line", async () => {
    const { deps, calls, sleeps } = fakeGh([ok(inProgress()), ok(inProgress()), ok(succeeded())]);
    const result = await waitRun(deps, { ...opts, run: "40756483538", repo: "cpheinrich/morpheus" });
    expect(result).toEqual({
      exitCode: 0,
      output: `✓ Run green — cpheinrich/morpheus CI run 40756483538 @ d9ca0a1 on ${FAILED["headBranch"]} (3 jobs: 2 passed, 1 skipped) after 25s`,
    });
    expect(sleeps).toEqual([FIRST_DELAY_MS, 15_000]);
    expect(calls).toEqual(Array(3).fill(["run", "view", "40756483538", "--repo", "cpheinrich/morpheus", "--json", RUN_VIEW_FIELDS]));
  });

  it("reports a failed run with the failing step's own words and exit 1", async () => {
    const { deps, calls } = fakeGh([ok(FAILED)], [], { "123056649367": ok(fixture("run-failed-conventions.txt")) });
    const result = await waitRun(deps, { ...opts, run: "40756483538" });
    expect(result.exitCode).toBe(1);
    const lines = result.output.split("\n");
    // No --repo given: the repository comes from the run's own URL.
    expect(lines[0]).toBe(`✗ Run failed — cpheinrich/morpheus CI run 40756483538 @ d9ca0a1 on ${FAILED["headBranch"]} (9 jobs: 6 passed, 2 skipped, 1 failed) after 0s`);
    expect(lines[1]).toBe("  ✗ pr / conventions — https://github.com/cpheinrich/morpheus/actions/runs/40756483538/job/123056649367");
    expect(result.output).toContain('│ ✗ [test-plan] PR body needs a non-empty "## Test plan" section.');
    expect(result.output).toContain("│ error: Process completed with exit code 1.");
    expect(result.output).not.toContain("Post job cleanup");
    expect(lines.at(-1)).toBe("  run: https://github.com/cpheinrich/morpheus/actions/runs/40756483538");
    expect(calls.at(-1)).toEqual(["run", "view", "--repo", "cpheinrich/morpheus", "--job", "123056649367", "--log-failed"]);
  });

  it("names a cancelled run as cancelled and still exits 1", async () => {
    const { deps } = fakeGh([ok(runJson({ conclusion: "cancelled", jobs: [{ name: "upload", status: "completed", conclusion: "cancelled", databaseId: 9 }] }))]);
    const result = await waitRun(deps, { ...opts, run: "40756483538" });
    expect(result.exitCode).toBe(1);
    expect(result.output.split("\n").slice(0, 2)).toEqual([
      `✗ Run cancelled — cpheinrich/morpheus CI run 40756483538 @ d9ca0a1 on ${FAILED["headBranch"]} (1 job: 1 cancelled) after 0s`,
      "  ⊘ upload",
    ]);
  });

  it("stops at the deadline with exit 2 and lists what is still running", async () => {
    const { deps, sleeps } = fakeGh([ok(inProgress())]);
    const result = await waitRun(deps, { timeoutMs: 30_000, run: "40756483538" });
    expect(result.exitCode).toBe(2);
    expect(sleeps).toEqual([10_000, 15_000, 5_000]);
    expect(result.output.split("\n")).toEqual([
      `… Run still in progress at the deadline — cpheinrich/morpheus CI run 40756483538 @ d9ca0a1 on ${FAILED["headBranch"]} (2 jobs: 1 passed, 1 running) after 30s`,
      "  … upload — https://github.com/cpheinrich/morpheus/actions/runs/40756483538/job/2",
      "  run: https://github.com/cpheinrich/morpheus/actions/runs/40756483538",
    ]);
  });

  it("fails fast with exit 3 when the very first read fails — a mistyped id is not a network blip", async () => {
    const { deps, sleeps } = fakeGh([fail("could not find any workflow run with ID 9")]);
    expect(await waitRun(deps, { ...opts, run: "9" })).toEqual({ exitCode: 3, output: "wait-ci: could not read run 9: could not find any workflow run with ID 9" });
    expect(sleeps).toEqual([]);
  });

  it("tolerates two failed polls after a good one and gives up on the third", async () => {
    const twoBlips = fakeGh([ok(inProgress()), fail("HTTP 502"), fail("HTTP 502"), ok(succeeded())]);
    expect((await waitRun(twoBlips.deps, { ...opts, run: "1" })).exitCode).toBe(0);
    const three = fakeGh([ok(inProgress()), fail("HTTP 502"), fail("HTTP 502"), fail("HTTP 503")]);
    expect(await waitRun(three.deps, { ...opts, run: "1" })).toEqual({ exitCode: 3, output: "wait-ci: 3 consecutive polls of run 1 failed; last: HTTP 503" });
  });
});

describe("waitRun --workflow", () => {
  const listArgs = (extra: string[] = []) => ["run", "list", "--repo", "acme/app", "--workflow", "testflight.yml", ...extra, "--limit", "20", "--json", RUN_FIELDS];

  it("follows the latest matching run to completion, reading its jobs once at the end", async () => {
    const { deps, calls } = fakeGh(
      [ok(succeeded({ databaseId: 7, url: "https://github.com/acme/app/actions/runs/7", workflowName: "TestFlight", headBranch: "main" }))],
      [
        ok([row(7, "queued", "", "2026-10-28T12:00:00Z"), row(6, "completed", "success", "2026-10-28T09:00:00Z")]),
        ok([row(7, "completed", "success", "2026-10-28T12:00:00Z"), row(6, "completed", "success", "2026-10-28T09:00:00Z")]),
      ],
    );
    const result = await waitRun(deps, { ...opts, workflow: "testflight.yml", branch: "main", repo: "acme/app" });
    expect(result).toEqual({ exitCode: 0, output: "✓ Run green — acme/app TestFlight run 7 @ d9ca0a1 on main (3 jobs: 2 passed, 1 skipped) after 10s" });
    expect(calls).toEqual([
      listArgs(["--branch", "main"]),
      listArgs(["--branch", "main"]),
      ["run", "view", "7", "--repo", "acme/app", "--json", RUN_VIEW_FIELDS],
    ]);
  });

  it("follows a newer run that starts mid-wait and names the move", async () => {
    const { deps } = fakeGh(
      [ok(succeeded({ databaseId: 8, url: "https://github.com/acme/app/actions/runs/8", workflowName: "TestFlight", headBranch: "main" }))],
      [
        ok([row(7, "in_progress", "", "2026-10-28T12:00:00Z")]),
        ok([row(8, "queued", "", "2026-10-28T12:05:00Z"), row(7, "in_progress", "", "2026-10-28T12:00:00Z")]),
        ok([row(8, "completed", "success", "2026-10-28T12:05:00Z"), row(7, "completed", "cancelled", "2026-10-28T12:00:00Z")]),
      ],
    );
    const result = await waitRun(deps, { ...opts, workflow: "testflight.yml", repo: "acme/app" });
    expect(result.exitCode).toBe(0);
    expect(result.output.split("\n")[1]).toBe("! a newer matching run started during the wait: 7 → 8; results are for run 8 only");
  });

  it("holds an already-finished latest run for the settle window, then flags it; --sha reports at once", async () => {
    const lists = [ok([row(6, "completed", "success", "2026-10-28T09:00:00Z")])];
    const view = [ok(succeeded({ databaseId: 6, url: "https://github.com/acme/app/actions/runs/6" }))];
    const branch = fakeGh(view, lists);
    const byBranch = await waitRun(branch.deps, { ...opts, workflow: "testflight.yml", branch: "main", repo: "acme/app" });
    // Held at least ALREADY_COMPLETE_SETTLE_MS: 10 s is inside it, 25 s is past it.
    expect(ALREADY_COMPLETE_SETTLE_MS).toBe(20_000);
    expect(branch.sleeps).toEqual([10_000, 15_000]);
    expect(byBranch.output.split("\n")).toEqual([
      "✓ Run green — acme/app TestFlight run 6 @ d9ca0a1 on main (3 jobs: 2 passed, 1 skipped) after 25s",
      "! run 6 had already finished when the wait began and no newer run started; to wait for a specific one, pass --run <id> or --sha <commit>",
    ]);
    const sha = fakeGh(view, lists);
    const bySha = await waitRun(sha.deps, { ...opts, workflow: "testflight.yml", sha: SHA, repo: "acme/app" });
    expect(sha.sleeps).toEqual([]);
    expect(bySha.output.split("\n")).toEqual(["✓ Run green — acme/app TestFlight run 6 @ d9ca0a1 on main (3 jobs: 2 passed, 1 skipped) after 0s"]);
  });

  it("follows a run dispatched just before the wait instead of answering with the previous run", async () => {
    // `gh workflow run testflight.yml` then `wait-ci --workflow testflight.yml --branch main`:
    // the new run is not listed on the first look, and the last one failed.
    const { deps } = fakeGh(
      [ok(succeeded({ databaseId: 7, url: "https://github.com/acme/app/actions/runs/7", workflowName: "TestFlight", headBranch: "main" }))],
      [
        ok([row(6, "completed", "failure", "2026-10-28T09:00:00Z")]),
        ok([row(7, "queued", "", "2026-10-28T12:00:00Z"), row(6, "completed", "failure", "2026-10-28T09:00:00Z")]),
        ok([row(7, "completed", "success", "2026-10-28T12:00:00Z")]),
      ],
    );
    const result = await waitRun(deps, { ...opts, workflow: "testflight.yml", branch: "main", repo: "acme/app" });
    expect(result.exitCode).toBe(0);
    expect(result.output.split("\n")).toEqual([
      "✓ Run green — acme/app TestFlight run 7 @ d9ca0a1 on main (3 jobs: 2 passed, 1 skipped) after 20s",
      "! a newer matching run started during the wait: 6 → 7; results are for run 7 only",
    ]);
  });

  it("passes --commit for --sha", async () => {
    const { deps, calls } = fakeGh([ok(succeeded())], [ok([row(6, "completed", "success", "2026-10-28T09:00:00Z")])]);
    await waitRun(deps, { ...opts, workflow: "testflight.yml", sha: SHA, repo: "acme/app" });
    expect(calls[0]).toEqual(listArgs(["--commit", SHA]));
  });

  it("waits the no-checks grace for a run to appear, then exits 2 naming what it looked for", async () => {
    const { deps, sleeps } = fakeGh([], [ok([])]);
    const result = await waitRun(deps, { ...opts, workflow: "nightly.yml", branch: "main" });
    expect(result.exitCode).toBe(2);
    expect(result.output).toBe("? No run of nightly.yml on main found after 3m12s — it may not have been triggered yet, or the filter matches nothing");
    // The grace is a floor: the last sleep crosses it, never a deadline-sized wait.
    expect(sleeps.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(NO_CHECKS_GRACE_MS);
    expect(sleeps.reduce((a, b) => a + b, 0) - sleeps.at(-1)!).toBeLessThan(NO_CHECKS_GRACE_MS);
  });

  it("picks up a run that appears within the grace", async () => {
    const { deps } = fakeGh(
      [ok(succeeded({ databaseId: 9, url: "https://github.com/acme/app/actions/runs/9" }))],
      [ok([]), ok([]), ok([row(9, "completed", "success", "2026-10-28T12:00:00Z")])],
    );
    const result = await waitRun(deps, { ...opts, workflow: "nightly.yml", sha: SHA });
    expect(result.exitCode).toBe(0);
  });

  it("still reports the verdict when the final job read fails", async () => {
    const { deps } = fakeGh([fail("HTTP 502")], [ok([row(7, "completed", "failure", "2026-10-28T12:00:00Z")])]);
    const result = await waitRun(deps, { ...opts, workflow: "testflight.yml", sha: SHA });
    expect(result.exitCode).toBe(1);
    expect(result.output.split("\n")).toEqual([
      "✗ Run failed — acme/app TestFlight run 7 @ d9ca0a1 on main after 0s",
      "  (job list unavailable: HTTP 502)",
      "  run: https://github.com/acme/app/actions/runs/7",
    ]);
  });

  it("refuses an unknown workflow at once", async () => {
    const { deps } = fakeGh([], [fail("could not find any workflows named nope")]);
    expect(await waitRun(deps, { ...opts, workflow: "nope" })).toEqual({ exitCode: 3, output: "wait-ci: could not read nope: could not find any workflows named nope" });
  });
});

describe("wait-ci usage", () => {
  const base: WaitCiFlags = { extra: [], requiredOnly: false };
  it.each<[Partial<WaitCiFlags>, string]>([
    [{ target: "12", run: "3" }, "wait-ci takes one of <pr|branch>, --run <id> or --workflow <name|file>, not several."],
    [{ run: "3", workflow: "ci.yml" }, "wait-ci takes one of <pr|branch>, --run <id> or --workflow <name|file>, not several."],
    [{ run: "https://github.com/o/r/actions/runs/3" }, '--run takes a workflow run\'s numeric id, got "https://github.com/o/r/actions/runs/3".'],
    [{ branch: "main" }, "--branch and --sha select among a workflow's runs; use them with --workflow <name|file>."],
    [{ target: "12", sha: "abc" }, "--branch and --sha select among a workflow's runs; use them with --workflow <name|file>."],
    [{ run: "3", requiredOnly: true }, "--required-only applies to a pull request's checks; a run's own conclusion decides --run and --workflow."],
    // gh's --commit matches only a full SHA: a short one would wait out the grace and say CI never started.
    [{ workflow: "ci.yml", sha: "322d674" }, '--sha takes a full 40-character commit SHA (gh matches no other form), got "322d674"; try `git rev-parse 322d674`.'],
    [{ workflow: "ci.yml", sha: `${SHA}0` }, `--sha takes a full 40-character commit SHA (gh matches no other form), got "${SHA}0"; try \`git rev-parse ${SHA}0\`.`],
  ])("refuses %j", (flags, message) => {
    expect(usageError({ ...base, ...flags })).toBe(message);
  });

  it.each<Partial<WaitCiFlags>>([{}, { target: "12" }, { run: "3" }, { workflow: "ci.yml", branch: "main", sha: SHA }, { workflow: "ci.yml", sha: SHA.toUpperCase() }])("accepts %j", (flags) => {
    expect(usageError({ ...base, ...flags })).toBeNull();
  });

  it("exits 3 on a usage error without calling gh", async () => {
    const never = async (): Promise<GhResult> => {
      throw new Error("gh must not be called on a usage error");
    };
    expect(await waitCiCommand({ ...base, run: "3", workflow: "ci.yml" }, never)).toBe(3);
  });
});
