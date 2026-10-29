import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
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
    pid: 4301,
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
  it("reports a configured reader spawn failure before the initialization timeout", async () => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    let failure: Error | undefined;
    void rejected.then(error => { failure = error; });
    f.control.write('{"reader":"spawn-failed","errno":2}\n');
    await vi.advanceTimersByTimeAsync(0);
    try {
      expect(failure?.message).toBe("Codex account quota configured reader could not start (errno=2) (phase=initialize elapsedMs=0)");
      expect(f.signals).toEqual(["SIGTERM"]);
    } finally {
      if (!failure) f.child.emit("close", 3);
      await rejected;
    }
  });

  it("joins fragmented and coalesced private status frames without retaining reader text", async () => {
    const f = fakeReader(false), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.control.write('{"reader":"ex');
    f.control.write('ited","code":2}\n{"cleanup":"terminated"}\n');
    f.child.emit("close", 0);
    expect((await rejected).message).toBe("Codex account quota configured reader exited (code=2) (phase=initialize elapsedMs=0)");
    expect(f.signals).toEqual(["SIGTERM"]);
  });

  it("rejects a lost private reader status channel immediately", async () => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.control.write('{"reader":"status-unavailable"}\n');
    expect((await rejected).message).toBe("Codex account quota configured reader status unavailable (phase=initialize elapsedMs=0)");
    expect(f.signals).toEqual(["SIGTERM"]);
  });

  it.each(['not-json\n', 'null\n', '[]\n', '{"reader":"exited","code":"SECRET"}\n',
    '{"reader":"exited","code":2,"cleanup":"terminated"}\n', '{"cleanup":"terminated","extra":"SECRET"}\n',
    '{"reader":"spawn-failed","errno":true}\n', 'X'.repeat(257)])("refuses malformed or oversized control %s", async frame => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.control.write(frame);
    expect((await rejected).message).toBe("Codex account quota cleanup unknown (phase=initialize elapsedMs=0)");
    expect(f.signals).toEqual(["SIGTERM"]);
  });

  it("does not accept a second cleanup attestation", async () => {
    const f = fakeReader(false), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.initialize(); f.response(f.limits(true));
    f.control.write('{"cleanup":"unknown"}\n{"cleanup":"terminated"}\n'); f.child.emit("close", 0);
    expect((await rejected).message).toContain("cleanup unknown");
  });

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
    f.control.write('{"cleanup":"terminated"}\n'); f.child.emit("close", 0);
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

