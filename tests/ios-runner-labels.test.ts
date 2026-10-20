import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { runInNewContext } from "node:vm";
import { load } from "js-yaml";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
type Job = {
  if: string; needs?: string; "runs-on": string; "timeout-minutes": number;
  outputs?: Record<string, string>;
  concurrency?: { group: string; "cancel-in-progress": string };
  steps: { id?: string; env?: Record<string, string>; run: string }[];
};
async function workflow() {
  return load(await readFile(new URL("../.github/workflows/ios-ci.yml", import.meta.url), "utf8")) as {
    on: { workflow_call: { inputs: Record<string, { type: string; default: unknown }> } };
    jobs: Record<"validate-runner" | "test", Job>;
  };
}
async function validate(input: string) {
  const dir = await mkdtemp(join(tmpdir(), "ios-runner-labels-"));
  const output = join(dir, "output");
  await writeFile(output, "");
  try {
    const script = (await workflow()).jobs["validate-runner"].steps[0]!.run;
    const result = await exec("/bin/bash", ["-e", "-c", script], {
      cwd: dir,
      env: { PATH: `${dirname(process.execPath)}:/usr/bin:/bin`, RUNNER_LABELS_JSON: input, GITHUB_OUTPUT: output },
    }).then(({ stdout, stderr }) => ({ code: 0, stdout, stderr }), error => ({ code: error.code as number, stdout: error.stdout as string, stderr: error.stderr as string }));
    return { ...result, output: await readFile(output, "utf8") };
  } finally { await rm(dir, { recursive: true, force: true }); }
}

// Evaluate only this workflow's fixed boolean/string/array expressions. These
// fixture values share Actions' short-circuit semantics; this is not a runner.
function expression(source: string, labels: string, runner: string, result: string, output = "", cancelled = false): unknown {
  const body = source.slice(3, -2)
    .replaceAll("inputs.runner-labels-json", "labels")
    .replaceAll("inputs.runner", "runner")
    .replaceAll("needs.validate-runner.result", "result")
    .replaceAll("needs.validate-runner.outputs.labels", "output");
  return runInNewContext(body, { labels, runner, result, output, cancelled: () => cancelled, fromJSON: JSON.parse });
}

describe("opt-in iOS runner label conjunction", () => {
  it("preserves the ordinary string route when the validator is skipped", async () => {
    const wf = await workflow();
    expect(wf.on.workflow_call.inputs["runner-labels-json"]).toMatchObject({ type: "string", default: "" });
    expect(wf.on.workflow_call.inputs.runner!.default).toBe("macos-26");
    expect(wf.jobs.test.needs).toBe("validate-runner");
    for (const runner of ["macos-26", "macos-vm"]) {
      expect(expression(wf.jobs["validate-runner"].if, "", runner, "skipped")).toBe(false);
      expect(expression(wf.jobs.test.if, "", runner, "skipped")).toBe(true);
      expect(expression(wf.jobs.test["runs-on"], "", runner, "skipped")).toBe(runner);
    }
  });

  it("validates on bounded hosted Linux without source checkout or secrets", async () => {
    const job = (await workflow()).jobs["validate-runner"];
    expect(job["runs-on"]).toBe("ubuntu-latest");
    expect(job["timeout-minutes"]).toBe(2);
    expect(job.concurrency).toEqual({
      group: "ios-ci-runner-labels-${{ github.repository }}-${{ github.workflow }}-${{ inputs.execution-id || github.ref }}-${{ inputs.scheme }}",
      "cancel-in-progress": "${{ inputs.execution-id == '' }}",
    });
    expect(job.outputs).toEqual({ labels: "${{ steps.labels.outputs.labels }}" });
    expect(job.steps).toHaveLength(1);
    expect(job.steps[0]!.env).toEqual({ RUNNER_LABELS_JSON: "${{ inputs.runner-labels-json }}" });
    expect(job.steps[0]!.run).not.toContain("${{");
  });

  it.each([
    [' [ "macos-vm", "no-admission-a1" ] ', ["macos-vm", "no-admission-a1"]],
    ['["self-hosted","macos-vm","unique-label"]', ["self-hosted", "macos-vm", "unique-label"]],
    ['["custom runner"]', ["custom runner"]],
    ['["$(touch injected)","quote\\\"label"]', ["$(touch injected)", 'quote"label']],
  ] as const)("preserves every label literally and emits canonical JSON for %s", async (input, expected) => {
    const validated = await validate(input);
    expect(validated).toEqual({ code: 0, stdout: "", stderr: "", output: `labels=${JSON.stringify(expected)}\n` });
    const wf = await workflow();
    expect(expression(wf.jobs["validate-runner"].if, input, "macos-26", "success")).toBe(true);
    expect(expression(wf.jobs.test.if, input, "macos-26", "success")).toBe(true);
    expect(expression(wf.jobs.test["runs-on"], input, "macos-26", "success", JSON.stringify(expected))).toEqual(expected);
  });

  it.each([
    "", " ", "{", '["macos-vm",]', '"macos-vm"', "{}", "null", "true", "1", "[]",
    '[""]', '[" "]', '[" macos-vm"]', '["macos-vm "]', '["line\\nbreak"]', '["tab\\tlabel"]', '["nul\\u0000"]',
    '[null]', '[false]', '[1]', '[["macos-vm"]]', '[{}]', '["macos-vm",null]',
    '["macos-vm","macos-vm"]', '["macos-vm","MACOS-VM"]',
  ])("refuses %s without emitting a usable selector", async input => {
    const validated = await validate(input);
    expect(validated.code).toBe(1);
    expect(validated.stdout).toBe("");
    expect(validated.stderr).toBe("runner-labels-json must be a nonempty JSON array of distinct, nonblank string labels without surrounding whitespace or control characters\n");
    expect(validated.output).toBe("");
  });

  it("never falls back after failed, skipped or cancelled opt-in validation", async () => {
    const wf = await workflow();
    for (const result of ["failure", "skipped", "cancelled"]) {
      expect(expression(wf.jobs.test.if, '["macos-vm"]', "macos-26", result)).toBe(false);
    }
    for (const labels of ["", '["macos-vm"]']) {
      expect(expression(wf.jobs.test.if, labels, "macos-26", "success", '["macos-vm"]', true)).toBe(false);
    }
    expect(() => expression(wf.jobs.test["runs-on"], '["macos-vm"]', "macos-26", "success", "")).toThrow();
  });
});
