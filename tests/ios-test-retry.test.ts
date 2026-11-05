import { execFile } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { load } from "js-yaml";
import { afterEach, describe, expect, it } from "vitest";

// scripts/ios-test-retry.py drives fake xcodebuild and xcrun binaries here. The fake
// simulator remembers whether anything ran on it since it was last erased, and a
// "leftover" test fails on a used simulator: the Evo failure a fresh retry must clear.
// A target listed in NO_START cannot start for its first NO_START_RUNS invocations that select
// it. As in Xcode's export, that bundle then has no test results, only a placeholder Test Case
// under "System Failures" whose name is a sentence rather than a Class/method() identifier.

const exec = promisify(execFile);
const script = resolve("scripts/ios-test-retry.py");
type Behavior = "pass" | "fail" | "leftover" | "unnamed-failure" | "missing-on-retry" | "fail-first-run" | "skip" | "expected-failure";
type Test = { id: string; behavior: Behavior };
type Invocation = { argv: string[]; selected: string[]; deviceWasClean: boolean };
type Step = { id?: string; name?: string; run?: string; env?: Record<string, string> };

const fakeXcodebuild = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === '-help') {
  // Like the real one (Xcode 27.0), the usage goes to stderr, not stdout.
  console.error(process.env.OLD_XCODE ? '-only-testing' : '-only-testing\\n-collect-test-diagnostics on-failure|never');
  process.exit(0);
}
const value = flag => argv[argv.indexOf(flag) + 1];
const only = argv.filter(a => a.startsWith('-only-testing:')).map(a => a.slice(14));
const skip = argv.filter(a => a.startsWith('-skip-testing:')).map(a => a.slice(14));
// An identifier selects itself, everything below it, and a method named without parentheses.
const covers = (id, entry) => id === entry || id.startsWith(entry + '/') || id === entry + '()';
const retry = argv.includes('-collect-test-diagnostics') || /attempt-/.test(value('-resultBundlePath'));
let tests = JSON.parse(process.env.FAKE_TESTS)
  .filter(t => (!only.length || only.some(e => covers(t.id, e))) && !skip.some(e => covers(t.id, e)))
  .filter(t => !(retry && t.behavior === 'missing-on-retry'));
const clean = fs.readFileSync(process.env.SIM_STATE, 'utf8') === 'clean';
const ledger = process.env.EVENTS + '.ran';
const ran = fs.existsSync(ledger) ? fs.readFileSync(ledger, 'utf8').split('\\n') : [];
const placeholders = [];
for (const target of (process.env.NO_START || '').split(',').filter(Boolean)) {
  if (!tests.some(t => t.id.startsWith(target + '/')) && !process.env.NO_START_UNSELECTED) continue;
  const starts = ran.filter(line => line === 'start ' + target).length;
  fs.appendFileSync(ledger, 'start ' + target + '\\n');
  if (starts >= Number(process.env.NO_START_RUNS || 99)) continue;
  // Skipped and expected-failure cases can sit beside the placeholder in the bundle's export.
  tests = tests.filter(t => !t.id.startsWith(target + '/') || t.behavior === 'skip' || t.behavior === 'expected-failure');
  placeholders.push({ id: target + '/App encountered an error', result: 'Failed', placeholder: true });
}
fs.appendFileSync(process.env.EVENTS, JSON.stringify({ argv, selected: tests.map(t => t.id), deviceWasClean: clean }) + '\\n');
const results = tests.map((t, i) => {
  const failed = t.behavior === 'fail' || t.behavior === 'unnamed-failure' || t.behavior === 'missing-on-retry' ||
    (t.behavior === 'leftover' && (!clean || i > 0)) || (t.behavior === 'fail-first-run' && !ran.includes(t.id));
  const other = { skip: 'Skipped', 'expected-failure': 'Expected Failure' }[t.behavior];
  return { ...t, result: failed ? 'Failed' : other || 'Passed' };
}).concat(placeholders);
fs.appendFileSync(ledger, tests.map(t => t.id + '\\n').join(''));
fs.writeFileSync(process.env.SIM_STATE, 'used');
const bundle = value('-resultBundlePath');
fs.mkdirSync(bundle, { recursive: true });
const targets = [...new Set(results.map(t => t.id.split('/')[0]))];
// Containers fail when anything below them fails, as xcresulttool reports them.
const outcome = list => list.some(t => t.result === 'Failed') ? 'Failed' : 'Passed';
const inTarget = target => results.filter(t => t.id.startsWith(target + '/'));
fs.writeFileSync(bundle + '/fake-tests.json', JSON.stringify({ testNodes: [{ nodeType: 'Test Plan', name: 'App', result: outcome(results), children:
  targets.map(target => ({ nodeType: target.endsWith('UITests') ? 'UI test bundle' : 'Unit test bundle', name: target, result: outcome(inTarget(target)), children:
    inTarget(target).map(t => ({ nodeType: 'Test Suite', name: t.placeholder ? 'System Failures' : t.id.split('/')[1], result: t.result, children: [
      { nodeType: 'Test Case', name: t.id.split('/').pop(), nodeIdentifier: t.id.split('/').slice(1).join('/'), result: t.result,
        children: t.result === 'Failed' ? [{ nodeType: 'Failure Message', name: t.placeholder
          ? 'Failed to install or launch the test runner. (Underlying Error: Application failed preflight checks)' : 'failed' }] : [] }] })) })) }] }));
const failures = results.filter(t => t.result === 'Failed').map(t => t.behavior === 'unnamed-failure'
  ? { targetName: t.id.split('/')[0], failureText: 'The test runner crashed' }
  : { targetName: t.id.split('/')[0], testIdentifierString: t.id.split('/').slice(1).join('/'), testName: t.id.split('/').pop() });
const count = result => results.filter(t => t.result === result).length;
const counts = { totalTestCount: results.length, passedTests: count('Passed'), failedTests: failures.length,
  skippedTests: count('Skipped'), expectedFailures: count('Expected Failure') };
