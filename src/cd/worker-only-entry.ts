// Worker-only entry: runs an INJECTED, unchanged runWorker behind the repair-only control.
// It never imports a worker module, so the caller binds the exact pinned runtime it runs.
import type { CdState } from "./schema.js";
import { RepairControlInvalid, RepairHeld, guardStore, repairHeld, validateRepairControls, type LedgerStore } from "./repair-control.js";

export interface WorkerOptions { executor: "local" | "hosted"; hostId?: string; workId?: string; invocationId?: string; taskDigest?: string }
export type RunWorkerPort<C, S extends LedgerStore> = (config: C, store: S, sourceDir: string, options: WorkerOptions, environment?: NodeJS.ProcessEnv) => Promise<unknown>;
export type HeldAwareResult = { state: "repair-held"; workId: string } | { state: "repair-control-invalid"; reason: string } | { state: "idle" } | unknown;

/** The worker's own first-due predicate (not complete, due, lease absent or expired). */
export const due = (work: CdState["agents"][string], now: string): boolean =>
  work.state !== "complete" && Date.parse(work.nextCheckAt) <= Date.parse(now) && (!work.lease || Date.parse(work.lease.expiresAt) <= Date.parse(now));

export async function runHeldAwareWorker<C, S extends LedgerStore>(d: { runWorker: RunWorkerPort<C, S>; config: C; store: S; sourceDir: string; options: WorkerOptions; environment: NodeJS.ProcessEnv; now?: () => string }): Promise<HeldAwareResult> {
  const snapshot = await d.store.read(), now = (d.now ?? (() => new Date().toISOString()))();
  try { validateRepairControls(snapshot.state); } catch (error) { if (error instanceof RepairControlInvalid) return { state: "repair-control-invalid", reason: error.message }; throw error; }
  const agents = snapshot.state.agents;
  let target = d.options.workId ? agents[d.options.workId] : undefined;
  // A held target returns before quota/login; unheld work behind it is still selected (no starvation).
  if (target && repairHeld(snapshot.state, target.intentId)) return { state: "repair-held", workId: target.id };
  if (!d.options.workId) {
    const candidates = Object.values(agents).filter(work => due(work, now));
    if (!candidates.length) return { state: "idle" };
    target = candidates.find(work => !repairHeld(snapshot.state, work.intentId));
    if (!target) return { state: "repair-held", workId: candidates[0]!.id };
  }
  // With no holds this is the work the unchanged worker would pick itself. The explicit workId adds
  // one bounded early race (documented): a concurrent budget-wait between the two reads.
  const options = target ? { ...d.options, workId: target.id } : d.options;
  try { return await d.runWorker(d.config, target ? guardStore(d.store, target.intentId) : d.store, d.sourceDir, options, d.environment); }
  catch (error) {
    if (error instanceof RepairHeld) return { state: "repair-held", workId: target?.id ?? d.options.workId ?? "" };
    if (error instanceof RepairControlInvalid) return { state: "repair-control-invalid", reason: error.message };
    throw error;
  }
}
