import { describe, expect, it } from "vitest";
import { configurationDigest, hash, parseState } from "../../src/cd/schema.js";
import { budgetStatus, newState, reservePaid, setBudgetSpendingPolicy, settlePaid } from "../../src/cd/state.js";
import { assertTransition } from "../../src/cd/invariants.js";
import { config, now, source } from "./fixtures.js";

const approval = { campaignId: "campaign-fixture", capMicros: 350_000_000, authorizationRef: "human:no-internal-holds-fixture" };
const request = { repository: "example/app", intentId: "production-due", purpose: "Guarded Firebase rollout and repair CI", roadmap: "EX-production-repair" };
function fixture() {
  const cfg = config(), state = newState(cfg, "epoch", now);
  state.sources = [source()]; state.fences.prior = 3;
  state.pauses.push({ scope: "unrelated", actor: "human", reason: "keep existing pause", resumeCondition: "explicit human resume", createdAt: now, human: true });
  state.budget.spentMicros = 44_232_828;
  state.budget.reservations.legacy = { digest: hash("prior-uncertain-request"), maximumMicros: 238_515_115, status: "reserved" };
  return { cfg, state };
}
describe("explicit campaign spend-as-needed policy", () => {
  it("preserves default reservation admission and opts in only this ledger", () => {
    const { cfg, state } = fixture(), before = structuredClone(state);
    expect(() => reservePaid(state, cfg, "mixed", request, 5_000_000)).toThrow("Together budget exhausted");
    setBudgetSpendingPolicy(state, cfg, approval, now);
    const expected = structuredClone(before); expected.budget.spendingPolicy = { mode: "spend-as-needed", ...approval, adoptedAt: now };
    expect(state).toEqual(expected); expect(state.configurationDigest).toBe(configurationDigest(cfg));
    expect(budgetStatus(state, cfg)).toEqual({ mode: "spend-as-needed", campaignId: approval.campaignId, capMicros: 350_000_000, recordedSpentMicros: 44_232_828, internalHeldMicros: 0, remainingMicros: 305_767_172, recordedOverspendMicros: 0, unsettledOperationCount: 1, remainingIsProviderBalance: false });
    expect(cfg.budget).toEqual({ togetherLimitUsd: 250, subscriptionAdmitBelowPercent: 80, subscriptionStopAtPercent: 90 });
    expect(() => reservePaid(before, cfg, "other", request, 5_000_000)).toThrow("Together budget exhausted");
  });
  it("funds the exact original mixed identity and replays without changing history", () => {
    const { cfg, state } = fixture(); setBudgetSpendingPolicy(state, cfg, approval, now);
    reservePaid(state, cfg, "original-mixed", request, 5_000_000);
    expect(state.budget.reservations["original-mixed"]).toEqual({ digest: hash(request), maximumMicros: 5_000_000, status: "reserved" });
    const before = structuredClone(state); reservePaid(state, cfg, "original-mixed", request, 5_000_000); expect(state).toEqual(before);
    expect(() => reservePaid(state, cfg, "original-mixed", { ...request, purpose: "different" }, 5_000_000)).toThrow("changed request");
    expect(() => reservePaid(state, cfg, "original-mixed", request, 5_000_001)).toThrow("changed request");
    expect(state.budget.reservations.legacy).toEqual({ digest: hash("prior-uncertain-request"), maximumMicros: 238_515_115, status: "reserved" });
    expect(budgetStatus(state, cfg).remainingMicros).toBe(305_767_172);
  });
  it("checks the exact recorded-spend boundary without retaining maxima as holds", () => {
    const { cfg, state } = fixture(); setBudgetSpendingPolicy(state, cfg, approval, now);
    expect(() => reservePaid(state, cfg, "one-over", {}, 305_767_173)).toThrow("Campaign budget exhausted");
    expect(() => reservePaid(state, cfg, "boundary", {}, 305_767_172)).not.toThrow();
    expect(state.budget.reservations.boundary?.maximumMicros).toBe(305_767_172);
    reservePaid(state, cfg, "separate-bounded-operation", {}, 5_000_000);
    expect(budgetStatus(state, cfg).internalHeldMicros).toBe(0);
    settlePaid(state, "separate-bounded-operation", 5_000_000);
    expect(budgetStatus(state, cfg).remainingMicros).toBe(300_767_172);
    expect(() => reservePaid(state, cfg, "new-over", {}, 300_767_173)).toThrow("Campaign budget exhausted");
  });
  it("records real late costs even if they put recorded spend beyond the cap", () => {
    const { cfg, state } = fixture(); state.budget.spentMicros = 345_000_000;
    setBudgetSpendingPolicy(state, cfg, approval, now); settlePaid(state, "legacy", 10_000_000);
    expect(state.budget.spentMicros).toBe(355_000_000);
    expect(budgetStatus(state, cfg)).toMatchObject({ internalHeldMicros: 0, remainingMicros: 0, recordedOverspendMicros: 5_000_000 });
    expect(() => reservePaid(state, cfg, "zero-over-cap", {}, 0)).toThrow("Campaign budget exhausted");
    expect(() => settlePaid(state, "legacy", 0)).toThrow("tombstone");
  });
  it("rejects invalid policies/configs and requires a new reference for a changed cap", () => {
    const { cfg, state } = fixture();
    for (const input of [{ ...approval, capMicros: 0 }, { ...approval, capMicros: 1.5 }, { ...approval, capMicros: Number.MAX_SAFE_INTEGER + 1 }, { ...approval, authorizationRef: " " }]) expect(() => setBudgetSpendingPolicy(state, cfg, input, now)).toThrow();
    expect(() => setBudgetSpendingPolicy(state, { ...cfg, repository: "other/app" }, approval, now)).toThrow("configuration differs");
    setBudgetSpendingPolicy(state, cfg, approval, now); const before = structuredClone(state);
    setBudgetSpendingPolicy(state, cfg, approval, "2026-10-19T18:00:00Z"); expect(state).toEqual(before);
    expect(() => setBudgetSpendingPolicy(state, cfg, { ...approval, campaignId: "another" }, now)).toThrow("another campaign");
    expect(() => setBudgetSpendingPolicy(state, cfg, { ...approval, capMicros: 400_000_000 }, now)).toThrow("new human authorization");
    setBudgetSpendingPolicy(state, cfg, { ...approval, capMicros: 400_000_000, authorizationRef: "human:explicit-additional-cap" }, now);
    expect(state.budget.spendingPolicy?.capMicros).toBe(400_000_000);
    assertTransition(before, state);
  });
  it("validates stored policy and preserves its campaign/adoption audit record", () => {
    const { cfg, state } = fixture(); setBudgetSpendingPolicy(state, cfg, approval, now);
    const bad = structuredClone(state); (bad.budget.spendingPolicy as { mode: string }).mode = "private-bypass";
    expect(() => parseState(bad)).toThrow(); expect(() => reservePaid(bad, cfg, "new", {}, 1)).toThrow();
    const removed = structuredClone(state); delete removed.budget.spendingPolicy; expect(() => assertTransition(state, removed)).toThrow("removed or reassigned");
    const moved = structuredClone(state); moved.budget.spendingPolicy!.campaignId = "other"; expect(() => assertTransition(state, moved)).toThrow("removed or reassigned");
    const rewritten = structuredClone(state); rewritten.budget.spendingPolicy!.adoptedAt = "2026-10-19T18:00:00Z"; expect(() => assertTransition(state, rewritten)).toThrow("adoption record");
    const overflow = structuredClone(state); overflow.budget.spentMicros = Number.MAX_SAFE_INTEGER; expect(() => reservePaid(overflow, cfg, "overflow", {}, 1)).toThrow();
  });
});
