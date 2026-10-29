import { describe, expect, it } from "vitest";
import { configurationDigest, hash, parseState } from "../../src/cd/schema.js";
import { adoptRepair, adoptSources, after, claimGroup, claimUpload, completeOperationalRepair, createIntent, currentSlot, deliver, dueSlots, eligible, evaluateSlots, newState, planAttempt, quotaUsed, recordTests, recordUpload, repairWork, reserveBuild, reservePaid, settlePaid } from "../../src/cd/state.js";
import { config, now, observation, prepared, source } from "./fixtures.js";
import { assertTransition } from "../../src/cd/invariants.js";

describe("durable slot/source obligations", () => {
  it("selects UTC boundaries and discovers every dropped staging tick", () => {
    const cfg = config(); expect(currentSlot(cfg, "staging", "2026-10-18T17:59:59.999Z")).toBe("2026-10-18T12:00:00.000Z");
    expect(currentSlot(cfg, "production", "2026-10-18T17:59:59.999Z")).toBe("2026-10-17T18:00:00.000Z");
    expect(dueSlots(cfg, "staging", "2026-10-18T00:00:00.000Z", now)).toEqual(["2026-10-18T06:00:00.000Z", "2026-10-18T12:00:00.000Z", now]);
  });
  it("rejects production at 23:59:59.999 and admits exactly 24 hours", () => {
    const candidate = source("a", 0, "2026-10-17T18:00:00.000Z");
    expect(eligible(candidate, config(), "production", "2026-10-18T17:59:59.999Z")).toBe(false); expect(eligible(candidate, config(), "production", now)).toBe(true);
  });
  it("waives age only for the explicitly authorized validation lineage, including app repairs", () => {
    const cfg = config(), state = newState(cfg, "e", now), fresh = source("a", 0, now);
    state.sources = [fresh];
    const waiver = { authorizationRef: "https://example.com/approval/8-deliveries", grantedAt: now };
    const intent = createIntent(state, cfg, "production", fresh, now, now, true, undefined, "campaign-one", waiver);
    expect(intent.state).toBe("pending"); expect(intent.groupId).toBe("production"); expect(intent.sourceAgeWaiver).toEqual(waiver);
    const first = planAttempt(state, cfg, intent.id, "c".repeat(40), "7", now); expect(first.sourceSha).toBe(fresh.sha); first.status = "failed";
    const fix = source("b", 1, after(now, 1)); state.sources.push(fix); adoptRepair(state, cfg, intent.id, fix, "reviewed app repair", after(now, 1));
    expect(intent.eligibleAt).toBe(after(now, 1)); expect(intent.state).toBe("pending"); expect(intent.sourceAgeWaiver).toEqual(waiver);
    expect(planAttempt(state, cfg, intent.id, "d".repeat(40), "8", after(now, 1)).sourceSha).toBe(fix.sha);
    const ordinary = createIntent(state, cfg, "production", fix, now, after(now, 1), false, undefined, "ordinary");
    expect(ordinary.state).toBe("waiting"); expect(ordinary.eligibleAt).toBe(after(now, 24 * 60 + 1));
    expect(() => planAttempt(state, cfg, ordinary.id, "c".repeat(40), "9", after(now, 1))).toThrow("old enough");
    expect(cfg.channels.production.minimumAgeHours).toBe(24); expect(state.cursors.production).toBeUndefined();
  });
  it("rejects ordinary or malformed waivers and preserves their immutable authorization", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source("a", 0, now)];
    const waiver = { authorizationRef: "https://example.com/approval", grantedAt: now };
    expect(() => createIntent(state, cfg, "production", state.sources[0]!, now, now, false, undefined, "ordinary", waiver)).toThrow("validation");
    expect(() => createIntent(state, cfg, "production", state.sources[0]!, now, now, true, undefined, "bad", { ...waiver, authorizationRef: " " })).toThrow();
    const intent = createIntent(state, cfg, "production", state.sources[0]!, now, now, true, undefined, "campaign", waiver);
    for (const changed of [undefined, { ...waiver, authorizationRef: "https://example.com/different" }, { ...waiver, grantedAt: after(now, 1) }]) {
      const next = structuredClone(state); next.intents[intent.id]!.sourceAgeWaiver = changed;
      expect(() => assertTransition(state, next)).toThrow("waiver is immutable");
    }
    const ordinaryState = structuredClone(state); ordinaryState.intents[intent.id]!.validation = false;
    expect(() => parseState(ordinaryState)).toThrow("validation");
    const malformed = structuredClone(state); malformed.intents[intent.id]!.sourceAgeWaiver!.grantedAt = "not a date";
    expect(() => parseState(malformed)).toThrow();
    const noWaiver = structuredClone(state); delete noWaiver.intents[intent.id]!.sourceAgeWaiver;
    expect(() => assertTransition(noWaiver, state)).toThrow("waiver is immutable");
  });
  it("uses conservative first observation, never old author timestamps", () => {
    const state = newState(config(), "e", now), candidate = source(); candidate.evidence = { kind: "observed", ref: "unknown history" };
    adoptSources(state, [candidate], now); expect(state.sources[0]!.mainEnteredAt).toBe(now);
    adoptSources(state, [{ ...candidate, mainEnteredAt: "1999-01-01T00:00:00.000Z" }], after(now, 20)); expect(state.sources[0]!.mainEnteredAt).toBe(now);
    state.lastMain = "f".repeat(40); expect(() => adoptSources(state, [candidate], now)).toThrow("rewritten");
  });
  it("preserves immutable selection/debt when unstarted staging coalesces", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source()]; evaluateSlots(state, cfg, "2026-10-18T06:00:00.000Z");
    const intent = Object.values(state.intents).find(item => item.channel === "staging")!, debt = intent.oldestDebtAt, slot = intent.slot;
    state.sources.push(source("b", 1, "2026-10-18T07:00:00.000Z")); evaluateSlots(state, cfg, "2026-10-18T12:00:00.000Z");
    expect(intent.source).toBe("b".repeat(40)); expect(intent.originalSource).toBe("a".repeat(40)); expect(intent.slot).toBe(slot); expect(intent.oldestDebtAt).toBe(debt); expect(intent.lineage).toHaveLength(2);
  });
  it("does not erase later staging debt while an older source is testing", () => {
    const { state, intentId } = prepared(); state.sources.push(source("b", 1, "2026-10-18T19:00:00.000Z")); state.evaluatedSlots.staging = now;
    evaluateSlots(state, config(), "2026-10-19T00:00:00.000Z");
    expect(state.intents[intentId]!.source).toBe("a".repeat(40)); expect(state.slots.filter(slot => slot.channel === "staging").at(-1)).toEqual({ channel: "staging", slot: "2026-10-19T00:00:00.000Z", decision: "missed" });
  });
  it("records no-change staging but still creates daily production", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source()]; state.cursors.staging = { sourceSha: state.sources[0]!.sha, order: 0, receiptId: "old" };
    evaluateSlots(state, cfg, now); expect(state.slots.find(slot => slot.channel === "staging")!.decision).toBe("no-change"); expect(Object.values(state.intents).map(intent => intent.channel)).toEqual(["production"]);
  });
  it("retains failed production identity across newer daily boundaries", () => {
    const { state, intentId } = prepared("production"), intent = state.intents[intentId]!; intent.state = "repairing"; state.evaluatedSlots.production = now;
    evaluateSlots(state, config(), "2026-10-21T18:00:00.000Z"); expect(Object.values(state.intents).filter(item => item.channel === "production")).toHaveLength(1); expect(intent.coveredSlots).toHaveLength(4); expect(intent.deadlineAt).toBe("2026-10-19T00:00:00.000Z");
  });
  it("coalesces a multi-day production outage at the latest due cutoff without backdated success", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source(), source("b", 1, "2026-10-19T17:00:00.000Z")]; state.evaluatedSlots.production = "2026-10-17T18:00:00.000Z";
    evaluateSlots(state, cfg, "2026-10-21T18:00:00.000Z"); const intent = Object.values(state.intents).find(item => item.channel === "production")!;
    expect(intent.slot).toBe("2026-10-21T18:00:00.000Z"); expect(intent.originalSource).toBe("b".repeat(40)); expect(intent.coveredSlots).toHaveLength(4); expect(intent.deadlineAt).toBe("2026-10-19T00:00:00.000Z"); expect(state.slots.filter(slot => slot.channel === "production" && slot.decision === "missed")).toHaveLength(3);
  });
  it("requires a separate authorized group for an older-binary validation", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source(), source("b", 1)]; state.cursors.staging = { sourceSha: "b".repeat(40), order: 1, receiptId: "new" };
    expect(() => createIntent(state, cfg, "staging", state.sources[0]!, now, now, true)).toThrow("separate");
    const intent = createIntent(state, cfg, "staging", state.sources[0]!, now, now, true, "historical", "historical-request"); expect(intent.groupId).toBe("historical");
  });
  it("app repairs restart production age without resetting the obligation deadline", () => {
    const { state, intentId, attemptId } = prepared("production"), intent = state.intents[intentId]!, deadline = intent.deadlineAt; intent.attempts[0]!.status = "failed";
    const fix = source("b", 1, now); state.sources.push(fix); adoptRepair(state, config(), intentId, fix, "reviewed merge", now);
    expect(intent.state).toBe("waiting"); expect(intent.eligibleAt).toBe("2026-10-19T18:00:00.000Z"); expect(intent.deadlineAt).toBe(deadline); expect(intent.attempts[0]!.id).toBe(attemptId);
    expect(() => planAttempt(state, config(), intentId, "c".repeat(40), "8", now)).toThrow("old enough");
  });
  it("preserves aged app inputs across a reviewed control-only repair", () => {
    const { state, intentId } = prepared("production"); state.intents[intentId]!.attempts[0]!.status = "failed";
    const fix = source("b", 1, now, "a"); state.sources.push(fix); adoptRepair(state, config(), intentId, fix, "control-only reviewed merge", now);
    expect(state.intents[intentId]!.state).toBe("pending"); expect(planAttempt(state, config(), intentId, "d".repeat(40), "8", now).sourceSha).toBe(fix.sha);
  });
  it("does not restart the aged app clock on a second consecutive control repair", () => {
    const { state, intentId } = prepared("production"); state.intents[intentId]!.attempts[0]!.status = "failed";
    const first = source("b", 1, now, "a"), second = source("d", 2, after(now, 10), "a"); state.sources.push(first, second);
    adoptRepair(state, config(), intentId, first, "first exact-head control review", now); const eligibleAt = state.intents[intentId]!.eligibleAt;
    adoptRepair(state, config(), intentId, second, "second exact-head control review", after(now, 10)); expect(state.intents[intentId]!.eligibleAt).toBe(eligibleAt); expect(state.intents[intentId]!.state).toBe("pending");
  });
});