fs.writeFileSync(bundle + '/fake-summary.json', JSON.stringify({ result: failures.length ? 'Failed' : 'Passed', ...counts,
  devicesAndConfigurations: [{ device: { deviceName: 'Fake' }, ...counts }], testFailures: failures }));
console.log('xcodebuild ran ' + tests.length + ' tests');
process.exit(failures.length || process.env.FORCE_EXIT ? 65 : 0);
`;

const fakeXcrun = `#!${process.execPath}
const fs = require('node:fs');
const argv = process.argv.slice(2);
if (argv[0] === 'simctl') {
  fs.appendFileSync(process.env.EVENTS, JSON.stringify({ simctl: argv.slice(1) }) + '\\n');
  if (argv[1] === 'erase') {
    if (process.env.FAIL_ERASE) { console.error('Unable to erase'); process.exit(1); }
    fs.writeFileSync(process.env.SIM_STATE, 'clean');
  }
  process.exit(argv[1] === 'shutdown' ? 149 : 0);
}
const kind = argv[3];
const path = argv[argv.indexOf('--path') + 1] + '/fake-' + kind + '.json';
if (!fs.existsSync(path)) process.exit(1);
process.stdout.write(fs.readFileSync(path, 'utf8'));
`;

const device = "12345678-ABCD-ABCD-ABCD-123456789ABC";
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function harness(tests: Test[], extra: Record<string, string> = {}) {
  const dir = await mkdtemp(join(tmpdir(), "ios-test-retry-"));
  dirs.push(dir);
  for (const child of ["bin", "Results", "Logs", ".morpheus-ci/scripts"]) await mkdir(join(dir, child), { recursive: true });
  await symlink(script, join(dir, ".morpheus-ci/scripts/ios-test-retry.py"));
  const fakeGit = `#!/bin/bash\necho ${"a".repeat(40)}\n`;
  for (const [name, body] of [["xcodebuild", fakeXcodebuild], ["xcrun", fakeXcrun], ["git", fakeGit]]) {
    await writeFile(join(dir, "bin", name!), body!);
    await chmod(join(dir, "bin", name!), 0o755);
  }
  await writeFile(join(dir, "pre-test.sh"), 'printf \'{"preTest":"%s","results":"%s","logs":"%s"}\\n\' "$MORPHEUS_IOS_DESTINATION" "$RESULTS" "$LOGS" >> "$EVENTS"\n' +
    'if [ -n "${PRE_TEST_FAIL_ON:-}" ] && [[ "$RESULTS" == *"$PRE_TEST_FAIL_ON" ]]; then exit 7; fi\n');
  await writeFile(join(dir, "sim-state"), "clean");
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>), PATH: `${dir}/bin:${process.env.PATH}`, GITHUB_WORKSPACE: dir,
    RESULTS: join(dir, "Results"), LOGS: join(dir, "Logs"), GITHUB_OUTPUT: join(dir, "output"),
    GITHUB_STEP_SUMMARY: join(dir, "summary.md"), EVENTS: join(dir, "events"), SIM_STATE: join(dir, "sim-state"),
    FAKE_TESTS: JSON.stringify(tests), PROJECT: "App.xcodeproj", SCHEME: "App", CONFIGURATION: "Debug",
    SDK: "iphonesimulator", PLATFORM: "iOS Simulator", DESTINATION: "OS=26.5,name=iPhone 17 Pro Max",
    MORPHEUS_IOS_DESTINATION: `id=${device}`, SOURCE_PACKAGES: join(dir, "packages"), DERIVED_DATA: join(dir, "derived"),
    TEST_PLAN: "", ONLY_TESTING: "", SKIP_TESTING: "", TEST_ITERATIONS: "3", PARALLEL_TESTING: "NO",
    MAXIMUM_PARALLEL_TESTING_WORKERS: "0", PRE_TEST_SCRIPT: "", FIREBASE_EMULATORS: "false", ...extra,
  };
  const run = async (command = ["python3", "-I", "-S", "-B", script]) => {
    try {
      const { stdout } = await exec(command[0]!, command.slice(1), { cwd: dir, env });
      return { code: 0, stdout };
    } catch (error) {
      const failed = error as { code: number; stdout: string };
      return { code: failed.code, stdout: failed.stdout };
    }
  };
  const read = (path: string) => readFile(join(dir, path), "utf8");
  const events = async () => (await read("events")).trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
  const invocations = async () => (await events()).filter((e) => "argv" in e) as unknown as Invocation[];
  return { dir, env, run, read, events, invocations };
}

const unit = "AppTests/ModelTests/testPasses()";
const stale = "AppUITests/LaunchUITests/testFirstLaunchIsFresh()";
const broken = "AppUITests/CheckoutUITests/testAlwaysFails()";

