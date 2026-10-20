import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeQuota } from "../../src/cd/quota-reader.js";

vi.mock("node:child_process", async original => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
const rejection = (reading: Promise<unknown>): Promise<Error> => reading.then(() => { throw new Error("Expected quota rejection"); }, error => error as Error);
const real = await vi.importActual<typeof import("node:child_process")>("node:child_process");
const folders: string[] = [];
afterEach(async () => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.restoreAllMocks(); vi.mocked(spawn).mockImplementation(real.spawn); await Promise.all(folders.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

function fakeReader(autoClose = true, cleaned = true) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T15:00:00Z"));
  const stdout = new PassThrough(), stderr = new PassThrough(), control = new PassThrough();
  const signals: string[] = [], commands: unknown[] = [];
  const child = Object.assign(new EventEmitter(), {
    stdin: Object.assign(new PassThrough(), { write(data: string) { commands.push(JSON.parse(data)); return true; } }),
    stdout, stderr, stdio: [null, stdout, stderr, control],
    kill(signal: string) {
      signals.push(signal);
      if (autoClose && signal === "SIGTERM") queueMicrotask(() => { control.write(JSON.stringify({ cleanup: cleaned ? "terminated" : "unknown" }) + "\n"); child.emit("close", cleaned ? 0 : 3); });
      return true;
    },
  });
  vi.mocked(spawn).mockReturnValueOnce(child as unknown as ChildProcess);
  const at = new Date().toISOString();
  const response = (result: unknown) => stdout.write(JSON.stringify({ id: 2, result }) + "\n");
  const limits = (ordinaryUsageAllowed?: unknown, resetSeconds = 3600) => ({
    ordinaryUsageAllowed, credits: { hasCredits: true },
    rateLimitsByLimitId: { codex: { primary: { usedPercent: 23, resetsAt: Date.parse(at) / 1000 + resetSeconds } } },
  });
  return { child, signals, commands, at, stdout, stderr, control, response, limits, initialize: () => stdout.write('{"id":1,"result":{}}\n') };
}

describe("native quota read bounds and protocol", () => {
  it("allows shim initialization past ten seconds, then reads exact fresh limits once", async () => {
    const f = fakeReader(), reading = nativeQuota(["fixture"], "/fixture", f.at);
    await vi.advanceTimersByTimeAsync(11_000); f.initialize(); f.response(f.limits(true));
    expect(await reading).toEqual({ observedAt: f.at, source: "Codex account/rateLimits/read", windows: [{ id: "primary", usedPercent: 23, resetsAt: "2026-10-20T16:00:00.000Z" }] });
    expect(f.commands).toEqual([{ id: 1, method: "initialize", params: { clientInfo: { name: "morpheus-cd", version: "1" }, capabilities: { experimentalApi: true } } }, { method: "initialized", params: {} }, { id: 2, method: "account/rateLimits/read", params: {} }]);
    expect(f.signals).toEqual(["SIGTERM"]);
  });

  it.each([60_000, 60_001])("fails closed at the startup deadline %sms without waiting for cleanup", async delay => {
    const f = fakeReader(false), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    await vi.advanceTimersByTimeAsync(delay);
    expect((await rejected).message).toBe("Codex account quota read timed out (phase=initialize elapsedMs=60000)");
    expect(f.signals).toEqual(["SIGTERM"]);
    expect(f.commands).toHaveLength(1);
  });

  it("accepts just before the total bound and caps the final RPC within remaining time", async () => {
    const f = fakeReader(), reading = nativeQuota(["fixture"], "/fixture", f.at);
    await vi.advanceTimersByTimeAsync(59_999); f.initialize(); f.response(f.limits(true)); await reading;
    const late = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", late.at));
    await vi.advanceTimersByTimeAsync(59_000); late.initialize(); await vi.advanceTimersByTimeAsync(1_000);
    expect((await rejected).message).toContain("phase=rateLimits elapsedMs=60000");
  });

  it.each([10_000, 10_001])("rejects a withheld quota RPC at its exact %sms bound", async delay => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.initialize(); await vi.advanceTimersByTimeAsync(delay);
    expect((await rejected).message).toBe("Codex account quota read timed out (phase=rateLimits elapsedMs=10000)");
    expect(f.commands).toHaveLength(3);
  });

  it("accepts a final quota RPC just before ten seconds", async () => {
    const f = fakeReader(), reading = nativeQuota(["fixture"], "/fixture", f.at);
    f.initialize(); await vi.advanceTimersByTimeAsync(9_999); f.response(f.limits(true)); expect((await reading).windows[0]!.usedPercent).toBe(23);
  });

  it.each(["initialize", "rateLimits"])("checks %s deadline equality even before its timer callback runs", async phase => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    if (phase === "rateLimits") f.initialize();
    vi.setSystemTime(new Date(Date.parse(f.at) + (phase === "initialize" ? 60_000 : 10_000)));
    if (phase === "initialize") f.initialize(); else f.response(f.limits(true));
    expect((await rejected).message).toContain("read timed out");
  });

  it.each([false, undefined, null, "true"])("never uses prepaid credits for ordinary allowance %s", async allowance => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.initialize(); f.response(f.limits(allowance));
    expect((await rejected).message).toContain("ordinary subscription usage is unavailable or unknown");
  });

  it.each(["stale", "reset-during-read"])("validates %s at completion, after reader cleanup", async kind => {
    const f = fakeReader(), at = kind === "stale" ? new Date(Date.parse(f.at) - 300_001).toISOString() : f.at;
    const rejected = rejection(nativeQuota(["fixture"], "/fixture", at));
    f.initialize(); await vi.advanceTimersByTimeAsync(5_000); f.response(f.limits(true, kind === "stale" ? 3600 : 5));
    expect((await rejected).message).toContain("returned unknown/expired quota telemetry");
  });

  it("also refuses windows expiring during cleanup and invalid observation timestamps", async () => {
    const f = fakeReader(false), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.initialize(); f.response(f.limits(true, 1)); vi.setSystemTime(new Date(Date.parse(f.at) + 1_000));
    f.control.write('{"cleanup":"terminated"}'); f.child.emit("close", 0);
    expect((await rejected).message).toContain("returned unknown/expired quota telemetry");
    const invalid = fakeReader(), failure = rejection(nativeQuota(["fixture"], "/fixture", "invalid"));
    invalid.initialize(); invalid.response(invalid.limits(true));
    expect((await failure).message).toContain("returned unknown/expired quota telemetry");
  });

  it("does not retain or echo provider errors or stderr", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write("SECRET PROVIDER TEXT"); f.stdout.write('{"id":1,"error":{"message":"SECRET PROVIDER TEXT"}}\n');
    expect((await rejected).message).toBe("Codex account quota RPC unavailable (phase=initialize elapsedMs=0)");
    expect(f.stderr.readableLength).toBe(0);
    expect(log).not.toHaveBeenCalled();
  });

  it("refuses an unconfirmed cleanup and has a separate three-second supervisor fuse", async () => {
    const bad = fakeReader(true, false), rejected = rejection(nativeQuota(["fixture"], "/fixture", bad.at));
    bad.initialize(); bad.response(bad.limits(true)); expect((await rejected).message).toContain("cleanup unknown");
    const stuck = fakeReader(false), failure = rejection(nativeQuota(["fixture"], "/fixture", stuck.at));
    stuck.initialize(); stuck.response(stuck.limits(true)); await vi.advanceTimersByTimeAsync(3_000);
    expect((await failure).message).toContain("phase=cleanup elapsedMs=3000");
    expect(stuck.signals).toEqual(["SIGTERM", "SIGKILL"]);
  });
});