describe("repair adoption descends past attempted sources", () => {
  // a (order 0) failed, a reviewed repair b (order 1) then failed too; c (order 2) is newer main.
  function twiceFailed() {
    const { state, intentId } = prepared(), cfg = config(); state.sources.push(source("b", 1), source("c", 2));
    state.intents[intentId]!.attempts[0]!.status = "failed";
    adoptRepair(state, cfg, intentId, state.sources[1]!, "first reviewed repair", now);
    planAttempt(state, cfg, intentId, "c".repeat(40), "8", now).status = "failed";
    return { state, cfg, intentId };
  }
  it.each([["a", "descend along configured main history"], ["b", `does not descend past attempted source ${"b".repeat(40)}`]])("refuses re-adopting %s without mutation", (sha, message) => {
    const f = twiceFailed(), before = structuredClone(f.state);
    expect(() => adoptRepair(f.state, f.cfg, f.intentId, f.state.sources.find(item => item.sha === sha.repeat(40))!, "reused merge", now)).toThrow(message);
    expect(f.state).toEqual(before);
  });
  it("adopts the next newer source and keeps the earlier lineage", () => {
    const f = twiceFailed(); adoptRepair(f.state, f.cfg, f.intentId, f.state.sources[2]!, "second reviewed repair", now);
    const intent = f.state.intents[f.intentId]!;
    expect(intent.source).toBe("c".repeat(40)); expect(intent.lineage.map(item => item.source)).toEqual(["a", "b", "c"].map(digit => digit.repeat(40)));
  });
  it("still allows an unattempted current source, as before", () => {
    const cfg = config(), state = newState(cfg, "e", now); state.sources = [source()];
    const intent = createIntent(state, cfg, "staging", state.sources[0]!, now, now);
    adoptRepair(state, cfg, intent.id, state.sources[0]!, "reviewed merge before any attempt", now);
    expect(intent.lineage).toHaveLength(2); expect(intent.state).toBe("pending");
  });
});

