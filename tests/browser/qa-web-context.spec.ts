import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { startWebQaServer } from "../../src/qa/web/server.js";

const fixture = `<!doctype html><html><head><title>Artists</title><style>
body{margin:0;background:rgb(20,40,200);font-family:Arial}main{height:14000px}#base{height:100px;background:#ddd}
[role=dialog]{position:fixed;inset:40px;background:rgb(200,20,40);z-index:10;padding:20px}
#scroller{height:240px;overflow:auto;background:white}#target{height:100px;margin-top:100px;background:rgb(20,180,40)}
</style></head><body><main><h1>Artists</h1><div id=base>Base card</div></main>
<script>window.openArtist=function(name){var old=document.querySelector('[role=dialog]');if(old)old.remove();var d=document.createElement('section');d.setAttribute('role','dialog');if(name==='Bob')d.style.background='rgb(20,200,40)';d.setAttribute('data-artist-id',name);d.innerHTML='<h2>'+name+'</h2><input type=search aria-label="Find artwork" value="landscape"><input type=password value="PASSWORD_SECRET"><div hidden>HIDDEN_SECRET</div><button aria-pressed=true>Oil</button><div id=scroller><div id=target>Artwork '+name+'</div><div style="height:1000px"></div></div>';document.body.appendChild(d)};</script></body></html>`;

async function setup(page: Page, html = fixture) {
  const root = await mkdtemp(join(tmpdir(), "web-context-"));
  const upstream = createServer((_req, res) => { res.writeHead(200, { "content-type": "text/html" }); res.end(html); });
  await new Promise<void>(resolve => upstream.listen(0, "127.0.0.1", resolve));
  const qa = await startWebQaServer({ root, project: "context-fixture", upstream: `http://127.0.0.1:${(upstream.address() as { port: number }).port}`, port: 0 });
  await page.goto(`http://127.0.0.1:${qa.port}/?token=TOKEN_SECRET#gallery`);
  const site = page.frameLocator("#morpheus-qa-site");
  await expect(site.locator("#base")).toBeVisible();
  const frame = page.frames().find(f => f.parentFrame() === page.mainFrame())!;
  const pins = () => page.evaluate(() => (window as any).__morpheusQa.pins().map((p: any) => ({ text: p.text, createdAt: p.createdAt, context: p.webContext, frame: p.frame, hidden: p.marker.hidden })));
  const cleanup = async () => { await qa.close(); upstream.closeAllConnections(); await new Promise<void>(resolve => upstream.close(() => resolve())); await rm(root, { recursive: true, force: true }); };
  return { root, site, frame, pins, cleanup };
}

