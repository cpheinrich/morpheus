import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { createContext, runInContext } from "node:vm";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

type Step = { name?: string; id?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Workflow = { on: { workflow_call: { inputs: Record<string, { default?: unknown }> } }; jobs: Record<string, { "timeout-minutes"?: number; strategy?: { matrix?: { python?: string[] } }; steps: Step[] }> };
const root = new URL("../", import.meta.url);
const read = (path: string) => load(readFileSync(new URL(path, root), "utf8")) as Workflow;
const uploadPin = "actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a";
function evaluate(expression: string, steps: Record<string, unknown>, failed = true, tests = true) {
  const source = expression.replace(/^\$\{\{\s*|\s*\}\}$/g, "").replace(/\.([A-Za-z_][A-Za-z0-9_-]*)/g, (_, key: string) => `[${JSON.stringify(key)}]`);
  return !!runInContext(source, createContext({ steps, inputs: { "run-tests": tests }, success: () => !failed, failure: () => failed, always: () => true }), { timeout: 100 });
}
const states = ["success", "failure", "cancelled", "skipped"];
function validateUpload(step: Step, own: string, barrier = false) {
  expect(step.uses).toBe(uploadPin);
  expect(step.with).toMatchObject({ path: `\${{ steps.${own}.outputs.payload-root }}`, archive: true, "compression-level": 0, overwrite: false });
  for (const outcome of states) for (const admitted of ["true", "false"]) for (const files of ["true", "false"]) for (const barrierOutcome of states) {
    const fixture = { scope: { outputs: { run: "true" } }, ios_paths: { outcome: "success" }, qa_tests: { outcome: "failure" }, upload: { outputs: { "receipt-path": "receipt", "resource-path": "resource" } },
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
    expect(job.strategy?.matrix?.python).toEqual(["3.9", "3.14"]);
    expect(job.steps.find(s => s.uses?.startsWith("actions/setup-node@"))?.with?.["node-version"]).toBe("24");
    expect(job.steps.find(s => s.uses?.startsWith("astral-sh/setup-uv@"))?.with?.["enable-cache"]).toBe(false);
    const upload = job.steps.find(s => s.uses === uploadPin)!;
    expect(upload.with).toMatchObject({ archive: true, "retention-days": 1, overwrite: false, "compression-level": 0, path: "${{ steps.artifact_abi.outputs.payload-root }}" });
    expect(upload.if).toContain("steps.artifact_abi.outcome == 'success'");
    expect(upload.if).toContain("steps.artifact_abi.outputs.admitted == 'true'");
    expect(job.steps.at(-1)?.run).toContain("abi_fixture.py verify");
  });
});