describe("ios-test-retry.py", () => {
  it("passes a test that failed on leftover state once a retry runs it alone in an erased simulator", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }]);
    const { code, stdout } = await h.run();

    expect(code).toBe(0);
    const [first, retry, ...rest] = await h.invocations();
    expect(rest).toEqual([]);
    expect(first!.selected).toEqual([unit, stale]);
    expect(first!.argv).not.toContain("-only-testing:" + stale);
    // Only the failed test reruns, in a new xcodebuild, on the job's erased device.
    expect(retry!.selected).toEqual([stale]);
    expect(retry!.deviceWasClean).toBe(true);
    expect(retry!.argv.filter((a) => a.startsWith("-only-testing:"))).toEqual(["-only-testing:" + stale]);
    expect(retry!.argv).toContain(`platform=iOS Simulator,id=${device}`);
    expect(retry!.argv.slice(retry!.argv.indexOf("-collect-test-diagnostics"), retry!.argv.indexOf("-collect-test-diagnostics") + 2))
      .toEqual(["-collect-test-diagnostics", "never"]);
    expect(retry!.argv.slice(retry!.argv.indexOf("-parallel-testing-enabled"), retry!.argv.indexOf("-parallel-testing-enabled") + 2))
      .toEqual(["-parallel-testing-enabled", "NO"]);
    expect(retry!.argv[retry!.argv.indexOf("-resultBundlePath") + 1]).toBe(join(h.dir, "Results/attempt-2/Tests.xcresult"));
    // xcodebuild's own in-process retry is what kept the leftover state; it must not return.
    for (const invocation of [first!, retry!]) {
      expect(invocation.argv).not.toContain("-retry-tests-on-failure");
      expect(invocation.argv).not.toContain("-test-iterations");
    }
    const simctl = (await h.events()).filter((e) => "simctl" in e).map((e) => e.simctl);
    expect(simctl).toEqual([["shutdown", device], ["erase", device]]);

    expect(await h.read("output")).toBe(`flaky-tests=["${stale}"]\n`);
    expect(stdout).toContain(`::warning title=Flaky iOS test::${stale} failed, then passed on a clean retry (attempt 2 of 3).`);
    expect(stdout).not.toContain("::error");
    expect(await h.read("summary.md")).toContain(`- \`${stale}\` passed on attempt 2`);
    const record = JSON.parse(await h.read("Results/test-attempts.json"));
    expect(record).toMatchObject({ result: "passed", maxAttempts: 3, failed: [], flaky: [{ id: stale, passedOnAttempt: 2 }] });
    expect(record.attempts.map((a: { attempt: number; exitCode: number; failed: string[] }) => [a.attempt, a.exitCode, a.failed]))
      .toEqual([[1, 65, [stale]], [2, 0, []]]);
    expect(await h.read("Logs/tests.log")).toContain("ran 2 tests");
    expect(await h.read("Logs/attempt-2/tests.log")).toContain("ran 1 tests");
    expect(JSON.parse(await h.read("Results/attempt-2/summary.json"))).toMatchObject({ result: "Passed" });
  });

  it("fails the job for a test that fails every attempt, retrying only what still fails", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }, { id: broken, behavior: "fail" }]);
    const { code, stdout } = await h.run();

    expect(code).toBe(65);
    const selections = (await h.invocations()).map((i) => i.selected);
    expect(selections).toEqual([[unit, stale, broken], [stale, broken], [broken]]);
    expect(await h.read("output")).toBe(`flaky-tests=["${stale}"]\n`);
    expect(stdout).toContain(`::error title=Failing iOS test::${broken} failed all 3 attempts.`);
    expect(await h.read("summary.md")).toContain(`**Failed every attempt:** these fail the job.\n\n- \`${broken}\``);
    expect(JSON.parse(await h.read("Results/test-attempts.json"))).toMatchObject({ result: "failed", failed: [broken] });
  });

  it("does not retry in a used simulator when erasing it fails", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], { FAIL_ERASE: "1" });
    const { code, stdout } = await h.run();

    expect(code).toBe(65);
    expect((await h.invocations()).length).toBe(1);
    expect(stdout).toContain(`::error::Could not erase simulator ${device}`);
    expect(await h.read("output")).toBe("flaky-tests=[]\n");
  });

  it("runs once, with no erase, when it passes or when retries are off", async () => {
    const passing = await harness([{ id: unit, behavior: "pass" }]);
    expect((await passing.run()).code).toBe(0);
    expect((await passing.events()).filter((e) => "simctl" in e)).toEqual([]);
    expect(await passing.read("output")).toBe("flaky-tests=[]\n");
    await expect(passing.read("summary.md")).rejects.toThrow();

    for (const attempts of ["0", "1"]) {
      const off = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], { TEST_ITERATIONS: attempts });
      expect((await off.run()).code).toBe(65);
      expect((await off.invocations()).length).toBe(1);
      expect((await off.events()).filter((e) => "simctl" in e)).toEqual([]);
      expect(JSON.parse(await off.read("Results/test-attempts.json"))).toMatchObject({ result: "failed", failed: [stale], maxAttempts: 1 });
    }
  });

  it("never retries without the job-owned simulator to erase", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], { MORPHEUS_IOS_DESTINATION: "" });
    const { code, stdout } = await h.run();
    expect(code).toBe(65);
    expect((await h.invocations()).length).toBe(1);
    expect(stdout).toContain("::notice::Retries need the job-owned iOS simulator");
  });

  it("never retries away a failure that names no test", async () => {
    const h = await harness([{ id: unit, behavior: "unnamed-failure" }, { id: stale, behavior: "leftover" }]);
    const { code, stdout } = await h.run();
    expect(code).toBe(65);
    expect((await h.invocations()).length).toBe(1);
    expect(stdout).toContain("::error::xcodebuild failed without a failure that names a test");

    const bare = await harness([{ id: unit, behavior: "pass" }], { FORCE_EXIT: "1" });
    expect((await bare.run()).code).toBe(65);
    expect((await bare.invocations()).length).toBe(1);
  });

  it("counts a retried test as passing only when its result says so", async () => {
    const missing = await harness([{ id: stale, behavior: "missing-on-retry" }]);
    expect((await missing.run()).code).toBe(1);
    expect(JSON.parse(await missing.read("Results/test-attempts.json"))).toMatchObject({ result: "failed", failed: [stale], flaky: [] });

    // An exit status that contradicts all-passing results is unexplained, so it still fails.
    const contradictory = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], { FORCE_EXIT: "1" });
    const { code, stdout } = await contradictory.run();
    expect(code).toBe(65);
    expect((await contradictory.invocations()).length).toBe(2);
    expect(stdout).toContain("::error::Attempt 2 failed without a failure that names a retried test.");
  });

  it("prepares every attempt with the pre-test script, in that attempt's own directories", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], { PRE_TEST_SCRIPT: "pre-test.sh" });
    expect((await h.run()).code).toBe(0);
    const order = (await h.events()).map((e) => ("preTest" in e ? "pre" : "simctl" in e ? `simctl ${(e.simctl as string[])[0]}` : "xcodebuild"));
    expect(order).toEqual(["pre", "xcodebuild", "simctl shutdown", "simctl erase", "pre", "xcodebuild"]);
    const prepared = (await h.events()).filter((e) => "preTest" in e);
    expect(prepared).toEqual([
      { preTest: `id=${device}`, results: join(h.dir, "Results"), logs: join(h.dir, "Logs") },
      { preTest: `id=${device}`, results: join(h.dir, "Results/attempt-2"), logs: join(h.dir, "Logs/attempt-2") },
    ]);
  });

  it("keeps the caller's selection on attempt 1 and omits the diagnostics flag on an Xcode without it", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }, { id: broken, behavior: "fail" }], {
      ONLY_TESTING: `${unit}\n${stale}\nAppUITests/$(touch injected)/test`, SKIP_TESTING: "AppUITests/CheckoutUITests",
      TEST_PLAN: "Smoke", PARALLEL_TESTING: "YES", MAXIMUM_PARALLEL_TESTING_WORKERS: "2", OLD_XCODE: "1",
    });
    expect((await h.run()).code).toBe(0);
    const [first, retry] = await h.invocations();
    expect(first!.argv.filter((a) => /^-(only|skip)-testing:/.test(a))).toEqual([
      `-only-testing:${unit}`, `-only-testing:${stale}`, "-only-testing:AppUITests/$(touch injected)/test",
      "-skip-testing:AppUITests/CheckoutUITests",
    ]);
    await expect(readFile(join(h.dir, "injected"))).rejects.toThrow();
    expect(first!.argv).toEqual(expect.arrayContaining(["-testPlan", "Smoke", "-maximum-parallel-testing-workers", "2"]));
    expect(first!.argv).not.toContain("-collect-test-diagnostics");
    expect(retry!.argv).toEqual(expect.arrayContaining(["-testPlan", "Smoke"]));
    expect(retry!.argv).not.toContain("-collect-test-diagnostics");
    expect(retry!.argv).not.toContain("-maximum-parallel-testing-workers");
    // The caller's skips still apply to a retry.
    expect(retry!.argv.filter((a) => /^-(only|skip)-testing:/.test(a)))
      .toEqual([`-only-testing:${stale}`, "-skip-testing:AppUITests/CheckoutUITests"]);
  });

  it("reports only the pre-test script when it fails before a retry", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }],
      { PRE_TEST_SCRIPT: "pre-test.sh", PRE_TEST_FAIL_ON: "attempt-2" });
    const { code, stdout } = await h.run();
    expect(code).toBe(7);
    expect((await h.invocations()).length).toBe(1);
    expect(stdout).toContain("::error::The pre-test script failed before attempt 2.");
    expect(stdout).not.toContain("failed without a failure");
    expect(JSON.parse(await h.read("Results/test-attempts.json"))).toMatchObject({ result: "failed", failed: [stale] });
  });
});