test("web context: exact semantic state, modal identity, scroll, scope, persistence and immutable JPEGs", async ({ page }, info) => {
  const s = await setup(page);
  try {
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Base background");
    await s.frame.evaluate(() => (window as any).openArtist("Alice"));
    await expect.poll(async () => (await s.pins())[0].hidden).toBe(true);
    await s.site.locator("#target").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Alice artwork\nSecond line");
    const frozen = (await s.pins())[1];
    expect(frozen.context.target).toMatchObject({ tag: "div", attributes: { id: "target" }, text: "Artwork Alice" });
    expect(frozen.context.view.root.attributes["data-artist-id"]).toBe("Alice");
    expect(frozen.context.state).toContainEqual({ kind: "search", label: "Find artwork", value: "landscape" });
    expect(JSON.stringify(frozen)).not.toContain("PASSWORD_SECRET");
    expect(JSON.stringify(frozen)).not.toContain("HIDDEN_SECRET");
    expect(JSON.stringify(frozen)).not.toContain("TOKEN_SECRET");
    // Change the original view immediately while image resource work is still asynchronous.
    await s.frame.evaluate(() => { (window as any).openArtist("Bob"); });
    await expect.poll(async () => (await s.pins())[1].hidden).toBe(true);
    await expect.poll(async () => (await s.pins())[1].context.image.status, { timeout: 17000 }).toBe("captured");
    await s.frame.evaluate(() => (window as any).openArtist("Alice"));
    await expect.poll(async () => (await s.pins())[1].hidden).toBe(false);
    await s.site.locator("#target").evaluate(el => { el.textContent = "Recycled other artwork"; });
    await expect.poll(async () => (await s.pins())[1].hidden).toBe(true);
    await s.site.locator("#target").evaluate(el => { el.textContent = "Artwork Alice"; });
    await expect.poll(async () => (await s.pins())[1].hidden).toBe(false);
    const y = await page.locator("morpheus-qa .pin").nth(1).evaluate(el => parseFloat((el as HTMLElement).style.top));
    await s.site.locator("#scroller").evaluate(el => { el.scrollTop = 50; });
    await expect.poll(async () => page.locator("morpheus-qa .pin").nth(1).evaluate(el => parseFloat((el as HTMLElement).style.top))).toBe(y - 50);
    await page.setViewportSize({ width: 1800, height: 1000 });
    await expect.poll(async () => (await s.pins())[1].hidden).toBe(false);
    await page.locator("morpheus-qa select").selectOption("view");
    expect((await s.pins())[1].context.scope).toBe("view");
    expect((await s.pins())[1].context.target).toEqual(frozen.context.target);
    const beforeReload = await s.pins();
    expect(beforeReload[0].frame.dataUrl).not.toBe(beforeReload[1].frame.dataUrl);
    expect(beforeReload[1].frame.dataUrl).toMatch(/^data:image\/jpeg;base64,/);
    expect(Math.max(beforeReload[1].frame.width, beforeReload[1].frame.height)).toBeLessThanOrEqual(1600);
    expect(beforeReload[1].frame.capturedAt).toBe(frozen.createdAt);
    // Inspect actual encoded pixels: the click image still contains Alice's red modal after Bob replaced it.
    const pixel = await page.evaluate(async (url) => { const im = new Image(); im.src = url; await im.decode(); const c = document.createElement("canvas"); c.width = im.width; c.height = im.height; c.getContext("2d")!.drawImage(im, 0, 0); return Array.from(c.getContext("2d")!.getImageData(800, 100, 1, 1).data); }, beforeReload[1].frame.dataUrl);
    expect(pixel[0]).toBeGreaterThan(180); expect(pixel[2]).toBeLessThan(65);
    if (process.env.QA_EVIDENCE_DIR) { await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, `web-context-${info.project.name}.png`) }); }
    await page.reload();
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(2);
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
    const dirs = await readdir(join(s.root, "local/qa-comments/pending"));
    const batch = JSON.parse(await readFile(join(s.root, "local/qa-comments/pending", dirs[0]!, "batch.json"), "utf8"));
    expect(batch.frame).toBeUndefined();
    expect(batch.comments.map((c: any) => c.createdAt)).toEqual(beforeReload.map((p: any) => p.createdAt));
    expect(batch.comments[1].text).toBe(beforeReload[1].text);
    expect(batch.comments[1].webContext).toEqual(beforeReload[1].context);
    expect(await readFile(join(s.root, "local/qa-comments/pending", dirs[0]!, "comment-2.jpg"))).toEqual(Buffer.from(beforeReload[1].frame.dataUrl.split(",")[1], "base64"));
  } finally { await s.cleanup(); }
});

test("web context: document scroll is applied once while fixed dialog stays in its viewport", async ({ page }) => {
  test.setTimeout(40000);
  const s = await setup(page, fixture.replace('<div id=base>', '<div style="height:700px"></div><div id=base>'));
  try {
    await s.frame.evaluate(() => scrollTo(0, 700));
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await expect.poll(async () => (await s.pins())[0]?.context.image.status, { timeout: 17000 }).toBe("captured");
    await s.frame.evaluate(() => (window as any).openArtist("Alice"));
    await s.site.locator("#target").click({ button: "right", position: { x: 50, y: 40 } });
    await expect.poll(async () => (await s.pins())[1]?.context.image.status, { timeout: 17000 }).toBe("captured");
    const colors = await page.evaluate(async (urls: string[]) => {
      return Promise.all(urls.map(async url => {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height;
        const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
        return Array.from(ctx.getImageData(800, 110, 1, 1).data).slice(0, 3);
      }));
    }, (await s.pins()).map((pin: any) => pin.frame.dataUrl));
    // The gray base card and red fixed dialog both occupy this viewport point at placement.
    expect(colors[0]!.every(value => Math.abs(value - 221) <= 8), JSON.stringify(colors[0])).toBe(true);
    expect(colors[1]![0]).toBeGreaterThan(180); expect(colors[1]![2]).toBeLessThan(65);
  } finally { await s.cleanup(); }
});

