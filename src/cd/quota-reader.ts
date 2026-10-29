import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type Readable } from "node:stream";
import { type QuotaSnapshot } from "./schema.js";
import { quotaUsed } from "./state.js";

const READ_MS = 60_000, RPC_MS = 10_000, CLEANUP_FUSE_MS = 3_000;
const STARTUP_LINE_BYTES = 128, STARTUP_SCAN_BYTES = 4096;
interface Bucket { primary?: { usedPercent?: number; resetsAt?: number }; secondary?: { usedPercent?: number; resetsAt?: number } }

/** The configured helper emits this fixed vocabulary; stderr itself is untrusted. */
function startupDiagnostic(line: string): string | undefined {
  const match = /^Evo CD worker: startup failed \(phase=(pin|version|scope|inventory|policy|final-verify|exec|(?:config|policy)-(?:launch|initialize|read|drain|validate|cleanup)) kind=(invalid|timeout|os-error|exit|protocol|bounds|eof|output)(?: (errno|code)=(-?(?:0|[1-9][0-9]{0,3})))?\)$/.exec(line);
  if (!match) return;
  const [, , kind, field, number] = match;
  if (field) {
    const value = Number(number);
    if (String(value) !== number || !(kind === "os-error" && field === "errno" && value > 0 && value <= 4095
      || kind === "exit" && field === "code" && value >= -255 && value <= 255)) return;
  }
  return line;
}

/** Only fixed protocol diagnostics, never provider output or configuration. */
export class QuotaReadError extends Error {}

