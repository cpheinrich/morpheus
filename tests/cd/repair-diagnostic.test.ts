import { afterEach, describe, expect, it, vi } from "vitest";
import { canonical, hash } from "../../src/cd/schema.js";
import { appendRepairDiagnostic, recordRepairDiagnostic, REPAIR_DIAGNOSTIC_MAX_BYTES, type RepairDiagnostic } from "../../src/cd/repair-diagnostic.js";
import { claimUpload, recordTests, recordUpload } from "../../src/cd/state.js";
import { GitHubStore } from "../../src/cd/store.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now } from "./fixtures.js";
import { diagnosticFixture } from "./repair-diagnostic-fixtures.js";

afterEach(() => vi.restoreAllMocks());
async function storeFixture() {
  const fixture = diagnosticFixture(), api = new FakeGitHub(), store = new GitHubStore(api, config());
  await store.initialize(now, "epoch");
  await store.transact("seed", "synthetic-fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  api.calls = [];
  return { ...fixture, api, store };
}
const transitionId = (input: RepairDiagnostic) => `repair-diagnostic-${hash(canonical(input))}`;
function savedReceipt(input: RepairDiagnostic) { return { workId: input.workId, taskDigest: input.taskDigest, intentId: input.intentId, attemptId: input.attemptId, diagnosticId: hash(canonical(input)) }; }

describe("evidence-only failed repair reducer", () => {
  it("appends exact canonical data to the existing owner and preserves every other whole object", () => {
    const f = diagnosticFixture(), before = structuredClone(f.state), expected = structuredClone(before);
    expected.agents[f.workId]!.evidence.push(canonical(f.input));
    expect(appendRepairDiagnostic(f.state, f.input)).toEqual(savedReceipt(f.input)); expect(f.state).toEqual(expected);
    expect(appendRepairDiagnostic(f.state, f.input)).toEqual(savedReceipt(f.input)); expect(f.state).toEqual(expected);
  });
  it.each(["pending", "waiting", "running"] as const)("preserves a %s repair including its current lease and invocation", state => {
    const f = diagnosticFixture(); f.state.agents[f.workId]!.state = state;
    const expected = structuredClone(f.state); expected.agents[f.workId]!.evidence.push(canonical(f.input));
    appendRepairDiagnostic(f.state, f.input); expect(f.state).toEqual(expected);
  });
  it("keeps existing tests, upload claims and upload records strict for failed attempts", () => {
    const f = diagnosticFixture(), before = structuredClone(f.state);
    for (const action of [() => recordTests(f.state, config(), f.tests), () => claimUpload(f.state, config(), f.upload, now), () => recordUpload(f.state, { ...f.upload, outcome: "accepted" }, now)]) {
      expect(action).toThrow("Attempt is no longer current"); expect(f.state).toEqual(before);
    }
  });
  const cases: [string, (f: ReturnType<typeof diagnosticFixture>) => void, RegExp][] = [
    ["unknown work", f => { f.input.workId = "unknown"; }, /missing/],
    ["unknown intent", f => { f.input.intentId = "unknown"; }, /current repair/],
    ["sibling intent", f => { f.state.agents[f.workId]!.intentId = "other-intent"; }, /another intent/],
    ["completed work", f => { f.state.agents[f.workId]!.state = "complete"; }, /complete/],
    ["nonrepairing intent", f => { f.state.intents[f.intentId]!.state = "pending"; }, /current repair/],
    ["delivered intent", f => { f.state.intents[f.intentId]!.state = "delivered"; }, /current repair/],
    ["receipt despite repair state", f => { f.state.intents[f.intentId]!.receipt = {} as never; }, /current repair/],
    ["wrong task digest", f => { f.input.taskDigest = hash("other task"); }, /task digest/],
    ["changed stored task", f => { f.state.agents[f.workId]!.task += " changed"; }, /task digest/],
    ["sibling active work", f => { const old = Object.values(f.state.agents).find(work => work.id !== f.workId)!; old.state = "waiting"; }, /unique latest/],
    ["newer complete work", f => { const old = Object.values(f.state.agents).find(work => work.id !== f.workId)!; old.strategy = 3; }, /unique latest/],
    ["strategy zero boundary", f => { f.state.agents[f.workId]!.strategy = 0; }, /unique latest/],
    ["unknown attempt", f => { f.input.attemptId = "unknown"; }, /latest failed/],
    ["active attempt", f => { f.state.intents[f.intentId]!.attempts.at(-1)!.status = "active"; }, /latest failed/],
    ["retired attempt", f => { f.state.intents[f.intentId]!.attempts.at(-1)!.status = "retired-uncertain"; }, /latest failed/],
    ["newer failed attempt", f => { const intent = f.state.intents[f.intentId]!; intent.attempts.push({ ...structuredClone(intent.attempts[0]!), id: "new-attempt" }); }, /latest failed/],
    ["moved intent source", f => { f.state.intents[f.intentId]!.source = "b".repeat(40); }, /execution identity/],
    ["source substitution", f => { f.input.sourceSha = "b".repeat(40); }, /execution identity/],
    ["control substitution", f => { f.input.controlSha = "b".repeat(40); }, /execution identity/],
    ["dispatch substitution", f => { f.input.dispatchEffectId = "sibling-dispatch"; }, /execution identity/],
    ["run substitution", f => { f.input.runId = "101"; }, /already-bound/],
    ["rerun substitution", f => { f.input.runAttempt = "2"; }, /already-bound/],
    ["unbound run", f => { delete f.state.intents[f.intentId]!.attempts[0]!.runId; }, /already-bound/],
    ["unbound run attempt", f => { delete f.state.intents[f.intentId]!.attempts[0]!.runAttempt; }, /already-bound/],
  ];
  it.each(cases)("refuses %s without changing any state", (_name, change, error) => {
    const f = diagnosticFixture(); change(f); const before = structuredClone(f.state);
    expect(() => appendRepairDiagnostic(f.state, f.input)).toThrow(error); expect(f.state).toEqual(before);
  });
  it.each([
    ["schema", { schemaVersion: 2 }], ["wrong kind", { kind: "failure" }], ["funding", { maximumMicros: 1 }],
    ["authority", { authority: { approved: true } }], ["source shape", { sourceSha: "not-a-sha" }],
    ["run shape", { runId: "1/2" }], ["empty run", { runAttempt: "" }], ["identifier", { workId: "../other" }],
    ["unknown diagnostic field", { diagnostic: { summary: "x", evidence: [], instruction: "run worker" } }],
    ["blank summary", { diagnostic: { summary: " ", evidence: [] } }],
    ["too many refs", { diagnostic: { summary: "x", evidence: Array(9).fill("ref") } }],
    ["oversized ref", { diagnostic: { summary: "x", evidence: ["x".repeat(4097)] } }],
    ["oversized summary", { diagnostic: { summary: "x".repeat(8193), evidence: [] } }],
  ])("rejects %s data before mutation", (_name, changed) => {
    const f = diagnosticFixture(), before = structuredClone(f.state);
    expect(() => appendRepairDiagnostic(f.state, { ...f.input, ...changed })).toThrow(); expect(f.state).toEqual(before);
  });
  it("counts UTF-8 bytes and admits exactly 16384 but refuses the next byte", () => {
    const f = diagnosticFixture(); f.input.diagnostic = { summary: "é".repeat(4000), evidence: ["x".repeat(4096), ""] };
    const remaining = REPAIR_DIAGNOSTIC_MAX_BYTES - Buffer.byteLength(canonical(f.input));
    expect(remaining).toBeLessThanOrEqual(4096); expect(remaining).toBeGreaterThan(0);
    f.input.diagnostic.evidence[1] = "x".repeat(remaining);
    expect(Buffer.byteLength(canonical(f.input))).toBe(16_384); appendRepairDiagnostic(f.state, f.input);
    const before = structuredClone(f.state); f.input.diagnostic.evidence[1] += "x";
    expect(() => appendRepairDiagnostic(f.state, f.input)).toThrow("16384 UTF-8 bytes"); expect(f.state).toEqual(before);
  });
});

describe("normal GitHubStore diagnostic transaction", () => {
  it("saves one content-addressed event with exact receipt, own parent and evidence-only state delta", async () => {
    const f = await storeFixture(), before = await f.store.read(), result = await recordRepairDiagnostic(f.store, f.input), final = await f.store.read();
    const expected = structuredClone(before.state); expected.agents[f.workId]!.evidence.push(canonical(f.input)); expected.transitions[transitionId(f.input)] = final.state.transitions[transitionId(f.input)]!;
    expect(final.state).toEqual(expected); expect(result.result).toEqual(savedReceipt(f.input)); expect(result.replayed).toBe(false); expect(result.targetCurrent).toBe(true); expect(result.verifiedReadbackHead).toBe(final.head);
    expect(f.api.commits.get(result.head)!.parents).toEqual([{ sha: before.head }]);
    const eventBlob = f.api.trees.get(final.tree)![`events/${transitionId(f.input)}.json`]!;
    expect(JSON.parse(f.api.blobs.get(eventBlob)!)).toEqual({ id: transitionId(f.input), at: expect.any(String), kind: "record-repair-diagnostic", data: savedReceipt(f.input), owner: final.state.transitions[transitionId(f.input)]!.owner });
    expect(final.state.transitions[transitionId(f.input)]!.owner).toMatch(/^[a-f0-9-]{36}$/);
    f.api.calls = []; const replay = await recordRepairDiagnostic(f.store, { ...f.input, diagnostic: { evidence: [...f.input.diagnostic.evidence], summary: f.input.diagnostic.summary } });
    expect(replay.replayed).toBe(true); expect(replay.result).toEqual(result.result); expect((await f.store.read()).state).toEqual(final.state); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]);
  });
  it("snapshots caller data before asynchronous reads", async () => {
    const f = await storeFixture(), expected = canonical(f.input), read = f.store.read.bind(f.store); let first = true;
    vi.spyOn(f.store, "read").mockImplementation(async () => { if (first) { first = false; f.input.diagnostic.summary = "changed during read"; f.input.workId = "changed-work"; } return read(); });
    const result = await recordRepairDiagnostic(f.store, f.input);
    expect(result.result.workId).toBe(f.workId); expect((await read()).state.agents[f.workId]!.evidence.at(-1)).toBe(expected);
  });
  it("deduplicates simultaneous equal callers without a second evidence append", async () => {
    const f = await storeFixture(), results = await Promise.all([recordRepairDiagnostic(f.store, f.input), recordRepairDiagnostic(f.store, f.input)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]); expect(results.map(result => result.result)).toEqual([savedReceipt(f.input), savedReceipt(f.input)]);
    expect((await f.store.read()).state.agents[f.workId]!.evidence.filter(item => item === canonical(f.input))).toHaveLength(1);
  });
  it("retains the actual note and reports progression after its lost acknowledgment", async () => {
    const f = await storeFixture(); f.api.loseNextAcknowledgment = true;
    f.api.afterLostAcknowledgment = async () => { await f.store.transact("owner-progress", "normal-owner-progress", now, state => { state.agents[f.workId]!.state = "complete"; state.intents[f.intentId]!.state = "pending"; return null; }); };
    const result = await recordRepairDiagnostic(f.store, f.input);
    expect(result.replayed).toBe(false); expect(result.targetCurrent).toBe(false); expect(result.result).toEqual(savedReceipt(f.input));
    const final = await f.store.read(); expect(final.state.agents[f.workId]!.state).toBe("complete"); expect(final.state.agents[f.workId]!.evidence.at(-1)).toBe(canonical(f.input));
    f.api.calls = []; const replay = await recordRepairDiagnostic(f.store, f.input);
    expect(replay.replayed).toBe(true); expect(replay.targetCurrent).toBe(false); expect(replay.result).toEqual(result.result); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]);
  });
  it.each(["complete", "new-attempt", "source", "task"])("rechecks the exact target after a CAS race: %s", async kind => {
    const f = await storeFixture(), original = f.api.request.bind(f.api); let raced = false;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (!raced && method === "PATCH" && path.endsWith("git/refs/heads/morpheus-cd-state")) {
        raced = true; await f.store.transact("owner-race", "normal-owner-progress", now, state => {
          if (kind === "complete") { state.agents[f.workId]!.state = "complete"; state.intents[f.intentId]!.state = "pending"; }
          if (kind === "new-attempt") { const intent = state.intents[f.intentId]!; intent.attempts.push({ ...structuredClone(intent.attempts[0]!), id: "new-attempt" }); }
          if (kind === "source") state.intents[f.intentId]!.source = "b".repeat(40);
          if (kind === "task") { state.agents[f.workId]!.task = "changed task"; state.agents[f.workId]!.taskDigest = hash("changed task"); }
          return null;
        });
      }
      return original<T>(method, path, body);
    };
    await expect(recordRepairDiagnostic(f.store, f.input)).rejects.toThrow(/current repair|complete|latest failed|execution identity|task digest/);
    const final = await f.store.read(); expect(final.state.transitions[transitionId(f.input)]).toBeUndefined(); expect(final.state.agents[f.workId]!.evidence).not.toContain(canonical(f.input));
  });
  it.each(["result", "owner", "missing-evidence"])("refuses a colliding transition or incomplete readback: %s", async kind => {
    const f = await storeFixture(), id = transitionId(f.input);
    if (kind === "owner") {
      // Exercise the replay seam against a legacy transition with no invocation owner.
      const read = f.store.read.bind(f.store); vi.spyOn(f.store, "read").mockImplementation(async () => { const snapshot = await read(); snapshot.state.transitions[id] = { at: now, result: savedReceipt(f.input) }; snapshot.state.agents[f.workId]!.evidence.push(canonical(f.input)); return snapshot; });
    } else await f.store.transact(id, "synthetic-collision", now, state => { if (kind === "result") state.agents[f.workId]!.evidence.push(canonical(f.input)); return kind === "result" ? { ...savedReceipt(f.input), diagnosticId: hash("other content") } : savedReceipt(f.input); });
    f.api.calls = []; await expect(recordRepairDiagnostic(f.store, f.input)).rejects.toThrow(/receipt differs|missing from exact work/); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]);
  });
  it("does not retry an unknown unchanged-head write failure", async () => {
    const f = await storeFixture(), original = f.api.request.bind(f.api); let updates = 0;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => { if (method === "PATCH" && path.endsWith("git/refs/heads/morpheus-cd-state")) { updates++; throw new Error("synthetic unknown response"); } return original<T>(method, path, body); };
    await expect(recordRepairDiagnostic(f.store, f.input)).rejects.toThrow("synthetic unknown response"); expect(updates).toBe(1); expect((await f.store.read()).state.agents[f.workId]!.evidence).not.toContain(canonical(f.input));
  });
  it("retains an accepted note when final readback is unknown without claiming success or retrying", async () => {
    const f = await storeFixture(), read = f.store.read.bind(f.store); let reads = 0;
    const spy = vi.spyOn(f.store, "read").mockImplementation(async () => { if (++reads === 3) throw new Error("synthetic readback unavailable"); return read(); });
    await expect(recordRepairDiagnostic(f.store, f.input)).rejects.toThrow("synthetic readback unavailable"); spy.mockRestore();
    const observed = await read(); expect(observed.state.transitions[transitionId(f.input)]!.result).toEqual(savedReceipt(f.input));
    expect(observed.state.agents[f.workId]!.evidence.filter(item => item === canonical(f.input))).toHaveLength(1);
    expect(f.api.calls.filter(call => call.method === "PATCH" && call.path.endsWith("git/refs/heads/morpheus-cd-state"))).toHaveLength(1);
  });
});
