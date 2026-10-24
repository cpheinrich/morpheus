import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyReviewedSourceReservation, prepareReviewedSourceReservation, reserveReviewedSource } from "../../src/cd/source-finance.js";
import { configurationDigest, hash } from "../../src/cd/schema.js";
import { createIntent, planAttempt, reservePaid, settlePaid } from "../../src/cd/state.js";
import { GitHubStore } from "../../src/cd/store.js";
import { now, source } from "./fixtures.js";
import { financeFixture, repin } from "./source-finance-fixtures.js";

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
const writes = (f: Awaited<ReturnType<typeof financeFixture>>) => f.api.calls.filter(call => call.method !== "GET");
const reserve = (f: Awaited<ReturnType<typeof financeFixture>>) => reserveReviewedSource(f.api, f.cfg, f.input);

describe("reviewed source-only financial admission", () => {
  it("exposes the exact pure callback contract without API effects", async () => {
    const f = await financeFixture(), state = (await f.store.read()).state, before = structuredClone(state), prepared = prepareReviewedSourceReservation(f.cfg, f.input);
    f.api.calls.length = 0; const receipt = applyReviewedSourceReservation(state, prepared, now);
    expect(receipt).toEqual(prepared.receipt); expect(state.transitions).toEqual(before.transitions); expect(f.api.calls).toEqual([]);
    before.budget.reservations[f.input.reservationId] = { digest: receipt.requestDigest, maximumMicros: f.input.maximumMicros, status: "reserved" };
    expect(state).toEqual(before); expect(Object.isFrozen(prepared)).toBe(true);
  });
  it.each([[17_000_000, 257_000_000], [65_000_000, 325_000_000]])("admits generic amount %i under ceiling %i with complete immutable evidence", async (amount, ceiling) => {
    const f = await financeFixture(amount, ceiling), before = (await f.store.read()).state;
    const result = await reserve(f), after = (await f.store.read()).state;
    const envelope = { version: 1, kind: "reviewed-source-reservation", request: f.request, authority: { grant: f.grant, digest: hash(f.grant) } };
    expect(result.result).toEqual({ version: 1, kind: "reviewed-source-reservation-receipt", id: f.input.reservationId, maximumMicros: amount, requestDigest: hash(envelope), envelope });
    expect(result.replayed).toBe(false); expect(result.verifiedReadbackHead).toBe(result.head);
    const expected = structuredClone(before);
    expected.budget.reservations[f.input.reservationId] = { digest: hash(envelope), maximumMicros: amount, status: "reserved" };
    expected.transitions[`budget-reserve-${f.input.reservationId}`] = after.transitions[`budget-reserve-${f.input.reservationId}`]!;
    expect(after).toEqual(expected);
    expect(f.cfg.budget.togetherLimitUsd).toBe(250); expect(after.configurationDigest).toBe(configurationDigest(f.cfg));
    expect(f.api.calls.filter(call => call.method === "PATCH").map(call => (call.body as { force: boolean }).force)).toEqual([false, false]);
    const tree = f.api.trees.get(f.api.commits.get(result.head)!.tree.sha)!;
    const event = JSON.parse(f.api.blobs.get(tree[`events/budget-reserve-${f.input.reservationId}.json`]!)!);
    expect(event.data).toEqual(result.result); expect(event.owner).toBe(after.transitions[`budget-reserve-${f.input.reservationId}`]!.owner);
  });
  it("refuses exactly one micro above the reviewed ceiling before any write", async () => {
    const f = await financeFixture(17_000_000, 256_999_999);
    await expect(reserve(f)).rejects.toThrow("ceiling"); expect(writes(f)).toEqual([]);
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Infinity])("rejects an invalid amount %s before provider I/O", async amount => {
    const f = await financeFixture(); f.input.maximumMicros = amount;
    await expect(reserve(f)).rejects.toThrow(); expect(f.api.calls).toEqual([]);
  });
  it.each(["grant-extra", "grant-missing", "request-extra", "request-native", "native-id", "hash", "amount", "request-hash"])("rejects repinned invalid scope %s before provider I/O", async kind => {
    const f = await financeFixture();
    if (kind === "grant-extra") Object.assign(f.grant, { extra: true });
    if (kind === "grant-missing") delete (f.grant as Partial<typeof f.grant>).humanEvidenceSha256;
    if (kind === "request-extra") Object.assign(f.request, { extra: true });
    if (kind === "request-native") f.request.nativeEffects = true;
    if (kind === "native-id") f.input.reservationId = f.grant.reservationId = "native-paid-attempt";
    if (kind === "amount") f.input.maximumMicros++;
    repin(f);
    if (kind === "hash") f.input.approvedGrantDigest = hash("unapproved");
    if (kind === "request-hash") f.request.branch = "unapproved-drift";
    await expect(reserve(f)).rejects.toThrow(); expect(f.api.calls).toEqual([]);
  });
  it.each(["repository", "epoch", "supplied-config", "stored-config", "request-repository"])("binds actual and stored target: %s", async kind => {
    const f = await financeFixture();
    if (kind === "repository") f.grant.repository = "example/other";
    if (kind === "epoch") f.grant.epoch = "other-epoch";
    if (kind === "supplied-config") f.cfg.deadlines.pollMinutes++;
    if (kind === "stored-config") {
      const original = GitHubStore.prototype.read;
      vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) { const result = await original.call(this); result.state.configurationDigest = hash("another configuration"); return result; });
    }
    if (kind === "request-repository") f.request.repository = "example/other";
    repin(f); await expect(reserve(f)).rejects.toThrow(); expect(writes(f)).toEqual([]);
  });
  it.each(["negative-spend", "fractional-spend", "bad-status", "bad-tombstone", "sum-overflow", "addition-overflow"])("refuses malformed or overflowing liabilities: %s", async kind => {
    const f = await financeFixture(4, Number.MAX_SAFE_INTEGER, state => {
      if (kind === "fractional-spend") state.budget.spentMicros = 1.5;
      if (kind === "addition-overflow") state.budget.spentMicros = Number.MAX_SAFE_INTEGER - 3;
      if (kind === "sum-overflow") { state.budget.spentMicros = Number.MAX_SAFE_INTEGER - 3; state.budget.reservations.old = { digest: hash("old"), maximumMicros: 4, status: "reserved" }; }
      if (kind === "bad-status") state.budget.reservations.old = { digest: hash("old"), maximumMicros: 1, status: "unknown" as "reserved" };
      if (kind === "bad-tombstone") state.budget.reservations.old = { digest: hash("old"), maximumMicros: 1, actualMicros: 2, status: "settled" };
    });
    if (kind === "negative-spend") {
      const original = GitHubStore.prototype.read;
      vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) { const result = await original.call(this); result.state.budget.spentMicros = -1; return result; });
    }
    await expect(reserve(f)).rejects.toThrow(); expect(writes(f)).toEqual([]);
  });
  it.each(["2026-10-18T17:59:59.999Z", "2026-10-18T18:10:00.000Z"])("refuses outside issued <= now < expires at %s", async time => {
    const f = await financeFixture(); vi.setSystemTime(time);
    await expect(reserve(f)).rejects.toThrow("admission window"); expect(writes(f)).toEqual([]);
  });
  it.each(["2026-10-18T18:00:00Z", "2026-02-30T18:00:00.000Z", "2026-10-18T18:30:00.001Z", now])("rejects noncanonical, invalid or unbounded expiry %s", async expires => {
    const f = await financeFixture(); f.grant.expiresAt = expires; repin(f);
    await expect(reserve(f)).rejects.toThrow(); expect(writes(f)).toEqual([]);
  });
  it("allows exactly the 30-minute window and one millisecond before expiry", async () => {
    const f = await financeFixture(); f.grant.expiresAt = "2026-10-18T18:30:00.000Z"; repin(f); vi.setSystemTime("2026-10-18T18:29:59.999Z");
    expect((await reserve(f)).replayed).toBe(false);
  });
  it("rechecks the clock after asynchronous store reads before its first callback", async () => {
    const f = await financeFixture(), original = GitHubStore.prototype.read; let reads = 0;
    vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) { const result = await original.call(this); if (++reads === 2) vi.setSystemTime(f.grant.expiresAt); return result; });
    await expect(reserve(f)).rejects.toThrow("admission window"); expect(writes(f)).toEqual([]);
  });
  it("revalidates replay before transact and after a delayed replay response", async () => {
    const f = await financeFixture(); await reserve(f); f.api.calls.length = 0; vi.setSystemTime(f.grant.expiresAt);
    await expect(reserve(f)).rejects.toThrow("admission window"); expect(writes(f)).toEqual([]);
    vi.setSystemTime(now); const original = GitHubStore.prototype.read; let reads = 0;
    vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) { const result = await original.call(this); if (++reads === 2) vi.setSystemTime(f.grant.expiresAt); return result; });
    await expect(reserve(f)).rejects.toThrow("admission window"); expect(writes(f)).toEqual([]);
  });
  it.each(["expiry", "liability"])("recomputes %s after a failed CAS without admitting stale funds", async change => {
    const f = await financeFixture(), request = f.api.request.bind(f.api); let first = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (first && method === "PATCH" && path.endsWith("/morpheus-cd-state")) {
        first = false;
        await f.store.transact("competitor", "competitor", now, state => { state.budget.reservations.other = { digest: hash("other"), maximumMicros: 20_000_000, status: "reserved" }; return null; });
        if (change === "expiry") vi.setSystemTime(f.grant.expiresAt);
      }
      return request<T>(method, path, body);
    };
    await expect(reserve(f)).rejects.toThrow(change === "expiry" ? "admission window" : "ceiling");
    const final = (await f.store.read()).state;
    expect(final.budget.reservations[f.input.reservationId]).toBeUndefined(); expect(final.budget.reservations.other?.maximumMicros).toBe(20_000_000);
    expect(final.transitions[`budget-reserve-${f.input.reservationId}`]).toBeUndefined();
  });
  it("serializes different reservations against the current aggregate ceiling", async () => {
    const f = await financeFixture(65_000_000, 325_000_000, state => { state.budget.spentMicros = 230_000_000; });
    const second = structuredClone(f.input); second.reservationId = second.grant.reservationId = "source-ci-second-task"; second.grant.grantId = "second-grant"; second.approvedGrantDigest = hash(second.grant);
    const outcomes = await Promise.allSettled([reserve(f), reserveReviewedSource(f.api, f.cfg, second)]);
    expect(outcomes.map(result => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    const state = (await f.store.read()).state;
    expect(Object.values(state.budget.reservations).map(paid => paid.maximumMicros)).toEqual([65_000_000]); expect(state.budget.spentMicros).toBe(230_000_000);
  });
  it("retains normal owner and lost-acknowledgment semantics", async () => {
    const f = await financeFixture(); f.api.loseNextAcknowledgment = true;
    f.api.afterLostAcknowledgment = async () => { await f.store.transact("later", "later", now, state => { state.fences.later = 7; return null; }); };
    const result = await reserve(f); expect(result.replayed).toBe(false); expect(result.verifiedReadbackHead).toBe(result.head);
    const results = await Promise.all([reserve(f), reserve(f)]); expect(results.map(value => value.replayed)).toEqual([true, true]);
    expect((await f.store.read()).state.fences).toEqual({ later: 7 });
  });
  it("gives simultaneous identical callers one owned creation and one replay", async () => {
    const f = await financeFixture(), results = await Promise.all([reserve(f), reserve(f)]);
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]); expect(results[0]!.result).toEqual(results[1]!.result);
    expect(Object.keys((await f.store.read()).state.budget.reservations)).toEqual([f.input.reservationId]);
  });
  it.each(["legacy", "settled", "missing-receipt", "changed-receipt", "ownerless"])("never relabels %s paid identities", async kind => {
    const f = await financeFixture(), result = await reserve(f);
    if (kind === "settled") await f.store.transact("settlement", "settle", now, state => { settlePaid(state, f.input.reservationId, 3); return null; });
    const read = GitHubStore.prototype.read;
    if (kind !== "settled") vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) {
      const result = await read.call(this), record = result.state.transitions[`budget-reserve-${f.input.reservationId}`]!;
      if (kind === "legacy") delete result.state.transitions[`budget-reserve-${f.input.reservationId}`];
      if (kind === "missing-receipt") record.result = { id: f.input.reservationId, maximumMicros: f.input.maximumMicros };
      if (kind === "changed-receipt") record.result = { ...(record.result as object), unexpected: true };
      if (kind === "ownerless") delete record.owner;
      return result;
    });
    f.api.calls.length = 0; await expect(reserve(f)).rejects.toThrow(); expect(writes(f)).toEqual([]); expect(result.result.envelope.authority.grant).toEqual(f.grant);
  });
  it.each(["paid", "paid-extra", "receipt"])("requires exact final %s readback", async kind => {
    const f = await financeFixture(), original = GitHubStore.prototype.read; let reads = 0;
    vi.spyOn(GitHubStore.prototype, "read").mockImplementation(async function (this: GitHubStore) {
      const result = await original.call(this);
      if (++reads === 3) {
        if (kind === "paid") result.state.budget.reservations[f.input.reservationId]!.maximumMicros++;
        else if (kind === "paid-extra") result.state.budget.reservations[f.input.reservationId]!.actualMicros = 0;
        else (result.state.transitions[`budget-reserve-${f.input.reservationId}`]!.result as { envelope: { authority: { grant: { humanEvidenceSha256: string } } } }).envelope.authority.grant.humanEvidenceSha256 = hash("changed human record");
      }
      return result;
    });
    await expect(reserve(f)).rejects.toThrow(kind.startsWith("paid") ? "paid reservation" : "complete authority receipt");
  });
  it("snapshots and freezes caller-owned config, grant and request before awaiting", async () => {
    const f = await financeFixture(), expected = structuredClone(f.input), original = f.api.request.bind(f.api); let first = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (first) { first = false; f.cfg.repository = "other/repository"; f.grant.maximumMicros = 1; f.request.fullCiMax = 999; }
      return original<T>(method, path, body);
    };
    const result = await reserve(f);
    expect(result.result.envelope.authority.grant).toEqual(expected.grant); expect(result.result.envelope.request).toEqual(expected.request);
    expect(f.api.calls.every(call => call.path.startsWith("repos/example/app/"))).toBe(true);
    expect(Object.isFrozen(result.result.envelope.authority.grant)).toBe(true);
  });
  it("caps new paid reservations while local planning and exact old paid replays remain available", async () => {
    const request = { native: "old exact request" }, f = await financeFixture(17_000_000, 280_000_000, state => { state.budget.reservations.old = { digest: hash(request), maximumMicros: 10_000_000, status: "reserved" }; });
    const funded = await reserve(f), state = structuredClone(funded.state), before = structuredClone(state.budget);
    expect(Object.values(before.reservations).reduce((sum, paid) => sum + (paid.status === "reserved" ? paid.maximumMicros : 0), before.spentMicros)).toBe(267_000_000);
    expect(f.cfg.budget.togetherLimitUsd).toBe(250);
    expect(() => reservePaid(state, f.cfg, "new-paid", { paid: "new" }, 1)).toThrow("Together budget exhausted");
    state.sources = [source()]; f.api.calls.length = 0;
    const intent = createIntent(state, f.cfg, "staging", state.sources[0]!, now, now, false, undefined, "otherwise-eligible-local");
    expect(intent.state).toBe("pending");
    const attempt = planAttempt(state, f.cfg, intent.id, "c".repeat(40), "7", now, "local");
    expect(attempt).toMatchObject({ lane: "local", status: "active", dispatch: { state: "intended", runIds: [] } });
    expect(state.budget).toEqual(before); expect(f.api.calls).toEqual([]);
    await expect(f.store.transact("new-native", "native", now, state => reservePaid(state, f.cfg, "new-native", { native: "new" }, 1))).rejects.toThrow("Together budget exhausted");
    await f.store.transact("replay-native", "native", now, state => reservePaid(state, f.cfg, "old", request, 10_000_000));
    expect((await f.store.read()).state.budget.reservations.old).toEqual({ digest: hash(request), maximumMicros: 10_000_000, status: "reserved" });
  });
});
