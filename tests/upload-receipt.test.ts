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

it("persists only accepted.json before any distribution, even when upload cleanup fails", async () => {
  const action = load(await readFile(new URL("../.github/actions/ios-testflight-upload/action.yml", import.meta.url), "utf8")) as {
    runs: { steps: Array<{ id?: string; name?: string; if?: string; uses?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> }> };
  };
  const steps = action.runs.steps;
  const upload = steps.findIndex(step => step.id === "upload");
  const persist = steps.findIndex(step => step.id === "acceptance");
  const distribute = steps.findIndex(step => step.run?.includes("distribute-testflight.sh"));
  expect(upload).toBeGreaterThan(0);
  expect(persist).toBe(upload + 1);
  expect(distribute).toBe(persist + 1);
  expect(steps[persist]?.if).toBe("${{ always() && steps.upload.outputs.receipt-path != '' }}");
  expect(steps[persist]?.uses).toBe("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  expect(steps[persist]?.with).toEqual({ name: "${{ steps.receipt-context.outputs.artifact-name }}", path: "${{ steps.upload.outputs.receipt-path }}", "if-no-files-found": "error", "retention-days": 90, overwrite: false });
  expect(steps[distribute]?.if).toBeUndefined(); // Default success() blocks distribution if persistence failed.
  expect(steps[distribute]?.env?.UPLOAD_ID).toBe("${{ steps.upload.outputs.upload-id }}");
  expect(steps[distribute]?.env?.IOS_DISTRIBUTION_P12_BASE64).toBeUndefined();
});
