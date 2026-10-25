import { createServer, type Server } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "@playwright/test";
import { pageHtml } from "../../src/qa/overlay-page.js";
import { startWebQaServer } from "../../src/qa/web/server.js";

const svg = (color: string) => `<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844"><rect width="390" height="844" fill="${color}"/></svg>`;
const listen = async (server: Server) => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return (server.address() as { port: number }).port;
};
const close = async (server: Server) => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
};

test("iOS: pin, scroll or navigate, pin again, and send each clicked frame", async ({ page }, testInfo) => {
  const received: { posted: { comments: Array<{ text: string; screenId?: string; frame?: { dataUrl: string } }> } | null } = { posted: null };
  const server = createServer(async (req, res) => {
    if (req.url === "/") {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(pageHtml({ previewUrl: "http://127.0.0.1:3000", streamPath: "/red.svg", axPath: "/api/ax", project: "evo" }));
    } else if (req.url === "/red.svg" || req.url === "/blue.svg") {
      res.writeHead(200, { "content-type": "image/svg+xml" });
      res.end(svg(req.url === "/red.svg" ? "#ff0000" : "#0000ff"));
    } else if (req.url === "/api/batches" && req.method === "POST") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      received.posted = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      res.writeHead(201, { "content-type": "application/json" });
      res.end(JSON.stringify({ id: "batch-browser", pendingCount: 1 }));
    } else { res.writeHead(404); res.end(); }
  });
  const port = await listen(server);
  try {
    await page.addInitScript(() => {
      type Snapshot = { screen: { width: number; height: number }; screenId: string; elements: unknown[]; errors: unknown[] };
      const sources: Array<{ onmessage?: (event: { data: string }) => void }> = [];
      Object.defineProperty(window, "EventSource", { value: class {
        onmessage?: (event: { data: string }) => void;
        constructor() { sources.push(this); }
      } });
      (window as typeof window & { emitAx: (s: Snapshot) => void }).emitAx =
        (snapshot) => sources.forEach((source) => source.onmessage?.({ data: JSON.stringify(snapshot) }));
    });
    await page.goto(`http://127.0.0.1:${port}/`);
    await expect(page.locator("#stream")).toHaveJSProperty("naturalWidth", 390);
    const snapshot = (screenId: string, y: number) => ({
      screen: { width: 390, height: 844 }, screenId, errors: [],
      elements: [{ id: "chart", path: "0.1", label: screenId, frame: { x: 0, y, width: 390, height: 100 } }],
    });
    await page.evaluate((s) => (window as unknown as { emitAx: (value: unknown) => void }).emitAx(s), snapshot("trendsScreen", 100));
    const stage = page.locator("#stage");
    await stage.click({ button: "right", position: { x: 195, y: 150 } });
    await page.locator("#text").fill("First chart");
    await page.locator("#text").press("Enter");
    await page.evaluate((s) => (window as unknown as { emitAx: (value: unknown) => void }).emitAx(s), snapshot("trendsScreen", 40));
    await page.evaluate((s) => {
      (window as unknown as { emitAx: (value: unknown) => void }).emitAx(s);
      (document.getElementById("stream") as HTMLImageElement).src = "/blue.svg";
    }, snapshot("trackScreen", 100));
    await expect(page.locator("#stream")).toHaveAttribute("src", "/blue.svg");
    await stage.click({ button: "right", position: { x: 195, y: 150 } });
    await page.locator("#text").fill("Second chart");
    await page.locator("#text").press("Enter");
    await expect(page.locator("#list li")).toHaveCount(2);
    if (process.env.QA_EVIDENCE_DIR) {
      await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, `ios-${testInfo.project.name}.png`) });
    }
    await page.reload();
    await expect(page.locator("#list li")).toHaveCount(2);
    await page.locator("#send").click();
    await expect(page.locator("#status")).toContainText("Queued batch-browser");
    const posted = received.posted;
    expect(posted).not.toBeNull();
    expect(posted!.comments.map((c) => [c.text, c.screenId])).toEqual([
      ["First chart", "trendsScreen"], ["Second chart", "trackScreen"],
    ]);
    expect(posted!.comments[0]?.frame?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(posted!.comments[1]?.frame?.dataUrl).toMatch(/^data:image\/png;base64,/);
    expect(posted!.comments[0]?.frame?.dataUrl).not.toBe(posted!.comments[1]?.frame?.dataUrl);
  } finally { await close(server); }
});

test("web: pin two elements across page scroll and send both through the proxy", async ({ page }, testInfo) => {
  const root = await mkdtemp(join(tmpdir(), "morpheus-qa-browser-"));
  const upstream = createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end('<html><head><title>QA fixture</title></head><body style="margin:0"><div id="first" style="height:160px;background:#fee">First card</div><div style="height:1000px"></div><div id="second" style="height:160px;background:#eef">Second card</div></body></html>');
  });
  const upstreamPort = await listen(upstream);
  const qa = await startWebQaServer({ root, project: "fixture", upstream: `http://127.0.0.1:${upstreamPort}`, port: 0 });
  try {
    await page.goto(`http://127.0.0.1:${qa.port}/`);
    const site = page.frameLocator("#morpheus-qa-site");
    await expect(site.locator("#first")).toBeVisible();
    await site.locator("#first").click({ button: "right", position: { x: 50, y: 50 } });
    await page.locator("morpheus-qa textarea").fill("First web card");
    await page.locator("morpheus-qa textarea").press("Enter");
    await site.locator("#first").evaluate((el) => { el.ownerDocument.defaultView!.location.href = "/other"; });
    await page.waitForFunction(() => (document.getElementById("morpheus-qa-site") as HTMLIFrameElement).contentWindow?.location.pathname === "/other");
    await page.evaluate(() => (document.getElementById("morpheus-qa-site") as HTMLIFrameElement).contentWindow!.history.back());
    await page.waitForFunction(() => (document.getElementById("morpheus-qa-site") as HTMLIFrameElement).contentWindow?.location.pathname === "/");
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(1);
    await site.locator("#second").scrollIntoViewIfNeeded();
    await site.locator("#second").click({ button: "right", position: { x: 50, y: 50 } });
    await page.locator("morpheus-qa textarea").fill("Second web card");
    await page.locator("morpheus-qa textarea").press("Enter");
    if (process.env.QA_EVIDENCE_DIR) {
      await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true });
      await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, `web-${testInfo.project.name}.png`) });
    }
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued", { timeout: 17000 });
    const names = await readdir(join(root, "local/qa-comments/pending"));
    expect(names).toHaveLength(1);
    const batch = JSON.parse(await readFile(join(root, "local/qa-comments/pending", names[0]!, "batch.json"), "utf8"));
    expect(batch.comments.map((c: { text: string; anchor: { element: { selector: string } } }) => [c.text, c.anchor.element.selector])).toEqual([
      ["First web card", "#first"], ["Second web card", "#second"],
    ]);
  } finally {
    await qa.close();
    await close(upstream);
    await rm(root, { recursive: true, force: true });
  }
});
