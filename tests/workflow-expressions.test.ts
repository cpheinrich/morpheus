import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dump, load } from "js-yaml";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../", import.meta.url));
type Step = { name?: string; id?: string; if?: string; run?: string; env?: Record<string, string> };
type Workflow = { jobs: Record<string, { steps: Step[] }> };
const native = readFileSync(new URL("../.github/workflows/ios-ci.yml", import.meta.url), "utf8");
const node = load(readFileSync(new URL("../.github/workflows/node-ci.yml", import.meta.url), "utf8")) as {
  on: { workflow_call: { inputs: Record<string, { default?: unknown }> } };
  jobs: { check: { steps: Array<Step & { "timeout-minutes"?: number; "working-directory"?: string }> } };
};
function lint(source?: string) {
  const result = spawnSync("actionlint", ["-no-color", "-oneline", "-shellcheck=", "-pyflakes=", ...(source === undefined ? [] : ["-"])], {
    cwd: root, input: source, encoding: "utf8", timeout: 15_000,
  });
  expect(result.error, "Install actionlint 1.7.12; see docs/ci-scope.md").toBeUndefined();
  return { status: result.status, output: result.stdout + result.stderr };
}

describe("actual GitHub Actions expression-context validation", () => {
  it("accepts every shipped workflow with the real checker", () => {
    expect(lint()).toEqual({ status: 0, output: "" });
  });

  it.each(["always", "cancelled", "success", "failure"])("rejects %s() outside supported conditionals", (status) => {
    for (const context of ["env", "run", "name"] as const) {
      const workflow = load(native) as Workflow;
      const capture = workflow.jobs.test!.steps.find(step => step.id === "native_failure")!;
      const expression = `\${{ ${status}() }}`;
      if (context === "env") capture.env = { NATIVE_FAILED: expression };
      else capture[context] = expression;
      const result = lint(dump(workflow));
      expect(result.status, `${context}/${status}: ${result.output}`).toBe(1);
      expect(result.output).toContain(`calling function "${status}" is not allowed here`);
      expect(result.output).toContain("[expression]");
    }
  });

  it("accepts status functions in a step conditional", () => {
    const workflow = load(native) as Workflow;
    workflow.jobs.test!.steps.find(step => step.id === "native_failure")!.if = "${{ always() && (success() || failure() || cancelled()) }}";
    expect(lint(dump(workflow))).toEqual({ status: 0, output: "" });
  });

  it("runs the pinned checker in the existing required Node job before its tests", () => {
    expect(node.on.workflow_call.inputs["run-workflow-lint"]?.default).toBe(false);
    const steps = node.jobs.check.steps;
    const check = steps.find(step => step.name === "Validate GitHub Actions workflows")!;
    expect(check.if).toBe("${{ inputs.run-workflow-lint }}");
    expect(check["working-directory"]).toBe(".");
    expect(check["timeout-minutes"]).toBe(3);
    expect(check.run).toContain("test \"$RUNNER_OS/$RUNNER_ARCH\" = Linux/X64");
    expect(check.run).toContain("https://github.com/rhysd/actionlint/releases/download/v1.7.12/actionlint_1.7.12_linux_amd64.tar.gz");
    expect(check.run).toContain("8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8");
    expect(check.run).toContain("sha256sum --check --status");
    expect(check.run).toContain("--connect-timeout 15 --max-time 90");
    expect(check.run).toContain('"$tool_dir/actionlint" -shellcheck= -pyflakes=');
    expect(check.run).toContain('echo "$tool_dir" >> "$GITHUB_PATH"');
    expect(steps.indexOf(check)).toBeLessThan(steps.findIndex(step => step.name === "Test"));
    const caller = load(readFileSync(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8")) as {
      jobs: { node: { uses: string; with: Record<string, unknown> } };
    };
    expect(caller.jobs.node.uses).toBe("./.github/workflows/node-ci.yml");
    expect(caller.jobs.node.with["run-workflow-lint"]).toBe(true);
  });
});
