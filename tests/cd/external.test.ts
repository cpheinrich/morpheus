import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller, status } from "../../src/cd/controller.js";
import { ActionsAdapter } from "../../src/cd/actions.js";
import { AppleAdapter, AppleRequestError } from "../../src/cd/apple.js";
import { GitHubStore } from "../../src/cd/store.js";
import { loadSources } from "../../src/cd/source.js";
import { after, claimExternalReview, claimUpload, createIntent, deliver, externalReviewKey, planAttempt, recordTests, recordUpload } from "../../src/cd/state.js";
import { assertTransition } from "../../src/cd/invariants.js";
import { CdWait } from "../../src/cd/errors.js";
import { configSchema, configurationDigest, type CdState } from "../../src/cd/schema.js";
import { FakeGitHub } from "./fake-github.js";
import { config, externalObservation, now, observation, prepared, source } from "./fixtures.js";

vi.mock("../../src/cd/source.js", async original => ({ ...await original<typeof import("../../src/cd/source.js")>(), loadSources: vi.fn(), verifyValidator: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadSources).mockResolvedValue([source()]); });

async function harness(optIn = true, internallyDelivered = true, isolated = false, groups = ["external"], previousConfiguration = false, channel: "staging" | "production" = "staging") {
  const cfg = config(); if (optIn) cfg.channels[channel].externalGroupIds = groups;
  const qualifiedConfig = previousConfiguration ? config() : cfg;
  const fixture = prepared(channel, qualifiedConfig), intent = fixture.state.intents[fixture.intentId]!, attempt = intent.attempts[0]!;
  claimUpload(fixture.state, qualifiedConfig, fixture.upload, now); recordUpload(fixture.state, { ...fixture.upload, outcome: "accepted" }, now);
  attempt.artifactsVerifiedAt = now; fixture.state.evaluatedSlots = { staging: now, production: now };
  if (isolated) { intent.validation = true; intent.isolatedValidation = true; intent.groupId = "historical"; }
  if (internallyDelivered) deliver(fixture.state, fixture.intentId, fixture.attemptId, observation(cfg.channels[channel].appId, isolated ? "historical" : channel), now);
  fixture.state.configurationDigest = configurationDigest(cfg);
  const api = new FakeGitHub(), store = new GitHubStore(api, cfg);
  await store.initialize(now, "epoch"); await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  const apple = new AppleAdapter({ request: vi.fn() }), external = vi.spyOn(apple, "external").mockResolvedValue(externalObservation()), assign = vi.spyOn(apple, "assign").mockResolvedValue(), notify = vi.spyOn(apple, "notifyExternal").mockResolvedValue(), submit = vi.spyOn(apple, "submitReview").mockResolvedValue("submission");
  const actions = new ActionsAdapter(api, cfg), dispatch = vi.spyOn(actions, "dispatch").mockResolvedValue(), runs = vi.spyOn(actions, "runs").mockResolvedValue([]);
  return { ...fixture, cfg, store, apple, actions, external, assign, notify, submit, dispatch, runs, controller: new Controller(cfg, store, actions, apple, "/unused") };
}
const internal = (state: CdState) => ({ receipts: Object.fromEntries(Object.entries(state.intents).map(([id, intent]) => [id, { state: intent.state, receipt: intent.receipt, attempts: intent.attempts, lineage: intent.lineage, nextAction: intent.nextAction, nextCheckAt: intent.nextCheckAt }])), cursors: state.cursors, groupCursors: state.groupCursors, groupOperations: state.groupOperations, builds: state.builds, agents: state.agents, budget: state.budget });