describe("sanitized configured reader startup diagnostics", () => {
  const safe = "Evo CD worker: startup failed (phase=config-initialize kind=timeout)";
  const exited = "Codex account quota configured reader exited (code=2)";
  const phases = ["pin", "version", "scope", "inventory", "policy", "final-verify", "exec",
    ...["config", "policy"].flatMap(prefix => ["launch", "initialize", "read", "drain", "validate", "cleanup"].map(step => `${prefix}-${step}`))];

  it.each([
    ...phases.map(phase => `phase=${phase} kind=invalid`),
    ...["invalid", "timeout", "os-error", "exit", "protocol", "bounds", "eof", "output"].map(kind => `phase=pin kind=${kind}`),
    "phase=exec kind=os-error errno=1", "phase=exec kind=os-error errno=4095",
    "phase=exec kind=exit code=-255", "phase=exec kind=exit code=0", "phase=exec kind=exit code=255",
  ])("includes only the exact accepted helper diagnostic %s in the quota error", async fields => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    const line = `Evo CD worker: startup failed (${fields})`;
    f.stderr.write(line + "\n"); f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(`${exited}; ${line} (readerPid=4301) (phase=initialize elapsedMs=0)`);
    expect(f.signals).toEqual(["SIGTERM"]); expect(log).not.toHaveBeenCalled();
  });

  it("retains a fragmented first diagnostic while discarding other lines and duplicates", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write("SECRET PROVIDER TEXT\n" + safe.slice(0, 24));
    f.stderr.write(safe.slice(24) + "\n" + safe + "\nEvo CD worker: startup failed (phase=exec kind=exit code=7)\n");
    f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(`${exited}; ${safe} (readerPid=4301) (phase=initialize elapsedMs=0)`);
    expect(log).not.toHaveBeenCalled(); expect(f.stderr.readableLength).toBe(0);
  });

  it.each([0, 30])("reports a late diagnostic once without delaying failure or the cleanup fuse (early bytes=%s)", async earlyBytes => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(false), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write(safe.slice(0, earlyBytes));
    f.control.write('{"reader":"exited","code":2}\n');
    const failure = await rejected;
    expect(failure.message).toBe(`${exited} (phase=initialize elapsedMs=0)`);
    expect(f.signals).toEqual(["SIGTERM"]); expect(log).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(17);
    f.stderr.write(safe.slice(earlyBytes, 40)); f.stderr.write(safe.slice(40) + "\n" + safe + "\nSECRET\n");
    expect(log.mock.calls).toEqual([[`Codex account quota configured reader startup diagnostic; ${safe} (readerPid=4301) (phase=initialize elapsedMs=17)`]]);
    expect(failure.message).toBe(`${exited} (phase=initialize elapsedMs=0)`);
    await vi.advanceTimersByTimeAsync(2_982); expect(f.signals).toEqual(["SIGTERM"]);
    await vi.advanceTimersByTimeAsync(1); expect(f.signals).toEqual(["SIGTERM", "SIGKILL"]);
    f.control.write('{"cleanup":"terminated"}\n'); f.child.emit("close", 0);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it.each([
    "SECRET PROVIDER TEXT", safe + " SECRET", "SECRET " + safe, safe + "\r", safe + " ",
    safe.replace("config-initialize", "initialize"), safe.replace("config-initialize", "config-secret"),
    safe.replace("timeout", "secret"), safe.replace("timeout", "Timeout"),
    "Evo CD worker: startup failed (phase=pin kind=os-error errno=0)",
    "Evo CD worker: startup failed (phase=pin kind=os-error errno=4096)",
    "Evo CD worker: startup failed (phase=pin kind=os-error errno=-1)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=-256)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=256)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=-0)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=01)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=+1)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=1.0)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=1e1)",
    "Evo CD worker: startup failed (phase=pin kind=exit errno=1)",
    "Evo CD worker: startup failed (phase=pin kind=os-error code=1)",
    "Evo CD worker: startup failed (phase=pin kind=timeout errno=1)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=SECRET)",
    "Evo CD worker: startup failed (phase=pin kind=exit code=1 code=2)",
    "X".repeat(129) + safe,
  ])("discards unrecognized, malformed or oversized stderr %#", async line => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write(line + "\n"); f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(`${exited} (phase=initialize elapsedMs=0)`);
    expect(log).not.toHaveBeenCalled(); expect(f.stderr.readableLength).toBe(0);
  });

  it("discards an unterminated diagnostic rather than admitting a possible trailing suffix", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write(safe); f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(`${exited} (phase=initialize elapsedMs=0)`);
    f.stderr.end(" SECRET"); expect(log).not.toHaveBeenCalled();
  });

  it("drops an oversized fragmented line through its newline, then recognizes a fresh line", async () => {
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    f.stderr.write("X".repeat(128)); f.stderr.write(safe + "\n" + safe + "\n");
    f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(`${exited}; ${safe} (readerPid=4301) (phase=initialize elapsedMs=0)`);
  });

  it.each([0, 1])("caps all stderr scanning at exactly 4096 bytes (overflow=%s)", async overflow => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = fakeReader(), rejected = rejection(nativeQuota(["fixture"], "/fixture", f.at));
    const prefix = "X".repeat(4096 - safe.length - 2 + overflow) + "\n";
    f.stderr.write(prefix.slice(0, 2000)); f.stderr.write(prefix.slice(2000) + safe + "\n");
    f.stderr.write("\n" + safe + "\n" + "SECRET".repeat(100_000));
    f.control.write('{"reader":"exited","code":2}\n');
    expect((await rejected).message).toBe(overflow === 0
      ? `${exited}; ${safe} (readerPid=4301) (phase=initialize elapsedMs=0)`
      : `${exited} (phase=initialize elapsedMs=0)`);
    expect(log).not.toHaveBeenCalled(); expect(f.stderr.readableLength).toBe(0);
  });
});