/** Real per-call telemetry; stop only its private foreground reader group. */
export async function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot> {
  return new Promise((resolve, reject) => {
    const started = Date.now(), deadline = started + READ_MS;
    let phase = "initialize", buffer = "", control = "", controlBytes = 0, cleanup = false, cleanupSeen = false, settled = false, stopping = false, value: QuotaSnapshot | undefined;
    let startup: string | undefined, stderrLine = "", stderrBytes = 0, oversizedLine = false, failed = false;
    let rpcDeadline = Infinity, rpcTimer: ReturnType<typeof setTimeout> | undefined, fuse: ReturnType<typeof setTimeout> | undefined;
    const helper = fileURLToPath(new URL("./quota-reader.py", import.meta.url));
    const child = spawn("/usr/bin/python3", [helper, String(READ_MS), command[0]!, ...command.slice(1), "app-server"], { cwd, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    const diagnostic = (reason: string) => new QuotaReadError(`Codex account quota ${reason} (phase=${phase} elapsedMs=${Math.max(0, Date.now() - started)})`);
    const startupContext = () => `${startup} (readerPid=${Number.isSafeInteger(child.pid) && child.pid! > 0 ? child.pid : "unknown"})`;
    const stop = () => {
      if (stopping) return;
      stopping = true; child.stdin.end(); child.kill("SIGTERM");
      fuse = setTimeout(() => { child.kill("SIGKILL"); fail("cleanup unknown"); }, CLEANUP_FUSE_MS);
    };
    const fail = (reason: string) => {
      if (settled) return;
      settled = true; failed = true; clearTimeout(timer); clearTimeout(rpcTimer);
      const error = diagnostic(startup ? `${reason}; ${startupContext()}` : reason);
      // Failure stops the model now; bounded reader cleanup grants no grace.
      stop(); reject(error);
    };
    const timer = setTimeout(() => fail("read timed out"), READ_MS);
    const send = (message: unknown) => child.stdin.write(JSON.stringify(message) + "\n");
    child.on("error", () => fail("reader could not start"));
    child.stdin.on("error", () => fail("transport unavailable"));
    child.stderr.on("data", (bytes: Buffer) => {
      // Keep draining after failure: control and stderr pipes can arrive in either order.
      const scan = bytes.subarray(0, STARTUP_SCAN_BYTES - stderrBytes);
      stderrBytes += scan.byteLength;
      for (const byte of scan) {
        if (startup) return;
        if (byte === 10) {
          if (!oversizedLine) startup = startupDiagnostic(stderrLine);
          stderrLine = ""; oversizedLine = false;
          if (startup && failed) console.error(diagnostic(`configured reader startup diagnostic; ${startupContext()}`).message);
        } else if (!oversizedLine) {
          if (stderrLine.length === STARTUP_LINE_BYTES) { stderrLine = ""; oversizedLine = true; }
          else stderrLine += String.fromCharCode(byte);
        }
      }
    });
    (child.stdio[3] as Readable).on("data", (bytes: Buffer) => {
      controlBytes += bytes.byteLength;
      if (controlBytes > 256) { fail("cleanup unknown"); return; }
      control += String(bytes);
      while (control.includes("\n")) {
        const end = control.indexOf("\n"), line = control.slice(0, end); control = control.slice(end + 1);
        let status: { cleanup?: unknown; reader?: unknown; errno?: unknown; code?: unknown };
        try { status = JSON.parse(line); } catch { fail("cleanup unknown"); return; }
        if (status === null || typeof status !== "object" || Array.isArray(status)) { fail("cleanup unknown"); return; }
        const keys = Object.keys(status);
        if (keys.length === 1 && ["terminated", "unknown"].includes(status.cleanup as string)) {
          if (cleanupSeen) { fail("cleanup unknown"); return; }
          cleanupSeen = true;
          cleanup = status.cleanup === "terminated";
        } else if (keys.length === 2 && status.reader === "spawn-failed" && Number.isInteger(status.errno) && Number(status.errno) >= 0 && Number(status.errno) <= 4095) {
          if (!stopping && !settled) fail(`configured reader could not start (errno=${status.errno})`);
        } else if (keys.length === 2 && status.reader === "exited" && Number.isInteger(status.code) && Number(status.code) >= -255 && Number(status.code) <= 255) {
          if (!stopping && !settled) fail(`configured reader exited (code=${status.code})`);
        } else if (keys.length === 1 && status.reader === "status-unavailable") {
          if (!stopping && !settled) fail("configured reader status unavailable");
        } else { fail("cleanup unknown"); return; }
      }
    });
    child.stdout.on("data", (bytes: Buffer) => {
      if (stopping || settled) return;
      buffer += String(bytes);
      if (buffer.length > 1_048_576) { fail("response unavailable"); return; }
      while (buffer.includes("\n") && !stopping && !settled) {
        const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message: { id?: number; error?: unknown; result?: { ordinaryUsageAllowed?: unknown; rateLimitsByLimitId?: { codex?: Bucket }; rateLimits?: Bucket } };
        try { message = JSON.parse(line); } catch { continue; }
        if (message === null || typeof message !== "object" || ![1, 2].includes(message.id!)) continue;
        if (Date.now() >= deadline || Date.now() >= rpcDeadline) { fail("read timed out"); return; }
        if (message.error) { fail("RPC unavailable"); return; }
        if (message.id === 1 && phase === "initialize") {
          phase = "rateLimits"; rpcDeadline = Math.min(deadline, Date.now() + RPC_MS);
          rpcTimer = setTimeout(() => fail("read timed out"), rpcDeadline - Date.now());
          send({ method: "initialized", params: {} }); send({ id: 2, method: "account/rateLimits/read", params: {} });
        } else if (message.id === 2 && phase === "rateLimits") {
          const result = message.result;
          if (result?.ordinaryUsageAllowed !== true) { fail("ordinary subscription usage is unavailable or unknown; retain budget wait"); return; }
          const bucket = result.rateLimitsByLimitId?.codex ?? result.rateLimits;
          try {
            value = { observedAt, source: "Codex account/rateLimits/read", windows: (["primary", "secondary"] as const).flatMap(id => bucket?.[id] ? [{ id, usedPercent: bucket[id]!.usedPercent!, resetsAt: new Date(bucket[id]!.resetsAt! * 1000).toISOString() }] : []) };
          } catch { fail("returned unknown/expired quota telemetry"); return; }
          clearTimeout(rpcTimer); phase = "cleanup"; stop();
        }
      }
    });
    child.on("close", code => {
      clearTimeout(fuse);
      if (!cleanup || control.length !== 0 || code !== 0) {
        if (!settled) fail("cleanup unknown");
        else console.error(diagnostic("cleanup unknown").message);
        clearTimeout(fuse); return;
      }
      if (settled) return;
      if (Date.now() >= deadline || !Number.isFinite(Date.parse(observedAt)) || !value || quotaUsed(value, new Date().toISOString()) === undefined) { fail("returned unknown/expired quota telemetry"); clearTimeout(fuse); return; }
      settled = true; clearTimeout(timer); clearTimeout(rpcTimer); resolve(value);
    });
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "morpheus-cd", version: "1" }, capabilities: { experimentalApi: true } } });
  });
}
