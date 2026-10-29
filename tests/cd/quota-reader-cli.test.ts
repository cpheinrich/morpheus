import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { config } from "./fixtures.js";

const cli = fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url));
const storeUrl = new URL("../../dist/cd/store.js", import.meta.url).href;
const schemaUrl = new URL("../../dist/cd/schema.js", import.meta.url).href;
const safe = "Evo CD worker: startup failed (phase=config-initialize kind=timeout)";
const base = "Codex account quota configured reader exited (code=2)";
const context = "(phase=initialize elapsedMs=ELAPSED)";
const detail = `; ${safe} (readerPid=74301) ${context}`;
const late = "Codex account quota configured reader startup diagnostic" + detail;
const normalized = (text: string) => text.replace(/elapsedMs=[0-9]+/g, "elapsedMs=ELAPSED");
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });

interface Event { kind: string; ms: number; signal?: string }
async function fixture(settings: { order?: string; cleanup?: string; real?: boolean; healthy?: boolean; linger?: boolean; worker?: boolean } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "cd-quota-cli-")); directories.push(directory);
  const preload = join(directory, "preload.mjs"), events = join(directory, "events.jsonl"), pidFile = join(directory, "descendant.json");
  const script = join(directory, "synthetic-reader.mjs"), configPath = join(directory, "config.json");
  await writeFile(configPath, JSON.stringify({ ...config(), agents: { local: { command: [process.execPath, script, pidFile] } } }));
  await writeFile(script, `import {spawn} from "node:child_process";import {writeFile} from "node:fs/promises";import {createInterface} from "node:readline";
const child=spawn(process.execPath,["-e","setInterval(()=>{},1000)"],{stdio:"ignore"});
await writeFile(process.argv[2],JSON.stringify({pid:child.pid}));
process.stderr.write(${JSON.stringify(safe + "\nSECRET PROVIDER TEXT\n")},()=>process.exit(2));
`);
  await writeFile(preload, `import cp from "node:child_process";import {syncBuiltinESMExports} from "node:module";import {EventEmitter} from "node:events";import {PassThrough} from "node:stream";import {appendFileSync} from "node:fs";
const settings=${JSON.stringify(settings)},started=Date.now(),event=(kind,extra={})=>appendFileSync(${JSON.stringify(events)},JSON.stringify({kind,ms:Date.now()-started,...extra})+"\\n");
event("preload");globalThis.fetch=()=>{throw Error("Unexpected network in offline fixture");};
const error=console.error.bind(console),log=console.log.bind(console);
console.error=(...args)=>{event("error");error(...args);};console.log=(...args)=>{event("result");log(...args);};
if(settings.linger)setTimeout(()=>event("linger"),2000);
const originalSpawn=cp.spawn;
cp.execFile=()=>{throw Error("Unexpected executable in offline fixture");};
cp.spawn=(command,args,options)=>{
 if(command!=="/usr/bin/python3"||!args[0].endsWith("/quota-reader.py"))throw Error("Unexpected process in offline fixture");
 if(settings.real){const child=originalSpawn(command,args,options);child.on("close",()=>event("close"));return child;}
 const stdout=new PassThrough(),stderr=new PassThrough(),control=new PassThrough();
 const stdin=Object.assign(new PassThrough(),{write(data){const request=JSON.parse(data);if(settings.healthy)queueMicrotask(()=>{if(request.id===1)stdout.write('{"id":1,"result":{}}\\n');if(request.id===2)stdout.write(JSON.stringify({id:2,result:{ordinaryUsageAllowed:true,rateLimitsByLimitId:{codex:{primary:{usedPercent:23,resetsAt:Date.now()/1000+3600}}}}})+"\\n");});return true;}});
 const child=Object.assign(new EventEmitter(),{pid:74301,stdin,stdout,stderr,stdio:[null,stdout,stderr,control],kill(signal){
  event("signal",{signal});
  if(signal==="SIGTERM"&&settings.cleanup!=="stuck")setTimeout(()=>{const confirmed=settings.cleanup!=="unknown";control.write(JSON.stringify({cleanup:confirmed?"terminated":"unknown"})+"\\n");event("close");child.emit("close",confirmed?0:3);},35);
  return true;
 }});
 if(!settings.healthy)setImmediate(()=>{
  if(settings.order==="before")stderr.write(${JSON.stringify(safe + "\n")});
  if(settings.order==="split")stderr.write(${JSON.stringify(safe.slice(0, 30))});
  event("control");control.write('{"reader":"exited","code":2}\\n');
  if(settings.order!=="before")setTimeout(()=>{event("diagnostic");stderr.write((settings.order==="split"?${JSON.stringify(safe.slice(30))}:${JSON.stringify(safe)})+"\\nSECRET PROVIDER TEXT\\n");},17);
 });
 return child;
};syncBuiltinESMExports();
if(settings.worker){
 const {GitHubStore}=await import(${JSON.stringify(storeUrl)}),{hash}=await import(${JSON.stringify(schemaUrl)}),at=new Date(Date.now()-1000).toISOString();
 const state={agents:{fixture:{id:"fixture",intentId:"intent",task:"offline fixture",taskDigest:hash("offline fixture"),evidence:[],createdAt:at,nextCheckAt:at,strategy:0,invocations:[],state:"pending"}},intents:{intent:{channel:"staging",attempts:[]}},pauses:[],transitions:{},fences:{}};
 GitHubStore.prototype.read=async()=>({head:"a".repeat(40),tree:"b".repeat(40),state});
 GitHubStore.prototype.transact=async(id,kind,at,transition)=>{event("journal");return {state,head:"a".repeat(40),result:transition(state),replayed:false};};
}
`);
  async function run(argv: string[]) {
    const child = spawn(process.execPath, ["--import", pathToFileURL(preload).href, cli, ...argv], {
      cwd: directory, stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, MORPHEUS_CD_QUOTA_FILE: "" },
    });
    let stdout = "", stderr = "";
    child.stdout.on("data", bytes => { stdout += String(bytes); }); child.stderr.on("data", bytes => { stderr += String(bytes); });
    child.stdin.end("{}");
    const code = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => { child.kill("SIGKILL"); reject(new Error("Offline CLI fixture exceeded six seconds")); }, 6_000);
      child.on("error", error => { clearTimeout(timer); reject(error); });
      child.on("close", code => { clearTimeout(timer); resolve(code); });
    });
    const trace = (await readFile(events, "utf8")).trim().split("\n").map(line => JSON.parse(line) as Event);
    return { code, stdout, stderr, trace };
  }
  const command = (name: string) => ["cd", name, "--executor", "local", "--config", configPath, ...(name === "worker" ? ["--host-id", "offline-fixture", "--work-id", "fixture"] : [])];
  return { run, command, pidFile };
}