async function fixture(options: Record<string, unknown>) {
  const directory = await mkdtemp(join(tmpdir(), "cd-quota-reader-")); folders.push(directory);
  const script = join(directory, "protocol.mjs"), settings = join(directory, "settings.json"), pidFile = join(directory, "descendant.json");
  await writeFile(settings, JSON.stringify(options));
  await writeFile(script, `import {readFile,writeFile} from "node:fs/promises";import{spawn}from"node:child_process";import{createInterface}from"node:readline";import{once}from"node:events";
const settings=JSON.parse(await readFile(process.argv[2],"utf8"));
if(settings.orphan){await writeFile(process.argv[3],JSON.stringify({pid:process.pid,pgid:process.ppid}));setInterval(()=>{},1000);await new Promise(()=>{});}
if(settings.descendant){const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});await writeFile(process.argv[3],JSON.stringify({pid:child.pid,modelOwner:process.env.MORPHEUS_CD_AGENT_OWNER??null,quotaOwner:process.env.MORPHEUS_CD_QUOTA_READER_OWNER}));}
if(settings.stderr){for(let i=0;i<32;i++)if(!process.stderr.write("X".repeat(65536)))await once(process.stderr,"drain");}
if(settings.startupDiagnostic)process.stderr.write("Evo CD worker: startup failed (phase=config-initialize kind=timeout)\\n");
if(settings.exitCode!==undefined){process.stderr.write("SECRET PROVIDER TEXT");process.exit(settings.exitCode);}
await new Promise(r=>setTimeout(r,settings.startup??0));
for await(const line of createInterface({input:process.stdin})){const m=JSON.parse(line);
if(m.method==="initialize")console.log(JSON.stringify({id:1,result:{}}));
if(m.method==="account/rateLimits/read"){console.log(JSON.stringify({id:2,result:{ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:{primary:{usedPercent:23,resetsAt:Date.now()/1000+3600}}}}}));if(settings.descendant)process.exit(0);}}
`);
  return { directory, command: [process.execPath, script, settings, pidFile], pidFile };
}

