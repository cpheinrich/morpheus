import { readFile } from "node:fs/promises";
import { load } from "js-yaml";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, it } from "vitest";

it("retains exact upload acceptance through post-upload failures and retries", async () => {
  await promisify(execFile)("python3", ["-B", new URL("./upload-receipt.test.py", import.meta.url).pathname], {
    timeout: 30_000,
    env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
  });
}, 35_000);

it("persists only allowlisted resource and acceptance receipts before distribution after any hook failure", async () => {
  const action = load(await readFile(new URL("../.github/actions/ios-testflight-upload/action.yml", import.meta.url), "utf8")) as {
    runs: { steps: Array<{ id?: string; name?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }> };
  };
  const steps = action.runs.steps;
  const upload = steps.findIndex(step => step.id === "upload");
  const stage = steps.findIndex(step => step.id === "artifact_receipt");
  const persist = steps.findIndex(step => step.id === "acceptance");
  const distribute = steps.findIndex(step => step.run?.includes("distribute-testflight.sh"));
  expect(upload).toBeGreaterThan(0);
  expect(stage).toBe(upload + 1);
  expect(persist).toBe(stage + 1);
  expect(steps[stage]?.if).toBe("${{ always() && (steps.upload.outputs.receipt-path != '' || steps.upload.outputs.resource-path != '') }}");
  expect(steps[stage]?.env).toEqual({
    ARTIFACT_RECEIPT_DIRECTORY: "${{ steps.receipt-context.outputs.directory }}",
    ARTIFACT_RECEIPT_PATH: "${{ steps.upload.outputs.receipt-path }}",
    ARTIFACT_RESOURCE_PATH: "${{ steps.upload.outputs.resource-path }}",
  });
  expect(steps[stage]?.run).toBe('python3 -I -S -B "$GITHUB_ACTION_PATH/artifact-stage/stage.py" --github upload-acceptance-resource');
  expect(distribute).toBe(persist + 1);
  expect(steps[persist]?.if).toBe("${{ always() && (steps.upload.outputs.receipt-path != '' || steps.upload.outputs.resource-path != '') && steps.artifact_receipt.outcome == 'success' && steps.artifact_receipt.outputs.admitted == 'true' && steps.artifact_receipt.outputs.has-files == 'true' }}");
  expect(steps[persist]?.uses).toBe("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  expect(steps[persist]?.with).toEqual({ name: "${{ steps.receipt-context.outputs.artifact-name }}", path: "${{ steps.artifact_receipt.outputs.payload-root }}", "if-no-files-found": "error", "retention-days": 90, overwrite: false, archive: true, "compression-level": 0 });
  expect(steps[distribute]?.if).toBe("${{ success() && inputs.distribution-enabled == 'true' && steps.upload.outputs.upload-id != '' }}");
  expect(steps[distribute]?.env?.UPLOAD_ID).toBe("${{ steps.upload.outputs.upload-id }}");
  expect(steps[distribute]?.env?.IOS_DISTRIBUTION_P12_BASE64).toBeUndefined();
});


it("keeps CD hooks and reserved identity explicit while legacy distribution remains enabled", async () => {
  const action = load(await readFile(new URL("../.github/actions/ios-testflight-upload/action.yml", import.meta.url), "utf8")) as {
    inputs: Record<string, { default?: unknown }>;
    outputs: Record<string, { value?: string }>;
    runs: { steps: Array<{ id?: string; env?: Record<string, string> }> };
  };
  expect(action.inputs["distribution-enabled"]?.default).toBe("true");
  for (const input of ["before-upload-script", "after-upload-script", "reserved-build-number"]) expect(action.inputs[input]?.default).toBe("");
  expect(action.outputs["acceptance-path"]?.value).toBe("${{ steps.upload.outputs.receipt-path }}");
  expect(action.outputs.version?.value).toBe("${{ steps.upload.outputs.version }}");
  expect(action.outputs["build-number"]?.value).toBe("${{ steps.upload.outputs.build-number }}");
  expect(action.runs.steps.find(step => step.id === "upload")?.env).toMatchObject({
    BEFORE_UPLOAD_SCRIPT: "${{ inputs.before-upload-script }}", AFTER_UPLOAD_SCRIPT: "${{ inputs.after-upload-script }}",
    RESERVED_BUILD_NUMBER: "${{ inputs.reserved-build-number }}", DISTRIBUTION_ENABLED: "${{ inputs.distribution-enabled }}",
  });
});
