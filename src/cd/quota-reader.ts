import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { type Readable } from "node:stream";
import { type QuotaSnapshot } from "./schema.js";
import { quotaUsed } from "./state.js";

const READ_MS = 60_000, RPC_MS = 10_000, CLEANUP_FUSE_MS = 3_000;
interface Bucket { primary?: { usedPercent?: number; resetsAt?: number }; secondary?: { usedPercent?: number; resetsAt?: number } }

/** Real per-call telemetry; stop only its private foreground reader group. */
export async function nativeQuota(command: string[], cwd: string, observedAt: string): Promise<QuotaSnapshot> {
  return new Promise((resolve, reject) => {
    const started = Date.now(), deadline = started + READ_MS;
    let phase = "initialize", buffer = "", control = "", cleanup = false, settled = false, stopping = false, value: QuotaSnapshot | undefined;
    let rpcDeadline = Infinity, rpcTimer: ReturnType<typeof setTimeout> | undefined, fuse: ReturnType<typeof setTimeout> | undefined;
    const helper = fileURLToPath(new URL("./quota-reader.py", import.meta.url));
    const child = spawn("/usr/bin/python3", [helper, String(READ_MS), command[0]!, ...command.slice(1), "app-server"], { cwd, stdio: ["pipe", "pipe", "pipe", "pipe"] });
    const diagnostic = (reason: string) => new Error(`Codex account quota ${reason} (phase=${phase} elapsedMs=${Math.max(0, Date.now() - started)})`);
    const stop = () => {
      if (stopping) return;
      stopping = true; child.stdin.end(); child.kill("SIGTERM");
      fuse = setTimeout(() => { child.kill("SIGKILL"); fail("cleanup unknown"); }, CLEANUP_FUSE_MS);
    };
    const fail = (reason: string) => {
      if (settled) return;
      settled = true; clearTimeout(timer); clearTimeout(rpcTimer);
      // Failure stops the model now; bounded reader cleanup grants no grace.
      stop(); reject(diagnostic(reason));
    };
    const timer = setTimeout(() => fail("read timed out"), READ_MS);
    const send = (message: unknown) => child.stdin.write(JSON.stringify(message) + "\n");
    child.on("error", () => fail("reader could not start"));
    child.stdin.on("error", () => fail("transport unavailable"));
    child.stderr.on("data", () => {}); // Drain without retaining provider text.
    (child.stdio[3] as Readable).on("data", (bytes: Buffer) => {
      control += String(bytes);
      if (control.length > 256) { fail("cleanup unknown"); return; }
      try {
        const status = JSON.parse(control);
        cleanup = status !== null && Object.keys(status).length === 1 && status.cleanup === "terminated";
      } catch { cleanup = false; }
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
      if (!cleanup || code !== 0) {
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