test("web context: storage failures remain visible and pin-count admission is bounded", async ({ page }) => {
  // Block the first open: WebKit can populate the cached database before a post-load patch.
  await page.addInitScript(() => {
    if (sessionStorage.getItem("storage-failure-tested")) return;
    sessionStorage.setItem("storage-failure-tested", "yes");
    Storage.prototype.setItem = function () { throw new Error("quota"); };
    indexedDB.open = function () { throw new Error("blocked storage"); };
  });
  const s = await setup(page);
  try {
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Keep HTML in this tab");
    await expect.poll(async () => (await s.pins())[0]?.context.image.status, { timeout: 17000 }).toBe("failed");
    await expect(page.locator("morpheus-qa .status")).toContainText("Draft not saved");
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
    await page.reload();
    await page.evaluate(() => { sessionStorage.setItem("morpheus-qa:v2:context-fixture", JSON.stringify({ pins: Array.from({ length: 30 }, (_, i) => ({ id: "legacy" + i, n: i + 1, text: "Old comment", anchor: { normX: .2, normY: .2 } })) })); });
    await page.reload();
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(30);
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await expect(page.locator("morpheus-qa .status")).toContainText("30 draft pins maximum");
    expect(await s.pins()).toHaveLength(30);
  } finally { await s.cleanup(); }
});

