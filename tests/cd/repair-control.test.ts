import { describe, expect, it } from "vitest";
import { hash, type CdState } from "../../src/cd/schema.js";
import { assertTransition } from "../../src/cd/invariants.js";
import { claimUpload, createIntent, deliver, newState, planAttempt, recordTests, recordUpload, repairWork } from "../../src/cd/state.js";
import type { Snapshot, Transaction } from "../../src/cd/store.js";
import { GUARDED_KINDS, RepairControlInvalid, RepairHeld, applyHold, applyRelease, guardStore, repairHeld, validateRepairControls, type HoldRequest, type LedgerStore, type ReleaseRequest } from "../../src/cd/repair-control.js";
import { runRepairControl } from "../../src/cd/repair-control-entry.js";
import { runHeldAwareWorker } from "../../src/cd/worker-only-entry.js";
import { config, now, observation, source } from "./fixtures.js";

/** In-memory ledger with GitHubStore.transact's contract: a known id replays WITHOUT running the
 * callback; every write passes the real assertTransition. `private` members prove receiver reuse. */
class MemoryStore implements LedgerStore {
  writes: string[] = []; private head = 0; interleave?: (store: MemoryStore) => void;
  constructor(public state: CdState) {}
  private snapshot(): Snapshot { return { head: String(this.head), tree: "t", state: structuredClone(this.state) }; }
  async read(): Promise<Snapshot> { return this.snapshot(); }
  async transact<T>(id: string, kind: string, at: string, transition: (state: CdState) => T): Promise<Transaction<T>> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const snap = this.snapshot();
      if (snap.state.transitions[id]) return { state: snap.state, head: snap.head, result: snap.state.transitions[id]!.result as T, replayed: true };
      const next = structuredClone(snap.state), result = transition(next);
      assertTransition(snap.state, next); next.transitions[id] = { at, result: result ?? null, owner: "memory" };
      if (this.interleave) { const f = this.interleave; this.interleave = undefined; f(this); }
      if (String(this.head) !== snap.head) continue;
      this.state = next; this.head++; this.writes.push(kind);
      return { state: next, head: String(this.head), result, replayed: false };
    }
    throw new Error("contention");
  }
}

const cfg = config();
function ledger() {
  const state = newState(cfg, "epoch", now); state.sources = [source()];
  const intent = createIntent(state, cfg, "staging", state.sources[0]!, now, now, true, undefined, "probe-intent");
  state.transitions["creation-1"] = { at: now, owner: "o", result: { kind: "supplemental-wake-probe", action: "supplemental-request", intentId: intent.id, campaignRef: "campaign-a", operationId: "probe-op" } };
  return { state, intentId: intent.id };
}
const holdReq = (intentId: string, extra: Partial<HoldRequest> = {}): HoldRequest => ({ schemaVersion: 1, operationId: "hold-one", intentId, expectedEpoch: "epoch", observedHead: "a".repeat(40), requestTransactionId: "creation-1", campaignRef: "campaign-a", requestOperationId: "probe-op", actor: "root", authorizationRef: "reviewed-authorization", ...extra });
const releaseReq = (intentId: string, extra: Partial<ReleaseRequest> = {}): ReleaseRequest => ({ schemaVersion: 1, operationId: "release-one", holdOperationId: "hold-one", intentId, expectedEpoch: "epoch", observedHead: "a".repeat(40), actor: "root", ...extra });

