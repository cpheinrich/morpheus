import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";

for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 400 }]) {
  test(`owner can send from a ${viewport.width}×${viewport.height} viewport with both Factory options`, async ({ page }, testInfo) => {
    const result = await build({
      configFile: false,
      logLevel: "silent",
      build: { write: false, lib: { entry: "src/qa/web/mount.ts", name: "ProductionQA", formats: ["iife"] } },
    });
    const chunk = (Array.isArray(result) ? result[0] : result);
    if (!chunk || !("output" in chunk) || chunk.output[0]?.type !== "chunk") {
      throw new Error("Production QA browser fixture did not build");
    }
    await page.setViewportSize(viewport);
    await page.route("https://qa.example.test/", route => route.fulfill({ contentType: "text/html", body: "<main><h1>Test page</h1></main>" }));
    await page.goto("https://qa.example.test/");
    await page.addScriptTag({ content: chunk.output[0].code + `
      ProductionQA.mountWebQa({
        project: "Fixture", accountKey: "test", canBuild: true, onClose() {},
        submit: async batch => {
          document.body.dataset.notes = batch.notes;
          document.body.dataset.featureFlag = String(batch.makeFeatureFlag);
          return {batchId: batch.batchId, factory: "queued"};
        }
      });
    ` });
    await page.getByRole("heading", { name: "Test page" }).click();
    await page.getByRole("textbox", { name: "Comment" }).fill("Synthetic short-screen review");
    await page.getByLabel("Notes").fill("  Prioritize the mobile layout.  ");
    await page.getByLabel("Build and deploy").check();
    await page.getByLabel("Feature flag").check();
    if (process.env.QA_EVIDENCE_DIR) {
      await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true });
      await page.getByLabel("Notes").scrollIntoViewIfNeeded();
      await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, `production-${viewport.width}-${testInfo.project.name}.png`) });
    }
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("body")).toHaveAttribute("data-notes", "Prioritize the mobile layout.");
    await expect(page.getByLabel("Notes")).toHaveValue("");
    await expect(page.locator("body")).toHaveAttribute("data-feature-flag", "true");
    await expect(page.getByRole("status")).toHaveText("Saved 1 comment; build and deploy queued.");
  });
}