test("web context: image failure preserves HTML; legacy drafts remain editable and sendable", async ({ page }) => {
  const s = await setup(page);
  try {
    await page.route("**/__qa/modern-screenshot.js", route => route.abort());
    await s.frame.evaluate(() => { const f = document.createElement("iframe"); f.style.cssText = "position:fixed;inset:0;width:200px;height:100px"; document.body.append(f); });
    await s.site.locator("#base").click({ button: "right", position: { x: 250, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("HTML still usable");
    await expect.poll(async () => (await s.pins())[0]?.context.image.status).toBe("failed");
    expect((await s.pins())[0].context.image.error).toBe("Capture library unavailable");
    await page.locator("morpheus-qa textarea").press("Enter");
    await expect(page.locator("morpheus-qa .status")).toContainText("Saved pin 1");
    await expect(page.locator("morpheus-qa .placement-status")).toBeVisible();
    await expect(page.locator("morpheus-qa .placement-status")).toContainText("Capture library unavailable");
    await page.locator("morpheus-qa ol li").click();
    await expect(page.locator("morpheus-qa .placement-status")).toContainText("HTML evidence is saved");
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
    await page.evaluate(() => { sessionStorage.removeItem("morpheus-qa:v2:context-fixture"); sessionStorage.setItem("morpheus-qa:/?token=TOKEN_SECRET", JSON.stringify({ pins: [{ id: "old", n: 1, text: "Old comment", anchor: { normX: .2, normY: .2 } }] })); });
    await page.reload();
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(1);
    await page.locator("morpheus-qa ol li").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Legacy pin");
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
  } finally { await s.cleanup(); }
});

test("web context: inherited design tokens stay bounded without losing resolved styles", async ({ page }, info) => {
  const tokens = Array.from({ length: 180 }, (_, i) => `--brand-unused-${i}:color-mix(in srgb, rgb(20,40,200) 40%, rgb(200,20,40));`).join("");
  const cards = Array.from({ length: 36 }, (_, i) => `<article><h2>Artist ${i}</h2><p>Live music in a small room</p><button>Listen ${i}</button></article>`).join("");
  const s = await setup(page, `<!doctype html><html><head><title>Token-rich guide</title><style>
    :root{${tokens}--brand-accent:rgb(200,20,40);--brand-pseudo:rgb(20,180,40)}
    body{margin:0;font:16px Arial;color:white;background:rgb(20,40,200)}main{min-height:14000px}
    #base{height:100px;background:rgb(17,34,51)}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
    article{padding:8px;border:1px solid white;background:rgb(40,50,60)}h2,p{margin:0}button{font:inherit;color:var(--brand-accent)}
    svg{position:fixed;left:340px;top:20px;width:40px;height:40px}rect{fill:var(--brand-accent)}
    .badge{position:fixed;left:400px;top:20px;width:40px;height:40px}.badge::before{content:"";position:absolute;inset:0;width:40px;height:40px;background:var(--brand-pseudo)}
    .inherit{position:fixed;left:460px;top:20px;color:var(--brand-accent)}.reset{color:initial;font:40px/40px monospace}
    input{position:fixed;left:520px;top:20px;width:180px;padding:8px;border:2px solid var(--brand-accent);font:16px Arial}
    img{position:fixed;left:740px;top:20px;width:100px;height:40px;object-fit:contain;background:white}
    .color-box{position:fixed;left:850px;top:20px;width:60px;height:40px;color:red;background:white;border:8px solid black;outline:8px solid black;font:20px Arial;text-decoration:underline black}
    .color-pseudo{position:fixed;left:850px;top:100px;width:60px;height:40px;color:red}
    .color-pseudo::before{content:"Red";position:absolute;inset:0;color:red;background:white;border:8px solid black;outline:8px solid black;font:20px Arial;text-decoration:underline black}
    </style></head><body><main><div id=base>Token-rich guide</div><div class=cards>${cards}</div></main>
    <svg viewBox="0 0 40 40"><rect width="40" height="40"/></svg><span class=badge></span><span class=inherit><span class=reset>█</span></span><input value="Placement query"><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='20' height='40'%3E%3Crect width='20' height='40' fill='rgb(200,20,40)'/%3E%3C/svg%3E"><div class=color-box>Red</div><span class=color-pseudo></span></body></html>`);
  let release!: () => void;
  const encoding = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/__qa/modern-screenshot.js", async route => { await encoding; await route.continue(); });
  try {
    await expect(s.site.locator("img")).toHaveJSProperty("complete", true);
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Token-rich placement");
    const pendingImage = (await s.pins())[0].context.image;
    expect(pendingImage.status, JSON.stringify(pendingImage)).toBe("pending");
    await page.waitForFunction(async () => {
      const request = indexedDB.open("morpheus-web-pin-evidence", 1);
      const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
      const rows = db.transaction("pins").objectStore("pins").getAll();
      return new Promise<boolean>(resolve => { rows.onsuccess = () => resolve(rows.result.some(r => r.snapshot)); });
    });
    const snapshot = await page.evaluate(async () => {
      const request = indexedDB.open("morpheus-web-pin-evidence", 1);
      const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
      const rows = db.transaction("pins").objectStore("pins").getAll();
      return new Promise<{ html: string }>(resolve => { rows.onsuccess = () => resolve(rows.result.find(r => r.snapshot).snapshot); });
    });
    expect(new Blob([snapshot.html]).size).toBeLessThan(2 * 1024 * 1024);
    expect(snapshot.html).not.toContain("--brand-unused-");
    if (process.env.QA_EVIDENCE_DIR) { await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.QA_EVIDENCE_DIR, `web-token-snapshot-${info.project.name}.html`), snapshot.html); }
    await s.frame.evaluate(() => { document.documentElement.style.setProperty("--brand-accent", "yellow"); document.documentElement.style.setProperty("--brand-pseudo", "purple"); document.querySelector("input")!.value = "Changed later"; });
    release();
    await expect.poll(async () => (await s.pins())[0].context.image.status, { timeout: 17000 }).toBe("captured");
    const pin = (await s.pins())[0];
    if (process.env.QA_EVIDENCE_DIR) { await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.QA_EVIDENCE_DIR, `web-tokens-${info.project.name}.jpg`), Buffer.from(pin.frame.dataUrl.split(",")[1], "base64")); }
    const pixels = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; const c = canvas.getContext("2d")!; c.drawImage(image, 0, 0); return [[10,80],[360,40],[420,40],[470,40],[750,40],[790,40],[854,40],[846,40],[854,120],[846,120]].map(([x,y]) => Array.from(c.getImageData(x!,y!,1,1).data).slice(0,3)); }, pin.frame.dataUrl);
    [[17,34,51],[200,20,40],[20,180,40],[0,0,0],[255,255,255],[200,20,40],[0,0,0],[0,0,0],[0,0,0],[0,0,0]].forEach((expected, i) => expected.forEach((value, j) => expect(Math.abs(pixels[i]![j]! - value), `pixel ${i}: ${pixels[i]}`).toBeLessThanOrEqual(8)));
    expect(snapshot.html).toContain("Placement query");
    expect(snapshot.html).not.toContain("Changed later");
  } finally { release(); await s.cleanup(); }
});