/** Drive the REAL normal reducers to an exact delivered receipt for the held validation intent. */
function deliverNormally(state: CdState, intentId: string): void {
  const attempt = planAttempt(state, cfg, intentId, "c".repeat(40), "7", now);
  const identity = { schemaVersion: 1 as const, intentId, attemptId: attempt.id, dispatchEffectId: attempt.dispatchEffectId, sourceSha: attempt.sourceSha, controlSha: attempt.controlSha, runId: "100", runAttempt: "1" };
  recordTests(state, cfg, { ...identity, scope: "full", appInputDigest: attempt.appInputDigest, configurationDigest: attempt.configurationDigest, inventory: { ids: ["AppTests/testFull"], sha256: hash(["AppTests/testFull"]) }, results: [{ id: "AppTests/testFull", status: "passed" }], artifacts: [{ name: "results.json", sha256: hash("results") }], validator: { path: "scripts/verify.mjs", sha256: hash("validator") } });
  attempt.artifactsVerifiedAt = now;
  const upload = { ...identity, appId: attempt.appId, version: attempt.version, buildNumber: attempt.buildNumber, ipaSha256: hash("ipa") };
  claimUpload(state, cfg, upload, now);
  recordUpload(state, { ...upload, outcome: "accepted", providerUploadId: "upload-1" }, now);
  deliver(state, intentId, attempt.id, { ...observation(), group: { ...observation().group, id: state.intents[intentId]!.groupId } }, now);
}

describe("repair-only control: hold", () => {
  it("commits the exact entry with a nested closed request and the full request digest", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    const out = await applyHold(store, holdReq(intentId), now, hash);
    expect(out).toMatchObject({ exit: 0, replayed: false });
    expect(out.result.entry).toEqual({ scope: `repair:${intentId}`, actor: "operator:root", reason: "reviewed-authorization", resumeCondition: "exact delivered receipt and all target work complete", createdAt: now, human: true });
    expect(out.result.requestDigest).toBe(hash(holdReq(intentId)));
    expect(out.result.requestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(store.writes).toEqual(["operator-repair-hold"]);
  });

  it("never stores top-level journal-creation markers (a flattened result would be read as a probe)", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    const result = store.state.transitions["repair-hold-hold-one"]!.result as Record<string, unknown>;
    expect(Object.keys(result).sort()).toEqual(["entry", "kind", "request", "requestDigest"]);
    for (const marker of ["campaignRef", "campaignId", "action", "fenceBinding", "operationId"]) expect(result).not.toHaveProperty(marker);
    expect(result.kind).toBe("repair-control-hold");
    // Negative fixture: the consumer journal's creation filter must match only the real creation row.
    const creationRows = Object.values(store.state.transitions).filter(row => { const r = row.result as Record<string, unknown> | null; return r?.campaignRef === "campaign-a" && (r.kind === "supplemental-wake-probe" || r.action === "supplemental-request" || r.fenceBinding); });
    expect(creationRows).toHaveLength(1);
    const flattened = { ...result, ...(result.request as object) } as Record<string, unknown>;
    expect(flattened.campaignRef).toBe("campaign-a"); // proves the nesting is what keeps the filter at one row
  });

  it.each([
    ["an attempt already exists", (s: CdState, id: string) => { planAttempt(s, cfg, id, "c".repeat(40), "7", now); }, "Hold must precede the first attempt"],
    ["target repair work exists", (s: CdState, id: string) => { s.intents[id]!.attempts.push({ id: "x" } as never); s.intents[id]!.attempts.pop(); repairWork(s, id, ["queued"], now); }, "Target already has repair work or an owner"],
    ["the epoch differs", (s: CdState) => { s.epoch = "other"; }, "Ledger epoch differs from the expected epoch"],
    ["the closed request differs", (s: CdState) => { (s.transitions["creation-1"]!.result as Record<string, unknown>).operationId = "other-op"; }, "Hold must bind the exact closed supplemental creation request"],
  ])("refuses with exit 2 when %s, writing nothing", async (_name, mutate, message) => {
    const { state, intentId } = ledger(); mutate(state, intentId);
    const store = new MemoryStore(state), lines: string[] = [];
    const code = await runRepairControl(["hold", "--operation-id", "hold-one", "--intent", intentId, "--epoch", "epoch", "--observed-head", "a".repeat(40), "--actor", "root", "--request-transaction", "creation-1", "--campaign-ref", "campaign-a", "--request-operation", "probe-op", "--authorization-ref", "reviewed-authorization"], { store, hash, now: () => now, out: line => lines.push(line) });
    expect(code).toBe(2); expect(JSON.parse(lines[0]!).reason).toBe(message); expect(store.writes).toEqual([]);
  });

  it("replays an identical request as exit 3 but refuses a different request under the same id", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    expect((await applyHold(store, holdReq(intentId), "2026-10-18T19:00:00.000Z", hash)).exit).toBe(3);
    await expect(applyHold(store, holdReq(intentId, { authorizationRef: "different-authorization" }), now, hash)).rejects.toThrow("Operation id was already used for a different request");
    expect(store.writes).toEqual(["operator-repair-hold"]);
  });
});

