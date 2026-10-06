import { execFileSync, spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { startQaCommentServer } from "../serve.js";
import { shutdownPreview, type PreviewState } from "./ios.js";

/**
 * The launchd job for one preview: serve-sim, then the comment overlay on top of it.
 *
 * A preview survives its launching terminal but never owns a booted device past its lease. The
 * overlay lives in this process rather than beside it, so the lease, `stop` and an expiry end both
 * together — before this, the overlay was a second process the agent had to remember to stop.
 */

export function supervise(
  child: ChildProcess,
  { expired, cleanup, interval = 5000, grace = 3000, signals = process }: {
    expired: () => boolean; cleanup: () => Promise<void> | void; interval?: number; grace?: number; signals?: NodeJS.EventEmitter;
  },
): Promise<number> {
  return new Promise((resolvePromise, reject) => {
    let stopping = false;
    let finished = false;
    let killTimer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (stopping) return;
      stopping = true;
      child.kill("SIGTERM");
      killTimer = setTimeout(() => child.kill("SIGKILL"), grace);
    };
    const timer = setInterval(() => {
      try { if (expired()) stop(); } catch { stop(); }
    }, interval);
    signals.on("SIGTERM", stop);
    signals.on("SIGINT", stop);
    const finish = async (code: number | null, error?: Error) => {
      if (finished) return;
      finished = true;
      clearInterval(timer);
      clearTimeout(killTimer);
      signals.removeListener("SIGTERM", stop);
      signals.removeListener("SIGINT", stop);
      try { await cleanup(); } catch (cleanupError) { reject(cleanupError); return; }
      if (error) reject(error); else resolvePromise(stopping ? 0 : (code ?? 1));
    };
    child.once("error", (error) => void finish(1, error));
    child.once("exit", (code) => void finish(code));
  });
}

/** serve-sim is ready once it has written its state record for this device and answers. */
async function waitForStream(state: PreviewState, stopped: () => boolean, attempts = 120): Promise<boolean> {
  const recordPath = join(tmpdir(), "serve-sim", `server-${state.udid}.json`);
  for (let i = 0; i < attempts; i++) {
    if (stopped()) return false;
    if (existsSync(recordPath)) {
      try {
        if ((await fetch(`http://127.0.0.1:${state.port}/`, { signal: AbortSignal.timeout(2000) })).ok) return true;
      } catch { /* not yet */ }
    }
    await sleep(500);
  }
  return false;
}

async function main([stateFile, cli]: string[]): Promise<void> {
  if (!stateFile || !cli) throw new Error("usage: supervisor <state.json> <serve-sim.js>");
  const state = JSON.parse(readFileSync(stateFile, "utf8")) as PreviewState;
  // Ownership is bound to this job's own checkout key — the state directory's name — so a corrupted
  // or foreign state file cannot point the supervisor at another checkout's simulator.
  const key = basename(dirname(stateFile));
  if (!/^[a-f0-9]{12}$/.test(key) || !/^[\w .-]+$/.test(state.name) || !state.name.endsWith(` ${key}`)) {
    throw new Error("Refusing to supervise a device whose name does not carry this checkout's key.");
  }
  const sim = (...args: string[]) => execFileSync("xcrun", ["simctl", ...args], { encoding: "utf8", timeout: 120000 });
  const child = spawn(process.execPath, [cli, state.udid, "--port", String(state.port), "--host", "127.0.0.1", "--fit", "--panes", "none"], { stdio: "inherit" });
  let overlay: Awaited<ReturnType<typeof startQaCommentServer>> | undefined;
  let stopping = false;
  const ready = waitForStream(state, () => stopping).then(async (ok) => {
    if (!ok) { console.error("serve-sim did not come up; the overlay was not started."); return; }
    try {
      overlay = await startQaCommentServer({
        root: state.root, previewUrl: `http://127.0.0.1:${state.port}/`, port: state.overlayPort,
        onListen: (info) => console.log(`QA comments overlay: ${info.url} (stream ${info.streamUrl ?? "undiscovered"})`),
      });
    } catch (error) {
      console.error(`QA comments overlay failed to start: ${(error as Error).message}`);
    }
  });
  process.exitCode = await supervise(child, {
    expired: () => {
      const current = JSON.parse(readFileSync(stateFile, "utf8")) as PreviewState;
      return current.udid !== state.udid || !Number.isFinite(current.expiresAt) || Date.now() >= current.expiresAt;
    },
    cleanup: async () => {
      stopping = true;
      await ready.catch(() => undefined);
      await overlay?.close().catch(() => undefined);
      shutdownPreview(state, state.name, sim);
    },
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error: Error) => { console.error(error.message); process.exitCode = 1; });
}
