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

const exec = promisify(execFile);
const script = resolve("scripts/ios-test-retry.py");
type Behavior = "pass" | "fail" | "leftover" | "unnamed-failure" | "missing-on-retry";
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
const retry = argv.includes('-collect-test-diagnostics') || /attempt-/.test(value('-resultBundlePath'));
const tests = JSON.parse(process.env.FAKE_TESTS)
  .filter(t => only.length ? only.includes(t.id) : !skip.some(s => t.id.startsWith(s)))
  .filter(t => !(retry && t.behavior === 'missing-on-retry'));
const clean = fs.readFileSync(process.env.SIM_STATE, 'utf8') === 'clean';
fs.appendFileSync(process.env.EVENTS, JSON.stringify({ argv, selected: tests.map(t => t.id), deviceWasClean: clean }) + '\\n');
const results = tests.map((t, i) => {
  const failed = t.behavior === 'fail' || t.behavior === 'unnamed-failure' || t.behavior === 'missing-on-retry' ||
    (t.behavior === 'leftover' && (!clean || i > 0));
  return { ...t, result: failed ? 'Failed' : 'Passed' };
});
fs.writeFileSync(process.env.SIM_STATE, 'used');
const bundle = value('-resultBundlePath');
fs.mkdirSync(bundle, { recursive: true });
const targets = [...new Set(results.map(t => t.id.split('/')[0]))];
fs.writeFileSync(bundle + '/fake-tests.json', JSON.stringify({ testNodes: [{ nodeType: 'Test Plan', name: 'App', children:
  targets.map(target => ({ nodeType: target.endsWith('UITests') ? 'UI test bundle' : 'Unit test bundle', name: target, children:
    results.filter(t => t.id.startsWith(target + '/')).map(t => ({ nodeType: 'Test Suite', name: t.id.split('/')[1], children: [
      { nodeType: 'Test Case', nodeIdentifier: t.id.split('/').slice(1).join('/'), result: t.result }] })) })) }] }));
const failures = results.filter(t => t.result === 'Failed').map(t => t.behavior === 'unnamed-failure'
  ? { targetName: t.id.split('/')[0], failureText: 'The test runner crashed' }
  : { targetName: t.id.split('/')[0], testIdentifierString: t.id.split('/').slice(1).join('/') });
fs.writeFileSync(bundle + '/fake-summary.json', JSON.stringify({ result: failures.length ? 'Failed' : 'Passed', testFailures: failures }));
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
  for (const [name, body] of [["xcodebuild", fakeXcodebuild], ["xcrun", fakeXcrun]]) {
    await writeFile(join(dir, "bin", name!), body!);
    await chmod(join(dir, "bin", name!), 0o755);
  }
  await writeFile(join(dir, "pre-test.sh"), 'printf \'{"preTest":"%s","results":"%s","logs":"%s"}\\n\' "$MORPHEUS_IOS_DESTINATION" "$RESULTS" "$LOGS" >> "$EVENTS"\n');
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
    expect(stdout).toContain(`::warning title=Flaky iOS test::${stale} failed attempt 1, then passed on a clean retry (attempt 2 of 3).`);
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
    expect(retry!.argv.filter((a) => /^-(only|skip)-testing:/.test(a))).toEqual([`-only-testing:${stale}`]);
  });

  it("refuses a malformed attempt count", async () => {
    const h = await harness([{ id: unit, behavior: "pass" }], { TEST_ITERATIONS: "2.5" });
    const { code, stdout } = await h.run();
    expect(code).toBe(2);
    expect(stdout).toContain("test-iterations must be a whole number");
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