const unitB = "AppTests/StoreTests/testSaves()";
const slowUnit = "AppTests/SlowTests/testImport()";
const launch = "AppUITests/LaunchUITests/testLaunches()";
const slowLaunch = "AppUITests/LaunchUITests/testSlowLaunch()";
const onboard = "AppUITests/OnboardingUITests/testOnboards()";
const settings = "AppUITests/SettingsUITests/testSettings()";
const placeholder = "encountered an error";
const record0 = (record: { attempts: { failed: string[]; failedBundles: string[] }[] }) =>
  ({ failed: record.attempts[0]!.failed, failedBundles: record.attempts[0]!.failedBundles });
const onlySkip = (i: Invocation) => i.argv.filter((a) => /^-(only|skip)-testing:/.test(a));

describe("a test bundle that could not start", () => {
  // The staging shape that failed: the whole unit bundle plus named smoke UI tests, one unit
  // class skipped, and the unit bundle's runner failing to launch on attempt 1.
  const staging = {
    ONLY_TESTING: "AppTests\nAppUITests/LaunchUITests/testLaunches\nAppUITests/OnboardingUITests/testOnboards",
    SKIP_TESTING: "AppTests/SlowTests", NO_START: "AppTests",
  };
  const suite: Test[] = [
    { id: unit, behavior: "pass" }, { id: unitB, behavior: "pass" }, { id: slowUnit, behavior: "pass" },
    { id: launch, behavior: "pass" }, { id: onboard, behavior: "fail-first-run" }, { id: settings, behavior: "pass" },
  ];

  it("retries the caller's selection in that bundle, not its placeholder, alongside real failed tests", async () => {
    const h = await harness(suite, { ...staging, NO_START_RUNS: "1" });
    const { code, stdout } = await h.run();

    expect(code).toBe(0);
    const [first, retry, ...rest] = await h.invocations();
    expect(rest).toEqual([]);
    expect(first!.selected).toEqual([launch, onboard]);
    // The real failure by its id, the bundle by the caller's own entry for it, the caller's skip kept.
    expect(onlySkip(retry!)).toEqual([`-only-testing:${onboard}`, "-only-testing:AppTests", "-skip-testing:AppTests/SlowTests"]);
    expect(retry!.selected).toEqual([unit, unitB, onboard]);
    expect(retry!.deviceWasClean).toBe(true);
    for (const invocation of [first!, retry!]) expect(invocation.argv.join(" ")).not.toContain(placeholder);

    const record = JSON.parse(await h.read("Results/test-attempts.json"));
    expect(record).toMatchObject({
      result: "passed", failed: [], failedBundles: [], flaky: [{ id: onboard, passedOnAttempt: 2 }],
      recoveredBundles: [{ bundle: "AppTests", ranOnAttempt: 2 }],
    });
    expect(record.attempts.map((a: Record<string, unknown>) => [a.attempt, a.exitCode, a.failed, a.failedBundles]))
      .toEqual([[1, 65, [onboard], ["AppTests"]], [2, 0, [], []]]);
    expect(record.attempts[1]).toMatchObject({ selection: [onboard, "AppTests"], bundles: ["AppTests"] });
    expect(JSON.stringify(record)).not.toContain(placeholder);
    expect(await h.read("output")).toBe(`flaky-tests=["${onboard}"]\n`);
    expect(stdout).toContain("::warning title=iOS test bundle did not start::AppTests could not start on attempt 1, " +
      "then ran on a clean retry (attempt 2 of 3).");
    expect(stdout).not.toContain("::error");
    expect(await h.read("summary.md")).toContain("- `AppTests` ran on attempt 2");
  });

  it("never widens a bounded UI selection to the whole bundle", async () => {
    const h = await harness([
      { id: unit, behavior: "pass" }, { id: launch, behavior: "pass" }, { id: slowLaunch, behavior: "pass" },
      { id: onboard, behavior: "pass" }, { id: settings, behavior: "pass" },
    ], {
      ONLY_TESTING: "AppTests/ModelTests\nAppUITests/LaunchUITests\nAppUITests/OnboardingUITests/testOnboards",
      SKIP_TESTING: "AppUITests/LaunchUITests/testSlowLaunch", NO_START: "AppUITests", NO_START_RUNS: "1",
    });
    expect((await h.run()).code).toBe(0);
    const [first, retry, ...rest] = await h.invocations();
    expect(rest).toEqual([]);
    expect(first!.selected).toEqual([unit]);
    expect(onlySkip(retry!)).toEqual(["-only-testing:AppUITests/LaunchUITests",
      "-only-testing:AppUITests/OnboardingUITests/testOnboards", "-skip-testing:AppUITests/LaunchUITests/testSlowLaunch"]);
    // The passing unit test is not rerun, and nothing outside the caller's selection ever runs.
    expect(retry!.selected).toEqual([launch, onboard]);
    expect(JSON.parse(await h.read("Results/test-attempts.json")))
      .toMatchObject({ result: "passed", recoveredBundles: [{ bundle: "AppUITests", ranOnAttempt: 2 }], flaky: [] });
  });

  it("fails, naming the bundle, when no retry ran any of its tests", async () => {
    // It never starts: every attempt selects the bundle, and every attempt fails.
    const never = await harness(suite, staging);
    const { code, stdout } = await never.run();
    expect(code).toBe(65);
    const invocations = await never.invocations();
    expect(invocations.slice(1).map(onlySkip)).toEqual([
      [`-only-testing:${onboard}`, "-only-testing:AppTests", "-skip-testing:AppTests/SlowTests"],
      ["-only-testing:AppTests", "-skip-testing:AppTests/SlowTests"],
    ]);
    expect(JSON.parse(await never.read("Results/test-attempts.json"))).toMatchObject({
      result: "failed", failed: [], failedBundles: ["AppTests"], recoveredBundles: [], flaky: [{ id: onboard, passedOnAttempt: 2 }],
    });
    expect(stdout).toContain("::error title=iOS test bundle did not start::AppTests ran none of its tests in 3 attempt(s)");
    await expect(never.read("Results/tests.json")).rejects.toThrow();

    // It starts but its selection runs nothing, and xcodebuild exits 0: still not a recovery.
    const empty = await harness(suite.map((t) => (t.id.startsWith("AppTests/") ? { ...t, behavior: "missing-on-retry" as const } : t)),
      { ...staging, NO_START_RUNS: "1" });
    expect((await empty.run()).code).toBe(1);
    const record = JSON.parse(await empty.read("Results/test-attempts.json"));
    expect(record).toMatchObject({ result: "failed", failed: [], failedBundles: ["AppTests"], recoveredBundles: [] });
    expect(record.attempts.map((a: { exitCode: number }) => a.exitCode)).toEqual([65, 0, 0]);
    expect((await empty.invocations()).slice(1).map((i) => i.selected)).toEqual([[onboard], []]);
    for (const invocation of await empty.invocations()) expect(invocation.argv.join(" ")).not.toContain(placeholder);
  });

  it("retries a failed top-level Swift Testing test by its own id, not as a bundle", async () => {
    // Swift Testing names a test outside any suite topLevel(), with no "/"; it is still a test.
    const topLevel = "AppTests/topLevel()";
    const h = await harness([{ id: unit, behavior: "pass" }, { id: topLevel, behavior: "fail-first-run" }]);
    const { code, stdout } = await h.run();
    expect(code).toBe(0);
    const [first, retry, ...rest] = await h.invocations();
    expect(rest).toEqual([]);
    expect(first!.selected).toEqual([unit, topLevel]);
    expect(onlySkip(retry!)).toEqual([`-only-testing:${topLevel}`]);
    expect(JSON.parse(await h.read("Results/test-attempts.json"))).toMatchObject({
      result: "passed", flaky: [{ id: topLevel, passedOnAttempt: 2 }], failedBundles: [], recoveredBundles: [],
    });
    expect(record0(JSON.parse(await h.read("Results/test-attempts.json")))).toEqual({ failed: [topLevel], failedBundles: [] });
    expect(stdout).not.toContain("test bundle did not start");
  });

  it("does not retry a bundle the caller selected nothing in", async () => {
    const h = await harness(suite, { ONLY_TESTING: "AppUITests/LaunchUITests/testLaunches", NO_START: "AppTests", NO_START_UNSELECTED: "1" });
    const { code, stdout } = await h.run();
    expect(code).toBe(65);
    expect((await h.invocations()).length).toBe(1);
    expect(stdout).toContain("::error::AppTests could not start, and the caller selected no tests in it to retry.");
  });
});