describe("irreversible identity, evidence and promotion", () => {
  it("allocates global per-app/version decimal numbers without JS precision loss", () => {
    const state = newState(config(), "e", now);
    expect(reserveBuild(state, "123", "1", "a", "9007199254740992", now)).toBe("9007199254740993"); expect(reserveBuild(state, "123", "1", "b", "3", now)).toBe("9007199254740994"); expect(reserveBuild(state, "123", "1", "a", "9999999999999999", now)).toBe("9007199254740993"); expect(state.builds["123/1"]!.reservations.a!.burned).toBe(true);
  });
  it("requires all actual results, exact inventory digest and full scope", () => {
    for (const change of [(tests: ReturnType<typeof prepared>["tests"]) => { tests.results = []; }, (tests: ReturnType<typeof prepared>["tests"]) => { tests.results[0]!.status = "skipped"; }, (tests: ReturnType<typeof prepared>["tests"]) => { tests.inventory.sha256 = hash("wrong"); }]) {
      const { state, tests } = prepared(); state.intents[tests.intentId]!.attempts[0]!.tests = undefined; change(tests); expect(() => recordTests(state, config(), tests)).toThrow();
    }
  });
  it("rejects sibling run, source and reserved build substitutions", () => {
    for (const change of [{ runId: "101" }, { sourceSha: "b".repeat(40) }, { buildNumber: "9" }, { appId: "456" }, { runAttempt: "2" }]) {
      const { state, upload } = prepared(); expect(() => claimUpload(state, config(), { ...upload, ...change }, now)).toThrow();
    }
  });
  it("expired leases retain the upload claim and burned build", () => {
    const { state, upload, intentId } = prepared(); expect(claimUpload(state, config(), upload, now)).toBe(`upload:${upload.attemptId}`);
    state.intents[intentId]!.attempts[0]!.lease!.expiresAt = "2020-01-01T00:00:00.000Z";
    expect(() => claimUpload(state, config(), upload, after(now, 200))).toThrow("already claimed"); expect(state.builds["123/1.0"]!.reservations[upload.attemptId]!.burned).toBe(true);
  });
  it("persists resource uncertainty then acceptance without replaying upload", () => {
    const { state, upload, intentId } = prepared(); claimUpload(state, config(), upload, now);
    recordUpload(state, { ...upload, outcome: "uncertain", providerUploadId: "resource" }, now); expect(state.intents[intentId]!.state).toBe("waiting");
    recordUpload(state, { ...upload, outcome: "accepted", providerUploadId: "resource" }, now); recordUpload(state, { ...upload, outcome: "uncertain", providerUploadId: "resource" }, now);
    expect(state.intents[intentId]!.attempts[0]!.upload!.outcome).toBe("accepted"); expect(state.intents[intentId]!.state).toBe("processing");
    expect(() => recordUpload(state, { ...upload, outcome: "accepted", providerUploadId: "sibling" }, now)).toThrow("resource identity");
  });
  it("rejects wrong group/build, automatic distribution and empty membership receipts", () => {
    for (const mutate of [(o: ReturnType<typeof observation>) => { o.group.id = "other"; }, (o: ReturnType<typeof observation>) => { o.group.automaticDistribution = true; }, (o: ReturnType<typeof observation>) => { o.group.testerIds = []; }, (o: ReturnType<typeof observation>) => { o.buildNumber = "9"; }, (o: ReturnType<typeof observation>) => { o.betaState = "WAITING_FOR_REVIEW"; }]) {
      const { state, upload, intentId, attemptId } = prepared(); claimUpload(state, config(), upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); state.intents[intentId]!.attempts[0]!.artifactsVerifiedAt = now;
      const observed = observation(); mutate(observed); expect(() => deliver(state, intentId, attemptId, observed, now)).toThrow(); expect(state.cursors.staging).toBeUndefined();
    }
  });
  it("commits immutable exact receipt and cursor together, and refuses late regression", () => {
    const { state, upload, intentId, attemptId } = prepared(); claimUpload(state, config(), upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); state.intents[intentId]!.attempts[0]!.artifactsVerifiedAt = now;
    const receipt = deliver(state, intentId, attemptId, observation(), now); expect(state.cursors.staging).toEqual({ sourceSha: upload.sourceSha, order: 0, receiptId: intentId }); expect(receipt.ipaSha256).toBe(hash("ipa"));
    expect(deliver(state, intentId, attemptId, { ...observation(), betaState: "EXPIRED" }, after(now, 10))).toBe(receipt);
    const other = prepared(); other.state.cursors.staging = { sourceSha: "b".repeat(40), order: 1, receiptId: "newer" }; claimUpload(other.state, config(), other.upload, now); recordUpload(other.state, { ...other.upload, outcome: "accepted" }, now); other.state.intents[other.intentId]!.attempts[0]!.artifactsVerifiedAt = now;
    expect(() => claimGroup(other.state, other.intentId, other.attemptId, now)).toThrow("regress"); expect(() => deliver(other.state, other.intentId, other.attemptId, observation(), now)).toThrow("regress");
  });
  it("requires downloaded full-test evidence, beyond a passing local ingestion", () => {
    const { state, upload, intentId, attemptId } = prepared(); claimUpload(state, config(), upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); expect(() => deliver(state, intentId, attemptId, observation(), now)).toThrow("downloaded");
  });
  it("rechecks actual group progress and operator pause at final completion", () => {
    const { state, upload, intentId, attemptId } = prepared(); claimUpload(state, config(), upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); state.intents[intentId]!.attempts[0]!.artifactsVerifiedAt = now;
    state.groupCursors.staging = { sourceSha: "b".repeat(40), order: 1, receiptId: "manual-newer" };
    expect(() => claimGroup(state, intentId, attemptId, now)).toThrow("regress"); expect(() => deliver(state, intentId, attemptId, observation(), now)).toThrow("regress");
    delete state.groupCursors.staging; state.pauses.push({ scope: intentId, actor: "operator", reason: "Investigating", resumeCondition: "verified", human: true, createdAt: now });
    expect(() => deliver(state, intentId, attemptId, observation(), now)).toThrow("paused"); expect(state.intents[intentId]!.receipt).toBeUndefined();
  });
  it("keeps native reservations bounded across independent intents", () => {
    const { state } = prepared(); createIntent(state, config(), "production", state.sources[0]!, now, now); const production = Object.values(state.intents).find(item => item.channel === "production")!; planAttempt(state, config(), production.id, "c".repeat(40), "4", now);
    const validation = createIntent(state, config(), "staging", state.sources[0]!, now, now, true, undefined, "validation"); expect(() => planAttempt(state, config(), validation.id, "c".repeat(40), "8", now)).toThrow("capacity");
  });
});

