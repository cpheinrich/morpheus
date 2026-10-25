import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { parseWebPreviewConfig, runWebPreview, webContext, webHealthy, type WebPreviewConfig, type WebPreviewState } from "../src/qa/preview/web.js";
import type { Run } from "../src/qa/preview/ios.js";

let base: string, root: string, cache: string;
type Job = { args: string[]; registered: boolean; child?: ChildProcess; bootoutError?: boolean; keepRegistered?: boolean };
const jobs = new Map<string, Job>();
const calls: Array<[string, string[]]> = [];
const output: string[] = [];
const children: ChildProcess[] = [];
const nativeFetch = globalThis.fetch;
const supervisor = fileURLToPath(new URL("../dist/qa/preview/web-supervisor.js", import.meta.url));
const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const freePort = async () => { const s = createServer(); await new Promise<void>(resolve => s.listen(0, "127.0.0.1", resolve)); const port = (s.address() as { port: number }).port; await new Promise<void>(resolve => s.close(() => resolve())); return port; };

const run: Run = (command, args) => {
  calls.push([command, args]);
  if (command !== "launchctl") throw new Error(`Unexpected fixture command ${command}`);
  if (args[0] === "print") {
    const entry = jobs.get(args[1]!);
    if (!entry?.registered) return "";
    const running = entry.child && entry.child.exitCode === null;
    return `state = ${running ? "running" : "not running"}\n${running ? `pid = ${entry.child!.pid}\n` : ""}runs = 1\narguments = {\n${entry.args.join("\n")}\n}`;
  }
  if (args[0] === "bootout") {
    const entry = jobs.get(args[1]!)!;
    if (entry.bootoutError) throw new Error("fixture bootout failed");
    if (!entry.keepRegistered) entry.registered = false;
    entry.child?.kill("SIGTERM");
    return "";
  }
  if (args[0] === "bootstrap") {
    const plist = readFileSync(args[2]!, "utf8");
    const label = plist.match(/<key>Label<\/key><string>([^<]+)<\/string>/)![1]!;
    const file = join(dirname(args[2]!), "session.json");
    const child = spawn(process.execPath, [supervisor, file], { stdio: "ignore" });
    children.push(child);
    jobs.set(`gui/${process.getuid?.()}/${label}`, { args: [process.execPath, supervisor, file], registered: true, child });
    return "";
  }
  throw new Error(`Unexpected fixture launchctl ${args.join(" ")}`);
};

function config(name: string, port = 5173): WebPreviewConfig {
  const parsed = parseWebPreviewConfig({ web: { url: `http://127.0.0.1:${port}` } }, name);
  if (!parsed.ok) throw new Error(parsed.issues.join("\n"));
  return parsed.config;
}
const context = (name = "renamed", port = 5173) => webContext(root, config(name, port), run, line => output.push(line), cache);
async function install(namespace: string, options: { root?: string; args?: string[]; bootoutError?: boolean; keepRegistered?: boolean } = {}) {
  const ctx = context();
  const stateDir = join(cache, namespace, `web-${ctx.key}`), file = join(stateDir, "session.json"), target = `gui/${process.getuid?.()}/${namespace}.web.${ctx.key}`;
  const state: WebPreviewState = { root: options.root ?? root, upstream: `http://127.0.0.1:${await freePort()}`, port: await freePort(), path: "/", cwd: ".", project: "old name", expiresAt: Date.now() + 60000, spawned: false };
  mkdirSync(stateDir, { recursive: true }); writeFileSync(file, JSON.stringify(state));
  jobs.set(target, { args: options.args ?? [process.execPath, supervisor, file], registered: true, ...options });
  return { file, target, state };
}

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), "qa-web-lifecycle-")); root = join(base, "checkout with spaces"); cache = join(base, "Caches");
  mkdirSync(root); mkdirSync(cache); jobs.clear(); calls.length = 0; output.length = 0; children.length = 0;
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fixture endpoint absent")));
});
afterEach(async () => {
  vi.unstubAllGlobals();
  for (const child of children) if (child.pid && alive(child.pid)) child.kill("SIGTERM");
  const pidFile = join(base, "dev.pid");
  if (existsSync(pidFile)) { const pid = Number(readFileSync(pidFile, "utf8")); if (alive(pid)) { try { process.kill(-pid, "SIGTERM"); } catch { /* fixture exited */ } } }
  await Promise.all(children.map(async child => { if (child.pid) await expect.poll(() => alive(child.pid!), { timeout: 8000 }).toBe(false); }));
  await rm(base, { recursive: true, force: true });
});