test("web context: pending frozen image resumes after reload, cap and quality apply, long page work stays bounded", async ({ page }) => {
  const s = await setup(page);
  try {
    await page.setViewportSize({ width: 2400, height: 1600 });
    await page.route("**/__qa/modern-screenshot.js", async route => { await new Promise(resolve => setTimeout(resolve, 400)); await route.continue(); });
    await s.frame.evaluate(() => {
      (window as any).openArtist("Alice");
      const list = document.createElement("div");
      list.innerHTML = Array.from({ length: 12000 }, (_, i) => '<p>Guide row ' + i + '</p>').join("");
      document.querySelector("main")!.appendChild(list);
    });
    const started = Date.now();
    await s.site.locator("#target").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Pending image");
    // A completed IndexedDB snapshot write is the reload boundary; encoding can still be pending.
    await page.waitForFunction(async () => {
      const request = indexedDB.open("morpheus-web-pin-evidence", 1);
      const db = await new Promise<IDBDatabase>(resolve => { request.onsuccess = () => resolve(request.result); });
      const rows = db.transaction("pins").objectStore("pins").getAll();
      return new Promise<boolean>(resolve => { rows.onsuccess = () => resolve(rows.result.some(r => r.snapshot)); });
    });
    expect(Date.now() - started).toBeLessThan(2000);
    const original = (await s.pins())[0];
    expect(original.context.image).toMatchObject({ status: "pending", quality: .5, coordinateSpace: "viewport", scale: 1600 / 2060 });
    await page.reload();
    await expect.poll(async () => (await s.pins())[0]?.context.image.status, { timeout: 17000 }).toBe("captured");
    const kept = (await s.pins())[0];
    expect(kept.frame.width).toBe(1600);
    const dimensions = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); return [image.width, image.height]; }, kept.frame.dataUrl);
    expect([kept.frame.width, kept.frame.height]).toEqual(dimensions);
    expect(kept.context.image.scaleX).toBe(dimensions[0]! / 2060);
    expect(kept.context.image.scaleY).toBe(dimensions[1]! / 1600);
    expect(kept.frame.capturedAt).toBe(original.createdAt);
    expect(kept.context.target.text).toBe("Artwork Alice");
    expect(kept.frame.dataUrl.length).toBeLessThanOrEqual(512 * 1024);
    expect(await page.locator('iframe[sandbox="allow-same-origin"]').count()).toBe(0);
  } finally { await s.cleanup(); }
});

test("web context: cross-origin artwork and video omit only their media, keeping the viewport JPEG", async ({ page }, info) => {
  const media = createServer((req, res) => {
    res.writeHead(200, { "content-type": req.url === "/art.svg" ? "image/svg+xml" : "text/html" });
    res.end(req.url === "/art.svg" ? '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><rect width="300" height="200" fill="purple"/></svg>' : '<h1>Cross-origin video player</h1>');
  });
  await new Promise<void>(resolve => media.listen(0, "127.0.0.1", resolve));
  const mediaOrigin = `http://127.0.0.1:${(media.address() as { port: number }).port}`;
  const s = await setup(page);
  try {
    await s.frame.evaluate(origin => {
      const image = document.createElement("img"); image.src = origin + "/art.svg"; image.style.cssText = "position:fixed;left:100px;top:400px;width:300px;height:200px";
      const video = document.createElement("iframe"); video.src = origin + "/player"; video.style.cssText = "position:fixed;left:600px;top:100px;width:300px;height:200px";
      document.body.append(image, video);
    }, mediaOrigin);
    await expect(s.site.locator("img")).toHaveJSProperty("complete", true);
    await s.site.locator("#base").click({ button: "right", position: { x: 50, y: 40 } });
    await page.locator("morpheus-qa textarea").fill("Guide with event artwork and video");
    await expect.poll(async () => (await s.pins())[0]?.context.image.status, { timeout: 17000 }).toBe("captured");
    const pin = (await s.pins())[0];
    expect(pin.context.image.omitted).toEqual(["Unloaded or cross-origin img pixels omitted", "Embedded media omitted"]);
    const pixels = await page.evaluate(async url => { const image = new Image(); image.src = url; await image.decode(); const canvas = document.createElement("canvas"); canvas.width = image.width; canvas.height = image.height; const c = canvas.getContext("2d")!; c.drawImage(image, 0, 0); return [Array.from(c.getImageData(800, 700, 1, 1).data), Array.from(c.getImageData(650, 110, 1, 1).data)]; }, pin.frame.dataUrl);
    expect(pixels[0]![2]).toBeGreaterThan(180); // original blue page still captured
    expect(pixels[1]![0]).toBeGreaterThan(200); // media placeholder is gray, not missing whole image
    if (process.env.QA_EVIDENCE_DIR) { await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true }); await writeFile(join(process.env.QA_EVIDENCE_DIR, `web-media-${info.project.name}.jpg`), Buffer.from(pin.frame.dataUrl.split(",")[1], "base64")); }
  } finally { await s.cleanup(); media.closeAllConnections(); await new Promise<void>(resolve => media.close(() => resolve())); }
});