// How Evo's verify-results.mjs reads tests.json and summary.json (darwin-health/evo, 2026-10-30):
// a test's own result decides, its Repetition children are its attempts, and the summary must pass.
function validatorView(tree: { testNodes: Node[] }, summary: { result: string; failedTests: number }) {
  const tests: { id: string; result: string; attempts: string[] }[] = [];
  const visit = (node: Node, target?: string) => {
    if (node.nodeType.endsWith("test bundle")) target = node.name;
    if (node.nodeType === "Test Case") {
      const attempts = (node.children ?? []).filter((c) => c.nodeType === "Repetition").map((c) => c.result!);
      tests.push({ id: `${target}/${node.nodeIdentifier}`, result: node.result!, attempts });
    } else for (const child of node.children ?? []) visit(child, target);
  };
  tree.testNodes.forEach((node) => visit(node));
  return { tests, passes: summary.result === "Passed" && summary.failedTests === 0 && tests.every((t) => t.result === "Passed") };
}
type Node = { nodeType: string; name?: string; nodeIdentifier?: string; result?: string; children?: Node[] };

describe("results a caller's validator reads", () => {
  const exportStep = async () => ((load(await readFile(".github/workflows/ios-ci.yml", "utf8")) as {
    jobs: { test: { steps: Step[] } } }).jobs.test.steps.find((s) => s.name === "Export complete test evidence")!);
  const evidenceEnv = { EXECUTION_ID: "", TEST_SELECTION: "", TEST_EVIDENCE_SCRIPT: "" };

  it("shows a test that passed on a clean retry the way Xcode's own retry did, and keeps it through export", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], evidenceEnv);
    expect((await h.run()).code).toBe(0);
    const before = await h.read("Results/tests.json");
    expect((await h.run(["/bin/bash", "-e", "-c", (await exportStep()).run!])).code).toBe(0);
    expect(await h.read("Results/tests.json")).toBe(before);

    const tree = JSON.parse(await h.read("Results/tests.json"));
    const summary = JSON.parse(await h.read("Results/summary.json"));
    const view = validatorView(tree, summary);
    expect(view.passes).toBe(true);
    expect(view.tests).toEqual([
      { id: unit, result: "Passed", attempts: [] },
      { id: stale, result: "Passed", attempts: ["Failed", "Passed"] },
    ]);
    expect(summary).toMatchObject({ result: "Passed", failedTests: 0, testFailures: [], retries: "test-attempts.json" });
    // Every container above the recovered test passes too: nothing below it still fails.
    expect(tree.testNodes[0].result).toBe("Passed");
    expect(tree.testNodes[0].children.map((bundle: Node) => bundle.result)).toEqual(["Passed", "Passed"]);
    // The first attempt's own bundle is untouched evidence of the failure.
    const raw = JSON.parse(await h.read("Results/Tests.xcresult/fake-tests.json"));
    expect(validatorView(raw, { result: "Failed", failedTests: 1 }).tests.find((t) => t.id === stale)?.result).toBe("Failed");
  });

  it("shows a bundle that could not start with the results of the retry that ran it", async () => {
    const h = await harness([
      { id: unit, behavior: "pass" }, { id: unitB, behavior: "fail-first-run" }, { id: launch, behavior: "pass" },
    ], { ...evidenceEnv, NO_START: "AppTests", NO_START_RUNS: "1" });
    const { code, stdout } = await h.run();
    expect(code).toBe(0);
    // Its first run, and first failure, was attempt 2: the warning must not claim attempt 1.
    expect(stdout).toContain(`::warning title=Flaky iOS test::${unitB} failed, then passed on a clean retry (attempt 3 of 3).`);
    expect(stdout).not.toContain("failed attempt 1");
    expect((await h.invocations()).map((i) => i.selected)).toEqual([[launch], [unit, unitB], [unitB]]);
    expect((await h.run(["/bin/bash", "-e", "-c", (await exportStep()).run!])).code).toBe(0);

    const tree = JSON.parse(await h.read("Results/tests.json"));
    const summary = JSON.parse(await h.read("Results/summary.json"));
    const view = validatorView(tree, summary);
    expect(view.passes).toBe(true);
    // Attempt 1 had only the placeholder for AppTests; its tests come from attempt 2, where one
    // failed for the first time and then passed on attempt 3.
    expect(view.tests).toEqual([
      { id: launch, result: "Passed", attempts: [] },
      { id: unit, result: "Passed", attempts: [] },
      { id: unitB, result: "Passed", attempts: ["Failed", "Passed"] },
    ]);
    const counts = { totalTestCount: 3, passedTests: 3, failedTests: 0 };
    expect(summary).toMatchObject({ result: "Passed", ...counts, testFailures: [] });
    expect(summary.devicesAndConfigurations[0]).toMatchObject(counts);
    expect(JSON.parse(await h.read("Results/test-attempts.json"))).toMatchObject({
      result: "passed", flaky: [{ id: unitB, passedOnAttempt: 3 }], recoveredBundles: [{ bundle: "AppTests", ranOnAttempt: 2 }],
    });
  });

  it("counts a bundle's skipped and expected-failure cases once, by category, when its retry replaces it", async () => {
    const skipped = "AppTests/ImportTests/testDisabled()";
    const expected = "AppTests/ImportTests/testKnownIssue()";
    const h = await harness([
      { id: skipped, behavior: "skip" }, { id: expected, behavior: "expected-failure" }, { id: unit, behavior: "pass" },
      { id: unitB, behavior: "pass" }, { id: launch, behavior: "pass" },
    ], { ...evidenceEnv, NO_START: "AppTests", NO_START_RUNS: "1" });
    expect((await h.run()).code).toBe(0);
    // Attempt 1: launch passed; the placeholder failed beside one skipped and one expected failure.
    expect(JSON.parse(await h.read("Results/Tests.xcresult/fake-summary.json")))
      .toMatchObject({ totalTestCount: 4, passedTests: 1, failedTests: 1, skippedTests: 1, expectedFailures: 1 });
    expect((await h.run(["/bin/bash", "-e", "-c", (await exportStep()).run!])).code).toBe(0);
    const summary = JSON.parse(await h.read("Results/summary.json"));
    const counts = { totalTestCount: 5, passedTests: 3, failedTests: 0, skippedTests: 1, expectedFailures: 1 };
    expect(summary).toMatchObject({ result: "Passed", ...counts });
    expect(summary.devicesAndConfigurations[0]).toMatchObject(counts);
  });

  it("leaves the first attempt's own export when a test failed every attempt", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }, { id: broken, behavior: "fail" }], evidenceEnv);
    expect((await h.run()).code).toBe(65);
    await expect(h.read("Results/tests.json")).rejects.toThrow();
    expect((await h.run(["/bin/bash", "-e", "-c", (await exportStep()).run!])).code).toBe(0);
    const view = validatorView(JSON.parse(await h.read("Results/tests.json")), JSON.parse(await h.read("Results/summary.json")));
    expect(view.passes).toBe(false);
    expect(view.tests.map((t) => [t.id, t.result])).toEqual([[unit, "Passed"], [stale, "Failed"], [broken, "Failed"]]);
  });
});

