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

/** The failure a well-formed helper status reports about the reader process, or undefined for an unrecognized status. */
export function readerFailure(status: Record<string, unknown>, keyCount: number, label: string): string | undefined {
  if (keyCount === 2 && status.reader === "spawn-failed" && Number.isInteger(status.errno) && Number(status.errno) >= 0 && Number(status.errno) <= 4095) return `${label} could not start (errno=${status.errno})`;
  if (keyCount === 2 && status.reader === "exited" && Number.isInteger(status.code) && Number(status.code) >= -255 && Number(status.code) <= 255) return `${label} exited (code=${status.code})`;
  if (keyCount === 1 && status.reader === "status-unavailable") return `${label} status unavailable`;
  return undefined;
}

/** Real per-call telemetry; stop only its private foreground reader group. */
export async function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot> {
  return new Promise((resolve, reject) => new CodexQuotaRead(observedAt, resolve, reject).start(command, cwd));
}

/** A JSON reply to one of the two requests this reader sends; anything else on stdout is ignored. */
function rpcResponse(line: string): RpcMessage | undefined {
  let message: RpcMessage;
  try { message = JSON.parse(line); } catch { return undefined; }
  return message !== null && typeof message === "object" && [1, 2].includes(message.id!) ? message : undefined;
}
type RpcMessage = { id?: number; error?: unknown; result?: { ordinaryUsageAllowed?: unknown; rateLimitsByLimitId?: { codex?: Bucket }; rateLimits?: Bucket } };

/** One app-server `initialize` then `account/rateLimits/read` exchange under the reader supervisor. */
class CodexQuotaRead {
  private readonly started = Date.now(); private readonly deadline = this.started + READ_MS;
  private phase = "initialize"; private buffer = ""; private control = ""; private controlBytes = 0;
  private cleanup = false; private cleanupSeen = false; private settled = false; private stopping = false; private value: QuotaSnapshot | undefined;
  private startup: string | undefined; private stderrLine = ""; private stderrBytes = 0; private oversizedLine = false; private failed = false;
  private rpcDeadline = Infinity; private rpcTimer: ReturnType<typeof setTimeout> | undefined; private fuse: ReturnType<typeof setTimeout> | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined; private child!: ReturnType<typeof spawn>;
  constructor(readonly observedAt: string, readonly resolve: (value: QuotaSnapshot) => void, readonly reject: (error: unknown) => void) {}