it("keeps new state and launchd identity stable across project/namespace renames", () => {
  const before = context("cpheinrich.com"), after = context("cpheinrich");
  expect(before.config.namespace).not.toBe(after.config.namespace);
  expect([before.stateDir, before.stateFile, before.target]).toEqual([after.stateDir, after.stateFile, after.target]);
  expect(before.stateDir).toBe(join(cache, "morpheus.qa.web", `web-${before.key}`));
});

it("discovers and stops only the verified legacy registration after a rename", async () => {
  const legacy = await install("morpheus.qa.cpheinrich-com");
  await runWebPreview(context("cpheinrich"), { command: "stop" }, "cpheinrich");
  expect(calls.filter(([, args]) => args[0] === "bootout")).toEqual([["launchctl", ["bootout", legacy.target]]]);
  expect(existsSync(legacy.file)).toBe(false);
  expect(output).toEqual(["Stopped this checkout's web preview: the overlay, and the dev server if this preview started it."]);
});

it("refuses unrelated checkout records and unverifiable job arguments without bootout", async () => {
  const unrelated = await install("morpheus.qa.old", { root: join(base, "another-checkout") });
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("another checkout");
  expect(existsSync(unrelated.file)).toBe(true);
  jobs.clear(); await rm(dirname(unrelated.file), { recursive: true });
  const wrong = await install("morpheus.qa.old", { args: [process.execPath, supervisor, join(base, "another-state.json")] });
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("no verifiable state-file binding");
  expect(existsSync(wrong.file)).toBe(true);
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false);
});

it("refuses multiple matching registrations before stopping any", async () => {
  const a = await install("morpheus.qa.old"), b = await install("morpheus.qa.other");
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("ambiguous ownership");
  await expect(runWebPreview(context(), { command: "status" }, "new")).rejects.toThrow("ambiguous ownership");
  expect(existsSync(a.file) && existsSync(b.file)).toBe(true);
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false);
});

it("does not touch another checkout's different-key session or claim a nonexistent preview stopped", async () => {
  const otherRoot = join(base, "other"); mkdirSync(otherRoot);
  const other = webContext(otherRoot, config("other"), run, () => undefined, cache);
  mkdirSync(other.stateDir, { recursive: true }); writeFileSync(other.stateFile, JSON.stringify({ root: otherRoot }));
  jobs.set(other.target, { args: [process.execPath, supervisor, other.stateFile], registered: true });
  await runWebPreview(context(), { command: "stop" }, "new");
  expect(output).toEqual(["No registered owned web preview was found; no process termination was confirmed."]);
  expect(jobs.get(other.target)?.registered).toBe(true);
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false);
});

it.each(["bootout error", "registration remains"])("keeps state and refuses a successful stop report when %s", async failure => {
  const legacy = await install("morpheus.qa.old", { bootoutError: failure === "bootout error", keepRegistered: failure === "registration remains" });
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow(failure === "bootout error" ? "fixture bootout failed" : "No stop was confirmed");
  expect(existsSync(legacy.file)).toBe(true); expect(output).toEqual([]);
});