describe("real offline quota reader processes", () => {
  it("preserves one sanitized startup diagnostic across real pipes and removes the foreground descendant", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const f = await fixture({ descendant: true, startupDiagnostic: true, exitCode: 2 });
    const reading = nativeQuota(f.command, f.directory, new Date().toISOString());
    const supervisor = vi.mocked(spawn).mock.results.at(-1)!.value as ChildProcess;
    const closed = new Promise<number | null>(resolve => supervisor.once("close", resolve));
    const error = await rejection(reading);
    expect(await closed).toBe(0);
    const output = [error.message, ...log.mock.calls.map(([message]) => String(message))];
    const safe = "Evo CD worker: startup failed (phase=config-initialize kind=timeout)";
    expect(output.filter(line => line.includes(safe))).toHaveLength(1);
    expect(output.join("\n")).not.toContain("SECRET");
    const context = `(phase=initialize elapsedMs=ELAPSED)`, detail = `; ${safe} (readerPid=${supervisor.pid}) ${context}`;
    expect([
      ["Codex account quota configured reader exited (code=2)" + detail],
      [`Codex account quota configured reader exited (code=2) ${context}`, "Codex account quota configured reader startup diagnostic" + detail],
    ]).toContainEqual(output.map(line => line.replace(/elapsedMs=[0-9]+\)/g, "elapsedMs=ELAPSED)")));
    const descendant = JSON.parse(await readFile(f.pidFile, "utf8"));
    expect(() => process.kill(descendant.pid, 0)).toThrow();
  });

  it("reports a missing executable and confirms private reader cleanup", async () => {
    const f = await fixture({});
    const reading = nativeQuota([join(f.directory, "absent-reader")], f.directory, new Date().toISOString());
    const supervisor = vi.mocked(spawn).mock.results.at(-1)!.value as ChildProcess;
    const control: string[] = []; (supervisor.stdio[3] as PassThrough).on("data", bytes => control.push(String(bytes)));
    const closed = new Promise<number | null>(resolve => supervisor.once("close", resolve));
    await expect(reading).rejects.toThrow("configured reader could not start (errno=2)");
    expect(await closed).toBe(0);
    expect(control.join("").trim().split("\n").map(line => JSON.parse(line))).toEqual([
      { reader: "spawn-failed", errno: 2 }, { cleanup: "terminated" },
    ]);
  });

  it("reports early failure and removes its foreground descendant without copying stderr", async () => {
    const f = await fixture({ descendant: true, exitCode: 7 });
    const reading = nativeQuota(f.command, f.directory, new Date().toISOString());
    const supervisor = vi.mocked(spawn).mock.results.at(-1)!.value as ChildProcess;
    const closed = new Promise<number | null>(resolve => supervisor.once("close", resolve));
    await expect(reading).rejects.toThrow("configured reader exited (code=7)");
    expect(await closed).toBe(0);
    const descendant = JSON.parse(await readFile(f.pidFile, "utf8"));
    expect(() => process.kill(descendant.pid, 0)).toThrow();
  });

  it("does not expose the supervisor control descriptor to the configured reader", async () => {
    const f = await fixture({}), proof = join(f.directory, "fd-proof.json");
    const script = `import errno,json,os,sys,time
try:
 os.write(3,b'{"cleanup":"terminated"}\\n')
 blocked=False
except OSError as error:
 blocked=error.errno==errno.EBADF
with open(sys.argv[1],'w') as stream:json.dump({'controlDescriptorClosed':blocked},stream)
for line in sys.stdin:
 message=json.loads(line)
 if message['method']=='initialize':print(json.dumps({'id':1,'result':{}}),flush=True)
 elif message['method']=='account/rateLimits/read':print(json.dumps({'id':2,'result':{'ordinaryUsageAllowed':True,'rateLimitsByLimitId':{'codex':{'primary':{'usedPercent':23,'resetsAt':time.time()+3600}}}}}),flush=True)
`;
    expect((await nativeQuota(["/usr/bin/python3", "-I", "-B", "-c", script, proof], f.directory, new Date().toISOString())).windows[0]!.usedPercent).toBe(23);
    expect(JSON.parse(await readFile(proof, "utf8"))).toEqual({ controlDescriptorClosed: true });
  });

  it("removes its private group within one second if the supervisor is killed", async () => {
    const f = await fixture({ orphan: true });
    const helper = fileURLToPath(new URL("../../src/cd/quota-reader.py", import.meta.url));
    const supervisor = real.spawn("/usr/bin/python3", [helper, "60000", ...f.command], { stdio: ["pipe", "pipe", "pipe", "pipe"] });
    supervisor.stdout!.resume(); supervisor.stderr!.resume();
    let groupId: number | undefined;
    try {
      await vi.waitFor(async () => { groupId = JSON.parse(await readFile(f.pidFile, "utf8")).pgid; });
      supervisor.kill("SIGKILL");
      await vi.waitFor(() => {
        let code: string | undefined;
        try { process.kill(-groupId!, 0); } catch (error) { code = (error as NodeJS.ErrnoException).code; }
        expect(code).toBe("ESRCH");
      }, { timeout: 1_000, interval: 20 });
    } finally {
      supervisor.kill("SIGKILL");
      if (groupId) {
        // Only clean this fixture's still-live private root when a guard mutant
        // deliberately leaves it behind; refuse a mismatched/reused identity.
        try {
          const row = real.execFileSync("ps", ["-p", String(groupId), "-o", "pgid=,command="], { encoding: "utf8" }).trim();
          if (Number(row.split(/\s+/)[0]) === groupId && row.includes(helper + " --group ") && row.includes(f.pidFile)) process.kill(-groupId, "SIGKILL");
        } catch { /* Absent or uncertain groups receive no signal. */ }
      }
    }
  });

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
