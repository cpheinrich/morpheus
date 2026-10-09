import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { QA_COMMENTS_DIR } from "./comments.js";
import { claimNextBatch, listPending, readBatchClaim, releaseBatchClaim, showBatch } from "./store.js";

export const QA_RESPONDER_CONFIG = `${QA_COMMENTS_DIR}/responder.json`;
export const QA_RESPONDER_LOCK = `${QA_COMMENTS_DIR}/responder.lock`;
const STOP_FILE = "stop";

export interface QaResponderConfig {
  agent: string;
  command: string[];
  pollMs: number;
}

export async function loadResponderConfig(root: string): Promise<QaResponderConfig> {
  const path = join(root, QA_RESPONDER_CONFIG);
  const raw: unknown = JSON.parse(await readFile(path, "utf8"));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${path}: expected a JSON object`);
  const settings = raw as Record<string, unknown>;
  if (typeof settings.agent !== "string" || !settings.agent.trim()) throw new Error(`${path}: agent is required`);
  if (!Array.isArray(settings.command) || !settings.command.length || !settings.command.every((part) => typeof part === "string" && part.length > 0)) {
    throw new Error(`${path}: command must be a nonempty argv array`);
  }
  const pollMs = settings.pollMs === undefined ? 2000 : settings.pollMs;
  if (typeof pollMs !== "number" || !Number.isInteger(pollMs) || pollMs < 250 || pollMs > 60000) {
    throw new Error(`${path}: pollMs must be an integer from 250 to 60000`);
  }
  return { agent: settings.agent, command: settings.command as string[], pollMs };
}

interface ResponderMarker {
  agent: string;
  pid: number;
  startedAt: string;
  root: string;
}

async function acquireResponder(root: string, agent: string): Promise<() => Promise<void>> {
  const path = join(root, QA_RESPONDER_LOCK);
  await mkdir(join(root, QA_COMMENTS_DIR), { recursive: true });
  try {
    await mkdir(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    let marker: ResponderMarker | null = null;
    try { marker = JSON.parse(await readFile(join(path, "owner.json"), "utf8")) as ResponderMarker; } catch { /* incomplete marker */ }
    throw new Error(`QA responder already owns ${root}${marker ? ` (agent ${marker.agent}, pid ${marker.pid})` : ""}; stop it before starting another`);
  }
  const marker: ResponderMarker = { agent, pid: process.pid, startedAt: new Date().toISOString(), root };
  try {
    await writeFile(join(path, "owner.json"), `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  } catch (error) {
    await rm(path, { recursive: true, force: true });
    throw error;
  }
  return () => rm(path, { recursive: true, force: true });
}

export async function responderStatus(root: string): Promise<ResponderMarker | null> {
  try {
    return JSON.parse(await readFile(join(root, QA_RESPONDER_LOCK, "owner.json"), "utf8")) as ResponderMarker;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function isResponderActive(root: string): Promise<boolean> {
  try {
    const marker = await responderStatus(root);
    if (!marker || !Number.isInteger(marker.pid) || marker.pid <= 0) return false;
    process.kill(marker.pid, 0);
    return true;
  } catch {
    // The optional status indicator must never turn a successful Send into an error.
    return false;
  }
}

export async function requestResponderStop(root: string): Promise<boolean> {
  if (!await responderStatus(root)) return false;
  await writeFile(join(root, QA_RESPONDER_LOCK, STOP_FILE), "stop after current batch\n", "utf8");
  return true;
}

export async function recoverStoppedResponder(root: string): Promise<boolean> {
  const marker = await responderStatus(root);
  if (!marker) return false;
  try {
    process.kill(marker.pid, 0);
    throw new Error(`QA responder pid ${marker.pid} is still running; stop it first`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
  await rm(join(root, QA_RESPONDER_LOCK), { recursive: true, force: true });
  return true;
}

async function stopRequested(root: string): Promise<boolean> {
  try {
    await access(join(root, QA_RESPONDER_LOCK, STOP_FILE));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function promptForBatch(root: string, id: string, agent: string): string {
  const quote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`;
  const cli = process.argv[1] ? `${quote(process.execPath)} ${quote(process.argv[1])}` : "morpheus";
  return `You are the separate QA comment responder for ${root}. A serialized Morpheus worker has exclusively claimed batch ${id} as ${agent}. Read this checkout's AGENTS.md and run "${cli} qa guide". Show the batch with "${cli} qa comments show ${quote(id)} --root ${quote(root)}" and inspect its frame. Implement or answer its comments, run focused checks, and commit locally on the existing QA session branch. Keep the person's live overlay and simulator untouched while they comment. Do not push, open a PR, merge, or stop the preview; the interactive chat will finish the session later. When the batch is fully handled, run "${cli} qa comments resolve ${quote(id)} --agent ${quote(agent)} --root ${quote(root)}". If you cannot finish, leave the claim in place and explain the blocker. Handle only this batch; the worker will give you later batches serially.\n`;
}

async function runCommand(root: string, id: string, config: QaResponderConfig, signal: AbortSignal): Promise<number> {
  const expanded = config.command.map((part) => part.replaceAll("{root}", root).replaceAll("{id}", id).replaceAll("{agent}", config.agent));
  const child = spawn(expanded[0]!, expanded.slice(1), {
    cwd: root,
    env: { ...process.env, MORPHEUS_QA_ROOT: root, MORPHEUS_QA_BATCH_ID: id, MORPHEUS_QA_AGENT: config.agent },
    stdio: ["pipe", "inherit", "inherit"],
    signal,
    shell: false,
  });
  child.stdin.on("error", () => undefined); // A child that exits early may close stdin before the prompt is written.
  child.stdin.end(promptForBatch(root, id, config.agent));
  return new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
}

/** One process per checkout. Later Sends accumulate while the configured agent handles a batch. */
export async function runQaResponder(root: string, config: QaResponderConfig, signal: AbortSignal, log = console.log): Promise<void> {
  const release = await acquireResponder(root, config.agent);
  try {
    log(`QA responder ${config.agent} owns ${root} (pid ${process.pid})`);
    for (const batch of await listPending(root)) {
      if ((await readBatchClaim(root, batch.id))?.agent === config.agent) {
        throw new Error(`QA batch ${batch.id} still has an unresolved claim by ${config.agent}; finish or release it before restarting the responder`);
      }
    }
    while (!signal.aborted && !await stopRequested(root)) {
      const claim = await claimNextBatch(root, config.agent);
      if (!claim) {
        await new Promise<void>((resolve) => {
          const onAbort = () => { clearTimeout(timer); resolve(); };
          const timer = setTimeout(() => { signal.removeEventListener("abort", onAbort); resolve(); }, config.pollMs);
          signal.addEventListener("abort", onAbort, { once: true });
        });
        continue;
      }
      log(`QA responder: handling ${claim.id}`);
      const code = await runCommand(root, claim.id, config, signal);
      const shown = await showBatch(root, claim.id);
      if (code !== 0 || shown?.batch.status !== "resolved") {
        throw new Error(`QA responder stopped on ${claim.id}: command exited ${code}, batch is ${shown?.batch.status ?? "missing"}; claim remains for recovery`);
      }
      // An older installed CLI may have moved the batch without clearing the newer claim file.
      await releaseBatchClaim(root, claim.id, config.agent);
      log(`QA responder: resolved ${claim.id}`);
    }
  } finally {
    await release();
  }
}