it("requires checkout identity in health and retains an answering orphan without a verified job", async () => {
  const legacy = await install("morpheus.qa.old"); jobs.get(legacy.target)!.registered = false;
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ kind: "web", upstream: legacy.state.upstream, root: join(base, "wrong") }))));
  expect(await webHealthy(legacy.state)).toBe(false);
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(JSON.stringify({ kind: "web", upstream: legacy.state.upstream, root }))));
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  legacy.state.port = (listener.address() as { port: number }).port; writeFileSync(legacy.file, JSON.stringify(legacy.state));
  try {
    await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("without a verified launchd owner");
    expect(existsSync(legacy.file)).toBe(true); expect(output).toEqual([]);
  } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
});

it("retains stale state when its port belongs to an unverified listener and reports the real log", async () => {
  const legacy = await install("morpheus.qa.old"); jobs.get(legacy.target)!.registered = false;
  const listener = createServer(); await new Promise<void>(resolve => listener.listen(0, "127.0.0.1", resolve));
  legacy.state.port = (listener.address() as { port: number }).port; writeFileSync(legacy.file, JSON.stringify(legacy.state));
  try {
    await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("without a verified launchd owner");
    await expect(runWebPreview(context(), { command: "status" }, "new")).rejects.toThrow(join(dirname(legacy.file), "preview.log"));
    expect(existsSync(legacy.file)).toBe(true); expect(output).toEqual([]);
    expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false);
  } finally { await new Promise<void>(resolve => listener.close(() => resolve())); }
});

it("retains malformed, symlinked or locked legacy state without stopping a job", async () => {
  const legacy = await install("morpheus.qa.old");
  writeFileSync(legacy.file, "{");
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("Cannot read preview state");
  writeFileSync(legacy.file, JSON.stringify(legacy.state)); mkdirSync(join(dirname(legacy.file), "start.lock"));
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("Another preview start");
  await rm(join(dirname(legacy.file), "start.lock"), { recursive: true });
  const original = join(base, "original.json"); writeFileSync(original, JSON.stringify(legacy.state));
  await rm(legacy.file); symlinkSync(original, legacy.file);
  await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow("Cannot verify preview state");
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false);
});

it("does not treat an inspection failure or missing owner state as successful absence", async () => {
  const denied = webContext(root, config("new"), () => { throw new Error("Operation not permitted"); }, line => output.push(line), cache);
  await expect(runWebPreview(denied, { command: "stop" }, "new")).rejects.toThrow("Cannot inspect preview job");
  const ctx = context(); jobs.set(ctx.target, { registered: true, args: [process.execPath, supervisor, ctx.stateFile] });
  await expect(runWebPreview(ctx, { command: "stop" }, "new")).rejects.toThrow("no verifiable state-file binding");
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false); expect(output).toEqual([]);
});

it("refuses an invalid supervisor PID before bootout", async () => {
  const legacy = await install("morpheus.qa.old");
  const invalid: Run = (command, args) => run(command, args) + (args[0] === "print" && args[1] === legacy.target ? "\npid = 0" : "");
  await expect(runWebPreview(webContext(root, config("new"), invalid, () => undefined, cache), { command: "stop" }, "new")).rejects.toThrow("Cannot verify supervisor PID");
  expect(calls.some(([, args]) => args[0] === "bootout")).toBe(false); expect(existsSync(legacy.file)).toBe(true);
});

it.each([200, 500])("retains a spawned dev listener with HTTP %s after bootout or absent registration", async status => {
  const service = createHttpServer((_req, response) => { response.writeHead(status); response.end("still running"); });
  await new Promise<void>(resolve => service.listen(0, "127.0.0.1", resolve));
  const legacy = await install("morpheus.qa.old");
  legacy.state.upstream = `http://127.0.0.1:${(service.address() as { port: number }).port}`; legacy.state.spawned = true;
  writeFileSync(legacy.file, JSON.stringify(legacy.state));
  if (status === 500) jobs.get(legacy.target)!.registered = false;
  try {
    await expect(runWebPreview(context(), { command: "stop" }, "new")).rejects.toThrow(/(?:No|no) stop was confirmed/);
    expect(existsSync(legacy.file)).toBe(true); expect(output).toEqual([]);
    const proof = await nativeFetch(legacy.state.upstream); expect(proof.status).toBe(status); await proof.text();
    expect(calls.filter(([, args]) => args[0] === "bootout")).toHaveLength(status === 200 ? 1 : 0);
  } finally { service.closeAllConnections(); await new Promise<void>(resolve => service.close(() => resolve())); }
});