describe("repair-only control: receipt-only release", () => {
  it("refuses before the exact receipt, then releases after the normal deliver completed pending held repair", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    await expect(applyRelease(store, releaseReq(intentId), now, hash)).rejects.toThrow("Release requires the exact delivered receipt");
    // Pending repair queued while held, then the unchanged normal reducers deliver the receipt.
    await store.transact("normal-path", "synthetic-normal-reducers", now, s => { repairWork(s, intentId, ["queued while held"], now); deliverNormally(s, intentId); return null; });
    expect(Object.values(store.state.agents).filter(w => w.intentId === intentId).map(w => w.state)).toEqual(["complete"]);
    const foreign = structuredClone(store.state.pauses.filter(p => !p.scope.startsWith("repair:")));
    const out = await applyRelease(store, releaseReq(intentId), now, hash);
    expect(out.exit).toBe(0);
    expect(repairHeld(store.state, intentId)).toBe(false);
    expect(store.state.pauses).toEqual(foreign);
  });

  it("refuses while target work is leased even after delivery", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    await store.transact("normal-path", "synthetic-normal-reducers", now, s => { deliverNormally(s, intentId); s.agents.leftover = { id: "leftover", intentId, strategy: 9, task: "t", taskDigest: hash("t"), evidence: [], state: "running", createdAt: now, nextCheckAt: now, lease: { owner: "x", expiresAt: "2026-10-18T19:00:00.000Z", fence: 1 }, invocations: [{ id: "i", executor: "local", startedAt: now }] }; return null; });
    await expect(applyRelease(store, releaseReq(intentId), now, hash)).rejects.toThrow("Target repair work is not complete or still has an owner");
  });

  it("an old hold retried after its release refuses with exit 2, not a stale held exit 3", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    await store.transact("normal-path", "synthetic-normal-reducers", now, s => { deliverNormally(s, intentId); return null; });
    await applyRelease(store, releaseReq(intentId), now, hash);
    expect((await applyRelease(store, releaseReq(intentId), now, hash)).exit).toBe(3);
    const lines: string[] = [];
    const code = await runRepairControl(["hold", "--operation-id", "hold-one", "--intent", intentId, "--epoch", "epoch", "--observed-head", "a".repeat(40), "--actor", "root", "--request-transaction", "creation-1", "--campaign-ref", "campaign-a", "--request-operation", "probe-op", "--authorization-ref", "reviewed-authorization"], { store, hash, now: () => now, out: line => lines.push(line) });
    expect(code).toBe(2); expect(JSON.parse(lines[0]!).reason).toBe("Hold is not present at readback (released since)");
  });

  it("keeps a genuine rejection held: no receipt means no release", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    await store.transact("rejected", "synthetic-normal-reducers", now, s => { const a = planAttempt(s, cfg, intentId, "c".repeat(40), "7", now); a.status = "failed"; repairWork(s, intentId, ["Apple rejected"], now); return null; });
    await expect(applyRelease(store, releaseReq(intentId), now, hash)).rejects.toThrow("Release requires the exact delivered receipt");
    expect(repairHeld(store.state, intentId)).toBe(true);
  });
});

