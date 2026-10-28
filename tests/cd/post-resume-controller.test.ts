import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "../../src/cd/controller.js";
import { ActionsAdapter, type WorkflowRun } from "../../src/cd/actions.js";
import { AppleAdapter, AppleHttp } from "../../src/cd/apple.js";
import { GitHubStore, GhApi } from "../../src/cd/store.js";
import { loadSources, verifyValidator } from "../../src/cd/source.js";
import { hash, type CdConfig, type Attempt } from "../../src/cd/schema.js";
import { after, assertPostResumeAdmission, claimGroup, createIntent, claimUpload, deliver, occupiesNative, planAttempt, recordTests, recordUpload, postResumeExecutionFingerprint, postResumeFingerprint as importFingerprint, postResumeAcceptance, qualifyPostResumeAcceptance, releasePostResumeExecution, yieldPostResumeAttempt } from "../../src/cd/state.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, observation, prepared, source } from "./fixtures.js";
import { optionalFixture } from "./post-resume-fixtures.js";
import { verifyExecution, verifyExecutionProvenance, cd } from "../../src/cd/cli.js";

vi.mock("../../src/cd/source.js", async original => ({ ...await original<typeof import("../../src/cd/source.js")>(), loadSources: vi.fn(), verifyValidator: vi.fn(), verifySource: vi.fn(), verifyConfiguration: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadSources).mockResolvedValue([source(), source("b", 1)]); vi.mocked(verifyValidator).mockImplementation(() => {}); });
async function harness(upload = true, cfg?: CdConfig) {
  const f = optionalFixture(upload, cfg), api = new FakeGitHub(), original = api.request.bind(api);
  api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => path.endsWith("/commits/main") ? { sha: "c".repeat(40) } as T : original<T>(method, path, body);
  f.state.intents[f.intentId]!.nextCheckAt = now;
  const store = new GitHubStore(api, f.cfg); await store.initialize(now, "epoch");
  await store.transact("seed", "synthetic-fixture", now, state => { Object.assign(state, { ...f.state, transitions: state.transitions }); return null; });
  const actions = new ActionsAdapter(api, f.cfg), run: WorkflowRun = { id: 100, run_attempt: 1, status: "completed", conclusion: "success", head_sha: "c".repeat(40), event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${f.attempt.dispatchEffectId}`, created_at: now, updated_at: now };
  vi.spyOn(actions, "runs").mockResolvedValue([run]); vi.spyOn(actions, "verifyRun").mockImplementation(() => {});
  vi.spyOn(actions, "evidence").mockResolvedValue({ tests: upload ? [f.tests] : [], uploads: [], failures: [] });
  const dispatch = vi.spyOn(actions, "dispatch").mockResolvedValue(), cancel = vi.spyOn(actions, "cancel").mockResolvedValue();
  const apple = new AppleAdapter({ request: vi.fn() }), observe = vi.spyOn(apple, "observe").mockResolvedValue({}), assign = vi.spyOn(apple, "assign").mockResolvedValue(); vi.spyOn(apple, "maximum").mockResolvedValue("8");
  let clock = now; const setClock = (value: string) => { clock = value; };
  const controller = new Controller(f.cfg, store, actions, apple, "/unused", () => clock);
  return { ...f, api, store, actions, run, apple, observe, assign, dispatch, cancel, controller, setClock };
}
function direct(h: Awaited<ReturnType<typeof harness>>) { return h.controller as unknown as { dispatch(intentId: string, channel: string, attempt: Attempt, now: string, suffix?: string): Promise<void>; reconcileIntent(intent: import("../../src/cd/schema.js").DeliveryIntent, now: string): Promise<void>; reconcileUpload(intentId: string, attempt: Attempt, run: WorkflowRun, now: string): Promise<void> }; }
async function release(h: Awaited<ReturnType<typeof harness>>) {
  await h.store.transact("release", "synthetic-authenticated-quiescence", now, state => {
    const a = state.intents[h.intentId]!.attempts[0]!; a.workflowTerminalAt = now; a.quiescence = { kind: "host-terminated", ref: "synthetic:verified-owned-executor-gone", observedAt: now };
    releasePostResumeExecution(state, h.identity, { fingerprint: postResumeExecutionFingerprint(state, h.identity), qualifiedAt: now, expiresAt: after(now, 5), quiescenceDigest: hash(a.quiescence), authorityClosureDigest: hash("actual-closed-actors"), evidenceRef: "synthetic:closed-execution-proof" }, now); return null;
  });
}
describe("post-resume actual controller and Store seams", () => {
  it("preserves the same protected active upload over MANY timeout polls/diagnosis, then recovers one real receipt without another upload", async () => {
    const h = await harness(); await release(h); const before = (await h.store.read()).state;
    for (const minute of [31, 62, 93, 124]) { const time = after(now, minute); h.setClock(time); const tick = await h.controller.tick(time); expect(tick.errors).toEqual([]); }
    let state = (await h.store.read()).state, a = state.intents[h.intentId]!.attempts[0]!;
    expect({ status: a.status, build: a.buildNumber, source: a.sourceSha, upload: a.upload }).toEqual({ status: "active", build: "8", source: source("b", 1).sha, upload: before.intents[h.intentId]!.attempts[0]!.upload });
    expect(state.agents).toEqual({}); expect(state.intents[h.intentId]!.attempts).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled();
    h.observe.mockResolvedValue({ observation: observation() }); h.setClock(after(now, 130)); const recovered = await h.controller.tick(after(now, 130)); expect(recovered.errors).toEqual([]);
    state = (await h.store.read()).state; expect(state.intents[h.intentId]!.receipt).toMatchObject({ attemptId: h.attemptId, observation: { buildNumber: "8" }, sourceSha: source("b", 1).sha, ipaSha256: h.upload.ipaSha256 }); expect(h.assign).not.toHaveBeenCalled(); expect(state.cursors).toEqual(before.cursors);
  });
  it("retains old retired-uncertain late appearance as observation-only", async () => {
    const h = await harness();
    // Old, untyped validation lineage remains under its original behavior.
    await h.store.transact("legacy", "synthetic-legacy-retired", now, state => { const old = structuredClone(state.intents[h.intentId]!); old.id = "legacy"; delete old.postResumeKey; old.attempts[0]!.id = "legacy-a1"; old.attempts[0]!.status = "retired-uncertain"; old.state = "paused"; state.intents.legacy = old; return null; });
    h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(now);
    const state = (await h.store.read()).state; expect(state.intents.legacy!.attempts[0]!.status).toBe("retired-uncertain"); expect(state.intents.legacy!.receipt).toBeUndefined(); expect(state.intents.legacy!.attempts[0]!.uploadObservations!.at(-1)!.buildId).toBe("apple-build");
  });
  it("stale direct dispatch and late before-upload authority cannot revive a yielded attempt", async () => {
    const h = await harness(false), stale = structuredClone(h.attempt);
    await h.store.transact("yield", "yield-post-resume", now, state => { yieldPostResumeAttempt(state, h.intentId, h.attemptId, now); return null; });
    await expect(direct(h).dispatch(h.intentId, "staging", stale, now)).rejects.toThrow("Yielded/released"); expect(h.dispatch).not.toHaveBeenCalled();
    const final = (await h.store.read()).state; expect(final.intents[h.intentId]!.attempts[0]!.dispatch.state).toBe("intended");
  });
  it("does not invent an optional cancellation operation for duplicates or an overdue live native executor", async () => {
    const duplicate = await harness(); vi.mocked(duplicate.actions.runs).mockResolvedValue([duplicate.run, { ...duplicate.run, id: 101, status: "in_progress", conclusion: null }]);
    const first = await duplicate.controller.tick(now); expect(first.errors[0]!.message).toContain("no automatic cancellation"); expect(duplicate.cancel).not.toHaveBeenCalled();
    const h = await harness(false), original = h.api.request.bind(h.api); h.run.status = "in_progress"; h.run.conclusion = null;
    h.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => path.includes("/jobs?") ? { total_count: 1, jobs: [{ id: 1, run_id: 100, run_attempt: 1, head_sha: "c".repeat(40), status: "in_progress", conclusion: null, started_at: now, completed_at: null, labels: ["self-hosted"], runner_id: 1, runner_name: "synthetic-owned-vm", steps: [{ status: "in_progress", conclusion: null }] }] } as T : original<T>(method, path, body);
    h.setClock(after(now, 181)); const overdue = await h.controller.tick(after(now, 181));
    expect(overdue.errors[0]!.message).toContain("no automatic cancellation or replacement"); expect(h.cancel).not.toHaveBeenCalled(); const final = (await h.store.read()).state; expect(final.intents[h.intentId]!.attempts[0]!.status).toBe("active"); expect(final.agents).toEqual({});
  });
  it("one successful dispatch claim linearizes; uncertainty never enters optional retry or a later yield", async () => {
    const h = await harness(false); h.dispatch.mockRejectedValue(new Error("synthetic lost dispatch reply"));
    await expect(direct(h).dispatch(h.intentId, "staging", h.attempt, now)).rejects.toThrow("lost dispatch");
    await expect(direct(h).dispatch(h.intentId, "staging", h.attempt, now, "retry-1")).rejects.toThrow("cannot retry");
    await expect(h.store.transact("invalid-yield", "yield", now, state => yieldPostResumeAttempt(state, h.intentId, h.attemptId, now))).rejects.toThrow("Possible dispatch");
    expect(h.dispatch).toHaveBeenCalledTimes(1);
  });
  it.each(["expiry", "due-slot"])("fresh injected clock inside CAS retry rejects a time-only %s race", async kind => {
    const h = await harness(false), original = h.api.request.bind(h.api); let raced = false;
    if (kind === "due-slot") {
      await h.store.transact("long-qualified", "synthetic-window", now, state => { qualifyPostResumeAcceptance(state, h.intentId, { ...h.qualification, expiresAt: after(now, 600), executionDeadlineAt: after(now, 600) }, now); return null; });
      h.setClock(after(now, 359));
    }
    h.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (!raced && method === "PATCH" && path.endsWith("git/refs/heads/morpheus-cd-state")) {
        raced = true; await h.store.transact("unrelated-racer", "synthetic-contender", now, state => { state.budget.telemetry.racer = { observedAt: now, source: "unrelated", windows: [] }; return null; });
        h.setClock(kind === "expiry" ? h.qualification.expiresAt : after(now, 360));
      }
      return original<T>(method, path, body);
    };
    await expect(direct(h).dispatch(h.intentId, "staging", h.attempt, now)).rejects.toThrow(kind === "expiry" ? "expired" : "priority");
    expect(h.dispatch).not.toHaveBeenCalled(); const final = (await h.store.read()).state;
    expect(final.transitions[`dispatch-call-${h.attemptId}-initial`]).toBeUndefined(); expect(final.intents[h.intentId]!.attempts[0]!.dispatch.state).toBe("intended");
  });
  it("ordinary internal dispatch precedes optional and late observations; ordinary arrival yields only the zero-effect optional plan", async () => {
    const h = await harness(false), trace: string[] = [];
    await h.store.transact("ordinary", "synthetic-due-ordinary", now, state => { createIntent(state, h.cfg, "production", state.sources[0]!, now, now); return null; });
    await h.store.transact("legacy-late", "synthetic-retired-obligation", now, state => { const legacy = structuredClone(state.intents[h.intentId]!); legacy.id = "legacy-retired"; delete legacy.postResumeKey; legacy.state = "paused"; legacy.attempts[0]!.status = "retired-uncertain"; state.intents[legacy.id] = legacy; return null; });
    h.dispatch.mockImplementation(async () => { trace.push("ordinary-dispatch"); }); h.observe.mockImplementation(async () => { trace.push("late-observation"); return {}; });
    const ordered = await h.controller.tick(now); expect(ordered.errors).toEqual([]);
    const state = (await h.store.read()).state; expect(h.dispatch).toHaveBeenCalledTimes(1); expect(trace).toEqual(["ordinary-dispatch", "late-observation"]);
    expect(postResumeAcceptance(state, state.intents[h.intentId]!)!.yielded).toEqual({ attemptId: h.attemptId, at: now });
  });
  it("B has one stable fresh claim owner under concurrent reconciliation and lost state-write acknowledgment", async () => {
    const h = await harness(), original = h.api.request.bind(h.api); const absent = observation(); absent.group.buildIds = [];
    h.observe.mockResolvedValue({ observation: absent });
    h.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (method === "POST" && path.endsWith("/git/commits") && String((body as { message?: string })?.message).includes("claim-post-resume-membership")) h.api.loseNextAcknowledgment = true;
      return original<T>(method, path, body);
    };
    await Promise.all([direct(h).reconcileUpload(h.intentId, h.attempt, h.run, now), direct(h).reconcileUpload(h.intentId, h.attempt, h.run, now)]);
    expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "staging");
    const final = (await h.store.read()).state, groups = postResumeAcceptance(final, final.intents[h.intentId]!)!.groups;
    expect(Object.keys(groups)).toHaveLength(1); expect(final.groupOperations).toEqual({});
  });
  it("B UNKNOWN plus absent readback remains read-only; later positive membership recovers with no repeated POST", async () => {
    const h = await harness(), absent = observation(); absent.group.buildIds = []; h.observe.mockResolvedValue({ observation: absent }); h.assign.mockRejectedValue(new Error("synthetic lost POST reply"));
    const claimed = await h.controller.tick(now); expect(claimed.errors).toEqual([{ intentId: h.intentId, message: "synthetic lost POST reply" }]); expect(h.assign).toHaveBeenCalledTimes(1);
    for (const minute of [5, 10, 15]) { h.setClock(after(now, minute)); await h.controller.tick(after(now, minute)); }
    expect(h.assign).toHaveBeenCalledTimes(1);
    h.observe.mockResolvedValue({ observation: observation() }); h.setClock(after(now, 20)); await h.controller.tick(after(now, 20));
    const final = (await h.store.read()).state; expect(final.intents[h.intentId]!.receipt!.observation.buildId).toBe("apple-build");
    expect(Object.values(postResumeAcceptance(final, final.intents[h.intentId]!)!.groups)[0]!.observedAt).toBe(after(now, 20)); expect(h.assign).toHaveBeenCalledTimes(1);
  });
  it("retains both exact memberships when an optional reply is lost and a normal ordinary add follows", async () => {
    const h = await harness(), members = new Set<string>();
    h.observe.mockImplementation(async () => { const current = observation(); current.group.buildIds = [...members]; return { observation: current }; });
    h.assign.mockImplementation(async (build, group) => { expect(group).toBe("staging"); members.add(build); if (build === "apple-build") throw new Error("synthetic withheld reply after additive success"); });
    await h.controller.tick(now); expect(members).toEqual(new Set(["apple-build"]));
    await h.store.transact("ordinary-add", "synthetic-normal-ordinary-group-claim", now, state => { const i = createIntent(state, h.cfg, "staging", state.sources[1]!, now, now), a = structuredClone(state.intents[h.intentId]!.attempts[0]!); a.id = `${i.id}-a1`; i.attempts.push(a); claimGroup(state, i.id, a.id, now); return null; });
    const before = (await h.store.read()).state; await h.apple.assign("ordinary-build", "staging");
    h.setClock(after(now, 5)); await expect(direct(h).reconcileUpload(h.intentId, h.attempt, h.run, after(now, 5))).rejects.toThrow("priority");
    expect(members).toEqual(new Set(["apple-build", "ordinary-build"])); expect(h.assign).toHaveBeenCalledTimes(2);
    expect((await h.store.read()).state.groupOperations).toEqual(before.groupOperations);
  });
  it("ordinary group fence and newer cursor remain independent from an old optional additive obligation", async () => {
    const h = await harness(), absent = observation(); absent.group.buildIds = []; h.observe.mockResolvedValue({ observation: absent }); await h.controller.tick(now);
    await h.store.transact("ordinary-newer", "synthetic-newer-ordinary", now, state => { state.sources.push(source("d", 2)); const i = createIntent(state, h.cfg, "staging", state.sources[2]!, now, now); const a = structuredClone(state.intents[h.intentId]!.attempts[0]!); a.id = `${i.id}-a1`; a.sourceSha = state.sources[2]!.sha; a.upload!.acceptedAt = now; i.attempts.push(a); claimGroup(state, i.id, a.id, now); state.cursors.staging = { sourceSha: a.sourceSha, order: 2, receiptId: "newer-receipt" }; return null; });
    const before = (await h.store.read()).state; h.observe.mockResolvedValue({ observation: observation() }); h.setClock(after(now, 5));
    await expect(direct(h).reconcileUpload(h.intentId, h.attempt, h.run, after(now, 5))).rejects.toThrow(/priority|differs|regress/);
    const final = (await h.store.read()).state; expect(final.groupOperations).toEqual(before.groupOperations); expect(final.cursors).toEqual(before.cursors); expect(final.intents[h.intentId]!.receipt).toBeUndefined(); expect(h.assign).toHaveBeenCalledTimes(1);
  });
});
describe("finite optional Apple reads", () => {
  it("bounds pagination by exact call count without changing normal API behavior", async () => {
    const request = vi.fn(async () => ({ data: [], links: { next: "/another" } }));
    const adapter = new AppleAdapter({ request: request as never });
    await expect(adapter.maximum("123", "1.0", { maximumRequests: 1, timeoutMs: 100 })).rejects.toThrow("budget exhausted"); expect(request).toHaveBeenCalledTimes(1);
  });
  it("bounds a stalled read by an abortable whole-observation deadline", async () => {
    let signal: AbortSignal | undefined;
    const adapter = new AppleAdapter({ request: async <T>(_method: string, _path: string, _body?: unknown, current?: AbortSignal): Promise<T> => { signal = current; return new Promise<T>(() => {}); } });
    await expect(adapter.maximum("123", "1.0", { maximumRequests: 2, timeoutMs: 5 })).rejects.toThrow("deadline reached"); expect(signal?.aborted).toBe(true);
  });
});

describe("optional Actions read completeness and abort budgets", () => {
  it("never treats a page-limited workflow sweep as an empty census or permission to dispatch", async () => {
    const h = await harness(false), original = h.api.request.bind(h.api); vi.mocked(h.actions.runs).mockRestore(); let pages = 0;
    h.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (path.includes("/actions/workflows/") && path.includes("/runs?")) { pages++; return { workflow_runs: Array.from({ length: 100 }, (_v, i) => ({ ...h.run, id: pages * 100 + i, display_title: "unrelated-effect" })) } as T; }
      return original<T>(method, path, body);
    };
    const result = await h.controller.tick(now); expect(result.errors[0]!.message).toContain("budget exhausted"); expect(pages).toBe(8); expect(h.dispatch).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.attempts).toHaveLength(1);
  });
  it.each([0, 1, 2])("completes an exact one-request census of %i rows with no truncation", async count => {
    const f = optionalFixture(), request = vi.fn(async () => ({ workflow_runs: Array.from({ length: count }, () => ({ display_title: `CD ${f.attempt.dispatchEffectId}` })) }));
    const actions = new ActionsAdapter({ request: request as never }, f.cfg);
    expect(await actions.runs(f.attempt.dispatchEffectId, undefined, { maximumRequests: 1, timeoutMs: 100 })).toHaveLength(count); expect(request).toHaveBeenCalledTimes(1);
  });
  it("aborts a stalled Actions request rather than returning an empty result", async () => {
    const f = optionalFixture(); let signal: AbortSignal | undefined;
    const actions = new ActionsAdapter({ request: async <T>(_m: string, _p: string, _b?: unknown, current?: AbortSignal): Promise<T> => { signal = current; return new Promise<T>(() => {}); } }, f.cfg);
    await expect(actions.runs(f.attempt.dispatchEffectId, undefined, { maximumRequests: 1, timeoutMs: 5 })).rejects.toThrow("deadline reached"); expect(signal?.aborted).toBe(true);
  });
  it("admits exactly four bounded artifact downloads using only a hermetic fake gh executable", async () => {
    const f = optionalFixture(), request = vi.fn(async () => ({ artifacts: Array.from({ length: 4 }, (_v, i) => ({ id: i + 1, name: `cd-v2-${i}`, expired: false })) }));
    const actions = new ActionsAdapter({ request: request as never }, f.cfg), directory = await mkdtemp(join(tmpdir(), "post-resume-fake-tools-")), marker = join(directory, "calls");
    await writeFile(join(directory, "gh"), '#!/bin/sh\nprintf x >> "$POST_RESUME_TEST_DOWNLOADS"\n', { mode: 0o700 });
    const previous = process.env.PATH, previousMarker = process.env.POST_RESUME_TEST_DOWNLOADS; process.env.PATH = directory; process.env.POST_RESUME_TEST_DOWNLOADS = marker;
    const run: WorkflowRun = { id: 100, run_attempt: 1, status: "completed", conclusion: "success", head_sha: f.attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${f.attempt.dispatchEffectId}`, created_at: now, updated_at: now };
    try { expect(await actions.evidence(run, f.attempt, { maximumRequests: 1, timeoutMs: 3000 })).toEqual({ tests: [], uploads: [], failures: [] }); expect(await readFile(marker, "utf8")).toBe("xxxx"); expect(request).toHaveBeenCalledTimes(1); }
    finally { process.env.PATH = previous; if (previousMarker === undefined) delete process.env.POST_RESUME_TEST_DOWNLOADS; else process.env.POST_RESUME_TEST_DOWNLOADS = previousMarker; await rm(directory, { recursive: true, force: true }); }
  });
  it("refuses an over-budget artifact census before invoking any download command", async () => {
    const f = optionalFixture(), request = vi.fn(async () => ({ artifacts: Array.from({ length: 5 }, (_v, i) => ({ id: i + 1, name: `cd-v2-${i}`, expired: false })) }));
    const actions = new ActionsAdapter({ request: request as never }, f.cfg), previous = process.env.PATH; process.env.PATH = "/nonexistent-post-resume-test-tools";
    const run: WorkflowRun = { id: 100, run_attempt: 1, status: "completed", conclusion: "success", head_sha: f.attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${f.attempt.dispatchEffectId}`, created_at: now, updated_at: now };
    try { await expect(actions.evidence(run, f.attempt, { maximumRequests: 1, timeoutMs: 100 })).rejects.toThrow("exceeds four downloads"); expect(request).toHaveBeenCalledTimes(1); }
    finally { process.env.PATH = previous; }
  });
});


describe("PR530 independent implementation findings", () => {
  it("IR-01: vanished demand commits no stable null yield; later demand yields and both ordinary slots fit", async () => {
    const h = await harness(false); let ordinaryId = "";
    await h.store.transact("ordinary-before-yield", "synthetic-current-ordinary", now, state => {
      const fixture = prepared("production", h.cfg), i = createIntent(state, h.cfg, "production", state.sources[0]!, now, now), a = planAttempt(state, h.cfg, i.id, "c".repeat(40), "7", now);
      ordinaryId = i.id; const tests = { ...fixture.tests, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "200" }, upload = { ...fixture.upload, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "200" };
      recordTests(state, h.cfg, tests); claimUpload(state, h.cfg, upload, now); recordUpload(state, { ...upload, outcome: "accepted" }, now); a.artifactsVerifiedAt = now; return null;
    });
    const transact = h.store.transact.bind(h.store); let raced = false;
    const race = vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, time, transition) => {
      if (!raced && id === `post-resume-yield-${h.attemptId}`) { raced = true; await transact("ordinary-completes-before-yield", "synthetic-genuine-receipt", now, state => deliver(state, ordinaryId, state.intents[ordinaryId]!.attempts[0]!.id, observation("456", "production"), now)); }
      return transact(id, kind, time, transition);
    });
    await expect(direct(h).reconcileIntent(h.state.intents[h.intentId]!, now)).rejects.toThrow("demand changed"); race.mockRestore();
    let state = (await h.store.read()).state; expect(state.transitions[`post-resume-yield-${h.attemptId}`]).toBeUndefined(); expect(postResumeAcceptance(state, state.intents[h.intentId]!)!.yielded).toBeUndefined();
    await h.store.transact("two-new-ordinary", "synthetic-two-eligible-channels", now, state => { for (const channel of ["staging", "production"] as const) createIntent(state, h.cfg, channel, state.sources[1]!, now, now, false, undefined, `ordinary-${channel}-after-race`); return null; });
    const burned = structuredClone(state.builds["123/1.0"]!.reservations[h.attemptId]); await direct(h).reconcileIntent(h.state.intents[h.intentId]!, now);
    await h.store.transact("both-ordinary-plans", "synthetic-actual-normal-planning", now, state => { for (const channel of ["staging", "production"] as const) planAttempt(state, h.cfg, `ordinary-${channel}-after-race`, "c".repeat(40), "8", now); return null; });
    state = (await h.store.read()).state; expect(postResumeAcceptance(state, state.intents[h.intentId]!)!.yielded).toEqual({ attemptId: h.attemptId, at: now });
    expect(Object.values(state.intents).flatMap(i => i.attempts.filter(a => occupiesNative(state, i, a)))).toHaveLength(2); expect(state.builds["123/1.0"]!.reservations[h.attemptId]).toEqual(burned); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("IR-02: optional receipt leaves all ordinary group ownership/cursors/fences unchanged and an older valid ordinary promotion still works", async () => {
    const h = await harness();
    await h.store.transact("ordinary-receipt-before-optional", "synthetic-existing-ordinary-receipt", now, state => {
      const f = prepared("production", h.cfg), i = createIntent(state, h.cfg, "production", state.sources[0]!, now, now), a = planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now);
      const t = { ...f.tests, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "203" }, u = { ...f.upload, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "203", buildNumber: a.buildNumber };
      recordTests(state, h.cfg, t); claimUpload(state, h.cfg, u, now); recordUpload(state, { ...u, outcome: "accepted" }, now); a.artifactsVerifiedAt = now; claimGroup(state, i.id, a.id, now); deliver(state, i.id, a.id, { ...observation("456", "production"), buildNumber: a.buildNumber }, now);
      qualifyPostResumeAcceptance(state, h.intentId, { ...h.qualification, fingerprint: importFingerprint(state) }, now); return null;
    });
    const before = (await h.store.read()).state, ordinaryReceipts = (state: typeof before) => Object.values(state.intents).filter(i => !i.validation).map(i => ({ id: i.id, receipt: i.receipt }));
    expect(ordinaryReceipts(before)).toHaveLength(1); expect(ordinaryReceipts(before)[0]!.receipt).toBeDefined();
    h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(now);
    let state = (await h.store.read()).state; for (const key of ["cursors", "groupCursors", "groupOperations", "fences"] as const) expect(state[key]).toEqual(before[key]); expect(ordinaryReceipts(state)).toEqual(ordinaryReceipts(before)); expect(state.intents[h.intentId]!.receipt).toBeDefined();
    await h.store.transact("ordinary-after-optional", "synthetic-valid-ordinary-receipt", now, state => {
      const f = prepared("staging", h.cfg), i = createIntent(state, h.cfg, "staging", state.sources[0]!, now, now), a = planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now);
      const t = { ...f.tests, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "201" }, u = { ...f.upload, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, runId: "201", buildNumber: a.buildNumber };
      recordTests(state, h.cfg, t); claimUpload(state, h.cfg, u, now); recordUpload(state, { ...u, outcome: "accepted" }, now); a.artifactsVerifiedAt = now; claimGroup(state, i.id, a.id, now); return deliver(state, i.id, a.id, { ...observation(), buildNumber: a.buildNumber, buildId: "ordinary-build", group: { ...observation().group, buildIds: ["ordinary-build"] } }, now);
    });
    state = (await h.store.read()).state; expect(state.cursors.staging!.sourceSha).toBe(source().sha); expect(state.groupCursors.staging!.sourceSha).toBe(source().sha); expect(state.intents[h.intentId]!.receipt!.sourceSha).toBe(source("b", 1).sha);
  });
  it("IR-02: a genuinely newer completed ordinary receipt prevents a first old optional receipt without changing ordinary state", async () => {
    const h = await harness();
    await h.store.transact("newer-ordinary-delivered", "synthetic-newer-ordinary-receipt", now, state => {
      recordUpload(state, { ...h.upload, outcome: "accepted" }, now); state.sources.push(source("d", 2));
      const f = prepared("staging", h.cfg), i = createIntent(state, h.cfg, "staging", state.sources[2]!, now, now), a = planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now);
      const t = { ...f.tests, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, sourceSha: a.sourceSha, appInputDigest: a.appInputDigest, runId: "202" }, u = { ...f.upload, intentId: i.id, attemptId: a.id, dispatchEffectId: a.dispatchEffectId, sourceSha: a.sourceSha, runId: "202", buildNumber: a.buildNumber };
      recordTests(state, h.cfg, t); claimUpload(state, h.cfg, u, now); recordUpload(state, { ...u, outcome: "accepted" }, now); a.artifactsVerifiedAt = now;
      deliver(state, i.id, a.id, { ...observation(), buildNumber: a.buildNumber }, now);
      qualifyPostResumeAcceptance(state, h.intentId, { ...h.qualification, fingerprint: importFingerprint(state) }, now); return null;
    });
    const before = (await h.store.read()).state;
    await expect(h.store.transact("old-optional-receipt", "synthetic-stale-optional-observation", now, state => deliver(state, h.intentId, h.attemptId, observation(), now, h.cfg))).rejects.toThrow("regress");
    expect((await h.store.read()).state).toEqual(before);
  });
  it.each(["receipt", "controller"])("IR-03: %s rejection retains native occupancy until exact release, without a replacement", async writer => {
    const h = await harness();
    if (writer === "receipt") await h.store.transact("rejected-hook", "synthetic-exact-rejected-receipt", now, state => recordUpload(state, { ...h.upload, outcome: "rejected", diagnostics: "actual synthetic rejection" }, now));
    else { h.observe.mockResolvedValue({ uploadState: "FAILED" }); await h.controller.tick(now); }
    let state = (await h.store.read()).state, a = state.intents[h.intentId]!.attempts[0]!; expect(a.upload!.outcome).toBe("rejected"); expect(a.status).toBe("active"); expect(occupiesNative(state, state.intents[h.intentId]!, a)).toBe(true);
    await h.store.transact("ordinary-one", "synthetic-one-ordinary", now, state => { const i = createIntent(state, h.cfg, "production", state.sources[1]!, now, now); planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now); return null; });
    await expect(h.store.transact("ordinary-over-capacity", "synthetic-second-ordinary", now, state => { const i = createIntent(state, h.cfg, "staging", state.sources[1]!, now, now); return planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now); })).rejects.toThrow("capacity");
    await release(h); state = (await h.store.read()).state; a = state.intents[h.intentId]!.attempts[0]!; expect(occupiesNative(state, state.intents[h.intentId]!, a)).toBe(false); expect(a.upload!.outcome).toBe("rejected"); expect(a.upload!.identity).toEqual(h.upload); expect(state.intents[h.intentId]!.attempts).toHaveLength(1);
    await h.store.transact("ordinary-second-after-release", "synthetic-normal-capacity-recovered", now, state => { const i = createIntent(state, h.cfg, "staging", state.sources[1]!, now, now); return planAttempt(state, h.cfg, i.id, "c".repeat(40), "8", now); });
  });
  it.each([false, true])("IR-04: fresh/replayed=%s native verification cannot authorize after release, while provenance/existing receipts remain valid", async replay => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    try {
      const h = await harness(); vi.spyOn(h.actions, "run").mockResolvedValue(h.run);
      if (replay) expect(await verifyExecution(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {})).toMatchObject({ authorized: true });
      await release(h); const before = (await h.store.read()).state;
      await expect(verifyExecution(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {})).rejects.toThrow("Yielded/released");
      expect(await verifyExecutionProvenance(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {})).toEqual({ verified: true, intentId: h.intentId, attemptId: h.attemptId });
      await h.store.transact("late-existing-proof-receipt", "synthetic-normal-readback", now, state => { recordTests(state, h.cfg, h.tests); recordUpload(state, { ...h.upload, outcome: "accepted", providerUploadId: "same-resource" }, now); return null; });
      const final = (await h.store.read()).state; expect(final.intents[h.intentId]!.attempts[0]!.upload!.providerUploadId).toBe("same-resource"); expect(final.transitions[`verify-${h.attemptId}-100-1`]).toEqual(before.transitions[`verify-${h.attemptId}-100-1`]);
    } finally { vi.useRealTimers(); }
  });
  it.each([false, true])("IR-04: release during provenance reads closes fresh/replayed=%s verification CAS/readback", async replay => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now));
    try {
      const h = await harness(); const run = vi.spyOn(h.actions, "run").mockResolvedValue(h.run);
      if (replay) await verifyExecution(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {});
      run.mockImplementation(async () => { await release(h); return h.run; });
      await expect(verifyExecution(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {})).rejects.toThrow("Yielded/released");
      const state = (await h.store.read()).state; expect(Boolean(state.transitions[`verify-${h.attemptId}-100-1`])).toBe(replay);
    } finally { vi.useRealTimers(); }
  });
  it.each([false, true])("IR-04: yielded execution rejects fresh/replayed=%s direct and CLI native gates", async replay => {
    vi.useFakeTimers(); vi.setSystemTime(new Date(now)); let mock: ReturnType<typeof vi.spyOn> | undefined;
    const directory = await mkdtemp(join(tmpdir(), "post-resume-native-gate-"));
    try {
      const h = await harness(false); vi.spyOn(h.actions, "run").mockResolvedValue(h.run);
      if (replay) await h.store.transact(`verify-${h.attemptId}-100-1`, "synthetic-existing-verification", now, () => ({ runId: "100" }));
      await h.store.transact("yield-before-native", "synthetic-zero-effect-yield", now, state => yieldPostResumeAttempt(state, h.intentId, h.attemptId, now));
      await expect(verifyExecution(h.cfg, h.store, h.actions, "/synthetic-source", h.identity, {})).rejects.toThrow("Yielded/released");
      const cfg = join(directory, "config.json"); await writeFile(cfg, JSON.stringify(h.cfg));
      mock = vi.spyOn(GhApi.prototype, "request").mockImplementation(<T>(method: string, path: string, body?: unknown) => h.api.request<T>(method, path, body));
      const environment = { MORPHEUS_CD_INTENT_ID: h.intentId, MORPHEUS_CD_ATTEMPT_ID: h.attemptId, MORPHEUS_CD_DISPATCH_EFFECT_ID: h.identity.dispatchEffectId, MORPHEUS_CD_SOURCE_SHA: h.identity.sourceSha, MORPHEUS_CD_CONTROL_SHA: h.identity.controlSha, GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "1" };
      await expect(cd(["verify-execution", "--config", cfg, "--source-dir", "/synthetic-source"], environment)).rejects.toThrow("Yielded/released"); expect(h.dispatch).not.toHaveBeenCalled();
    } finally { mock?.mockRestore(); vi.useRealTimers(); await rm(directory, { recursive: true, force: true }); }
  });
});


function externalApiDocument(path: string, members: string[] = ["member"]) {
  if (path.includes("/betaAppReviewSubmission")) return { data: null };
  if (path.includes("/v1/builds/apple-build?")) return { data: { id: "apple-build", type: "builds", attributes: { version: "8", processingState: "VALID" }, relationships: { app: { data: { id: "123", type: "apps" } }, preReleaseVersion: { data: { id: "version", type: "preReleaseVersions" } }, buildBetaDetail: { data: { id: "detail", type: "buildBetaDetails" } } } }, included: [{ id: "123", type: "apps" }, { id: "version", type: "preReleaseVersions", attributes: { version: "1.0" } }, { id: "detail", type: "buildBetaDetails", attributes: { externalBuildState: "IN_BETA_TESTING", autoNotifyEnabled: true } }] };
  if (path.includes("/relationships/betaTesters")) return { data: members.map(id => ({ id, type: "betaTesters" })) };
  if (path.includes("/relationships/builds")) return { data: [{ id: "apple-build", type: "builds" }] };
  if (path.includes("/v1/betaGroups/external?")) return { data: { id: "external", type: "betaGroups", attributes: { isInternalGroup: false, hasAccessToAllBuilds: false }, relationships: { app: { data: { id: "123", type: "apps" } } } } };
  throw new Error(`Unexpected synthetic Apple route ${path}`);
}
describe("IR-05 delivered optional external observation", () => {
  it("shares eight GETs across build/review/group/pagination and records UNKNOWN with no mutation from a partial census", async () => {
    const cfg = config(); cfg.channels.staging.externalGroupIds = ["external"]; const h = await harness(true, cfg);
    await h.store.transact("internal-delivered", "synthetic-exact-internal-receipt", now, state => { recordUpload(state, { ...h.upload, outcome: "accepted" }, now); return deliver(state, h.intentId, h.attemptId, observation(), now, cfg); });
    const calls: { method: string; signal?: AbortSignal }[] = []; let page = 0;
    vi.mocked(h.apple.api.request).mockImplementation(async <T>(method: string, path: string, _body?: unknown, signal?: AbortSignal): Promise<T> => {
      calls.push({ method, signal }); if (calls.length > 8) throw new Error("sentinel: unbounded optional external observation"); if (path.includes("/relationships/betaTesters")) return { data: [{ id: "member", type: "betaTesters" }], links: { next: `/v1/betaGroups/external/relationships/betaTesters?page=${++page}` } } as T;
      return externalApiDocument(path) as T;
    });
    const notify = vi.spyOn(h.apple, "notifyExternal").mockResolvedValue(), review = vi.spyOn(h.apple, "submitReview").mockResolvedValue("submission");
    const result = await h.controller.tick(now); expect(result.errors[0]!.message).toContain("budget exhausted"); expect(calls).toHaveLength(8); expect(calls.every(call => call.method === "GET" && call.signal instanceof AbortSignal)).toBe(true);
    expect(h.assign).not.toHaveBeenCalled(); expect(notify).not.toHaveBeenCalled(); expect(review).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.external!.status).toBe("uncertain");
  });
  it("preserves the ordinary three-argument external adapter's complete multi-page behavior", async () => {
    const cfg = config(), f = prepared(); claimUpload(f.state, cfg, f.upload, now); recordUpload(f.state, { ...f.upload, outcome: "accepted" }, now); f.state.intents[f.intentId]!.attempts[0]!.artifactsVerifiedAt = now;
    const receipt = deliver(f.state, f.intentId, f.attemptId, observation(), now); let calls = 0, pages = 0, signals = 0;
    const adapter = new AppleAdapter({ request: async <T>(_method: string, path: string, _body?: unknown, signal?: AbortSignal): Promise<T> => {
      calls++; if (signal) signals++;
      if (path.includes("/relationships/betaTesters")) { pages++; return { data: [{ id: `member-${pages}`, type: "betaTesters" }], ...(pages < 10 ? { links: { next: `/v1/betaGroups/external/relationships/betaTesters?page=${pages}` } } : {}) } as T; }
      return externalApiDocument(path) as T;
    } });
    const result = await adapter.external(receipt, ["external"], now); expect(result.groups[0]!.testerIds).toHaveLength(10); expect({ calls, pages, signals }).toEqual({ calls: 14, pages: 10, signals: 0 });
  });
  it("aborts a stalled external membership response body under the SAME whole-observation deadline", async () => {
    const cfg = config(); cfg.channels.staging.externalGroupIds = ["external"]; const f = optionalFixture(true, cfg); recordUpload(f.state, { ...f.upload, outcome: "accepted" }, now); const receipt = deliver(f.state, f.intentId, f.attemptId, observation(), now, cfg);
    const signals: AbortSignal[] = []; let requests = 0, stalledBodies = 0;
    const http = new AppleHttp(cfg, {}, (async (url: string | URL | Request, init?: RequestInit) => {
      requests++; signals.push(init!.signal as AbortSignal); const path = String(url).replace("https://api.appstoreconnect.apple.com", "");
      return { ok: true, status: 200, text: () => { if (path.includes("/relationships/betaTesters")) { stalledBodies++; return new Promise<string>(() => {}); } return Promise.resolve(JSON.stringify(externalApiDocument(path))); } } as Response;
    }) as typeof fetch);
    vi.spyOn(http as unknown as { authorization(): Promise<string> }, "authorization").mockResolvedValue("synthetic-token-no-credential-read");
    await expect(new AppleAdapter(http).external(receipt, ["external"], now, { maximumRequests: 8, timeoutMs: 15 })).rejects.toThrow("deadline reached");
    expect(requests).toBe(4); expect(stalledBodies).toBe(1); expect(signals.every(signal => signal.aborted)).toBe(true);
  });
});
