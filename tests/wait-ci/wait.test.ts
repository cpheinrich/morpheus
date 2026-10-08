import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { waitCiCommand } from "../../src/cli/wait-ci.js";
import { type Check, checkKey } from "../../src/wait-ci/checks.js";
import { renderDigest } from "../../src/wait-ci/digest.js";
import {
  FIRST_DELAY_MS,
  type GhResult,
  MAX_DELAY_MS,
  NO_CHECKS_GRACE_MS,
  nextDelay,
  waitCi,
  type WaitDeps,
} from "../../src/wait-ci/wait.js";
import { rollup, run } from "./helpers.js";

const fixture = (name: string) => readFileSync(join(import.meta.dirname, "fixtures", name), "utf8");
const ok = (stdout: unknown): GhResult => ({ code: 0, stdout: typeof stdout === "string" ? stdout : JSON.stringify(stdout), stderr: "" });
const fail = (stderr: string): GhResult => ({ code: 1, stdout: "", stderr });
const PR = ok({ number: 354, url: "https://github.com/cpheinrich/morpheus/pull/354" });
const SHA_A = "59cb7d56ee05e3784d640a0497b7a8e03a5c4219";
const SHA_B = "dcd95b702c31929528dd99a27fe9a6b65228d6ed";

/**
 * A scripted `gh`: `pr view` resolves the PR, each `api graphql` call takes the
 * next scripted poll (the last repeats), and `run view` answers from `logs`.
 */