describe("ios-ci.yml wiring", () => {
  const workflow = async () => load(await readFile(".github/workflows/ios-ci.yml", "utf8")) as {
    on: { workflow_call: { inputs: Record<string, { default?: unknown }>; outputs: Record<string, { value: string }> } };
    jobs: { test: { outputs: Record<string, string>; steps: Step[] } };
  };

  it("defaults to three attempts and exposes flaky tests as a workflow output", async () => {
    const wf = await workflow();
    expect(wf.on.workflow_call.inputs["test-iterations"]?.default).toBe(3);
    expect(wf.on.workflow_call.outputs["flaky-tests"]?.value).toBe("${{ jobs.test.outputs.flaky-tests }}");
    expect(wf.jobs.test.outputs["flaky-tests"]).toBe("${{ steps.tests.outputs.flaky-tests }}");
    expect(wf.jobs.test.steps.find((s) => s.id === "tests")?.name).toBe("Run unit and UI tests");
  });

  it("runs the step through the script from this workflow's actions checkout", async () => {
    const step = (await workflow()).jobs.test.steps.find((s) => s.id === "tests")!;
    expect(step.env?.TEST_ITERATIONS).toBe("${{ inputs.test-iterations }}");
    expect(step.run).not.toContain("-retry-tests-on-failure");
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }]);
    const { code } = await h.run(["/bin/bash", "-e", "-c", step.run!]);
    expect(code).toBe(0);
    expect((await h.invocations()).map((i) => i.selected)).toEqual([[unit, stale], [stale]]);
    expect(await h.read("output")).toBe(`flaky-tests=["${stale}"]\n`);

    await rm(join(h.dir, ".morpheus-ci/scripts/ios-test-retry.py"));
    expect((await h.run(["/bin/bash", "-e", "-c", step.run!])).code).toBe(1);
  });

  it("runs every attempt inside the Firebase emulators when they are enabled", async () => {
    const step = (await workflow()).jobs.test.steps.find((s) => s.id === "tests")!;
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], {
      FIREBASE_EMULATORS: "true", FIREBASE_CONFIG: "firebase.json", FIREBASE_PROJECT: "demo-ios-ci", FIREBASE_ONLY: "auth",
    });
    // The fake emulator runs its command the way firebase emulators:exec does, through a shell.
    await writeFile(join(h.dir, "bin/firebase"), `#!/bin/bash\necho "emulators $*" >> "$EVENTS.firebase"\nbash -c "\${@: -1}"\n`);
    await chmod(join(h.dir, "bin/firebase"), 0o755);
    expect((await h.run(["/bin/bash", "-e", "-o", "pipefail", "-c", step.run!])).code).toBe(0);
    expect(await h.read("events.firebase")).toContain("emulators:exec --config");
    expect((await h.invocations()).length).toBe(2);
  });
});