async function fixture(options: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), "cd-quota-reader-")); folders.push(directory);
  const script = join(directory, "protocol.mjs"), settings = join(directory, "settings.json"), pidFile = join(directory, "descendant.json");
  await writeFile(settings, JSON.stringify(options));
  await writeFile(script, `import {readFile,writeFile} from "node:fs/promises";import{spawn}from"node:child_process";import{createInterface}from"node:readline";import{once}from"node:events";
const settings=JSON.parse(await readFile(process.argv[2],"utf8"));
if(settings.descendant){const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});await writeFile(process.argv[3],JSON.stringify({pid:child.pid,modelOwner:process.env.MORPHEUS_CD_AGENT_OWNER??null,quotaOwner:process.env.MORPHEUS_CD_QUOTA_READER_OWNER}));}
if(settings.stderr){for(let i=0;i<32;i++)if(!process.stderr.write("X".repeat(65536)))await once(process.stderr,"drain");}
await new Promise(r=>setTimeout(r,settings.startup??0));
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);
if(m.method==="initialize")console.log(JSON.stringify({id:1,result:{}}));
if(m.method==="account/rateLimits/read"){console.log(JSON.stringify({id:2,result:{ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:{primary:{usedPercent:23,resetsAt:Date.now()/1000+3600}}}}}));if(settings.descendant)process.exit(0);}}
`);
  return { directory, command: [process.execPath, script, settings, pidFile], pidFile };
}

describe("real offline quota reader processes", () => {
  it("handles an actual synthetic startup longer than the old ten-second deadline", async () => {
    const f = await fixture({ startup: 10_200 });
    expect((await nativeQuota(f.command, f.directory, new Date().toISOString())).windows[0]!.usedPercent).toBe(23);
  }, 20_000);

  it("drains two MiB of stderr before the handshake without retaining provider text", async () => {
    const f = await fixture({ stderr: true });
    expect((await nativeQuota(f.command, f.directory, new Date().toISOString())).windows).toHaveLength(1);
  });

  it("cleans a reader that exits leaving a foreground descendant, without touching another model group", async () => {
    vi.stubEnv("MORPHEUS_CD_AGENT_OWNER", "synthetic-unrelated-model-owner");
    const model = real.spawn(process.execPath, ["-e", "setInterval(()=>{},1000)"], { detached: true, stdio: "ignore" });
    try {
      const f = await fixture({ descendant: true });
      const snapshot = await nativeQuota(f.command, f.directory, new Date().toISOString());
      const evidence = JSON.parse(await readFile(f.pidFile, "utf8"));
      expect(snapshot.windows[0]!.usedPercent).toBe(23);
      expect(evidence.modelOwner).toBeNull(); expect(evidence.quotaOwner).toMatch(/^[a-f0-9]{32}$/);
      expect(() => process.kill(evidence.pid, 0)).toThrow();
      expect(() => process.kill(model.pid!, 0)).not.toThrow();
    } finally { model.kill("SIGTERM"); await new Promise<void>(resolve => model.once("close", () => resolve())); }
  });
});