function fakeGh(polls: GhResult[], logs: Record<string, GhResult> = {}, resolve: GhResult = PR) {
  const calls: string[][] = [];
  const sleeps: number[] = [];
  let t = 0;
  let i = 0;
  const deps: WaitDeps = {
    gh: async (args) => {
      calls.push(args);
      if (args[0] === "pr") return resolve;
      if (args[0] === "api") return polls[Math.min(i++, polls.length - 1)]!;
      if (args[0] === "run") return logs[args[args.indexOf("--job") + 1]!] ?? fail("no log scripted");
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

const opts = { timeoutMs: 45 * 60_000, requiredOnly: false };
const pending = (sha = SHA_A) => ok(rollup(sha, [run("node / check", "IN_PROGRESS", null, { required: true }), run("pm / pm", "COMPLETED", "SUCCESS", { required: true, job: "2" })]));
const green = (sha = SHA_A) => ok(rollup(sha, [run("node / check", "COMPLETED", "SUCCESS", { required: true }), run("pm / pm", "COMPLETED", "SUCCESS", { required: true, job: "2" })]));

describe("nextDelay", () => {
  it("starts at the first delay, grows by half, caps, and never sleeps past the deadline", () => {
    expect(nextDelay(null, Infinity)).toBe(FIRST_DELAY_MS);
    expect(nextDelay(10_000, Infinity)).toBe(15_000);
    expect(nextDelay(50_000, Infinity)).toBe(MAX_DELAY_MS);
    expect(nextDelay(MAX_DELAY_MS, Infinity)).toBe(MAX_DELAY_MS);
    expect(nextDelay(10_000, 4_000)).toBe(4_000);
    expect(nextDelay(10_000, 0)).toBe(0);
  });
});

describe("waitCi", () => {
  it("waits silently with backoff and returns one green line", async () => {
    const { deps, sleeps, calls } = fakeGh([pending(), pending(), pending(), green()]);
    const result = await waitCi(deps, { ...opts, target: "354" });
    expect(result).toEqual({ exitCode: 0, output: "✓ CI green — cpheinrich/morpheus#354 @ 59cb7d5 (2 checks: 2 passed) after 48s" });
    expect(sleeps).toEqual([10_000, 15_000, 10_000 * 1.5 * 1.5]);
    expect(calls[0]).toEqual(["pr", "view", "354", "--json", "number,url"]);
    expect(calls.filter((c) => c[0] === "run")).toEqual([]);
  });

  it("passes --repo through to the PR lookup", async () => {
    const { deps, calls } = fakeGh([green()]);
    await waitCi(deps, { ...opts, target: "feature-branch", repo: "cpheinrich/morpheus" });
    expect(calls[0]).toEqual(["pr", "view", "feature-branch", "--repo", "cpheinrich/morpheus", "--json", "number,url"]);
  });

  it("follows a head that moves mid-wait and names the move, reporting only the new head", async () => {
    const { deps, sleeps } = fakeGh([pending(SHA_A), pending(SHA_B), green(SHA_B)]);
    const result = await waitCi(deps, opts);
    expect(result.exitCode).toBe(0);
    expect(result.output.split("\n")).toEqual([
      "✓ CI green — cpheinrich/morpheus#354 @ dcd95b7 (2 checks: 2 passed) after 20s",
      "! head moved during the wait: 59cb7d5 → dcd95b7; results are for dcd95b7 only",
    ]);
    // Backoff restarts for the new head.
    expect(sleeps).toEqual([10_000, 10_000]);
  });

  it("stops at the deadline with exit 2 and lists what is still running", async () => {
    const { deps, sleeps } = fakeGh([pending()]);
    const result = await waitCi(deps, { ...opts, timeoutMs: 30_000 });
    expect(result.exitCode).toBe(2);
    expect(sleeps).toEqual([10_000, 15_000, 5_000]);
    expect(result.output.split("\n")).toEqual([
      "… CI still running at the deadline — cpheinrich/morpheus#354 @ 59cb7d5 (2 checks: 1 passed, 1 running) after 30s",
      "  … node / check (CI) — https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/113138012168",
    ]);
  });

  it("fetches the failing job's log by job id and prints only the failing step", async () => {
    const red = ok(rollup(SHA_A, [run("node / check", "COMPLETED", "FAILURE", { required: true, job: "111125356260" }), run("pm / pm", "COMPLETED", "SUCCESS", { job: "2" })]));
    const { deps, calls } = fakeGh([red], { "111125356260": ok(fixture("build-diff.txt")) });
    const result = await waitCi(deps, opts);
    expect(result.exitCode).toBe(1);
    expect(calls.find((c) => c[0] === "run")).toEqual(["run", "view", "--repo", "cpheinrich/morpheus", "--job", "111125356260", "--log-failed"]);
    const lines = result.output.split("\n");
    expect(lines.slice(0, 4)).toEqual([
      "✗ CI failed — cpheinrich/morpheus#354 @ 59cb7d5 (2 checks: 1 passed, 1 failed) after 0s",
      "  ✗ node / check (CI) — https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/111125356260",
      '      step: if [ -z "$BUILD_OUTPUT_DIRECTORY" ]; then',
      "      │ diff --git a/dist/cli/dispatch.js b/dist/cli/dispatch.js",
    ]);
    expect(lines[18]).toMatch(/^ {6}│ … \d+ lines omitted …$/);
    expect(lines.at(-1)).toBe("      │ error: Process completed with exit code 1.");
    // One failed job gets the whole 60-line budget plus header, verdict and gap marker.
    expect(lines).toHaveLength(60 + 4);
  });

  it("labels a conventions failure that is only the label race, and prints no log for it", async () => {
    const red = ok(rollup(SHA_A, [run("pr / conventions", "COMPLETED", "FAILURE", { required: true, job: "112762456967" }), run("node / check", "COMPLETED", "SUCCESS", { job: "2" })]));
    const { deps } = fakeGh([red], { "112762456967": ok(fixture("label-race.txt")) });
    const result = await waitCi(deps, opts);
    expect(result.exitCode).toBe(1);
    expect(result.output.split("\n")).toEqual([
      "✗ CI blocked only by the agent-reviewed label race — cpheinrich/morpheus#354 @ 59cb7d5 (2 checks: 1 passed, 1 failed) after 0s",
      "  ✗ pr / conventions (CI) — https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/112762456967 — label race: agent-reviewed not applied yet; not a code failure",
      "  Nothing to fix in code: apply agent-reviewed once the independent review is recorded, then re-check.",
    ]);
  });

  it("decides the label race on the whole step, so a real ✗ trimmed from the middle still counts", async () => {
    const line = (t: string) => `pr / conventions\tUNKNOWN STEP\t2026-10-07T11:11:14.0000000Z ${t}`;
    const raw = [
      line("##[group]Run set -euo pipefail"),
      line("##[endgroup]"),
      line("✗ [agent-review] agent-reviewed label is not applied, so the PR is not marked merge-ready."),
      ...Array.from({ length: 40 }, (_, i) => line(`detail ${i}`)),
      line("✗ [tests] source changed with no test change"),
      ...Array.from({ length: 60 }, (_, i) => line(`more ${i}`)),
      line("2 blocking issue(s)."),
      line("##[error]Process completed with exit code 1."),
    ].join("\n");
    const red = ok(rollup(SHA_A, [run("pr / conventions", "COMPLETED", "FAILURE", { required: true, job: "7" })]));
    const result = await waitCi(fakeGh([red], { "7": ok(raw) }).deps, opts);
    const lines = result.output.split("\n");
    expect(lines[0]).toMatch(/^✗ CI failed — /);
    // The trimmed view really did lose the second ✗ ...
    expect(lines.some((l) => l.includes("[tests]"))).toBe(false);
    // ... and the check is still not called a label race.
    expect(lines[1]).toBe("  ✗ pr / conventions (CI) — https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/7");
  });

  it("says when a failing job's log could not be read, rather than omitting the job", async () => {
    const red = ok(rollup(SHA_A, [run("node / check", "COMPLETED", "FAILURE", { job: "9" })]));
    const { deps } = fakeGh([red], { "9": fail("HTTP 410: logs expired\nmore") });
    const result = await waitCi(deps, opts);
    expect(result.output.split("\n").slice(1)).toEqual([
      "  ✗ node / check (CI) — https://github.com/cpheinrich/morpheus/actions/runs/37724037716/job/9",
      "      (log unavailable: HTTP 410: logs expired)",
    ]);
  });

  it("tolerates two failed polls in a row and gives up with exit 3 on the third", async () => {
    const twice = fakeGh([fail("timeout"), fail("timeout"), green()]);
    expect((await waitCi(twice.deps, opts)).exitCode).toBe(0);
    const thrice = fakeGh([fail("timeout"), fail("timeout"), fail("HTTP 502")]);
    expect(await waitCi(thrice.deps, opts)).toEqual({ exitCode: 3, output: "wait-ci: 3 consecutive polls of cpheinrich/morpheus#354 failed; last: HTTP 502" });
    const reset = fakeGh([fail("a"), fail("b"), pending(), fail("c"), fail("d"), green()]);
    expect((await waitCi(reset.deps, opts)).exitCode).toBe(0);
  });

  it("treats no checks as not-yet-created until the grace period, then reports no CI", async () => {
    const empty = ok(rollup(SHA_A, []));
    const late = fakeGh([empty, empty, empty, empty, green()]);
    // 10 + 15 + 22.5 + 33.75 s of empty polls is under three minutes, so it keeps waiting.
    expect((await waitCi(late.deps, opts)).exitCode).toBe(0);

    const never = fakeGh([empty]);
    const result = await waitCi(never.deps, opts);
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/^\? No checks reported on cpheinrich\/morpheus#354 @ 59cb7d5 after 3m\d\ds — /);
    const total = never.sleeps.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThanOrEqual(NO_CHECKS_GRACE_MS);
    expect(total - never.sleeps.at(-1)!).toBeLessThan(NO_CHECKS_GRACE_MS);
  });

  it("--required-only ignores a failing optional check", async () => {
    const mixed = ok(rollup(SHA_A, [run("node / check", "COMPLETED", "SUCCESS", { required: true }), run("codex-claude", "COMPLETED", "FAILURE", { job: "3" })]));
    expect((await waitCi(fakeGh([mixed]).deps, opts)).exitCode).toBe(1);
    expect(await waitCi(fakeGh([mixed]).deps, { ...opts, requiredOnly: true })).toEqual({
      exitCode: 0,
      output: "✓ CI green — cpheinrich/morpheus#354 @ 59cb7d5 (required 1 check: 1 passed) after 0s",
    });
  });

  it("--required-only with no required checks says so instead of waiting forever", async () => {
    const optional = ok(rollup(SHA_A, [run("codex-claude", "COMPLETED", "SUCCESS")]));
    const result = await waitCi(fakeGh([optional]).deps, { ...opts, requiredOnly: true });
    expect(result.exitCode).toBe(2);
    expect(result.output).toMatch(/^\? No required checks on cpheinrich\/morpheus#354 @ 59cb7d5 after 3m\d\ds \(1 non-required ignored by --required-only\)$/);
  });

  it("an unresolvable PR is exit 3 with gh's own first line", async () => {
    const { deps } = fakeGh([green()], {}, fail("no pull requests found for branch \"topic\"\nhint"));
    expect(await waitCi(deps, { ...opts, target: "topic" })).toEqual({
      exitCode: 3,
      output: 'wait-ci: could not find the pull request: no pull requests found for branch "topic"',
    });
  });
});

describe("renderDigest", () => {
  const base = { repo: "o/r", pr: 7, headSha: SHA_A, elapsedMs: 61_000, timedOut: false, details: new Map(), movedFrom: [], requiredOnly: false, truncated: false, ignored: 0 };
  const c = (name: string, outcome: Check["outcome"], url?: string): Check => ({ name, outcome, required: false, url });

  it("marks cancelled checks distinctly and notes a truncated rollup", () => {
    const out = renderDigest({ ...base, verdict: "failed", truncated: true, checks: [c("deploy", "cancelled", "https://x/1"), c("lint", "pass")] });
    expect(out.split("\n")).toEqual([
      "✗ CI failed — o/r#7 @ 59cb7d5 (2 checks: 1 passed, 1 cancelled) after 1m01s",
      "! more than 100 checks: only the first page was read",
      "  ⊘ deploy — https://x/1",
    ]);
  });

  it("a real failure beside a label race is a failure, with both listed", () => {
    const race = c("pr / conventions", "fail");
    const test = c("node / check", "fail");
    const details = new Map([[checkKey(race), { labelRace: true }], [checkKey(test), { log: { step: "pnpm test", lines: ["FAIL x"], omitted: 0, omittedAfter: 1 } }]]);
    const out = renderDigest({ ...base, verdict: "failed", details, checks: [race, test] });
    expect(out.split("\n")).toEqual([
      "✗ CI failed — o/r#7 @ 59cb7d5 (2 checks: 2 failed) after 1m01s",
      "  ✗ pr / conventions — label race: agent-reviewed not applied yet; not a code failure",
      "  ✗ node / check",
      "      step: pnpm test",
      "      │ FAIL x",
    ]);
  });

  it("a failure found before the deadline says checks were still running", () => {
    const out = renderDigest({ ...base, verdict: "failed", timedOut: true, checks: [c("a", "fail"), c("b", "pending")] });
    expect(out.split("\n")).toEqual([
      "✗ CI failed — o/r#7 @ 59cb7d5 (2 checks: 1 failed, 1 running) after 1m01s; stopped at the deadline with checks still running",
      "  ✗ a",
      "  … b",
    ]);
  });
});

describe("waitCiCommand usage errors", () => {
  const never = async (): Promise<GhResult> => {
    throw new Error("gh must not be called on a usage error");
  };
  it.each([["0m"], ["soon"], ["-1"]])("refuses --timeout %s with exit 3 before calling gh", async (timeout) => {
    expect(await waitCiCommand({ extra: [], timeout, requiredOnly: false }, never)).toBe(3);
  });
  it("refuses a second positional argument", async () => {
    expect(await waitCiCommand({ target: "1", extra: ["2"], requiredOnly: false }, never)).toBe(3);
  });
});