describe("simulator lanes the runner's host declares", () => {
  const pair = (argv: string[], flag: string) => argv.slice(argv.indexOf(flag), argv.indexOf(flag) + 2);

  it("runs attempt 1 with Xcode's parallel testing capped at two workers and retries serially on the erased job simulator", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }, { id: stale, behavior: "leftover" }], {
      SIMULATOR_LANES_FROM_HOST: "true", MORPHEUS_IOS_SIMULATOR_LANES: "2", PRE_TEST_SCRIPT: "pre-test.sh",
    });
    const { code, stdout } = await h.run();

    expect(code).toBe(0);
    const [first, retry, ...rest] = await h.invocations();
    expect(rest).toEqual([]);
    expect(pair(first!.argv, "-parallel-testing-enabled")).toEqual(["-parallel-testing-enabled", "YES"]);
    // A cap, not a count: a small selection may use fewer workers.
    expect(pair(first!.argv, "-maximum-parallel-testing-workers")).toEqual(["-maximum-parallel-testing-workers", "2"]);
    expect(first!.argv).not.toContain("-parallel-testing-worker-count");
    // One xcodebuild for the whole selection, on the job's own prepared simulator.
    expect(first!.argv).toContain(`platform=iOS Simulator,id=${device}`);
    expect(first!.selected).toEqual([unit, stale]);
    // The retry is the existing serial rerun of only what failed, on the job's own erased device.
    expect(pair(retry!.argv, "-parallel-testing-enabled")).toEqual(["-parallel-testing-enabled", "NO"]);
    expect(retry!.argv).not.toContain("-parallel-testing-worker-count");
    expect(retry!.argv).not.toContain("-maximum-parallel-testing-workers");
    expect(retry!.argv).toContain(`platform=iOS Simulator,id=${device}`);
    expect(retry!.deviceWasClean).toBe(true);
    expect(retry!.selected).toEqual([stale]);
    expect(stdout).toContain("::notice::The runner host declares 2 simulator lane(s): attempt 1 runs with Xcode's parallel testing on, at most 2 workers.");
    const record = JSON.parse(await h.read("Results/test-attempts.json"));
    expect(record).toMatchObject({ simulatorLanes: 2, result: "passed", flaky: [{ id: stale, passedOnAttempt: 2 }] });
    // Attempt 1's preparation and test intervals, in order, on the runner's monotonic clock.
    const { preTest, xcodebuild } = record.attempts[0].timing;
    expect(preTest[0]).toBeLessThanOrEqual(preTest[1]);
    expect(preTest[1]).toBeLessThanOrEqual(xcodebuild[0]);
    expect(xcodebuild[0]).toBeLessThanOrEqual(xcodebuild[1]);
    expect(record.clock).toMatchObject({ unit: expect.stringContaining("monotonic") });
  });

  it.each([["unset", undefined], ["empty", ""], ["one", "1"], ["padded one", " 1\n"]])(
    "runs with Xcode's parallel testing off when the host declares %s",
    async (_name, declared) => {
      const extra: Record<string, string> = { SIMULATOR_LANES_FROM_HOST: "true" };
      if (declared !== undefined) extra.MORPHEUS_IOS_SIMULATOR_LANES = declared;
      const h = await harness([{ id: unit, behavior: "pass" }], extra);
      if (declared === undefined) delete h.env.MORPHEUS_IOS_SIMULATOR_LANES;
      expect((await h.run()).code).toBe(0);
      const [first] = await h.invocations();
      expect(pair(first!.argv, "-parallel-testing-enabled")).toEqual(["-parallel-testing-enabled", "NO"]);
      expect(first!.argv).not.toContain("-parallel-testing-worker-count");
      expect(first!.argv).not.toContain("-maximum-parallel-testing-workers");
      expect(JSON.parse(await h.read("Results/test-attempts.json")).simulatorLanes).toBe(1);
    },
  );

  it.each(["0", "3", "two", "2x", "-1", "1 2"])("refuses a host declaring %j before any test runs", async (declared) => {
    const h = await harness([{ id: unit, behavior: "pass" }], {
      SIMULATOR_LANES_FROM_HOST: "true", MORPHEUS_IOS_SIMULATOR_LANES: declared, PRE_TEST_SCRIPT: "pre-test.sh",
    });
    const { code, stdout } = await h.run();
    expect(code).toBe(1);
    expect(stdout).toContain(`::error::MORPHEUS_IOS_SIMULATOR_LANES must be 1 or 2, not '${declared}'`);
    // Neither the pre-test script nor xcodebuild ran, and no attempt record claims anything.
    await expect(h.read("events")).rejects.toThrow();
    await expect(h.read("Results/test-attempts.json")).rejects.toThrow();
  });

  it.each([["absent", undefined], ["false", "false"]])(
    "ignores the host's declaration when the caller's opt-in is %s, keeping the caller's own settings",
    async (_name, optIn) => {
      const extra: Record<string, string> = {
        MORPHEUS_IOS_SIMULATOR_LANES: "garbage", PARALLEL_TESTING: "YES", MAXIMUM_PARALLEL_TESTING_WORKERS: "3",
      };
      if (optIn !== undefined) extra.SIMULATOR_LANES_FROM_HOST = optIn;
      const h = await harness([{ id: unit, behavior: "pass" }], extra);
      expect((await h.run()).code).toBe(0);
      const [first] = await h.invocations();
      expect(pair(first!.argv, "-parallel-testing-enabled")).toEqual(["-parallel-testing-enabled", "YES"]);
      expect(pair(first!.argv, "-maximum-parallel-testing-workers")).toEqual(["-maximum-parallel-testing-workers", "3"]);
      expect(first!.argv).not.toContain("-parallel-testing-worker-count");
      expect(JSON.parse(await h.read("Results/test-attempts.json"))).not.toHaveProperty("simulatorLanes");
    },
  );
});