test("web context: legacy route drafts merge once with v2 drafts across navigation and cleanup failure", async ({ page }) => {
  const s = await setup(page);
  const old = (id: string, text: string) => ({ id, n: 1, text, anchor: { normX: .2, normY: .2 } });
  try {
    await page.evaluate(pin => {
      sessionStorage.setItem("morpheus-qa:v2:context-fixture", JSON.stringify({ pins: [] }));
      sessionStorage.setItem("morpheus-qa:/?token=TOKEN_SECRET", JSON.stringify({ pins: [pin] }));
    }, old("old1", "First legacy"));
    await page.reload();
    await expect(page.locator("morpheus-qa ol li")).toHaveText(["1First legacy×"]);
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET"))).toBeNull();
    await page.evaluate(pin => {
      sessionStorage.setItem("morpheus-qa:/second", JSON.stringify({ pins: [pin] }));
      const remove = Storage.prototype.removeItem;
      Storage.prototype.removeItem = function (key) { if (key === "morpheus-qa:/second") throw new Error("cleanup denied"); return remove.call(this, key); };
    }, old("old1", "Second legacy"));
    await s.site.locator("body").evaluate(body => body.ownerDocument.defaultView!.history.pushState(null, "", "/second"));
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(2);
    expect((await s.pins()).map((p: any) => p.text)).toEqual(["First legacy", "Second legacy"]);
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/second"))).not.toBeNull();
    await page.locator("morpheus-qa ol li").filter({ hasText: "Second legacy" }).locator("button").click();
    await s.site.locator("body").evaluate(body => body.ownerDocument.defaultView!.history.pushState(null, "", "/away"));
    await s.site.locator("body").evaluate(body => body.ownerDocument.defaultView!.history.pushState(null, "", "/second"));
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(1);
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
    await page.reload();
    await expect.poll(async () => (await s.pins()).length).toBe(0);
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/second"))).toBeNull();
  } finally { await s.cleanup(); }
});