describe("optional external distribution after immutable internal delivery", () => {
  it("preserves absent opt-in config bytes and makes no external calls", async () => {
    const h = await harness(false), before = (await h.store.read()).state;
    expect(Object.hasOwn(config().channels.staging, "externalGroupIds")).toBe(false);
    expect(configurationDigest(configSchema.parse(config()))).toBe("b71edea032bd39142b1cd27b61c211a9864e46f38f7d2d39463c89daf4f77127");
    await h.controller.tick(after(now, 5));
    expect(h.external).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(internal((await h.store.read()).state)).toEqual(internal(before));
  });
  it.each([[], ["external", "external"], ["staging"], ["historical"]].map(groups => ({ groups })))("rejects unsafe explicit external groups $groups", ({ groups }) => {
    const cfg = config(); cfg.channels.staging.externalGroupIds = groups; expect(configSchema.safeParse(cfg).success).toBe(false);
  });
  it("does not contact external providers before internal delivery", async () => {
    const h = await harness(true, false); await h.controller.tick(after(now, 5));
    expect(h.external).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
  });
  it("does not backfill receipts from before the explicit external opt-in", async () => {
    const h = await harness(true, true, false, ["external"], true), before = (await h.store.read()).state;
    expect(before.intents[h.intentId]!.receipt!.configurationDigest).not.toBe(configurationDigest(h.cfg));
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 10)); const state = (await h.store.read()).state;
    expect(h.external).not.toHaveBeenCalled(); expect(h.notify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(state.intents[h.intentId]!.external).toBeUndefined(); expect(internal(state)).toEqual(internal(before));
  });
  it("never exposes isolated historical validation binaries to ordinary external testers", async () => {
    const h = await harness(true, true, true); await h.controller.tick(after(now, 5));
    expect(h.external).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.external).toBeUndefined();
  });
  it("records exact external availability without changing any internal evidence or cursors", async () => {
    const h = await harness(), before = (await h.store.read()).state;
    h.external.mockResolvedValue({ ...externalObservation(), betaState: "IN_BETA_TESTING", review: { id: "submission", state: "APPROVED" } });
    await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(state.intents[h.intentId]!.external).toMatchObject({ status: "available", nextAction: "complete", observation: { buildId: "apple-build", review: { state: "APPROVED" } } });
    expect(internal(state)).toEqual(internal(before)); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(status(state, now)[0]).toMatchObject({ state: "delivered", external: { status: "available" } });
    await h.controller.tick(after(now, 10)); expect(h.external).toHaveBeenCalledTimes(1);
  });
  it("persists a single review claim before its POST, then waits for exact readback", async () => {
    const h = await harness(), before = (await h.store.read()).state;
    h.submit.mockImplementation(async () => { expect((await h.store.read()).state.externalReviews![externalReviewKey("123", "apple-build")]!.attempts).toEqual([{ claimedAt: after(now, 5), outcome: "claimed" }]); return "submission"; });
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 10));
    const state = (await h.store.read()).state; expect(h.submit).toHaveBeenCalledExactlyOnceWith("apple-build"); expect(state.intents[h.intentId]!.external!.status).toBe("waiting-review"); expect(internal(state)).toEqual(internal(before));
  });
  it("requires every external membership and shares a single review across groups", async () => {
    const h = await harness(true, true, false, ["external", "external-two"]), observed = externalObservation(), second = { ...observed.groups[0]!, id: "external-two" };
    h.external.mockResolvedValue({ ...observed, groups: [...observed.groups, { ...second, buildIds: [] }] });
    await h.controller.tick(after(now, 5)); expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "external-two"); expect(h.submit).not.toHaveBeenCalled();
    h.external.mockResolvedValue({ ...observed, groups: [...observed.groups, second] });
    await h.controller.tick(after(now, 10)); await h.controller.tick(after(now, 15)); expect(h.submit).toHaveBeenCalledExactlyOnceWith("apple-build");
    h.external.mockResolvedValue({ ...observed, betaState: "IN_BETA_TESTING", groups: [...observed.groups, second] });
    await h.controller.tick(after(now, 20)); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("available");
  });
  it("concurrent controllers cannot submit the exact build twice", async () => {
    const h = await harness(); await Promise.all([h.controller.tick(after(now, 5)), h.controller.tick(after(now, 5))]);
    expect(h.submit).toHaveBeenCalledExactlyOnceWith("apple-build"); expect((await h.store.read()).state.externalReviews![externalReviewKey("123", "apple-build")]!.attempts).toHaveLength(1);
  });
  it("reconciles a lost submission reply without repeating the POST", async () => {
    const h = await harness(), before = (await h.store.read()).state; h.submit.mockRejectedValue(new Error("lost network response"));
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 10));
    expect(h.submit).toHaveBeenCalledTimes(1); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("uncertain");
    h.external.mockResolvedValue({ ...externalObservation(), betaState: "WAITING_FOR_BETA_REVIEW", review: { id: "exact-submission", state: "WAITING_FOR_REVIEW" } });
    await h.controller.tick(after(now, 65)); const state = (await h.store.read()).state;
    expect(state.externalReviews![externalReviewKey("123", "apple-build")]!.attempts[0]).toEqual({ claimedAt: after(now, 5), outcome: "confirmed", completedAt: after(now, 65), submissionId: "exact-submission" }); expect(internal(state)).toEqual(internal(before)); expect(h.submit).toHaveBeenCalledTimes(1);
  });
  it("does not count a pending sibling review as this build's external availability", async () => {
    const h = await harness(); h.submit.mockRejectedValue(new AppleRequestError(409, "another build is in review"));
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 60));
    expect(h.submit).toHaveBeenCalledTimes(1); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("waiting-review");
    await h.controller.tick(after(now, 65)); expect(h.submit).toHaveBeenCalledTimes(2);
    expect((await h.store.read()).state.externalReviews![externalReviewKey("123", "apple-build")]!.attempts.map(attempt => attempt.outcome)).toEqual(["conflict", "conflict"]);
  });
  it("never reposts rejected metadata or permission requests unchanged", async () => {
    const h = await harness(), before = (await h.store.read()).state; h.submit.mockRejectedValue(new AppleRequestError(400, "missing beta review metadata"));
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 65));
    const state = (await h.store.read()).state; expect(h.submit).toHaveBeenCalledTimes(1); expect(state.externalReviews![externalReviewKey("123", "apple-build")]!.attempts[0]!.outcome).toBe("rejected"); expect(internal(state)).toEqual(internal(before));
  });
  it("adds missing membership to the same binary and preserves a newer group build", async () => {
    const h = await harness(), observed = externalObservation(); observed.groups[0]!.buildIds = ["newer-build"]; h.external.mockResolvedValue(observed);
    h.assign.mockRejectedValueOnce(new CdWait("lost group reply", "apple-network")); await h.controller.tick(after(now, 5));
    h.external.mockResolvedValue({ ...externalObservation(), betaState: "IN_BETA_TESTING", groups: [{ ...observed.groups[0]!, buildIds: ["newer-build", "apple-build"] }] });
    await h.controller.tick(after(now, 10)); expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "external"); expect(h.submit).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("available"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("claims auto-notify before setting it and requires fresh state before submitting", async () => {
    const h = await harness(); h.external.mockResolvedValue({ ...externalObservation(), autoNotifyEnabled: false });
    h.notify.mockImplementation(async () => { expect(Object.keys((await h.store.read()).state.transitions).some(key => key.startsWith("external-setting-"))).toBe(true); });
    await h.controller.tick(after(now, 5)); expect(h.notify).toHaveBeenCalledExactlyOnceWith("detail"); expect(h.submit).not.toHaveBeenCalled();
    h.external.mockResolvedValue(externalObservation()); await h.controller.tick(after(now, 10)); expect(h.submit).toHaveBeenCalledTimes(1);
  });
  it.each([
    { ...externalObservation(), buildId: "sibling" },
    { ...externalObservation(), appId: "wrong" },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, id: "wrong" }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, internal: true }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, testerIds: [""] }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, testerIds: ["   "] }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, testerIds: [null as unknown as string] }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, testerIds: undefined as unknown as string[] }] },
    { ...externalObservation(), groups: [{ ...externalObservation().groups[0]!, automaticDistribution: true }] },
  ])("refuses substituted or unsafe provider evidence %#", async observed => {
    const h = await harness(), before = (await h.store.read()).state; h.external.mockResolvedValue(observed);
    expect((await h.controller.tick(after(now, 5))).errors).toHaveLength(1); expect(h.submit).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.notify).not.toHaveBeenCalled(); expect(internal((await h.store.read()).state)).toEqual(internal(before));
  });
  it.each((["staging", "production"] as const).flatMap(channel => ["READY_FOR_BETA_SUBMISSION", "IN_BETA_TESTING"].map(betaState => ({ channel, betaState }))))("waits without errors or mutations for zero $channel testers in $betaState", async ({ channel, betaState }) => {
    const h = await harness(true, true, false, ["external"], false, channel), before = (await h.store.read()).state, observed = externalObservation(), appId = h.cfg.channels[channel].appId;
    h.external.mockResolvedValue({ ...observed, appId, betaState, autoNotifyEnabled: false, groups: [{ ...observed.groups[0]!, appId, testerIds: [], buildIds: betaState === "IN_BETA_TESTING" ? ["apple-build"] : [] }] });
    expect((await h.controller.tick(after(now, 5))).errors).toEqual([]);
    const state = (await h.store.read()).state;
    expect(state.intents[h.intentId]!.external).toMatchObject({ status: "pending", nextAction: "wait-external-testers", nextCheckAt: after(now, 5 + h.cfg.deadlines.pollMinutes), observation: { groups: [{ testerIds: [] }] } });
    expect(internal(state)).toEqual(internal(before)); expect(state.externalReviews).toEqual(before.externalReviews);
    expect(h.notify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 5 + h.cfg.deadlines.pollMinutes - 0.001)); expect(h.external).toHaveBeenCalledTimes(1);
    expect((await h.controller.tick(after(now, 5 + h.cfg.deadlines.pollMinutes))).errors).toEqual([]); expect(h.external).toHaveBeenCalledTimes(2);
  });
  it("retains an uncertain exact-build review claim while testers are empty", async () => {
    const h = await harness(), observed = externalObservation();
    await h.store.transact("review-before-empty", "fixture", now, state => claimExternalReview(state, h.intentId, now));
    const before = (await h.store.read()).state;
    h.external.mockResolvedValue({ ...observed, groups: [{ ...observed.groups[0]!, testerIds: [] }] });
    await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(state.externalReviews).toEqual(before.externalReviews); expect(internal(state)).toEqual(internal(before)); expect(h.submit).not.toHaveBeenCalled();
  });
  it("waits for every configured group's testers, then resumes existing once-only review", async () => {
    const h = await harness(true, true, false, ["external", "external-two"]), observed = externalObservation(), second = { ...observed.groups[0]!, id: "external-two" };
    const before = (await h.store.read()).state;
    h.external.mockResolvedValue({ ...observed, groups: [...observed.groups, { ...second, testerIds: [], buildIds: [] }] });
    await h.controller.tick(after(now, 5)); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
    h.external.mockResolvedValue({ ...observed, groups: [...observed.groups, { ...second, testerIds: ["member"], buildIds: [] }] });
    await h.controller.tick(after(now, 10)); expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "external-two");
    h.external.mockResolvedValue({ ...observed, groups: [...observed.groups, second] });
    await h.controller.tick(after(now, 15)); await h.controller.tick(after(now, 20)); expect(h.submit).toHaveBeenCalledExactlyOnceWith("apple-build");
    h.external.mockResolvedValue({ ...observed, betaState: "IN_BETA_TESTING", groups: [...observed.groups, second] });
    await h.controller.tick(after(now, 25));
    expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("available"); expect(internal((await h.store.read()).state)).toEqual(internal(before));
  });
  it.each([
    { processingState: "PROCESSING", betaState: "READY_FOR_BETA_SUBMISSION" },
    { processingState: "VALID", betaState: "EXPIRED" },
    { processingState: "VALID", betaState: "NEW_UNKNOWN_STATE" },
    { processingState: "VALID", betaState: "BETA_REJECTED", review: { id: "rejected", state: "REJECTED" } },
  ])("does not hide unsafe build state behind an empty tester list %#", async buildState => {
    const h = await harness(), observed = externalObservation(); h.external.mockResolvedValue({ ...observed, ...buildState, groups: [{ ...observed.groups[0]!, testerIds: [] }] });
    expect((await h.controller.tick(after(now, 5))).errors).toEqual([]);
    expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("blocked");
    expect(h.notify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
  });
  it.each([
    { appId: "wrong" }, { internal: true }, { automaticDistribution: true },
  ])("does not let empty testers bypass unsafe group evidence %#", async unsafe => {
    const h = await harness(), observed = externalObservation(); h.external.mockResolvedValue({ ...observed, groups: [{ ...observed.groups[0]!, ...unsafe, testerIds: [] }] });
    expect((await h.controller.tick(after(now, 5))).errors).toHaveLength(1);
    expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("blocked");
    expect(h.notify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
  });
  it("keeps rejection external and never reopens internal repair or build work", async () => {
    const h = await harness(), before = (await h.store.read()).state; h.external.mockResolvedValue({ ...externalObservation(), betaState: "BETA_REJECTED", review: { id: "submission", state: "REJECTED" } });
    await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state; expect(state.intents[h.intentId]!.external!.status).toBe("blocked"); expect(internal(state)).toEqual(internal(before)); expect(h.submit).not.toHaveBeenCalled();
  });
  it("stops observing expired builds and bounds rejected submissions to daily readback", async () => {
    const expired = await harness(); expired.external.mockResolvedValue({ ...externalObservation(), betaState: "EXPIRED" });
    await expired.controller.tick(after(now, 5)); await expired.controller.tick(after(now, 65)); await expired.controller.tick(after(now, 1445));
    expect(expired.external).toHaveBeenCalledTimes(1); expect((await expired.store.read()).state.intents[expired.intentId]!.external).toMatchObject({ status: "blocked", terminal: true });
    const rejected = await harness(); rejected.submit.mockRejectedValue(new AppleRequestError(400, "metadata missing"));
    await rejected.controller.tick(after(now, 5)); await rejected.controller.tick(after(now, 65)); await rejected.controller.tick(after(now, 1444));
    expect(rejected.external).toHaveBeenCalledTimes(1); expect((await rejected.store.read()).state.intents[rejected.intentId]!.external!.nextCheckAt).toBe(after(now, 1445));
    await rejected.controller.tick(after(now, 1445)); expect(rejected.external).toHaveBeenCalledTimes(2); expect(rejected.submit).toHaveBeenCalledTimes(1); expect((await rejected.store.read()).state.intents[rejected.intentId]!.state).toBe("delivered");
  });
  it("reconciles internal work first and bounds external backlog per invocation", async () => {
    const h = await harness(), events: string[] = [];
    await h.store.transact("more-deliveries", "fixture", now, state => {
      for (let index = 0; index < 2; index++) {
        const intent = createIntent(state, h.cfg, "staging", state.sources[0]!, now, now, true, undefined, `extra-${index}`), attempt = planAttempt(state, h.cfg, intent.id, "c".repeat(40), "8", now);
        const identity = { intentId: intent.id, attemptId: attempt.id, dispatchEffectId: attempt.dispatchEffectId, runId: String(101 + index), runAttempt: "1" };
        recordTests(state, h.cfg, { ...h.tests, ...identity });
        const upload = { ...h.upload, ...identity, buildNumber: attempt.buildNumber };
        claimUpload(state, h.cfg, upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); attempt.artifactsVerifiedAt = now;
        const observed = { ...observation(), buildNumber: attempt.buildNumber, buildId: `build-${index}`, group: { ...observation().group, buildIds: [`build-${index}`] } }; deliver(state, intent.id, attempt.id, observed, now);
      }
      createIntent(state, h.cfg, "production", state.sources[0]!, now, now); return null;
    });
    vi.spyOn(h.apple, "maximum").mockImplementation(async () => { events.push("internal"); return "42"; });
    h.external.mockImplementation(async receipt => { events.push("external"); const identity = receipt.observation; return { ...externalObservation(), ...identity, betaState: "IN_BETA_TESTING", groups: [{ ...externalObservation().groups[0]!, buildIds: [identity.buildId] }] }; });
    await h.controller.tick(after(now, 5)); expect(events).toEqual(["internal", "external", "external"]); expect(h.external).toHaveBeenCalledTimes(2);
    await h.controller.tick(after(now, 5)); expect(h.external).toHaveBeenCalledTimes(3);
  });
  it("does not mutate providers on an unknown external state", async () => {
    const h = await harness(); h.external.mockResolvedValue({ ...externalObservation(), betaState: "NEW_UNKNOWN_STATE", autoNotifyEnabled: false });
    await h.controller.tick(after(now, 5)); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("blocked"); expect(h.notify).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
  });
  it("observation mode and pauses do not call external providers", async () => {
    const h = await harness(), before = (await h.store.read()).head; await h.controller.tick(after(now, 5), true); expect((await h.store.read()).head).toBe(before);
    await h.store.transact("pause", "operator-pause", now, state => { state.pauses.push({ scope: "staging", actor: "human", human: true, reason: "pause", resumeCondition: "resume", createdAt: now }); return null; });
    await h.controller.tick(after(now, 5)); expect(h.external).not.toHaveBeenCalled(); expect(h.submit).not.toHaveBeenCalled();
  });
  it("rechecks an operator pause committed after external readback before mutation", async () => {
    const h = await harness(); h.external.mockImplementation(async () => { await h.store.transact("late-pause", "operator-pause", now, state => { state.pauses.push({ scope: "all", actor: "human", human: true, reason: "pause", resumeCondition: "resume", createdAt: now }); return null; }); return externalObservation(); });
    await h.controller.tick(after(now, 5)); expect(h.submit).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
  });
});