describe("compiled quota CLI lifecycle", () => {
  it.each(["quota", "worker"].flatMap(command => ["before", "after", "split"].map(order => ({ command, order }))))("preserves one diagnostic through $command exit ($order stderr)", async ({ command, order }) => {
    const f = await fixture({ order, worker: command === "worker" }), result = await f.run(f.command(command));
    const reason = order === "before" ? base + detail : `${base} ${context}`;
    expect(result.code).toBe(command === "quota" ? 1 : 0);
    expect(normalized(result.stderr)).toBe(command === "quota" ? reason + "\n" + (order === "before" ? "" : late + "\n") : order === "before" ? "" : late + "\n");
    if (command === "worker") expect(JSON.parse(normalized(result.stdout))).toEqual({ state: "budget-wait", reason, failureKind: "telemetry" });
    else expect(result.stdout).toBe("");
    expect((result.stdout + result.stderr).match(/Evo CD worker: startup failed/g)).toHaveLength(1);
    expect(result.stdout + result.stderr).not.toContain("SECRET");
    expect(result.trace.filter(event => event.kind === "signal").map(event => event.signal)).toEqual(["SIGTERM"]);
    expect(result.trace.at(-1)!.kind).toBe("close");
    if (order !== "before") {
      const completion = result.trace.findIndex(event => event.kind === (command === "worker" ? "result" : "error"));
      expect(completion).toBeGreaterThan(result.trace.findIndex(event => event.kind === "control"));
      expect(completion).toBeLessThan(result.trace.findIndex(event => event.kind === "diagnostic"));
    }
  });

  it("returns successful quota only after its cleanup attestation", async () => {
    const f = await fixture({ healthy: true }), result = await f.run(f.command("quota"));
    expect(result.code).toBe(0); expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout)).toEqual({ observedAt: expect.any(String), source: "Codex account/rateLimits/read", windows: [{ id: "primary", usedPercent: 23, resetsAt: expect.any(String) }] });
    expect(result.trace.map(event => event.kind)).toEqual(["preload", "signal", "close", "result"]);
  });

  it.each(["quota", "worker"])("preserves %s failure and private cleanup-unknown diagnostics", async command => {
    const f = await fixture({ order: "after", cleanup: "unknown", worker: command === "worker" }), result = await f.run(f.command(command));
    expect(result.code).toBe(command === "quota" ? 1 : 0);
    expect(normalized(result.stderr)).toBe((command === "quota" ? `${base} ${context}\n` : "") + late + `\nCodex account quota cleanup unknown ${context}\n`);
    expect(result.trace.filter(event => event.kind === "signal").map(event => event.signal)).toEqual(["SIGTERM"]);
    if (command === "worker") expect(JSON.parse(normalized(result.stdout))).toEqual({ state: "budget-wait", reason: `${base} ${context}`, failureKind: "telemetry" });
  });

  it.each(["quota", "worker"])("keeps the separate three-second cleanup fuse for %s", async command => {
    const f = await fixture({ order: "after", cleanup: "stuck", worker: command === "worker" }), result = await f.run(f.command(command));
    expect(result.code).toBe(command === "quota" ? 1 : 0);
    expect(normalized(result.stderr)).toBe((command === "quota" ? `${base} ${context}\n` : "") + late + "\n");
    const signals = result.trace.filter(event => event.kind === "signal");
    expect(signals.map(event => event.signal)).toEqual(["SIGTERM", "SIGKILL"]);
    expect(signals[1]!.ms - signals[0]!.ms).toBeGreaterThanOrEqual(3_000);
    expect(signals[1]!.ms - signals[0]!.ms).toBeLessThan(4_000);
  }, 10_000);

  it.each(["quota", "worker"])("removes a real offline reader descendant before %s exits", async command => {
    const f = await fixture({ real: true, worker: command === "worker" }), result = await f.run(f.command(command));
    expect(result.code).toBe(command === "quota" ? 1 : 0);
    expect((result.stdout + result.stderr).match(/Evo CD worker: startup failed/g)).toHaveLength(1);
    expect(result.stdout + result.stderr).not.toContain("SECRET");
    expect(result.trace.some(event => event.kind === "close")).toBe(true);
    const descendant = JSON.parse(await readFile(f.pidFile, "utf8"));
    expect(() => process.kill(descendant.pid, 0)).toThrow();
  });

  it.each([
    { argv: ["--help"], code: 0 },
    { argv: ["nonsense"], code: 1 },
    { argv: ["context", "record-read"], code: 0 },
  ])("retains immediate exit for $argv", async ({ argv, code }) => {
    const f = await fixture({ linger: true }), result = await f.run(argv);
    expect(result.code).toBe(code); expect(result.trace.some(event => event.kind === "linger")).toBe(false);
    expect(result.trace.filter(event => event.kind === "signal")).toEqual([]);
    if (argv[0] === "context") { expect(result.stdout).toBe(""); expect(result.stderr).toBe(""); }
  });

  it("retains immediate exit for other CD commands", async () => {
    const f = await fixture({ linger: true }), result = await f.run(f.command("config"));
    expect(result.code).toBe(0); expect(result.stderr).toBe("");
    expect(JSON.parse(result.stdout).valid).toBe(true);
    expect(result.trace.map(event => event.kind)).toEqual(["preload", "result"]);
  });

  it.each(["quota", "worker"].flatMap(command => ["values", "equals", "delimiter"].map(order => ({ command, order }))))("drains $command with options before the command ($order)", async ({ command, order }) => {
    const f = await fixture({ order: "after", worker: command === "worker" }), options = f.command(command).slice(2);
    const joined = options.flatMap((option, index) => index % 2 === 0 ? [`${option}=${options[index + 1]}`] : []);
    const argv = ["cd", "--json", ...(order === "equals" ? joined : options), ...(order === "delimiter" ? ["--"] : []), command];
    const result = await f.run(argv);
    expect(result.code).toBe(command === "quota" ? 1 : 0);
    expect(normalized(result.stderr)).toBe((command === "quota" ? `${base} ${context}\n` : "") + late + "\n");
    if (command === "worker") expect(JSON.parse(normalized(result.stdout))).toEqual({ state: "budget-wait", reason: `${base} ${context}`, failureKind: "telemetry" });
    expect(result.trace.at(-1)!.kind).toBe("close");
  });

  it("does not treat a worker option value as the CD command", async () => {
    const f = await fixture({ linger: true }), options = f.command("config").slice(2);
    const result = await f.run(["cd", "--source", "worker", ...options, "config"]);
    expect(result.code).toBe(0); expect(result.stderr).toBe(""); expect(JSON.parse(result.stdout).valid).toBe(true);
    expect(result.trace.map(event => event.kind)).toEqual(["preload", "result"]);
  });
});
