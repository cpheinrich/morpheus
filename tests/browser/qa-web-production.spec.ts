import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { build } from "vite";
import type { WebQaBatch, WebQaEvidence } from "../../src/qa/web/schema.js";

async function productionBundle(): Promise<string> {
  const result = await build({
    configFile: false,
    logLevel: "silent",
    build: { write: false, lib: { entry: "src/qa/web/mount.ts", name: "ProductionQA", formats: ["iife"] } },
  });
  const chunk = Array.isArray(result) ? result[0] : result;
  if (!chunk || !("output" in chunk) || chunk.output[0]?.type !== "chunk") throw new Error("Production QA browser fixture did not build");
  return chunk.output[0].code;
}

for (const viewport of [{ width: 375, height: 667 }, { width: 1280, height: 400 }]) {
  test(`owner can send from a ${viewport.width}×${viewport.height} viewport with both Factory options`, async ({ page }, testInfo) => {
    const bundle = await productionBundle();
    await page.setViewportSize(viewport);
    await page.route("https://qa.example.test/", route => route.fulfill({ contentType: "text/html", body: "<main><h1>Test page</h1></main>" }));
    await page.goto("https://qa.example.test/");
    await page.addScriptTag({ content: bundle + `
      ProductionQA.mountWebQa({
        project: "Fixture", accountKey: "test", canBuild: true, onClose() {},
        submit: async batch => {
          document.body.dataset.notes = batch.notes;
          document.body.dataset.featureFlag = String(batch.makeFeatureFlag);
          document.body.dataset.evidence = String(Object.hasOwn(batch.comments[0], "evidence"));
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
    await expect(page.locator("body")).toHaveAttribute("data-evidence", "false");
    await expect(page.getByRole("status")).toHaveText("Saved 1 comment; build and deploy queued.");
  });
}

const FIXTURE_URL = "https://qa.example.test/";
const EVIDENCE_FIXTURE = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:white} body{min-height:2200px;font:20px sans-serif}
.fixed,.sticky{width:130px;height:28px;color:#000}
.fixed{position:fixed;left:16px;top:10px;background:#ffcd35;z-index:3}
.sticky{position:sticky;top:48px;margin-left:16px;background:#25d8d2;z-index:2}
.phase{position:absolute;left:0;width:780px;height:320px}
.first{top:300px;background:#da3527}.second{top:1000px;background:#275ddc}
.target{position:absolute;left:16px;top:120px;margin:0;width:170px;height:42px;background:#fff;color:#000}
.private,.field,.editable,.embedded,.custom,.launcher,.asset{position:absolute;top:180px;width:84px;height:44px;border:0;padding:0;background:#fa00fc}
.private{left:20px}.field{left:120px}.editable{left:220px}.embedded{left:320px}
.custom{display:block;left:420px}.launcher{left:1080px;top:120px}.asset{left:520px;background:white url('/fixture.svg?token=synthetic')}
.photo{position:absolute;left:625px;top:180px;width:84px;height:44px}
details{position:absolute;left:625px;top:236px;width:120px;font:16px/24px sans-serif}
details div{height:30px;background:#9832d4}
</style><div class="fixed">Fixed</div><div class="sticky">Sticky</div>
<section class="phase first"><p class="target" tabindex="0" role="button" aria-pressed="false">First state</p>
<div class="private" data-qa-private>PRIVATE-MARKER</div>
<input class="field" value="PRIVATE-FIELD"><div class="editable" contenteditable>PRIVATE-EDITABLE</div>
<iframe class="embedded" srcdoc="&lt;body style='background:magenta'&gt;PRIVATE-FRAME"></iframe>
<fixture-secret class="custom">PRIVATE-CUSTOM</fixture-secret><div data-qa-chrome class="launcher">QA</div>
<div class="asset"></div><canvas class="photo" width="640" height="440"></canvas>
<details open><summary>Open panel</summary><div>Panel content</div></details></section>
<section class="phase second"><p class="target" tabindex="0">Second state</p></section>
<script>document.querySelector('fixture-secret').attachShadow({mode:'closed'}).innerHTML = '<div>PRIVATE-SHADOW</div>';
const ctx = document.querySelector('.photo').getContext('2d');
ctx.fillStyle = 'rgb(35, 164, 72)'; ctx.fillRect(0, 0, 640, 440);</script>`;

async function mountEvidence(page: Page, bundle: string): Promise<void> {
  await page.addScriptTag({ content: bundle + `
    ProductionQA.mountWebQa({
      project: "Evidence fixture", accountKey: "synthetic", canBuild: false, captureEvidence: true, onClose() {},
      submit: async batch => {
        const response = await fetch("/submit", {method: "POST", body: JSON.stringify(batch)});
        return response.json();
      }
    });
  ` });
}

function captured(evidence: WebQaEvidence | undefined): Extract<WebQaEvidence["status"], { kind: "captured" }> {
  if (evidence?.status.kind !== "captured") throw new Error(`Expected screenshot, got ${JSON.stringify(evidence?.status)}`);
  return evidence.status;
}

test("freezes redacted JPEG pixels at each pin and retries the exact batch across reloads", async ({ page, browserName }, testInfo) => {
  const bundle = await productionBundle();
  let assetRequests = 0;
  const requests: string[] = [];
  await page.route(FIXTURE_URL, route => route.fulfill({ contentType: "text/html", body: EVIDENCE_FIXTURE }));
  await page.route(/\/fixture\.svg\?token=synthetic$/, route => {
    assetRequests++;
    return route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="84" height="44"><rect width="84" height="44" fill="magenta"/></svg>' });
  });
  await page.route("**/submit", async route => {
    requests.push(route.request().postData() ?? "");
    if (requests.length === 1) return route.abort();
    const { batchId } = JSON.parse(requests[0]!) as WebQaBatch;
    return route.fulfill({ json: { batchId, factory: "not-requested" } });
  });
  await page.goto(FIXTURE_URL);
  await mountEvidence(page, bundle);
  const first = page.locator(".first .target");
  const started = Date.now();
  const pending = await first.evaluate(element => {
    const root = document.querySelector("morpheus-web-qa")!.shadowRoot!;
    window.scrollTo(0, 300);
    window.dispatchEvent(new ErrorEvent("error", { message: "PRIVATE-ERROR" }));
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true, cancelable: true, detail: 1, clientX: rect.left + 40, clientY: rect.top + 20 }));
    const composer = root.querySelector<HTMLTextAreaElement>('[aria-label="Comment"]')!;
    composer.value = "First synthetic pin";
    composer.dispatchEvent(new Event("input"));
    composer.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true }));
    element.parentElement!.style.backgroundColor = "rgb(31, 210, 34)";
    element.textContent = "Changed after placement";
    return [root.querySelector<HTMLButtonElement>("button.primary")!.disabled, root.querySelector(".status")!.textContent];
  });
  expect(pending).toEqual([true, "Wait for the screenshot capture to finish."]);
  await expect(page.getByText("Screenshot attached", { exact: true })).toHaveCount(1);
  expect(requests).toEqual([]);
  const second = page.locator(".second .target");
  await second.evaluate(element => {
    window.scrollTo(0, 1000);
    (element as HTMLElement).focus({ preventScroll: true });
  });
  await page.keyboard.press("Enter");
  await page.getByRole("textbox", { name: "Comment" }).fill("Second synthetic pin");
  await expect(page.getByText("Screenshot attached", { exact: true })).toHaveCount(2);
  await expect(page.locator("[data-qa-capture-frame]")).toHaveCount(0);
  const drafts = () => page.evaluate(() => {
    const key = Object.keys(sessionStorage).find(name => name.startsWith("morpheus-qa-web:"))!;
    return (JSON.parse(sessionStorage.getItem(key)!) as { drafts: WebQaBatch["comments"] }).drafts;
  });
  const placed = await drafts();
  expect(assetRequests).toBe(1);
  expect(placed.map(pin => pin.scrollY)).toEqual([300, 1000]);
  expect(placed.map(pin => pin.evidence?.input)).toEqual(["left-click", "keyboard"]);
  expect(placed[0]?.evidence?.elements?.[0]).toMatchObject({ tag: "p", role: "button", pressed: "false", position: "absolute", width: 170, height: 42 });
  expect(placed[0]?.evidence?.errorsSinceMount).toBe(1);
  expect(placed[0]?.evidence?.theme).toBe("light");
  for (const pin of placed) {
    expect(pin.evidence?.browser).toMatchObject({ family: browserName === "chromium" ? "Chrome" : "Safari", versionSource: "user-agent", version: /^\d+(?:\.\d+){0,3}$/ });
    expect(Date.parse(pin.evidence!.capturedAt)).toBeGreaterThanOrEqual(started);
    expect(Date.parse(pin.evidence!.capturedAt)).toBeLessThanOrEqual(Date.now());
    expect(JSON.stringify({ ...pin, evidence: { ...pin.evidence, status: undefined } })).not.toMatch(/PRIVATE-|fixture\.svg|Changed after placement/);
  }
  const firstImage = captured(placed[0]?.evidence);
  const secondImage = captured(placed[1]?.evidence);
  expect(firstImage.jpegBase64).not.toBe(secondImage.jpegBase64);
  const pixels = (image: typeof firstImage, points: number[][]) => page.evaluate(async ({ image, points }) => {
    const picture = new Image();
    picture.src = `data:image/jpeg;base64,${image.jpegBase64}`;
    await picture.decode();
    const canvas = document.createElement("canvas");
    canvas.width = picture.naturalWidth;
    canvas.height = picture.naturalHeight;
    const context = canvas.getContext("2d")!;
    context.drawImage(picture, 0, 0);
    return {
      dimensions: [picture.naturalWidth, picture.naturalHeight],
      colors: points.map(([x, y]) => [...context.getImageData(Math.floor(x! * canvas.width / innerWidth), Math.floor(y! * canvas.height / innerHeight), 1, 1).data].slice(0, 3)),
    };
  }, { image, points });
  const firstPixels = await pixels(firstImage, [[700, 150], [125, 25], [125, 62], [159, 145], [40, 210], [150, 210], [250, 210], [350, 210], [450, 210], [550, 210], [665, 210], [733, 273], [1110, 145]]);
  expect(firstPixels.dimensions).toEqual([firstImage.width, firstImage.height]);
  const secondPixels = await pixels(secondImage, [[700, 150], [125, 25], [125, 62]]);
  const expectPixels = (actual: number[][], expected: number[][]) => {
    expect(actual).toHaveLength(expected.length);
    expected.forEach((color, pixel) => color.forEach((channel, index) => expect(Math.abs(actual[pixel]![index]! - channel), `pixel ${pixel}, channel ${index}`).toBeLessThan(30)));
  };
  const mask = [101, 106, 114], yellow = [255, 205, 53], cyan = [37, 216, 210], white = [255, 255, 255];
  expectPixels(firstPixels.colors, [[218, 53, 39], yellow, cyan, white, mask, mask, mask, mask, mask, white, [35, 164, 72], [152, 50, 212], white]);
  expectPixels(secondPixels.colors, [[39, 93, 220], yellow, cyan]);
  if (process.env.QA_EVIDENCE_DIR) {
    await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true });
    await writeFile(join(process.env.QA_EVIDENCE_DIR, `pin-first-${testInfo.project.name}.jpg`), Buffer.from(firstImage.jpegBase64, "base64"));
    await writeFile(join(process.env.QA_EVIDENCE_DIR, `pin-second-${testInfo.project.name}.jpg`), Buffer.from(secondImage.jpegBase64, "base64"));
  }
  await page.reload();
  await mountEvidence(page, bundle);
  expect(await drafts()).toEqual(placed);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Send not confirmed");
  await page.reload();
  await mountEvidence(page, bundle);
  await page.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved 2 comments.");
  expect(requests).toHaveLength(2);
  expect(requests[1]).toBe(requests[0]);
  expect((JSON.parse(requests[0]!) as WebQaBatch).comments.map(pin => pin.evidence)).toEqual(placed.map(pin => pin.evidence));
});

test("makes a pin's capture failure visible and still sends the feedback", async ({ page }) => {
  const bundle = await productionBundle();
  await page.route(FIXTURE_URL, route => route.fulfill({ contentType: "text/html", body: '<h1>Fixture</h1><div id="over-budget"></div>' }));
  const posted: WebQaBatch[] = [];
  await page.route("**/submit", route => {
    const batch = JSON.parse(route.request().postData()!) as WebQaBatch;
    posted.push(batch);
    return route.fulfill({ json: { batchId: batch.batchId, factory: "not-requested" } });
  });
  await page.goto(FIXTURE_URL);
  await page.evaluate(() => {
    document.querySelector("#over-budget")!.innerHTML = "<span></span>".repeat(2600);
  });
  await mountEvidence(page, bundle);
  await page.getByRole("button", { name: "Comment on this page" }).click();
  await expect(page.getByText("Screenshot unavailable: page exceeds capture limits", { exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Comment" }).fill("Feedback without a screenshot");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Saved 1 comment.");
  expect(posted[0]?.comments[0]).toMatchObject({ text: "Feedback without a screenshot", scope: "page", evidence: { input: "page", status: { kind: "unavailable", reason: "snapshot-limit" } } });
});