describe("global budget and recovery work", () => {
  it("reserves exact liability at the cap and refuses a competing dollar", () => {
    const cfg = config(), state = newState(cfg, "e", now);
    reservePaid(state, cfg, "a", { maxOutputTokens: 100, maxAttempts: 1 }, 249_000_000); reservePaid(state, cfg, "b", { maxOutputTokens: 1, maxAttempts: 1 }, 1_000_000);
    expect(() => reservePaid(state, cfg, "c", {}, 1)).toThrow("exhausted");
    expect(() => reservePaid(state, cfg, "a", { maxOutputTokens: 200 }, 249_000_000)).toThrow("replay changed");
    settlePaid(state, "a", 2_000_000); settlePaid(state, "a", 2_000_000); expect(state.budget.spentMicros).toBe(2_000_000); expect(() => settlePaid(state, "a", 0)).toThrow("tombstone");
    reservePaid(state, cfg, "c", {}, 247_000_000); expect(state.budget.reservations.b!.status).toBe("reserved");
  });
  it("requires fresh real telemetry and tests exact admission/stop boundaries", () => {
    const snapshot = { source: "actual runtime", observedAt: now, windows: [{ id: "5h", usedPercent: 80, resetsAt: after(now, 60) }] };
    expect(quotaUsed(snapshot, now)).toBe(80); expect(quotaUsed(snapshot, after(now, 5))).toBe(80); expect(quotaUsed(snapshot, after(now, 5.001))).toBeUndefined(); expect(quotaUsed({ ...snapshot, windows: [] }, now)).toBeUndefined();
  });
  it("owns unknown failure and preserves previous independent strategies", () => {
    const { state, intentId } = prepared(); const first = repairWork(state, intentId, ["unknown failure"], now); expect(repairWork(state, intentId, ["again"], now)).toBe(first);
    state.agents[first]!.state = "complete"; const second = repairWork(state, intentId, ["different diagnosis"], now); expect(state.agents[second]!.strategy).toBe(2); expect(state.agents[second]!.task).toContain("unknown failure"); expect(state.intents[intentId]!.state).toBe("repairing");
  });
  it("resumes a proven operational repair without manufacturing an app PR", () => {
    const { state, intentId } = prepared(), intent = state.intents[intentId]!, attempt = intent.attempts[0]!; repairWork(state, intentId, ["runner interrupted"], now);
    expect(() => completeOperationalRepair(state, intentId, ["restored owned VM"], now)).toThrow("quiescence");
    attempt.quiescence = { kind: "host-terminated", ref: "owned VM terminal and restored", observedAt: now }; attempt.workflowTerminalAt = now;
    completeOperationalRepair(state, intentId, ["owned VM restored; native runner online"], now); expect(intent.state).toBe("pending"); expect(attempt.status).toBe("failed"); expect(intent.originalSource).toBe("a".repeat(40)); expect(intent.attempts).toHaveLength(1);
  });
  it("does not change configuration identity when observe mode becomes active", () => { const cfg = config(); expect(configurationDigest(cfg)).toBe(configurationDigest({ ...cfg, mode: "observe" })); });
  it("refuses unsupported or damaged durable state rather than empty reset", () => { expect(() => parseState({ schemaVersion: 2 })).toThrow("migration"); const { state, intentId } = prepared(); state.intents[intentId]!.state = "delivered"; expect(() => parseState(state)).toThrow("receipt"); });
});