test("web context: legacy overflow survives admission and metadata limits", async ({ page }, info) => {
  const s = await setup(page);
  try {
    await page.evaluate(() => {
      const old = (id: string, text: string) => ({ id, n: 1, text, anchor: { normX: .2, normY: .2 } });
      sessionStorage.setItem("morpheus-qa:v2:context-fixture", JSON.stringify({ pins: Array.from({ length: 29 }, (_, i) => ({ ...old("existing" + i, "Existing " + i), n: i + 1 })) }));
      sessionStorage.setItem("morpheus-qa:/?token=TOKEN_SECRET", JSON.stringify({ pins: [old("a", "Legacy A"), old("b", "Legacy B"), old("c", "Legacy C")] }));
    });
    await page.reload();
    await expect(page.locator("morpheus-qa ol li")).toHaveCount(30);
    await expect(page.locator("morpheus-qa .status")).toContainText("Legacy draft retained");
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET")!).pins.map((p: any) => p.text))).toEqual(["Legacy A", "Legacy B", "Legacy C"]);
    if (process.env.QA_EVIDENCE_DIR) { await mkdir(process.env.QA_EVIDENCE_DIR, { recursive: true }); await page.screenshot({ path: join(process.env.QA_EVIDENCE_DIR, `web-legacy-overflow-${info.project.name}.png`) }); }
    await page.locator("morpheus-qa button.primary").click();
    await expect(page.locator("morpheus-qa .status")).toContainText("Queued");
    await expect.poll(async () => (await s.pins()).map((p: any) => p.text)).toEqual(["Legacy B", "Legacy C"]);
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET"))).toBeNull();
    await page.evaluate(() => {
      const old = (id: string, text: string) => ({ id, n: 1, text, anchor: { normX: .2, normY: .2 } });
      sessionStorage.setItem("morpheus-qa:v2:context-fixture", JSON.stringify({ pins: [old("large", "x".repeat(261800))] }));
      sessionStorage.setItem("morpheus-qa:/?token=TOKEN_SECRET", JSON.stringify({ pins: [old("pending", "Pending " + "y".repeat(1000))] }));
    });
    await page.reload();
    await expect.poll(async () => (await s.pins()).length).toBe(1);
    await expect(page.locator("morpheus-qa .status")).toContainText("Legacy draft retained");
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET"))).not.toBeNull();
    await page.locator("morpheus-qa ol li .num").click();
    await page.locator("morpheus-qa textarea").fill("Shortened current comment");
    await expect.poll(async () => (await s.pins()).length).toBe(2);
    expect((await s.pins())[1].text).toBe("Pending " + "y".repeat(1000));
  } finally { await s.cleanup(); }
});

test("web context: unrelated filtered/reordered cards do not change page identity", async ({ page }) => {
  const s = await setup(page);
  try {
    await s.site.locator("main").evaluate(main => { main.innerHTML = '<h1>Artist guide</h1><article data-entity-id="Alice">Alice</article><article data-entity-id="Bob"><button id="bob">Bob artwork</button></article>'; });
    await s.site.locator("#bob").click({ button: "right" });
    await s.site.locator('[data-entity-id="Alice"]').evaluate(el => el.remove());
    await expect.poll(async () => (await s.pins())[0].hidden).toBe(false);
    await s.site.locator("main").evaluate(main => { const alice = document.createElement("article"); alice.dataset.entityId = "Alice"; alice.textContent = "Alice"; main.prepend(alice); });
    await expect.poll(async () => (await s.pins())[0].hidden).toBe(false);
    expect((await s.pins())[0].context.target.text).toBe("Bob artwork");
  } finally { await s.cleanup(); }
});

test("web context: failed merged-metadata write leaves the legacy source recoverable", async ({ page }) => {
  const s = await setup(page);
  try {
    await page.evaluate(() => {
      sessionStorage.setItem("morpheus-qa:v2:context-fixture", JSON.stringify({ pins: [] }));
      sessionStorage.setItem("morpheus-qa:/?token=TOKEN_SECRET", JSON.stringify({ pins: [{ id: "old", n: 1, text: "Durable legacy", anchor: { normX: .2, normY: .2 } }] }));
    });
    await page.addInitScript(() => {
      const set = Storage.prototype.setItem;
      (window as any).restoreStorageWrites = () => { Storage.prototype.setItem = set; };
      Storage.prototype.setItem = function (key, value) { if (key === "morpheus-qa:v2:context-fixture") throw new Error("quota"); return set.call(this, key, value); };
    });
    await page.reload();
    await expect(page.locator("morpheus-qa .status")).toContainText("Legacy draft retained");
    expect((await s.pins()).length).toBe(0);
    expect(await page.evaluate(() => JSON.parse(sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET")!).pins[0].text)).toBe("Durable legacy");
    await page.evaluate(() => (window as any).restoreStorageWrites());
    await s.site.locator("body").evaluate(body => body.ownerDocument.defaultView!.history.pushState(null, "", "/away"));
    await expect.poll(async () => page.url()).toContain("/away");
    await s.site.locator("body").evaluate(body => body.ownerDocument.defaultView!.history.pushState(null, "", "/?token=TOKEN_SECRET"));
    await expect.poll(async () => (await s.pins()).map((p: any) => p.text)).toEqual(["Durable legacy"]);
    expect(await page.evaluate(() => sessionStorage.getItem("morpheus-qa:/?token=TOKEN_SECRET"))).toBeNull();
  } finally { await s.cleanup(); }
});