describe("repair-only control: guarded store and worker entry", () => {
  it("validates malformed controls globally", () => {
    const { state, intentId } = ledger();
    state.pauses.push({ scope: "repair:unknown", actor: "operator:root", reason: "r", resumeCondition: "c", createdAt: now, human: true });
    expect(() => validateRepairControls(state)).toThrow(RepairControlInvalid);
    state.pauses = [{ scope: `repair:${intentId}`, actor: "evo-campaign:x", reason: "r", resumeCondition: "c", createdAt: now, human: true }];
    expect(() => validateRepairControls(state)).toThrow(RepairControlInvalid);
  });

  it("aborts only the three admission kinds before any write; post-claim kinds pass through", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await applyHold(store, holdReq(intentId), now, hash);
    const guarded = guardStore(store, intentId);
    expect(GUARDED_KINDS).toEqual(["agent-budget-wait", "claim-agent-invocation", "claim-hosted-agent-dispatch"]);
    for (const kind of GUARDED_KINDS) await expect(guarded.transact(`t-${kind}`, kind, now, () => "x")).rejects.toBeInstanceOf(RepairHeld);
    for (const kind of ["agent-session-checkpoint", "subscription-usage", "agent-checkpoint", "agent-error-checkpoint"]) await guarded.transact(`t-${kind}`, kind, now, () => "x");
    expect(store.writes).toEqual(["operator-repair-hold", "agent-session-checkpoint", "subscription-usage", "agent-checkpoint", "agent-error-checkpoint"]);
    expect(await guarded.read()).toEqual(await store.read()); // inherited read on the original receiver
  });

  it("skips held work without starving unheld work and never reaches the worker for an explicit held id", async () => {
    const { state, intentId } = ledger();
    const other = createIntent(state, cfg, "staging", state.sources[0]!, now, now, true, undefined, "other-intent");
    const store = new MemoryStore(state); await applyHold(store, holdReq(intentId), now, hash);
    await store.transact("queue", "synthetic-normal-reducers", now, s => { repairWork(s, intentId, ["held"], now); repairWork(s, other.id, ["unheld"], now); return null; });
    const calls: unknown[] = [];
    const runWorker = async (_c: unknown, s: LedgerStore, _d: string, options: { workId?: string }) => { calls.push(options.workId); await s.transact(`claim-${options.workId}`, "claim-agent-invocation", now, () => "claimed"); return { state: "launched", workId: options.workId }; };
    const later = () => "2026-10-18T19:00:00.000Z";
    const r = await runHeldAwareWorker({ runWorker, config: {}, store, sourceDir: "/src", options: { executor: "local" }, environment: {}, now: later });
    expect(r).toEqual({ state: "launched", workId: `repair-${other.id}-1` });
    const held = await runHeldAwareWorker({ runWorker, config: {}, store, sourceDir: "/src", options: { executor: "local", workId: `repair-${intentId}-1` }, environment: {}, now: later });
    expect(held).toEqual({ state: "repair-held", workId: `repair-${intentId}-1` });
    expect(calls).toEqual([`repair-${other.id}-1`]);
  });

  it("a hold committed between selection and claim aborts the claim with zero claim writes", async () => {
    const { state, intentId } = ledger(), store = new MemoryStore(state);
    await store.transact("queue", "synthetic-normal-reducers", now, s => { repairWork(s, intentId, ["queued"], now); return null; });
    const runWorker = async (_c: unknown, s: LedgerStore) => { /* Injected: the public hold refuses once work exists, so this only models a race-committed entry. */ store.state.pauses.push({ scope: `repair:${intentId}`, actor: "operator:root", reason: "r", resumeCondition: "c", createdAt: now, human: true }); return s.transact("claim-x", "claim-agent-invocation", now, () => "claimed"); };
    const r = await runHeldAwareWorker({ runWorker, config: {}, store, sourceDir: "/src", options: { executor: "local" }, environment: {}, now: () => "2026-10-18T19:00:00.000Z" });
    expect(r).toEqual({ state: "repair-held", workId: `repair-${intentId}-1` });
    expect(store.writes).not.toContain("claim-agent-invocation");
  });
});
