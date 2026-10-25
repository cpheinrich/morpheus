import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createContext, runInContext } from "node:vm";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = { name?: string; id?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = { on: { workflow_call: { inputs: Record<string, { default?: unknown }> } }; jobs: Record<string, { "timeout-minutes"?: number; needs?: string | string[]; env?: Record<string, string>; strategy?: { matrix?: { python?: string[] } }; steps: Step[] }> };
const root = new URL("../", import.meta.url);
const read = (path: string) => load(readFileSync(new URL(path, root), "utf8")) as Workflow;
const uploadPin = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
function evaluate(expression: string, steps: Record<string, unknown>, failed = true, tests = true, cancelled = false) {
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, "").replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (_, key: string) => `[${JSON.stringify(key)}]`);
  return !!runInContext(source, createContext({ steps, inputs: { "run-tests": tests }, success: () => !failed && !cancelled, failure: () => failed && !cancelled, cancelled: () => cancelled, always: () => true }), { timeout: 100 });
}
const states = ["success", "failure", "cancelled", "skipped"];
function validateUpload(step: Step, own: string, barrier = false) {
  expect(step.uses).toBe(uploadPin);
  expect(step.with).toMatchObject({ path: `\${{ steps.${own}.outputs.payload-root }}`, archive: true, "compression-level": 0, overwrite: false });
  for (const outcome of states) for (const admitted of ["true", "false"]) for (const files of ["true", "false"]) for (const barrierOutcome of states) {
    const fixture = { native_failure: { outputs: { failed: "true" } }, scope: { outputs: { run: "true" } }, ios_paths: { outcome: "success" }, qa_tests: { outcome: "failure" }, upload: { outputs: { "receipt-path": "receipt", "resource-path": "resource" } },
      [own]: { outcome, outputs: { admitted, "has-files": files } }, artifact_barrier: { outcome: barrierOutcome } };
    expect(evaluate(step.if!, fixture), `${step.name}/${outcome}/${admitted}/${files}/${barrierOutcome}`).toBe(outcome === "success" && admitted === "true" && files === "true" && (!barrier || barrierOutcome === "success"));
  }
}