it("ignores an empty colliding legacy directory when the stable registration owns its state", async () => {
  const ctx = context();
  const legacy = await install("morpheus.qa"); jobs.delete(legacy.target);
  await rm(legacy.file);
  mkdirSync(ctx.stateDir, { recursive: true }); writeFileSync(ctx.stateFile, JSON.stringify(legacy.state));
  jobs.set(ctx.target, { args: [process.execPath, supervisor, ctx.stateFile], registered: true });
  await runWebPreview(ctx, { command: "stop" }, "new");
  expect(existsSync(ctx.stateFile)).toBe(false);
  expect(calls.filter(([, args]) => args[0] === "bootout")).toEqual([["launchctl", ["bootout", ctx.target]]]);
});

it.each([false, true, "colliding"] as const)("real isolated start/status/stop survives rename (legacy=%s)", async legacy => {
  vi.unstubAllGlobals();
  const port = await freePort(), dev = join(base, "dev.mjs"), pidFile = join(base, "dev.pid");
  writeFileSync(dev, `import {createServer} from 'node:http';import {writeFileSync} from 'node:fs';writeFileSync(process.argv[3],String(process.pid));const s=createServer((q,r)=>r.end('<html><head></head><body>fixture</body></html>'));s.listen(Number(process.argv[2]),'127.0.0.1');process.on('SIGTERM',()=>s.close(()=>process.exit(0)));`);
  const before = context("cpheinrich.com", port); before.config.command = [process.execPath, dev, "{port}", pidFile];
  if (legacy) {
    if (legacy === "colliding") before.config.namespace = "morpheus.qa";
    before.stateDir = join(cache, before.config.namespace, `web-${before.key}`); before.stateFile = join(before.stateDir, "session.json");
    before.label = `${before.config.namespace}.web.${before.key}`; before.target = `gui/${process.getuid?.()}/${before.label}`;
  }
  await runWebPreview(before, { command: "start", ttlMinutes: 1 }, "cpheinrich.com");
  const oldSupervisor = jobs.get(before.target)!.child!.pid!, oldDev = Number(readFileSync(pidFile, "utf8"));
  const renamed = context("cpheinrich", port); renamed.config.command = before.config.command;
  output.length = 0;
  await runWebPreview(renamed, { command: "status" }, "cpheinrich");
  expect(output.join("\n")).toContain(`QA overlay: http://127.0.0.1:${port}/`);
  expect(output.join("\n")).toContain(`Log: ${join(before.stateDir, "preview.log")}`);
  if (legacy) {
    await runWebPreview(renamed, { command: "start", ttlMinutes: 1 }, "cpheinrich");
    expect(alive(oldSupervisor)).toBe(false); expect(alive(oldDev)).toBe(false);
    expect(existsSync(before.stateFile)).toBe(false); expect(existsSync(renamed.stateFile)).toBe(true);
  }
  const current = jobs.get(renamed.target)!.child!.pid!, currentDev = Number(readFileSync(pidFile, "utf8"));
  await runWebPreview(renamed, { command: "stop" }, "cpheinrich");
  expect(alive(current)).toBe(false); expect(alive(currentDev)).toBe(false);
  expect(existsSync(renamed.stateFile)).toBe(false);
  await expect(fetch(`http://127.0.0.1:${port}/__qa/health`)).rejects.toThrow();
}, 20000);