  start(command: string[], cwd: string): void {
    const helper = fileURLToPath(new URL("./quota-reader.py", import.meta.url));
    const child = this.child = spawn("/usr/bin/python3", [helper, String(READ_MS), command[0]!, ...command.slice(1), "app-server"], { cwd, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    this.timer = setTimeout(() => this.fail("read timed out"), READ_MS);
    child.on("error", () => this.fail("reader could not start"));
    child.stdin!.on("error", () => this.fail("transport unavailable"));
    child.stderr!.on("data", (bytes: Buffer) => this.onStderr(bytes));
    (child.stdio[3] as Readable).on("data", (bytes: Buffer) => this.onControl(bytes));
    child.stdout!.on("data", (bytes: Buffer) => this.onStdout(bytes));
    child.on("close", code => this.onClose(code));
    this.send({ id: 1, method: "initialize", params: { clientInfo: { name: "morpheus-cd", version: "1" }, capabilities: { experimentalApi: true } } });
  }
  private diagnostic(reason: string): QuotaReadError { return new QuotaReadError(`Codex account quota ${reason} (phase=${this.phase} elapsedMs=${Math.max(0, Date.now() - this.started)})`); }
  private startupContext(): string { const pid = this.child.pid; return `${this.startup} (readerPid=${Number.isSafeInteger(pid) && pid! > 0 ? pid : "unknown"})`; }
  private stop(): void {
    if (this.stopping) return;
    this.stopping = true; this.child.stdin!.end(); this.child.kill("SIGTERM");
    this.fuse = setTimeout(() => { this.child.kill("SIGKILL"); this.fail("cleanup unknown"); }, CLEANUP_FUSE_MS);
  }
  private fail(reason: string): void {
    if (this.settled) return;
    this.settled = true; this.failed = true; clearTimeout(this.timer); clearTimeout(this.rpcTimer);
    const error = this.diagnostic(this.startup ? `${reason}; ${this.startupContext()}` : reason);
    // Failure stops the model now; bounded reader cleanup grants no grace.
    this.stop(); this.reject(error);
  }
  private send(message: unknown): void { this.child.stdin!.write(JSON.stringify(message) + "\n"); }
  /** Keeps the first recognized startup diagnostic line; keep draining after failure, since control and stderr pipes can arrive in either order. */
  private onStderr(bytes: Buffer): void {
    const scan = bytes.subarray(0, STARTUP_SCAN_BYTES - this.stderrBytes);
    this.stderrBytes += scan.byteLength;
    for (const byte of scan) {
      if (this.startup) return;
      if (byte === 10) this.endStderrLine();
      else if (!this.oversizedLine) {
        if (this.stderrLine.length === STARTUP_LINE_BYTES) { this.stderrLine = ""; this.oversizedLine = true; }
        else this.stderrLine += String.fromCharCode(byte);
      }
    }
  }
  private endStderrLine(): void {
    if (!this.oversizedLine) this.startup = startupDiagnostic(this.stderrLine);
    this.stderrLine = ""; this.oversizedLine = false;
    if (this.startup && this.failed) console.error(this.diagnostic(`configured reader startup diagnostic; ${this.startupContext()}`).message);
  }
  private onControl(bytes: Buffer): void {
    this.controlBytes += bytes.byteLength;
    if (this.controlBytes > 256) { this.fail("cleanup unknown"); return; }
    this.control += String(bytes);
    while (this.control.includes("\n")) {
      const end = this.control.indexOf("\n"), line = this.control.slice(0, end); this.control = this.control.slice(end + 1);
      let status: unknown;
      try { status = JSON.parse(line); } catch { this.fail("cleanup unknown"); return; }
      if (!this.controlStatus(status)) { this.fail("cleanup unknown"); return; }
    }
  }
  /** Applies one helper status line; false when it is malformed or a repeated cleanup report. */
  private controlStatus(status: unknown): boolean {
    if (status === null || typeof status !== "object" || Array.isArray(status)) return false;
    const record = status as Record<string, unknown>, keys = Object.keys(record), live = !this.stopping && !this.settled;
    if (keys.length === 1 && ["terminated", "unknown"].includes(record.cleanup as string)) {
      if (this.cleanupSeen) return false;
      this.cleanupSeen = true; this.cleanup = record.cleanup === "terminated"; return true;
    }
    const failure = readerFailure(record, keys.length, "configured reader");
    if (failure === undefined) return false;
    if (live) this.fail(failure);
    return true;
  }
  private onStdout(bytes: Buffer): void {
    if (this.stopping || this.settled) return;
    this.buffer += String(bytes);
    if (this.buffer.length > 1_048_576) { this.fail("response unavailable"); return; }
    while (this.buffer.includes("\n") && !this.stopping && !this.settled) {
      const end = this.buffer.indexOf("\n"), line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      const message = rpcResponse(line);
      if (message && !this.handleRpc(message)) return;
    }
  }
  /** Advances the exchange on one reply; false once the read has failed. */
  private handleRpc(message: RpcMessage): boolean {
    if (Date.now() >= this.deadline || Date.now() >= this.rpcDeadline) { this.fail("read timed out"); return false; }
    if (message.error) { this.fail("RPC unavailable"); return false; }
    if (message.id === 1 && this.phase === "initialize") this.requestRateLimits();
    else if (message.id === 2 && this.phase === "rateLimits") return this.acceptRateLimits(message.result);
    return true;
  }
  private requestRateLimits(): void {
    this.phase = "rateLimits"; this.rpcDeadline = Math.min(this.deadline, Date.now() + RPC_MS);
    this.rpcTimer = setTimeout(() => this.fail("read timed out"), this.rpcDeadline - Date.now());
    this.send({ method: "initialized", params: {} }); this.send({ id: 2, method: "account/rateLimits/read", params: {} });
  }
  /** Keeps the Codex buckets as windows and stops the reader; false once the read has failed. */
  private acceptRateLimits(result: RpcMessage["result"]): boolean {
    if (result?.ordinaryUsageAllowed !== true) { this.fail("ordinary subscription usage is unavailable or unknown; retain budget wait"); return false; }
    const bucket = result.rateLimitsByLimitId?.codex ?? result.rateLimits;
    try {
      this.value = { observedAt: this.observedAt, source: "Codex account/rateLimits/read", windows: (["primary", "secondary"] as const).flatMap(id => bucket?.[id] ? [{ id, usedPercent: bucket[id]!.usedPercent!, resetsAt: new Date(bucket[id]!.resetsAt! * 1000).toISOString() }] : []) };
    } catch { this.fail("returned unknown/expired quota telemetry"); return false; }
    clearTimeout(this.rpcTimer); this.phase = "cleanup"; this.stop(); return true;
  }
  private onClose(code: number | null): void {
    clearTimeout(this.fuse);
    if (!this.cleanup || this.control.length !== 0 || code !== 0) {
      if (!this.settled) this.fail("cleanup unknown");
      else console.error(this.diagnostic("cleanup unknown").message);
      clearTimeout(this.fuse); return;
    }
    if (this.settled) return;
    if (Date.now() >= this.deadline || !Number.isFinite(Date.parse(this.observedAt)) || !this.value || quotaUsed(this.value, new Date().toISOString()) === undefined) { this.fail("returned unknown/expired quota telemetry"); clearTimeout(this.fuse); return; }
    this.settled = true; clearTimeout(this.timer); clearTimeout(this.rpcTimer); this.resolve(this.value);
  }
}