describe("bounded artifact integration", () => {
  it("puts all selected native stages after all original writers and before any upload", () => {
    const wf = read(".github/workflows/ios-ci.yml"), steps = wf.jobs.test!.steps;
    expect(wf.on.workflow_call.inputs["artifact-stage-ref"]?.default).toBe("main");
    const checkout = steps.find(s => s.name === "Check out the bounded artifact helper")!;
    expect(checkout.with).toMatchObject({ ref: "${{ inputs.artifact-stage-ref }}", "persist-credentials": false, "sparse-checkout": ".github/actions/ios-testflight-upload/artifact-stage" });
    const pin = steps.find(s => s.name === "Validate bounded artifact helper pin")!;
    for (const [ref, status] of [["a".repeat(40), 0], ["main", 1], ["A".repeat(40), 1], ["a".repeat(39), 1]] as const) {
      try { execFileSync("bash", ["-c", pin.run!], { env: { PATH: process.env.PATH, EXECUTION_ID: "effect", ARTIFACT_STAGE_REF: ref }, stdio: "pipe" }); expect(status).toBe(0); }
      catch (error) { expect((error as { status: number }).status).toBe(status); }
    }
    const barrier = steps.findIndex(s => s.id === "artifact_barrier");
    for (const id of ["artifact_screenshots", "artifact_complete", "artifact_failure"]) {
      const index = steps.findIndex(s => s.id === id);
      expect(index).toBeGreaterThan(steps.findIndex(s => s.name === "Collect Firebase emulator diagnostics"));
      expect(index).toBeLessThan(barrier);
    }
    const uploads = steps.filter(s => s.uses === uploadPin);
    expect(uploads).toHaveLength(3);
    for (const [step, own, retention] of [[uploads[0]!, "artifact_screenshots", 14], [uploads[1]!, "artifact_complete", 30], [uploads[2]!, "artifact_failure", 14]] as const) {
      expect(steps.indexOf(step)).toBeGreaterThan(barrier);
      expect(step.with?.["retention-days"]).toBe(retention);
      validateUpload(step, own, true);
    }
  });
  it("captures only prior native failure and never a later artifact failure", () => {
    const steps = read(".github/workflows/ios-ci.yml").jobs.test!.steps;
    const capture = steps.find(s => s.id === "native_failure")!;
    expect(capture.if).toBe("${{ steps.scope.outputs.run == 'true' && failure() }}");
    expect(capture.env).toBeUndefined();
    expect(steps.indexOf(capture)).toBeGreaterThan(steps.findIndex(s => s.name === "Collect Firebase emulator diagnostics"));
    expect(steps.indexOf(capture)).toBeLessThan(steps.findIndex(s => s.id === "artifact_screenshots"));
    const stage = steps.find(s => s.id === "artifact_failure")!;
    const upload = steps.find(s => s.name === "Upload Xcode failure evidence")!;
    // failure() uses job.status, after continue-on-error has applied. Cancellation
    // before capture is cancelled even when an earlier native step failed.
    const cases = [
      ["success", "success", false],
      ["native failure", "failure", true],
      ["continued failure (outcome=failure, conclusion=success)", "success", false],
      ["skipped native work", "success", false],
      ["cancellation before capture", "cancelled", false],
      ["native failure then cancellation before capture", "cancelled", false],
      ["native failure then successful diagnostics", "failure", true],
      ["native failure then skipped diagnostics", "failure", true],
    ] as const;
    const dir = mkdtempSync(join(tmpdir(), "native-failure-capture-"));
    try {
      const output = join(dir, "output");
      for (const [name, status, nativeFailed] of cases) for (const scope of ["true", "false", ""]) {
        writeFileSync(output, "");
        const selected = evaluate(capture.if!, { scope: { outputs: { run: scope } } }, status === "failure", true, status === "cancelled");
        if (selected) execFileSync("bash", ["-c", capture.run!], { env: { PATH: process.env.PATH, GITHUB_OUTPUT: output }, stdio: "pipe" });
        const expected = scope === "true" && nativeFailed;
        expect(readFileSync(output, "utf8"), `${name}/${scope}`).toBe(expected ? "failed=true\n" : "");
        const fixture = { scope: { outputs: { run: scope } }, ios_paths: { outcome: "success" },
          native_failure: { outputs: { failed: selected ? readFileSync(output, "utf8").trim().split("=")[1] : "" } },
          artifact_failure: { outcome: "success", outputs: { admitted: "true", "has-files": "true" } }, artifact_barrier: { outcome: "success" } };
        for (const laterStatus of ["success", "failure", "cancelled"]) {
          expect(evaluate(stage.if!, fixture, laterStatus === "failure", true, laterStatus === "cancelled"), `${name}/${scope}/${laterStatus}/stage`).toBe(expected);
          expect(evaluate(upload.if!, fixture, laterStatus === "failure", true, laterStatus === "cancelled"), `${name}/${scope}/${laterStatus}/upload`).toBe(expected);
        }
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it("executes the native all-selected barrier at failure and skipped boundaries", () => {
    const step = read(".github/workflows/ios-ci.yml").jobs.test!.steps.find(s => s.id === "artifact_barrier")!;
    for (const tests of [true, false]) for (const screenshot of states) for (const complete of states) for (const failure of states) {
      const expected = (tests ? screenshot === "success" && complete === "success" : screenshot === "skipped" && complete === "skipped") && ["success", "skipped"].includes(failure);
      let status = 0;
      try { execFileSync("bash", ["-c", step.run!], { env: { PATH: process.env.PATH, RUN_TESTS: String(tests), SCREENSHOT_STAGE: screenshot, COMPLETE_STAGE: complete, FAILURE_STAGE: failure }, stdio: "pipe" }); }
      catch (error) { status = (error as { status: number }).status; }
      expect(status === 0).toBe(expected);
    }
  });
  it("guards receipts even on always and traces only after a returned QA failure", () => {
    const action = load(readFileSync(new URL(".github/actions/ios-testflight-upload/action.yml", root), "utf8")) as { runs: { steps: Step[] } };
    const steps = action.runs.steps, upload = steps.find(s => s.id === "upload")!;
    expect(upload.env).toMatchObject({ PROCESSING_TIMEOUT_SECONDS: "1200", PROCESSING_POLL_SECONDS: "30" });
    expect(steps.findIndex(s => s.id === "artifact_receipt")).toBeGreaterThan(steps.indexOf(upload));
    validateUpload(steps.find(s => s.id === "acceptance")!, "artifact_receipt");
    const qa = read(".github/workflows/ci.yml").jobs["qa-browser"]!.steps;
    expect(qa.findIndex(s => s.id === "artifact_ci_trace")).toBeGreaterThan(qa.findIndex(s => s.id === "qa_tests"));
    validateUpload(qa.find(s => s.uses === uploadPin)!, "artifact_ci_trace");
    expect(qa.find(s => s.uses === uploadPin)!.with?.["retention-days"]).toBe(1);
  });
  it("kills removed own-admission guards, original paths, retention, archive and pin mutants", () => {
    const step = read(".github/workflows/ios-ci.yml").jobs.test!.steps.find(s => s.name === "Upload complete test evidence")!;
    for (const mutate of [
      (s: Step) => { s.if = s.if!.replace("steps.artifact_complete.outcome == 'success'", "true"); },
      (s: Step) => { s.if = s.if!.replace("steps.artifact_complete.outputs.admitted == 'true'", "true"); },
      (s: Step) => { s.if = s.if!.replace("steps.artifact_complete.outputs.has-files == 'true'", "true"); },
      (s: Step) => { s.if = s.if!.replace("steps.artifact_barrier.outcome == 'success'", "true"); },
      (s: Step) => { s.with!.path = "original-writer-path"; },
      (s: Step) => { s.with!.archive = false; },
      (s: Step) => { s.uses = "actions/upload-artifact@v7"; },
    ]) { const mutant = structuredClone(step); mutate(mutant); expect(() => validateUpload(mutant, "artifact_complete", true)).toThrow(); }
  });
  it("declares actual Node24/Python Actions ABI validation and bounds each synthetic channel", () => {
    const job = read(".github/workflows/ci.yml").jobs["artifact-abi"]!;
    expect(job["timeout-minutes"]).toBe(10);
    expect(job.strategy).toBeUndefined();
    expect(job.env?.UV_PYTHON).toBe("3.14");
    expect(job.needs).toBe("changes");
    const suites = job.steps.find(s => s.name === "Test Python 3.9 and 3.14 compatibility")!.run!;
    expect(suites).toContain("for python in 3.9 3.14");
    expect(suites).toContain('exit "$status"');
    expect(job.steps.filter(s => s.uses === uploadPin)).toHaveLength(1);
    for (const suite of ["test_stage.py", "test_ci_trace.py", "test_processing_environment.py", "test_abi_fixture.py"]) expect(suites).toContain(suite);
    expect(job.steps.find(s => s.uses?.startsWith("actions/setup-node@"))?.with?.["node-version"]).toBe("24");
    expect(job.steps.find(s => s.uses?.startsWith("astral-sh/setup-uv@"))?.with?.["enable-cache"]).toBe(false);
    const upload = job.steps.find(s => s.uses === uploadPin)!;
    expect(upload.with).toMatchObject({ archive: true, "retention-days": 1, overwrite: false, "compression-level": 0, path: "${{ steps.artifact_abi.outputs.payload-root }}" });
    expect(upload.if).toContain("steps.artifact_abi.outcome == 'success'");
    expect(upload.if).toContain("steps.artifact_abi.outputs.admitted == 'true'");
    expect(job.steps.at(-1)?.run).toContain("abi_fixture.py verify");
  });
  it("attempts both Python boundaries and returns failure after any install, version or suite failure", () => {
    const script = read(".github/workflows/ci.yml").jobs["artifact-abi"]!.steps.find(s => s.name === "Test Python 3.9 and 3.14 compatibility")!.run!;
    const suites = ["test_stage.py", "test_ci_trace.py", "test_processing_environment.py", "test_abi_fixture.py"];
    const dir = mkdtempSync(join(tmpdir(), "artifact-python-loop-"));
    try {
      const uv = join(dir, "uv"), log = join(dir, "calls.jsonl");
      writeFileSync(uv, `#!${process.execPath}\nconst fs=require('node:fs'),args=process.argv.slice(2),python=args[0]==='python'?args[2]:process.env.UV_PYTHON;fs.appendFileSync(process.env.PROBE_LOG,JSON.stringify({args,python})+'\\n');const failure=process.env.PROBE_FAILURE;const fail=python==='3.9'&&((failure==='install'&&args[0]==='python')||(failure==='version'&&args.includes('-c'))||(failure==='suite'&&args.at(-1)==='tests/artifacts/test_stage.py'));process.exit(fail?9:0);\n`);
      chmodSync(uv, 0o700);
      for (const failure of ["", "install", "version", "suite"]) {
        writeFileSync(log, "");
        const result = spawnSync("/bin/bash", ["-c", script], { env: { PATH: dir, PROBE_LOG: log, PROBE_FAILURE: failure }, encoding: "utf8" });
        expect(result.status, result.stderr).toBe(failure ? 1 : 0);
        const calls = readFileSync(log, "utf8").trim().split("\n").map(line => JSON.parse(line) as { args: string[]; python: string });
        expect(calls.filter(c => c.args[0] === "python").map(c => c.python)).toEqual(["3.9", "3.14"]);
        const tested = calls.filter(c => c.args.at(-1)?.startsWith("tests/artifacts/"));
        const expected = (failure === "install" || failure === "version" ? ["3.14"] : ["3.9", "3.14"])
          .flatMap(python => suites.map(suite => [python, `tests/artifacts/${suite}`]));
        expect(tested.map(c => [c.python, c.args.at(-1)])).toEqual(expected);
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