describe("ios-ci.yml simulator-lanes-from-host input", () => {
  type Wf = {
    on: { workflow_call: { inputs: Record<string, { default?: unknown; type?: string }> } };
    jobs: { test: { steps: Step[] } };
  };
  const workflow = async () => load(await readFile(".github/workflows/ios-ci.yml", "utf8")) as Wf;

  it("is an opt-in boolean the test step forwards", async () => {
    const wf = await workflow();
    expect(wf.on.workflow_call.inputs["simulator-lanes-from-host"]).toMatchObject({ type: "boolean", default: false });
    const step = wf.jobs.test.steps.find((s) => s.id === "tests")!;
    expect(step.env?.SIMULATOR_LANES_FROM_HOST).toBe("${{ inputs.simulator-lanes-from-host }}");
  });

  it.each([
    ["refuses it beside parallel-testing", "true", "YES", 1, "simulator-lanes-from-host replaces parallel-testing"],
    ["accepts it alone", "true", "NO", 1, "Package.resolved is required"],
    ["accepts parallel-testing alone", "false", "YES", 1, "Package.resolved is required"],
  ])("validation %s", async (_name, fromHost, parallel, code, message) => {
    const step = (await workflow()).jobs.test.steps.find((s) => s.name === "Validate locked project inputs")!;
    const dir = await mkdtemp(join(tmpdir(), "ios-lanes-validate-"));
    dirs.push(dir);
    await mkdir(join(dir, "App.xcodeproj"));
    let result: { code: number; stderr: string };
    try {
      await exec("/bin/bash", ["-e", "-c", step.run!], {
        cwd: dir,
        env: {
          ...(process.env as Record<string, string>), PROJECT: "App.xcodeproj", SCHEME: "App", PARALLEL_TESTING: parallel,
          MAXIMUM_PARALLEL_TESTING_WORKERS: "0", SIMULATOR_LANES_FROM_HOST: fromHost, TEST_ITERATIONS: "1",
          GITHUB_WORKSPACE: dir,
        },
      });
      result = { code: 0, stderr: "" };
    } catch (error) {
      result = error as { code: number; stderr: string };
    }
    // The two accepted cases pass the lanes check and stop at the next, unrelated requirement.
    expect(result.code).toBe(code);
    expect(result.stderr).toContain(message);
  });
});