describe("durable exact-build review operation invariants", () => {
  it("shares one claim across groups/intents and preserves its unknown liability", async () => {
    const h = await harness(), state = (await h.store.read()).state, before = structuredClone(state);
    expect(claimExternalReview(state, h.intentId, now).claimed).toBe(true); expect(claimExternalReview(state, h.intentId, after(now, 1440)).claimed).toBe(false);
    const changed = structuredClone(state); delete changed.externalReviews; expect(() => assertTransition(state, changed)).toThrow("cannot be deleted");
    const substituted = structuredClone(state); substituted.externalReviews![externalReviewKey("123", "apple-build")]!.buildId = "sibling"; expect(() => assertTransition(state, substituted)).toThrow("binding");
    const retimed = structuredClone(state); retimed.externalReviews![externalReviewKey("123", "apple-build")]!.attempts[0]!.claimedAt = after(now, 1); expect(() => assertTransition(state, retimed)).toThrow("time is immutable");
    expect(internal(state)).toEqual(internal(before));
  });
  it("keeps completed operation history and committed external availability immutable", async () => {
    const h = await harness(); h.external.mockResolvedValue({ ...externalObservation(), betaState: "IN_BETA_TESTING" }); await h.controller.tick(after(now, 5));
    const state = (await h.store.read()).state, changed = structuredClone(state); changed.intents[h.intentId]!.external!.status = "pending"; expect(() => assertTransition(state, changed)).toThrow("availability evidence is immutable");
    const claimState = (await (await harness()).store.read()).state; claimExternalReview(claimState, h.intentId, now); const operation = claimState.externalReviews![externalReviewKey("123", "apple-build")]!.attempts[0]!; operation.outcome = "confirmed"; operation.submissionId = "review"; operation.completedAt = now;
    const rewritten = structuredClone(claimState); rewritten.externalReviews![externalReviewKey("123", "apple-build")]!.attempts[0]!.outcome = "conflict"; expect(() => assertTransition(claimState, rewritten)).toThrow("Completed external review operation is immutable");
  });
  it("limits all app review claims and tests the exact 24-hour boundary", async () => {
    const h = await harness(), state = (await h.store.read()).state;
    state.externalReviews = Object.fromEntries(Array.from({ length: 6 }, (_, index) => [externalReviewKey("123", String(index)), { appId: "123", buildId: String(index), attempts: [{ claimedAt: now, outcome: "confirmed" as const, completedAt: now }] }]));
    expect(() => claimExternalReview(state, h.intentId, after(now, 1439))).toThrow("six claims");
    expect(claimExternalReview(state, h.intentId, after(now, 1440)).claimed).toBe(true);
  });
});
