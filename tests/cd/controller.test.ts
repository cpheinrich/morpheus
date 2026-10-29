import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "../../src/cd/controller.js";
import { ActionsAdapter, uploadEvidence, type WorkflowRun } from "../../src/cd/actions.js";
import { AppleAdapter } from "../../src/cd/apple.js";
import { GitHubStore } from "../../src/cd/store.js";
import { loadSources, verifyValidator } from "../../src/cd/source.js";
import { after, claimUpload, completeOperationalRepair, createIntent, deliver, planAttempt, recordTests, recordUpload, repairWork } from "../../src/cd/state.js";
import { CdWait } from "../../src/cd/errors.js";
import { configurationDigest, hash, type Attempt, type CdState } from "../../src/cd/schema.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, observation, prepared, source } from "./fixtures.js";
import { physicalPolicy } from "./physical-device-fixtures.js";

vi.mock("../../src/cd/source.js", async original => ({ ...await original<typeof import("../../src/cd/source.js")>(), loadSources: vi.fn(), verifyValidator: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadSources).mockResolvedValue([source()]); vi.mocked(verifyValidator).mockImplementation(() => {}); });
function nativeJob(overrides: Record<string, unknown> = {}) {
  return { id: 1, node_id: "job-1", run_id: 100, run_attempt: 1, run_url: "https://api.github.com/repos/example/app/actions/runs/100", head_sha: "c".repeat(40), workflow_name: "CD", head_branch: "main", name: "tests / test", url: "https://api.github.com/repos/example/app/actions/jobs/1", html_url: "https://github.com/example/app/actions/runs/100/job/1", check_run_url: "https://api.github.com/repos/example/app/check-runs/1", created_at: now, status: "queued", conclusion: null, started_at: null, completed_at: null, labels: ["macos-vm"], runner_id: null, runner_name: null, runner_group_id: null, runner_group_name: null, steps: [], ...overrides };
}
const preflightJob = (overrides: Record<string, unknown> = {}) => nativeJob({ id: 2, name: "preflight", labels: ["ubuntu-24.04"], status: "completed", conclusion: "success", started_at: now, completed_at: after(now, 1), runner_id: 20, runner_name: "GitHub Actions 20", steps: [{ name: "Verify source", number: 1, status: "completed", conclusion: "success", started_at: now, completed_at: after(now, 1) }], ...overrides });
async function harness(upload = false, maximumNativeJobs = 2, lane: "local" | "hosted" = "local") {
  const cfg = config(); cfg.execution = { localRunner: "macos-vm", hostedRunner: "macos-26", maxNativeJobs: maximumNativeJobs };
  const jobs: unknown[] = [nativeJob({ status: "completed", conclusion: "success", started_at: now, completed_at: after(now, 1), runner_id: 3, runner_name: "owned-vm", labels: ["self-hosted", "macos-vm"] })];
  const jobPages = { read: (page: number): unknown => ({ total_count: jobs.length, jobs: jobs.slice((page - 1) * 100, page * 100) }) };
  const api = new FakeGitHub(), original = api.request.bind(api);
  api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    if (path.endsWith("/commits/main")) return { sha: "c".repeat(40) } as T;
    if (path.includes("/jobs?")) return await jobPages.read(Number(new URL(path, "https://api.github.com/").searchParams.get("page"))) as T;
    return original<T>(method, path, body);
  };
  const store = new GitHubStore(api, cfg), fixture = prepared(); fixture.state.configurationDigest = configurationDigest(cfg); fixture.tests.configurationDigest = configurationDigest(cfg); fixture.state.intents[fixture.intentId]!.attempts[0]!.configurationDigest = configurationDigest(cfg); fixture.state.intents[fixture.intentId]!.attempts[0]!.tests = undefined; fixture.state.evaluatedSlots = { staging: now, production: now };
  fixture.state.intents[fixture.intentId]!.attempts[0]!.lane = lane;
  if (upload) { recordTests(fixture.state, cfg, fixture.tests); claimUpload(fixture.state, cfg, fixture.upload, now); recordUpload(fixture.state, { ...fixture.upload, outcome: "uncertain", providerUploadId: "resource" }, now); }
  await store.initialize(now, "epoch"); await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  const attempt = fixture.state.intents[fixture.intentId]!.attempts[0]!, run: WorkflowRun = { id: 100, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${attempt.dispatchEffectId}`, created_at: now, updated_at: now };
  const actions = new ActionsAdapter(api, cfg), runs = vi.spyOn(actions, "runs").mockResolvedValue([run]), dispatch = vi.spyOn(actions, "dispatch").mockResolvedValue(), cancel = vi.spyOn(actions, "cancel").mockResolvedValue(), evidence = vi.spyOn(actions, "evidence").mockResolvedValue({ tests: [fixture.tests], uploads: [], failures: [] });
  const apple = new AppleAdapter({ request: vi.fn() }), observe = vi.spyOn(apple, "observe").mockResolvedValue({}), assign = vi.spyOn(apple, "assign").mockResolvedValue(); vi.spyOn(apple, "maximum").mockResolvedValue("8");
  return { ...fixture, cfg, api, store, actions, apple, run, runs, dispatch, cancel, evidence, jobs, jobPages, observe, assign, controller: new Controller(cfg, store, actions, apple, "/unused-source") };
}
async function admissionHarness(lane: "local" | "hosted" = "local") {
  const h = await harness(false, 2, lane); h.evidence.mockResolvedValue({ tests: [], uploads: [], failures: [] });
  h.jobs.splice(0, h.jobs.length, nativeJob(), preflightJob());
  h.runs.mockImplementation(async effect => effect === h.state.intents[h.intentId]!.attempts[0]!.dispatchEffectId ? [h.run] : []);
  return h;
}
function finishUnassigned(h: Awaited<ReturnType<typeof admissionHarness>>) {
  h.run.status = "completed"; h.run.conclusion = "cancelled";
  h.jobs[0] = nativeJob({ status: "completed", conclusion: "cancelled", completed_at: after(now, 16) });
}
// Exact-field projections of retained GitHub rows (hashes in qa/acceptance/MO-26-10-21-20.30.42.md).
// Status, conclusion, labels, runner and runner-group values, step count and the start/completion
// relations to created_at are the provider's; identity is rebound to this run and times to its clock.
const placed = after(now, 1), skippedAt = after(now, 16);
const cancelledWhileQueued = (overrides: Record<string, unknown> = {}) => nativeJob({ status: "completed", conclusion: "cancelled", created_at: placed, started_at: placed, completed_at: after(placed, 24 + 8 / 60), runner_id: 0, runner_name: "", runner_group_id: 0, runner_group_name: "", steps: [], ...overrides });
const skippedPlaceholder = (overrides: Record<string, unknown> = {}) => nativeJob({ id: 3, name: "upload", status: "completed", conclusion: "skipped", created_at: skippedAt, started_at: skippedAt, completed_at: after(skippedAt, -1 / 60), steps: [], ...overrides });
function finishPlaceholders(h: Awaited<ReturnType<typeof admissionHarness>>, target: Record<string, unknown> = {}, upload: Record<string, unknown> = {}, qualify: Record<string, unknown> = {}, ...extra: unknown[]) {
  h.run.status = "completed"; h.run.conclusion = "cancelled";
  h.jobs.splice(0, h.jobs.length, cancelledWhileQueued(target), preflightJob(), skippedPlaceholder(upload), skippedPlaceholder({ id: 4, name: "qualify", labels: ["ubuntu-24.04"], ...qualify }), ...extra);
}
describe("exact-attempt native admission", () => {
  it("uses 15 minutes for queued native work despite in-progress Linux preflight, then makes one ordinary hosted successor", async () => {
    const h = await admissionHarness(), before = (await h.store.read()).state.intents[h.intentId]!;
    h.jobs[1] = preflightJob({ status: "in_progress", conclusion: null, completed_at: null });
    await h.controller.tick(after(now, 15)); expect(h.cancel).not.toHaveBeenCalled();
    const expired = after(now, 15 + 1 / 60_000); await h.controller.tick(expired);
    expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
    let intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.nextAction).toBe("verify-executor-quiescence"); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined();
    finishUnassigned(h); h.jobs[1] = preflightJob(); await h.controller.tick(after(now, 21));
    intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.nextAction).toBe("dispatch-hosted"); expect(intent.attempts[0]!.status).toBe("failed"); expect(intent.attempts[0]!.quiescence!.ref).toContain("100/1");
    await h.controller.tick(after(now, 22)); await h.controller.tick(after(now, 27));
    const state = (await h.store.read()).state; intent = state.intents[h.intentId]!;
    expect(intent.attempts.map(attempt => ({ build: attempt.buildNumber, lane: attempt.lane, source: attempt.sourceSha, status: attempt.status }))).toEqual([{ build: "8", lane: "local", source: before.source, status: "failed" }, { build: "9", lane: "hosted", source: before.source, status: "active" }]);
    expect(h.dispatch).toHaveBeenCalledTimes(1); expect(h.dispatch.mock.calls[0]![0].id).toBe(`${h.intentId}-a2`);
    for (const key of ["id", "source", "originalSource", "slot", "oldestDebtAt", "deadlineAt"] as const) expect(intent[key]).toEqual(before[key]);
    expect(state.builds["123/1.0"]!.reservations).toEqual({ [h.attemptId]: { buildNumber: "8", at: now, burned: true }, [`${h.intentId}-a2`]: { buildNumber: "9", at: after(now, 22), burned: true } });
    expect(state.builds["123/1.0"]!.maximum).toBe("9"); expect(intent.receipt).toBeUndefined(); expect(state.agents).toEqual({});
  });
  it.each([
    ["runner id", { runner_id: 3 }], ["runner name", { runner_name: "assigned-vm" }], ["started job", { started_at: after(now, 1) }],
    ["started step", { steps: [{ status: "in_progress", conclusion: null, started_at: now }] }],
    ["completed step with contradictory queued status", { steps: [{ status: "queued", conclusion: null, started_at: null, completed_at: now }] }],
    ["missing assignment", { runner_id: undefined }], ["missing name", { runner_name: undefined }], ["missing start", { started_at: undefined }], ["missing steps", { steps: undefined }],
    ["unknown status", { status: "waiting" }], ["unknown labels", { labels: ["unrecognized-native"] }],
  ])("retains the test bound and ownership for %s evidence", async (_label, overrides) => {
    const h = await admissionHarness(); h.jobs[0] = nativeJob(overrides);
    await h.controller.tick(after(now, 16)); expect(h.cancel).not.toHaveBeenCalled();
    finishUnassigned(h); h.jobs[0] = nativeJob({ status: "completed", conclusion: "cancelled", completed_at: after(now, 16), ...overrides });
    await h.controller.tick(after(now, 21)); const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.nextAction).toBe("run-repair-agent"); expect(Object.values(state.agents)).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each(["empty", "preflight-only", "failed-preflight", "unknown-companion"])("does not call %s evidence a safe native admission failure", async kind => {
    const h = await admissionHarness(); finishUnassigned(h);
    if (kind === "empty") h.jobs.splice(0);
    else if (kind === "preflight-only") h.jobs.splice(0, h.jobs.length, preflightJob({ conclusion: "failure" }));
    else if (kind === "failed-preflight") h.jobs[1] = preflightJob({ conclusion: "failure" });
    else h.jobs.push(preflightJob({ id: 3, labels: ["unknown-executor"] }));
    await h.controller.tick(after(now, 20)); const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.state).toBe("repairing"); expect(Object.values(state.agents)[0]!.evidence).toContain("Native admission absence is not proved; host-side owned process/VM termination evidence is required before replacement"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("recovers preflight-only failure only through verified owned quiescence and operational repair", async () => {
    const h = await admissionHarness(); finishUnassigned(h); h.jobs.splice(0, h.jobs.length, preflightJob({ conclusion: "failure" }));
    await h.controller.tick(after(now, 20));
    await expect(h.store.transact("unsafe-repair", "agent-checkpoint", after(now, 21), state => completeOperationalRepair(state, h.intentId, ["Preflight fixed"], after(now, 21)))).rejects.toThrow("Pre-upload retry requires host/provider quiescence");
    await h.store.transact("verified-owned-termination", "record-executor-quiescence", after(now, 22), state => { state.intents[h.intentId]!.attempts[0]!.quiescence = { kind: "host-terminated", ref: "Owned process group absent and exact VM terminated", observedAt: after(now, 22) }; completeOperationalRepair(state, h.intentId, ["Owned executor terminated; preflight repaired"], after(now, 22)); for (const work of Object.values(state.agents)) work.state = "complete"; return null; });
    await h.controller.tick(after(now, 23)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts.map(attempt => [attempt.buildNumber, attempt.lane, attempt.status])).toEqual([["8", "local", "failed"], ["9", "local", "active"]]); expect(h.dispatch).toHaveBeenCalledTimes(1); expect(intent.oldestDebtAt).toBe(h.state.intents[h.intentId]!.oldestDebtAt); expect(intent.source).toBe(source().sha);
  });
  it("allows explicitly skipped unassigned downstream jobs without treating skip-only native work as admission", async () => {
    const h = await admissionHarness(); h.jobs.push(nativeJob({ id: 3, name: "upload", status: "completed", conclusion: "skipped", completed_at: after(now, 1) }), nativeJob({ id: 4, name: "qualify", labels: [], status: "completed", conclusion: "skipped", completed_at: after(now, 1) }));
    await h.controller.tick(after(now, 16)); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
    finishUnassigned(h); await h.controller.tick(after(now, 22)); expect((await h.store.read()).state.intents[h.intentId]!.nextAction).toBe("dispatch-hosted");
    const skipped = await admissionHarness(); finishUnassigned(skipped); skipped.jobs[0] = nativeJob({ status: "completed", conclusion: "skipped", completed_at: after(now, 1) });
    await skipped.controller.tick(after(now, 20)); expect((await skipped.store.read()).state.intents[skipped.intentId]!.attempts[0]!.quiescence).toBeUndefined(); expect((await skipped.store.read()).state.intents[skipped.intentId]!.nextAction).toBe("run-repair-agent");
  });
  it("reads a bound original attempt when a later rerun is visible", async () => {
    const h = await admissionHarness(); finishUnassigned(h); h.runs.mockResolvedValue([{ ...h.run, run_attempt: 2 }]); const original = vi.spyOn(h.actions, "runAttempt").mockResolvedValue(h.run), read = vi.spyOn(h.jobPages, "read");
    await h.controller.tick(after(now, 20));
    expect(original).toHaveBeenCalledExactlyOnceWith("100", "1"); expect(read).toHaveBeenCalledExactlyOnceWith(1); expect((await h.store.read()).state.intents[h.intentId]!.nextAction).toBe("dispatch-hosted");
  });
  it("accepts explicit zero/empty unassigned fields and an omitted optional job run-attempt on the exact endpoint", async () => {
    const h = await admissionHarness(); finishUnassigned(h); h.jobs[0] = nativeJob({ status: "completed", conclusion: "cancelled", completed_at: after(now, 16), runner_id: 0, runner_name: "", run_attempt: undefined });
    await h.controller.tick(after(now, 20)); expect((await h.store.read()).state.intents[h.intentId]!.nextAction).toBe("dispatch-hosted");
  });
  it.each(["hosted", "self-hosted", "empty"])("never treats terminal %s evidence as self-hosted VM termination", async kind => {
    const h = await admissionHarness("hosted"); finishUnassigned(h);
    if (kind === "empty") h.jobs.splice(0);
    else h.jobs[0] = nativeJob({ status: "completed", conclusion: "failure", started_at: now, completed_at: after(now, 16), runner_id: 3, runner_name: "executor", labels: kind === "hosted" ? ["macos-26-xlarge"] : ["self-hosted", "macos-vm"] });
    await h.controller.tick(after(now, 20)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe(kind === "hosted" ? "failed" : "active"); expect(intent.attempts[0]!.quiescence?.kind).toBe(kind === "hosted" ? "hosted-terminated" : undefined); expect(intent.nextAction).toBe("run-repair-agent"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("preserves the exact 180-minute running bound and requires later host termination even after cancellation", async () => {
    const h = await admissionHarness(); h.jobs[0] = nativeJob({ status: "in_progress", started_at: now, runner_id: 3, runner_name: "owned-vm" });
    await h.controller.tick(after(now, 180)); expect(h.cancel).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 180 + 1 / 60_000)); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
    h.run.status = "completed"; h.run.conclusion = "cancelled"; h.jobs[0] = nativeJob({ status: "completed", conclusion: "cancelled", started_at: now, completed_at: after(now, 181), runner_id: 3, runner_name: "owned-vm" });
    await h.controller.tick(after(now, 186)); let intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(h.dispatch).not.toHaveBeenCalled();
    await h.store.transact("later-owned-termination", "record-executor-quiescence", after(now, 187), state => { state.intents[h.intentId]!.attempts[0]!.quiescence = { kind: "host-terminated", ref: "Owned VM terminated after cancellation", observedAt: after(now, 187) }; return null; });
    await h.controller.tick(after(now, 191)); intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("failed"); expect(intent.nextAction).toBe("run-repair-agent"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each([
    ["missing total at equality", "missing", 180], ["missing total just after", "missing", 180 + 1 / 60_000],
    ["incomplete page at equality", "partial", 180], ["incomplete page just after", "partial", 180 + 1 / 60_000],
    ["provider error at equality", "error", 180], ["provider error just after", "error", 180 + 1 / 60_000],
  ])("preserves the running cancellation bound for %s", async (_label, failure, elapsed) => {
    const h = await admissionHarness(); h.jobPages.read = () => { if (failure === "error") throw new CdWait("Job page temporarily unavailable", "github-provider"); return { total_count: failure === "missing" ? undefined : 3, jobs: h.jobs }; };
    const result = await h.controller.tick(after(now, Number(elapsed))), intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(result.errors).toHaveLength(1); expect(h.cancel.mock.calls).toEqual(Number(elapsed) === 180 ? [] : [["100"]]);
    expect(intent.state).toBe("waiting"); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each(["short", "error", "duplicate", "changing", "over-count", "wrong-run", "wrong-attempt", "wrong-sha", "missing-total"])("cannot authorize fallback from %s census", async kind => {
    const h = await admissionHarness(); finishUnassigned(h);
    if (["error", "duplicate", "changing"].includes(kind)) h.jobs.splice(0, h.jobs.length, ...Array.from({ length: 101 }, (_, index) => nativeJob({ id: index + 1, status: "completed", conclusion: "cancelled", completed_at: after(now, 16) })));
    if (kind === "duplicate") h.jobs[100] = h.jobs[0];
    else if (kind === "wrong-run") h.jobs[0] = nativeJob({ run_id: 999 });
    else if (kind === "wrong-attempt") h.jobs[0] = nativeJob({ run_attempt: 2 });
    else if (kind === "wrong-sha") h.jobs[0] = nativeJob({ head_sha: "d".repeat(40) });
    else { const read = h.jobPages.read; h.jobPages.read = page => { if (kind === "error" && page === 2) throw new CdWait("Job page temporarily unavailable", "github-provider"); const value = read(page) as { total_count: number; jobs: unknown[] }; return { ...value, total_count: kind === "missing-total" ? undefined : kind === "over-count" ? 1 : kind === "short" || kind === "changing" && page === 2 ? value.total_count + 1 : value.total_count }; }; }
    const result = await h.controller.tick(after(now, 20)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(result.errors).toHaveLength(1); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.state).toBe("waiting"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("reads the final job page before deciding that native work never started", async () => {
    const h = await admissionHarness(); finishUnassigned(h); h.jobs.splice(0, h.jobs.length, ...Array.from({ length: 101 }, (_, index) => nativeJob({ id: index + 1, status: "completed", conclusion: "cancelled", completed_at: after(now, 16), ...(index === 100 ? { runner_id: 42, runner_name: "assigned-last-page" } : {}) })));
    const read = vi.spyOn(h.jobPages, "read"); await h.controller.tick(after(now, 20));
    expect(read.mock.calls.map(call => call[0])).toEqual([1, 2]); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.nextAction).toBe("run-repair-agent");
  });
  it.each([["null-start", finishUnassigned], ["terminal placeholder", (h: Awaited<ReturnType<typeof admissionHarness>>) => finishPlaceholders(h)], ["cancelled Ubuntu companion", (h: Awaited<ReturnType<typeof admissionHarness>>) => { h.run.status = "completed"; h.run.conclusion = "cancelled"; h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map(job => nativeJob(job))); }]])("keeps an upload claim committed after the %s no-start census reserved", async (_label, finish) => {
    const h = await admissionHarness(); finish(h); const transact = h.store.transact.bind(h.store); let injected = false;
    vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, at, transition) => { if (kind === "native-failure" && !injected) { injected = true; await transact("racing-upload-hook", "record-upload-result", at, state => { recordTests(state, h.cfg, h.tests); claimUpload(state, h.cfg, h.upload, at); recordUpload(state, { ...h.upload, outcome: "accepted", providerUploadId: "resource" }, at); return null; }); } return transact(id, kind, at, transition); });
    await h.controller.tick(after(now, 20)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(injected).toBe(true); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.upload!.acceptedAt).toBe(after(now, 20)); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.state).toBe("processing"); expect(h.dispatch).not.toHaveBeenCalled();
  });
});
// Complete five-job terminal provider projection; timestamps and execution fields are untouched.
// Identity/positive runner names/nonce label are anonymized; raw digest is in the task acceptance record.
const cancelledCompanionCensus: Record<string, unknown>[] = [
  {
    "status": "completed",
    "conclusion": "success",
    "created_at": "2026-10-23T00:34:31Z",
    "started_at": "2026-10-23T00:34:35Z",
    "completed_at": "2026-10-23T00:35:18Z",
    "labels": [
      "ubuntu-24.04"
    ],
    "runner_id": 20,
    "runner_name": "assigned-preflight-0",
    "runner_group_id": 0,
    "runner_group_name": "GitHub Actions",
    "id": 10,
    "steps": [
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:36Z",
        "completed_at": "2026-10-23T00:34:37Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:37Z",
        "completed_at": "2026-10-23T00:34:43Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:43Z",
        "completed_at": "2026-10-23T00:34:45Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:45Z",
        "completed_at": "2026-10-23T00:34:46Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:46Z",
        "completed_at": "2026-10-23T00:34:47Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:47Z",
        "completed_at": "2026-10-23T00:34:48Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:48Z",
        "completed_at": "2026-10-23T00:34:57Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:34:57Z",
        "completed_at": "2026-10-23T00:35:04Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:04Z",
        "completed_at": "2026-10-23T00:35:04Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:04Z",
        "completed_at": "2026-10-23T00:35:08Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:08Z",
        "completed_at": "2026-10-23T00:35:15Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:15Z",
        "completed_at": "2026-10-23T00:35:15Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:15Z",
        "completed_at": "2026-10-23T00:35:15Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:15Z",
        "completed_at": "2026-10-23T00:35:15Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:15Z",
        "completed_at": "2026-10-23T00:35:16Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:16Z",
        "completed_at": "2026-10-23T00:35:16Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:16Z",
        "completed_at": "2026-10-23T00:35:16Z"
      }
    ]
  },
  {
    "status": "completed",
    "conclusion": "success",
    "created_at": "2026-10-23T00:35:18Z",
    "started_at": "2026-10-23T00:35:21Z",
    "completed_at": "2026-10-23T00:35:25Z",
    "labels": [
      "ubuntu-latest"
    ],
    "runner_id": 21,
    "runner_name": "assigned-preflight-1",
    "runner_group_id": 0,
    "runner_group_name": "GitHub Actions",
    "id": 11,
    "steps": [
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:22Z",
        "completed_at": "2026-10-23T00:35:22Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:22Z",
        "completed_at": "2026-10-23T00:35:23Z"
      },
      {
        "status": "completed",
        "conclusion": "success",
        "started_at": "2026-10-23T00:35:23Z",
        "completed_at": "2026-10-23T00:35:23Z"
      }
    ]
  },
  {
    "status": "completed",
    "conclusion": "cancelled",
    "created_at": "2026-10-23T00:35:25Z",
    "started_at": "2026-10-23T00:35:25Z",
    "completed_at": "2026-10-23T00:38:06Z",
    "labels": [
      "macos-vm",
      "no-admission-fixture"
    ],
    "runner_id": 0,
    "runner_name": "",
    "runner_group_id": 0,
    "runner_group_name": "",
    "id": 12,
    "steps": []
  },
  {
    "status": "completed",
    "conclusion": "cancelled",
    "created_at": "2026-10-23T00:38:07Z",
    "started_at": "2026-10-23T00:38:07Z",
    "completed_at": "2026-10-23T00:38:06Z",
    "labels": [
      "ubuntu-24.04"
    ],
    "runner_id": null,
    "runner_name": null,
    "runner_group_id": null,
    "runner_group_name": null,
    "id": 13,
    "steps": []
  },
  {
    "status": "completed",
    "conclusion": "cancelled",
    "created_at": "2026-10-23T00:38:07Z",
    "started_at": "2026-10-23T00:38:07Z",
    "completed_at": "2026-10-23T00:38:06Z",
    "labels": [
      "macos-vm"
    ],
    "runner_id": null,
    "runner_name": null,
    "runner_group_id": null,
    "runner_group_name": null,
    "id": 14,
    "steps": []
  }
];
describe("physical-device source floor at planning", () => {
  // The source predates the floor: refuse before any build number, and tell repair why.
  it.each([["b", true], ["a", false]])("routes planning against floor %s to repair before reserving a build (refused: %s)", async (floor, refused) => {
    const h = await harness();
    h.cfg.tests.physicalDevice = { ...physicalPolicy(), sourceFloor: floor.repeat(40) };
    vi.mocked(loadSources).mockResolvedValue([source(), source("b", 1)]);
    await h.store.transact("floor-config", "fixture", now, state => {
      const intent = state.intents[h.intentId]!; state.configurationDigest = configurationDigest(h.cfg);
      intent.attempts[0]!.status = "failed"; intent.state = "pending"; intent.nextAction = "dispatch-full-tests"; intent.nextCheckAt = now; return null;
    });
    const result = await h.controller.tick(after(now, 5)), state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    if (!refused) { expect(result.errors).toEqual([]); expect(intent.attempts.map(item => item.sourceSha)).toEqual(["a".repeat(40), "a".repeat(40)]); expect(h.dispatch).toHaveBeenCalledTimes(1); return; }
    const message = `Source ${"a".repeat(40)} predates physical-device source floor ${"b".repeat(40)}, so it cannot carry the configured physical test plan (profile regression-v1, 2 tests); deliver a main source at or after the floor`;
    expect(result.errors).toEqual([{ intentId: h.intentId, message }]);
    expect(intent.state).toBe("repairing"); expect(intent.nextAction).toBe("run-repair-agent"); expect(intent.attempts).toHaveLength(1);
    expect(Object.values(state.agents).map(work => work.evidence)).toEqual([[message]]);
    expect(state.builds["123/1.0"]!.reservations).toEqual({ [h.attemptId]: { buildNumber: "8", at: now, burned: true } }); expect(h.dispatch).not.toHaveBeenCalled();
  });
});
describe("terminal job placeholders", () => {
  async function expectRepair(h: Awaited<ReturnType<typeof admissionHarness>>) {
    const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.state).toBe("repairing"); expect(intent.nextAction).toBe("run-repair-agent");
    expect(Object.values(state.agents)).toHaveLength(1); expect(Object.values(state.agents)[0]!.evidence).toContain("Native admission absence is not proved; host-side owned process/VM termination evidence is required before replacement"); expect(h.dispatch).not.toHaveBeenCalled();
  }
  it("recovers the actual five-job cancelled companion census through one normal hosted successor", async () => {
    const h = await admissionHarness(), before = (await h.store.read()).state.intents[h.intentId]!;
    h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map(job => nativeJob(job)));
    // A later main changes controller plumbing/controlRef, with identical app inputs.
    vi.mocked(loadSources).mockResolvedValue([source(), { ...source(), sha: "d".repeat(40), order: 1, mainEnteredAt: after(now, 26) }]);
    const request = h.api.request.bind(h.api);
    vi.spyOn(h.api, "request").mockImplementation(async (method, path, body) => path.endsWith("/commits/main") ? { sha: "d".repeat(40) } : request(method, path, body));
    await h.controller.tick(after(now, 26));
    let state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.state).toBe("pending"); expect(intent.nextAction).toBe("dispatch-hosted");
    expect(intent.attempts[0]!.status).toBe("failed");
    expect(intent.attempts[0]!.quiescence).toEqual({ kind: "host-terminated", ref: "GitHub complete exact-attempt job census: no native job assigned/started, run 100/1", observedAt: after(now, 26) });
    expect(state.agents).toEqual({}); expect(h.cancel).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 27)); await h.controller.tick(after(now, 32));
    state = (await h.store.read()).state; intent = state.intents[h.intentId]!;
    expect(intent.attempts.map(attempt => [attempt.buildNumber, attempt.lane, attempt.status, attempt.sourceSha, attempt.controlSha])).toEqual([["8", "local", "failed", before.source, "c".repeat(40)], ["9", "hosted", "active", before.source, "d".repeat(40)]]);
    expect(h.dispatch).toHaveBeenCalledTimes(1); expect(h.dispatch.mock.calls[0]![0].id).toBe(`${h.intentId}-a2`);
    expect(h.dispatch.mock.calls[0]![0].dispatchEffectId).not.toBe(before.attempts[0]!.dispatchEffectId);
    expect(JSON.stringify(h.dispatch.mock.calls[0])).not.toContain("no-admission-fixture");
    expect(h.cancel).not.toHaveBeenCalled(); expect(state.agents).toEqual({}); expect(intent.receipt).toBeUndefined();
    expect(state.builds["123/1.0"]!.reservations).toEqual({ [h.attemptId]: { buildNumber: "8", at: now, burned: true }, [`${h.intentId}-a2`]: { buildNumber: "9", at: after(now, 27), burned: true } });
    for (const key of ["source", "originalSource", "slot", "oldestDebtAt", "deadlineAt"] as const) expect(intent[key]).toEqual(before[key]);
  });
  it.each([
    ["runner id", { runner_id: 7 }], ["runner name", { runner_name: "assigned" }],
    ["runner group id", { runner_group_id: 1 }], ["runner group name", { runner_group_name: "Default" }],
    ["group absent on null start", { started_at: null, runner_group_id: undefined }],
    ["group name on null start", { started_at: null, runner_group_name: "assigned-group" }],
    ["completion absent on null start", { started_at: null, completed_at: null }],
    ["real start", { started_at: "2026-10-23T00:38:08Z" }], ["creation absent", { created_at: undefined }],
    ["completion absent", { completed_at: null }], ["nonterminal", { status: "in_progress" }],
    ["failed", { conclusion: "failure" }], ["foreign executor", { labels: ["windows-latest"] }],
    ["malformed labels", { labels: undefined }],
    ["executed step", { steps: [{ status: "completed", conclusion: "success", started_at: now, completed_at: now }] }],
    ["listed queued step on null start", { started_at: null, steps: [{ status: "queued", conclusion: null, started_at: null, completed_at: null }] }],
  ])("keeps a cancelled Ubuntu companion in repair for %s", async (_label, override) => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map((job, index) => nativeJob({ ...job, ...(index === 3 ? override : {}) })));
    await h.controller.tick(after(now, 26)); await expectRepair(h); expect(h.cancel).not.toHaveBeenCalled();
  });
  it.each([
    ["failed preflight", { conclusion: "failure" }], ["unverified preflight", { status: "in_progress", conclusion: null }],
    ["missing assigned runner", { runner_id: 0 }], ["empty runner name", { runner_name: "" }],
    ["empty steps", { steps: [] }], ["queued step", { steps: [{ status: "queued", conclusion: null }] }],
    ["step timestamp missing", { steps: [{ status: "completed", conclusion: "success" }] }],
  ])("does not use %s as authority for the cancelled companion exception", async (_label, override) => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    // Keep only one preflight, so no second verified row masks this boundary.
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.filter((_, index) => index !== 1).map((job, index) => nativeJob({ ...job, ...(index === 0 ? override : {}) })));
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it("requires a successful executed preflight, not only cancelled dependents", async () => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.slice(2).map(job => nativeJob(job)));
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it("retains a failed executed preflight even beside another successful preflight", async () => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map((job, index) => nativeJob({ ...job, ...(index === 0 ? { conclusion: "failure" } : {}) })));
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it.each([["run", { run_id: 999 }], ["attempt", { run_attempt: 2 }], ["head", { head_sha: "d".repeat(40) }]])("rejects the actual cancelled companion census on a foreign %s", async (_label, override) => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map((job, index) => nativeJob({ ...job, ...(index === 3 ? override : {}) })));
    const result = await h.controller.tick(after(now, 26)), intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(result.errors.map(error => error.message)).toEqual(["Job census does not match the exact workflow run attempt"]);
    expect(intent.state).toBe("waiting"); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it.each(["empty", "partial", "duplicate"])("refuses the actual cancelled companion %s census", async kind => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map(job => nativeJob(job)));
    if (kind === "empty") h.jobs.splice(0);
    if (kind === "duplicate") h.jobs[3] = h.jobs[2];
    if (kind === "partial") h.jobPages.read = () => ({ total_count: 6, jobs: h.jobs });
    const result = await h.controller.tick(after(now, 26)), intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(intent.state).toBe(kind === "empty" ? "repairing" : "waiting"); expect(intent.nextAction).toBe(kind === "empty" ? "run-repair-agent" : "wait-native-job-evidence"); expect(h.dispatch).not.toHaveBeenCalled();
    expect(result.errors).toHaveLength(kind === "empty" ? 0 : 1);
  });
  it.each(["tests", "newer owner"])("keeps %s committed after the cancelled-companion census", async kind => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "cancelled";
    h.jobs.splice(0, h.jobs.length, ...cancelledCompanionCensus.map(job => nativeJob(job)));
    const transact = h.store.transact.bind(h.store); let raced = false;
    vi.spyOn(h.store, "transact").mockImplementation(async (id, event, at, transition) => {
      if (event === "native-failure" && !raced) { raced = true; await transact("racing-current-owner", "fixture", at, state => {
        if (kind === "tests") recordTests(state, h.cfg, h.tests);
        else { state.intents[h.intentId]!.attempts[0]!.status = "failed"; planAttempt(state, h.cfg, h.intentId, "d".repeat(40), "8", at, "hosted"); }
        return null;
      }); }
      return transact(id, event, at, transition);
    });
    await h.controller.tick(after(now, 26)); const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(raced).toBe(true); expect(intent.nextAction).toBe(kind === "tests" ? "run-repair-agent" : "reconcile-dispatch");
    expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled();
    if (kind === "tests") { expect(intent.attempts[0]!.tests!.evidenceHash).toBe(hash(h.tests)); expect(intent.attempts[0]!.status).toBe("active"); }
    else expect(intent.attempts.map(attempt => [attempt.id, attempt.status])).toEqual([[h.attemptId, "failed"], [`${h.intentId}-a2`, "active"]]);
  });
  it("classifies a real-shape cancelled-while-queued census as no-start and makes one hosted successor", async () => {
    const h = await admissionHarness(), before = (await h.store.read()).state.intents[h.intentId]!;
    await h.controller.tick(after(now, 15 + 1 / 60_000)); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
    finishPlaceholders(h); await h.controller.tick(after(now, 26));
    let state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.nextAction).toBe("dispatch-hosted"); expect(intent.state).toBe("pending"); expect(intent.attempts[0]!.status).toBe("failed");
    expect(intent.attempts[0]!.quiescence).toEqual({ kind: "host-terminated", ref: "GitHub complete exact-attempt job census: no native job assigned/started, run 100/1", observedAt: after(now, 26) }); expect(state.agents).toEqual({});
    await h.controller.tick(after(now, 27)); await h.controller.tick(after(now, 32));
    state = (await h.store.read()).state; intent = state.intents[h.intentId]!;
    expect(intent.attempts.map(attempt => [attempt.buildNumber, attempt.lane, attempt.status])).toEqual([["8", "local", "failed"], ["9", "hosted", "active"]]);
    expect(h.dispatch).toHaveBeenCalledTimes(1); expect(h.dispatch.mock.calls[0]![0].id).toBe(`${h.intentId}-a2`); expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(state.builds["123/1.0"]!.reservations).toEqual({ [h.attemptId]: { buildNumber: "8", at: now, burned: true }, [`${h.intentId}-a2`]: { buildNumber: "9", at: after(now, 27), burned: true } });
    for (const key of ["source", "originalSource", "slot", "oldestDebtAt", "deadlineAt"] as const) expect(intent[key]).toEqual(before[key]);
    expect(state.agents).toEqual({});
  });
  it("keeps the null-start control of the same census on the hosted fallback", async () => {
    const h = await admissionHarness(); finishPlaceholders(h, { started_at: null }, { started_at: null }, { started_at: null });
    await h.controller.tick(after(now, 26)); expect((await h.store.read()).state.intents[h.intentId]!.nextAction).toBe("dispatch-hosted");
  });
  it("does not turn a failed preflight with real skipped placeholders into an admission failure", async () => {
    const h = await admissionHarness(); h.run.status = "completed"; h.run.conclusion = "failure";
    h.jobs.splice(0, h.jobs.length, preflightJob({ conclusion: "failure" }), skippedPlaceholder({ id: 5, name: "tests", labels: [], completed_at: skippedAt }), skippedPlaceholder({ id: 4, name: "qualify", labels: ["ubuntu-24.04"], completed_at: skippedAt }), skippedPlaceholder({ completed_at: skippedAt }));
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it.each([
    ["target started one second after creation", { started_at: after(placed, 1 / 60) }, {}, {}],
    ["target started one second before creation", { started_at: after(placed, -1 / 60) }, {}, {}],
    ["target start spelled differently for the same instant", { started_at: placed.replace(".000Z", "Z") }, {}, {}],
    ["target creation absent", { created_at: undefined }, {}, {}], ["target creation null", { created_at: null }, {}, {}],
    ["target runner id", { runner_id: 1153 }, {}, {}], ["target runner name", { runner_name: "assigned-vm" }, {}, {}],
    ["target runner group id", { runner_group_id: 1 }, {}, {}], ["target runner group name", { runner_group_name: "Default" }, {}, {}],
    ["target runner group id absent", { runner_group_id: undefined }, {}, {}], ["target runner group name absent", { runner_group_name: undefined }, {}, {}],
    ["target completed step", { steps: [{ name: "Set up job", number: 1, status: "completed", conclusion: "success", started_at: placed, completed_at: placed }] }, {}, {}],
    ["target queued step", { steps: [{ name: "Set up job", number: 1, status: "queued", conclusion: null, started_at: null, completed_at: null }] }, {}, {}],
    ["target still in progress", { status: "in_progress" }, {}, {}], ["target completion absent", { completed_at: null }, {}, {}],
    ["native companion failed", {}, { conclusion: "failure" }, {}], ["native companion started after creation", {}, { started_at: after(skippedAt, 1 / 60) }, {}],
    ["Ubuntu companion cancelled after a listed step", {}, {}, { conclusion: "cancelled", steps: [{ status: "completed", conclusion: "success", started_at: skippedAt, completed_at: skippedAt }] }], ["Ubuntu companion assigned", {}, {}, { runner_id: 20, runner_name: "GitHub Actions 20" }],
  ])("refuses no-start fallback for %s", async (_label, target, upload, qualify) => {
    const h = await admissionHarness(); finishPlaceholders(h, target, upload, qualify);
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it("refuses a cancelled placeholder from a foreign executor", async () => {
    const h = await admissionHarness(); finishPlaceholders(h, {}, {}, {}, cancelledWhileQueued({ id: 6, name: "other", labels: ["windows-latest"] }));
    await h.controller.tick(after(now, 26)); await expectRepair(h);
  });
  it("keeps the queued admission census strict for a creation-time start", async () => {
    const h = await admissionHarness(); h.jobs[0] = nativeJob({ created_at: placed, started_at: placed, runner_id: 0, runner_name: "", runner_group_id: 0, runner_group_name: "" });
    await h.controller.tick(after(now, 16)); expect(h.cancel).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 180)); expect(h.cancel).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 180 + 1 / 60_000)); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
  });
  it("lets a terminal skipped placeholder accompany strictly queued native work", async () => {
    const h = await admissionHarness(); h.jobs.push(skippedPlaceholder({ created_at: placed, started_at: placed, completed_at: after(placed, -1 / 60) }));
    await h.controller.tick(after(now, 15)); expect(h.cancel).not.toHaveBeenCalled();
    await h.controller.tick(after(now, 15 + 1 / 60_000)); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("100");
  });
  it.each([["an exact placeholder", skippedAt, true], ["a start one second after creation", after(skippedAt, 1 / 60), false]])("records hosted-lane termination beside a skipped unlabelled companion only for %s", async (_label, started, ended) => {
    const h = await admissionHarness("hosted"); h.run.status = "completed"; h.run.conclusion = "failure";
    h.jobs.splice(0, h.jobs.length, preflightJob(), nativeJob({ status: "completed", conclusion: "failure", started_at: after(now, 2), completed_at: after(now, 16), runner_id: 3, runner_name: "GitHub Actions 3", runner_group_id: 0, runner_group_name: "GitHub Actions", labels: ["macos-26-xlarge"], steps: [{ name: "Set up job", number: 1, status: "completed", conclusion: "success", started_at: after(now, 2), completed_at: after(now, 2) }] }), skippedPlaceholder({ id: 5, name: "tests", labels: [], started_at: started, completed_at: skippedAt }));
    await h.controller.tick(after(now, 26)); const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.attempts[0]!.status).toBe(ended ? "failed" : "active");
    expect(intent.attempts[0]!.quiescence).toEqual(ended ? { kind: "hosted-terminated", ref: "GitHub hosted ephemeral VM job completion: 2,1,5", observedAt: after(now, 26) } : undefined);
    expect(intent.nextAction).toBe("run-repair-agent"); expect(Object.values(state.agents)).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled();
    expect(Object.values(state.agents)[0]!.evidence.includes("Native admission absence is not proved; host-side owned process/VM termination evidence is required before replacement")).toBe(!ended);
  });
  it.each([["run", { run_id: 999 }], ["attempt", { run_attempt: 2 }], ["head", { head_sha: "d".repeat(40) }]])("cannot authorize fallback from a placeholder on the wrong %s", async (_label, upload) => {
    const h = await admissionHarness(); finishPlaceholders(h, {}, upload);
    const result = await h.controller.tick(after(now, 26)), intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(result.errors.map(error => error.message)).toEqual(["Job census does not match the exact workflow run attempt"]); expect(intent.state).toBe("waiting"); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.quiescence).toBeUndefined(); expect(h.dispatch).not.toHaveBeenCalled();
  });
});
describe("controller failure sequences", () => {
  it("finds an existing dispatch after restart without another request or build reservation", async () => {
    const h = await harness(); await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(h.dispatch).not.toHaveBeenCalled(); expect(state.intents[h.intentId]!.attempts).toHaveLength(1); expect(state.intents[h.intentId]!.attempts[0]!.artifactsVerifiedAt).toBe(after(now, 5)); expect(state.builds["123/1.0"]!.maximum).toBe("8");
  });
  it("resolves ambiguous upload to the same exact accepted build without dispatch/upload replay", async () => {
    const h = await harness(true); h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(after(now, 5)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.state).toBe("delivered"); expect(intent.receipt!.observation.buildId).toBe("apple-build"); expect(intent.receipt!.providerUploadId).toBe("resource"); expect(intent.attempts).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
  });
  it.each(["UNKNOWN", "PROCESSING", "MISSING_EXPORT_COMPLIANCE"])("waits for internal readiness (%s), then promotes and verifies the same accepted build", async betaState => {
    const h = await harness(true), unassigned = { ...observation(), betaState, group: { ...observation().group, buildIds: [] } };
    h.observe.mockResolvedValue({ observation: unassigned });
    await h.controller.tick(after(now, 5));
    let state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(h.assign).not.toHaveBeenCalled(); expect(state.groupOperations).toEqual({});
    expect(intent.state).toBe("processing"); expect(intent.receipt).toBeUndefined();
    expect(intent.attempts[0]!.upload!.outcome).toBe("accepted");
    h.observe.mockResolvedValue({ observation: { ...unassigned, betaState: "READY_FOR_BETA_TESTING" } });
    await h.controller.tick(after(now, 10));
    expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "staging");
    expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
    h.observe.mockResolvedValue({ observation: observation() });
    await h.controller.tick(after(now, 15));
    state = (await h.store.read()).state; intent = state.intents[h.intentId]!;
    expect(intent.state).toBe("delivered"); expect(intent.receipt!.observation.buildId).toBe("apple-build");
    expect(intent.receipt!.providerUploadId).toBe("resource"); expect(intent.attempts).toHaveLength(1);
    expect(h.dispatch).not.toHaveBeenCalled(); expect(h.assign).toHaveBeenCalledTimes(1);
  });
  it("retains accepted bytes and requests bounded diagnosis when internal readiness never arrives", async () => {
    const h = await harness(true);
    h.observe.mockResolvedValue({ observation: { ...observation(), betaState: "UNKNOWN", group: { ...observation().group, buildIds: [] } } });
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 40));
    const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.state).toBe("repairing"); expect(intent.attempts).toHaveLength(1);
    expect(intent.attempts[0]!.upload!.outcome).toBe("accepted"); expect(intent.receipt).toBeUndefined();
    expect(Object.values(state.agents)[0]!.evidence[0]).toContain("internal beta readiness");
    expect(h.assign).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("retries group distribution on the accepted identity after a transient provider failure", async () => {
    const h = await harness(true); h.observe.mockResolvedValue({ observation: { ...observation(), group: { ...observation().group, buildIds: [] } } }); h.assign.mockRejectedValueOnce(new Error("provider transient"));
    const first = await h.controller.tick(after(now, 5)); expect(first.errors[0]!.message).toBe("provider transient");
    h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(after(now, 10)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.state).toBe("delivered"); expect(intent.attempts).toHaveLength(1); expect(intent.receipt!.observation.buildNumber).toBe("8"); expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "staging"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("keeps a paused possibly-live uploader reserved after lease expiry and observation timeout", async () => {
    const h = await harness(true); await h.store.transact("expire", "fixture", now, state => { state.intents[h.intentId]!.attempts[0]!.lease!.expiresAt = now; return null; });
    await h.controller.tick(after(now, 40)); const state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(intent.attempts).toHaveLength(1); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.upload!.outcome).toBe("uncertain"); expect(intent.nextAction).toBe("run-repair-agent"); expect(Object.values(state.agents)).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("keeps accepted bytes reserved when the hook wins after absence but before retirement", async () => {
    const h = await harness(true); h.run.status = "completed"; h.run.conclusion = "failure";
    await h.store.transact("host-stopped", "fixture", now, state => { const attempt = state.intents[h.intentId]!.attempts[0]!; attempt.quiescence = { kind: "host-terminated", ref: "Owned VM terminated", observedAt: now }; attempt.uploadObservations = [{ at: after(now, 5) }]; return null; });
    const transact = h.store.transact.bind(h.store); let injected = false;
    vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, at, transition) => {
      if (id.startsWith("retire-") && !injected) { injected = true; await transact("late-acceptance-hook", "record-upload-result", at, state => { recordUpload(state, { ...h.upload, outcome: "accepted", providerUploadId: "resource" }, at); return null; }); }
      return transact(id, kind, at, transition);
    });
    await h.controller.tick(after(now, 40)); let intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(injected).toBe(true); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.upload!.acceptedAt).toBe(after(now, 40)); expect(intent.state).toBe("processing");
    await h.controller.tick(after(now, 45)); intent = (await h.store.read()).state.intents[h.intentId]!; expect(intent.attempts).toHaveLength(1); expect(intent.attempts[0]!.buildNumber).toBe("8"); expect(h.dispatch).not.toHaveBeenCalled();
    h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(after(now, 50)); expect((await h.store.read()).state.intents[h.intentId]!.receipt!.attemptId).toBe(h.attemptId);
  });
  it("replaces a still-absent uncertain upload after proven quiescence and observation", async () => {
    const h = await harness(true); h.run.status = "completed"; h.run.conclusion = "failure";
    await h.store.transact("host-stopped", "fixture", now, state => { const attempt = state.intents[h.intentId]!.attempts[0]!; attempt.quiescence = { kind: "host-terminated", ref: "Owned VM terminated", observedAt: now }; attempt.uploadObservations = [{ at: after(now, 5) }]; return null; });
    await h.controller.tick(after(now, 40)); expect((await h.store.read()).state.intents[h.intentId]!.attempts[0]!.status).toBe("retired-uncertain");
    await h.controller.tick(after(now, 45)); const intent = (await h.store.read()).state.intents[h.intentId]!; expect(intent.attempts).toHaveLength(2); expect(intent.attempts[1]!.buildNumber).toBe("9"); expect(h.dispatch).toHaveBeenCalledTimes(1);
  });
  it("retains a build observed by another poller before its acceptance transaction", async () => {
    const h = await harness(true); h.run.status = "completed"; h.run.conclusion = "failure";
    await h.store.transact("host-stopped", "fixture", now, state => { const attempt = state.intents[h.intentId]!.attempts[0]!; attempt.quiescence = { kind: "host-terminated", ref: "Owned VM terminated", observedAt: now }; attempt.uploadObservations = [{ at: after(now, 5) }]; return null; });
    const transact = h.store.transact.bind(h.store); let visiblePaused!: () => void, releaseVisible!: () => void;
    const paused = new Promise<void>(resolve => { visiblePaused = resolve; }), blocked = new Promise<void>(resolve => { releaseVisible = resolve; });
    vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, at, transition) => { if (kind === "exact-build-observation") { visiblePaused(); await blocked; } return transact(id, kind, at, transition); });
    h.observe.mockResolvedValueOnce({ observation: observation() }).mockResolvedValue({}); const visible = h.controller.tick(after(now, 40)); await paused;
    try {
      await h.controller.tick(after(now, 40)); await h.controller.tick(after(now, 45)); const intent = (await h.store.read()).state.intents[h.intentId]!;
      expect(intent.attempts).toHaveLength(1); expect(intent.attempts[0]!.status).toBe("active"); expect(intent.attempts[0]!.uploadObservations!.some(item => item.buildId === "apple-build")).toBe(true); expect(h.dispatch).not.toHaveBeenCalled();
    } finally { releaseVisible(); await visible; }
    expect((await h.store.read()).state.intents[h.intentId]!.receipt!.attemptId).toBe(h.attemptId);
  });
  it("diagnoses terminal upload rejection when no matching build exists", async () => {
    const h = await harness(true); h.observe.mockResolvedValue({ uploadState: "FAILED", diagnostics: "90683" }); await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(state.intents[h.intentId]!.attempts[0]!.status).toBe("failed"); expect(state.intents[h.intentId]!.state).toBe("repairing"); expect(Object.values(state.agents)[0]!.task).toContain("90683"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("a terminal resource hook atomically owns repair through later ticks", async () => {
    const h = await harness(true);
    await h.store.transact("resource-hook", "record-upload-result", now, state => { recordUpload(state, uploadEvidence({ ...h.upload, state: "FAILED", uploadId: "resource", diagnosticCodes: ["90683"] }), now); return null; });
    await h.controller.tick(after(now, 5)); await h.controller.tick(after(now, 10)); const state = (await h.store.read()).state;
    expect(state.intents[h.intentId]!.state).toBe("repairing"); expect(state.intents[h.intentId]!.attempts[0]!.status).toBe("failed"); expect(Object.values(state.agents)).toHaveLength(1); expect(Object.values(state.agents)[0]!.task).toContain("90683"); expect(Object.values(state.agents)[0]!.state).toBe("pending"); expect(h.dispatch).not.toHaveBeenCalled();
  });
  it("never counts or promotes a late retired build", async () => {
    const h = await harness(true); await h.store.transact("retire", "fixture", now, state => { state.intents[h.intentId]!.attempts[0]!.status = "retired-uncertain"; state.intents[h.intentId]!.state = "paused"; return null; });
    h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(state.intents[h.intentId]!.receipt).toBeUndefined(); expect(state.cursors.staging).toBeUndefined(); expect(state.intents[h.intentId]!.attempts[0]!.uploadObservations!.at(-1)!.buildId).toBe("apple-build"); expect(h.assign).not.toHaveBeenCalled();
  });
  it("observation mode computes decisions without any ledger write or effect", async () => {
    const h = await harness(), before = (await h.store.read()).head; await h.controller.tick(after(now, 5), true);
    expect((await h.store.read()).head).toBe(before); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled();
  });
  it("rejects a forged validator before marking downloaded tests verified", async () => {
    const h = await harness(); vi.mocked(verifyValidator).mockImplementationOnce(() => { throw new Error("Test validator hash differs from trusted revision"); });
    const result = await h.controller.tick(after(now, 5)); expect(result.errors[0]!.message).toContain("validator hash differs"); expect((await h.store.read()).state.intents[h.intentId]!.attempts[0]!.artifactsVerifiedAt).toBeUndefined();
  });
  it("native capacity is an ordinary retryable wait and starts after capacity returns", async () => {
    const h = await harness(false, 1); const production = await h.store.transact("production-request", "fixture", now, state => createIntent(state, h.cfg, "production", state.sources[0]!, now, now).id);
    await h.controller.tick(after(now, 5)); let state = (await h.store.read()).state; expect(state.intents[production.result]!.state).toBe("waiting"); expect(state.intents[production.result]!.nextAction).toBe("wait-native-capacity"); expect(Object.keys(state.agents)).toEqual([]);
    await h.store.transact("free-capacity", "fixture", now, state => { state.intents[h.intentId]!.attempts[0]!.status = "failed"; state.intents[h.intentId]!.state = "paused"; return null; });
    await h.controller.tick(after(now, 10)); state = (await h.store.read()).state; expect(state.intents[production.result]!.state).toBe("testing"); expect(state.intents[production.result]!.attempts).toHaveLength(1); expect(Object.keys(state.agents)).toEqual([]); expect(h.dispatch).toHaveBeenCalledTimes(1);
  });
  it("transient provider admission failure retries without creating a permanent repair", async () => {
    const h = await harness(); const production = await h.store.transact("production-request", "fixture", now, state => createIntent(state, h.cfg, "production", state.sources[0]!, now, now).id);
    vi.spyOn(h.apple, "maximum").mockRejectedValueOnce(new CdWait("Apple HTTP503", "apple-provider")).mockResolvedValue("8");
    await h.controller.tick(after(now, 5)); expect((await h.store.read()).state.intents[production.result]!.nextAction).toBe("wait-apple-provider"); expect(Object.keys((await h.store.read()).state.agents)).toEqual([]);
    await h.controller.tick(after(now, 10)); expect((await h.store.read()).state.intents[production.result]!.attempts).toHaveLength(1); expect(h.dispatch).toHaveBeenCalledTimes(1);
  });
  it("consumes later host quiescence and resumes infrastructure repair without a fake PR", async () => {
    const h = await harness(); h.run.status = "completed"; h.run.conclusion = "failure";
    await h.controller.tick(after(now, 5)); expect((await h.store.read()).state.intents[h.intentId]!.attempts[0]!.status).toBe("active");
    await h.store.transact("record-host-quiescence", "record-executor-quiescence", after(now, 6), state => { state.intents[h.intentId]!.attempts[0]!.quiescence = { kind: "host-terminated", ref: "Owned VM terminated and its replacement verified online", observedAt: after(now, 6) }; return null; });
    await h.controller.tick(after(now, 10)); expect((await h.store.read()).state.intents[h.intentId]!.attempts[0]!.status).toBe("failed");
    await h.store.transact("operational-repair", "agent-checkpoint", after(now, 11), state => { completeOperationalRepair(state, h.intentId, ["Owned VM restored; exact failed workflow terminal"], after(now, 11)); for (const work of Object.values(state.agents)) work.state = "complete"; return null; });
    await h.controller.tick(after(now, 15)); const intent = (await h.store.read()).state.intents[h.intentId]!; expect(intent.attempts).toHaveLength(2); expect(intent.attempts[0]!.buildNumber).toBe("8"); expect(intent.attempts[1]!.buildNumber).toBe("9"); expect(intent.originalSource).toBe("a".repeat(40)); expect(h.dispatch).toHaveBeenCalledTimes(1);
  });
});

async function acceptedHarness(change?: (attempt: Attempt, state: CdState) => void, allowedSkips: string[] = [], physical = false) {
  const cfg = config(); cfg.tests.allowedSkips = allowedSkips;
  if (physical) cfg.tests.physicalDevice = physicalPolicy();
  const fixture = prepared("staging", cfg), intent = fixture.state.intents[fixture.intentId]!, attempt = intent.attempts[0]!;
  if (allowedSkips.includes(fixture.tests.results[0]!.id)) { fixture.tests.results[0]!.status = "skipped"; delete attempt.tests; recordTests(fixture.state, cfg, fixture.tests); }
  claimUpload(fixture.state, cfg, fixture.upload, now); recordUpload(fixture.state, { ...fixture.upload, outcome: "accepted", providerUploadId: "resource" }, now);
  attempt.artifactsVerifiedAt = now; fixture.state.evaluatedSlots = { staging: now, production: now };
  repairWork(fixture.state, intent.id, ["Historical artifact download outage"], now);
  change?.(attempt, fixture.state);
  const api = new FakeGitHub(), store = new GitHubStore(api, cfg);
  await store.initialize(now, "epoch");
  await store.transact("seed-accepted", "fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  const run: WorkflowRun = { id: 100, run_attempt: 1, status: "completed", conclusion: "success", head_sha: attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${attempt.dispatchEffectId}`, created_at: now, updated_at: after(now, 1) };
  const actions = new ActionsAdapter(api, cfg), runs = vi.spyOn(actions, "runs").mockResolvedValue([run]);
  const evidence = vi.spyOn(actions, "evidence").mockRejectedValue(new Error("Artifact egress unavailable")), dispatch = vi.spyOn(actions, "dispatch").mockResolvedValue(), cancel = vi.spyOn(actions, "cancel").mockResolvedValue();
  const apple = new AppleAdapter({ request: vi.fn() }), observe = vi.spyOn(apple, "observe").mockResolvedValue({ observation: observation() }), assign = vi.spyOn(apple, "assign").mockResolvedValue();
  return { ...fixture, cfg, api, store, actions, apple, run, runs, evidence, dispatch, cancel, observe, assign, controller: new Controller(cfg, store, actions, apple, "/unused-source") };
}

describe("durable accepted-upload test proof", () => {
  it("reuses a required physical-device proof through exact Apple receipt without redownloading or rewriting it", async () => {
    const h = await acceptedHarness(undefined, [], true), before = (await h.store.read()).state;
    const result = await h.controller.tick(after(now, 2)), state = (await h.store.read()).state;
    expect(result.errors).toEqual([]); expect(h.evidence).not.toHaveBeenCalled(); expect(h.observe).toHaveBeenCalledTimes(1);
    expect(state.intents[h.intentId]!.attempts[0]!.tests).toEqual(before.intents[h.intentId]!.attempts[0]!.tests);
    expect(state.intents[h.intentId]!.receipt!.testEvidenceHash).toBe(before.intents[h.intentId]!.attempts[0]!.tests!.evidenceHash);
    for (const key of ["builds", "budget", "fences", "pauses", "sources", "slots"] as const) expect(state[key]).toEqual(before[key]);
  });
  it.each(["missing", "device", "host", "inventory", "source", "retry", "payload"] as const)("refuses conflicting required physical %s before Apple or artifact access", async kind => {
    const h = await acceptedHarness(attempt => {
      if (kind === "missing") delete attempt.tests!.physicalDevice;
      else {
        const proof = attempt.tests!.physicalDevice!;
        if (kind === "device") proof.deviceId = "other";
        if (kind === "host") proof.hostId = "other";
        if (kind === "inventory") proof.inventoryHash = hash("partial");
        if (kind === "source") proof.sourceSha = "d".repeat(40);
        if (kind === "retry") proof.firstAttemptPassed = false as true;
        if (kind === "payload") proof.artifacts = [{ name: "absent.json", sha256: hash("absent") }];
      }
    }, [], true);
    const before = (await h.store.read()).state, result = await h.controller.tick(after(now, 2)), state = (await h.store.read()).state;
    expect(result.errors).toHaveLength(1); expect(h.evidence).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled();
    expect(h.assign).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
    expect(state.intents[h.intentId]!.receipt).toBeUndefined();
    for (const key of ["builds", "budget", "fences", "pauses", "sources", "slots"] as const) expect(state[key]).toEqual(before[key]);
  });
  it("delivers through ordinary Apple readback without redownloading or rewriting the proof", async () => {
    const h = await acceptedHarness(), before = (await h.store.read()).state, proof = before.intents[h.intentId]!.attempts[0]!.tests!;
    const result = await h.controller.tick(after(now, 2)), state = (await h.store.read()).state, intent = state.intents[h.intentId]!;
    expect(result.errors).toEqual([]); expect(h.runs).toHaveBeenCalledExactlyOnceWith(before.intents[h.intentId]!.attempts[0]!.dispatchEffectId);
    expect(h.evidence).not.toHaveBeenCalled(); expect(verifyValidator).toHaveBeenCalledExactlyOnceWith("/unused-source", proof);
    expect(h.observe).toHaveBeenCalledTimes(1); expect(h.assign).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.cancel).not.toHaveBeenCalled();
    expect(intent.receipt).toEqual({ schemaVersion: 1, intentId: h.intentId, attemptId: h.attemptId, dispatchEffectId: proof.dispatchEffectId, sourceSha: proof.sourceSha, controlSha: proof.controlSha, runId: "100", runAttempt: "1", appInputDigest: proof.appInputDigest, configurationDigest: proof.configurationDigest, ipaSha256: h.upload.ipaSha256, uploadOperationId: `upload:${h.attemptId}`, providerUploadId: "resource", testEvidenceHash: proof.evidenceHash, observation: observation(), deliveredAt: after(now, 2) });
    expect(intent.attempts[0]!.tests).toEqual(proof); expect(intent.attempts[0]!.artifactsVerifiedAt).toBe(now);
    expect(intent.attempts[0]!.upload).toEqual(before.intents[h.intentId]!.attempts[0]!.upload); expect(Object.values(state.agents).map(work => work.state)).toEqual(["complete"]);
    for (const key of ["builds", "budget", "fences", "pauses", "sources", "slots"] as const) expect(state[key]).toEqual(before[key]);
    const workflow = Object.values(state.transitions).filter(item => (item.result as { artifacts?: number } | null)?.artifacts === 0);
    expect(workflow.map(item => item.result)).toEqual([{ runId: "100", artifacts: 0 }]);
    expect(state.cursors.staging).toEqual({ sourceSha: proof.sourceSha, order: 0, receiptId: h.intentId });
    expect(state.groupCursors.staging).toEqual({ sourceSha: proof.sourceSha, order: 0, receiptId: h.intentId });
  });
  it.each(["failure", "cancelled"])("keeps accepted bytes recoverable after terminal %s cleanup", async conclusion => {
    const h = await acceptedHarness(attempt => { attempt.lease!.expiresAt = after(now, -1); }); h.run.conclusion = conclusion;
    const result = await h.controller.tick(after(now, 2)); expect(result.errors).toEqual([]); expect(h.evidence).not.toHaveBeenCalled();
    expect((await h.store.read()).state.intents[h.intentId]!.receipt!.providerUploadId).toBe("resource");
  });
  it("allows a resource-less accepted operation", async () => {
    const h = await acceptedHarness(attempt => { delete attempt.upload!.providerUploadId; });
    const result = await h.controller.tick(after(now, 2)); expect(result.errors).toEqual([]); expect(h.evidence).not.toHaveBeenCalled();
    expect((await h.store.read()).state.intents[h.intentId]!.receipt!.providerUploadId).toBeUndefined();
  });
  it.each(["equal", "duplicate", "over-count"])("checks allowed skip %s boundaries independently", async kind => {
    const h = await acceptedHarness(attempt => {
      if (kind === "duplicate") attempt.tests!.skippedIds.push("AppTests/testFull");
      if (kind === "over-count") attempt.tests!.skippedIds.push("Other/allowed");
    }, ["AppTests/testFull", "Other/allowed"]);
    const result = await h.controller.tick(after(now, 2)); expect(h.evidence).not.toHaveBeenCalled();
    if (kind === "equal") { expect(result.errors).toEqual([]); expect((await h.store.read()).state.intents[h.intentId]!.receipt!.testEvidenceHash).toBe(h.state.intents[h.intentId]!.attempts[0]!.tests!.evidenceHash); }
    else { expect(result.errors).toEqual([{ intentId: h.intentId, message: "Reusable full-test skips differ from policy" }]); expect(h.observe).not.toHaveBeenCalled(); }
  });
  it.each([
    ["no proof", (a: Attempt) => { delete a.tests; }],
    ["no verification marker", (a: Attempt) => { delete a.artifactsVerifiedAt; }],
    ["no accepted time", (a: Attempt) => { delete a.upload!.acceptedAt; }],
    ["claim only", (a: Attempt) => { a.upload!.outcome = "claimed"; }],
    ["uncertain", (a: Attempt) => { a.upload!.outcome = "uncertain"; }],
    ["rejected", (a: Attempt) => { a.upload!.outcome = "rejected"; }],
  ] as const)("retains the original artifact path for %s", async (_label, change) => {
    const h = await acceptedHarness(change), result = await h.controller.tick(after(now, 2));
    expect(h.evidence).toHaveBeenCalledExactlyOnceWith(h.run, expect.objectContaining({ id: h.attemptId }));
    expect(result.errors).toEqual([{ intentId: h.intentId, message: "Artifact egress unavailable" }]); expect(h.observe).not.toHaveBeenCalled();
    expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
  });
  it("does not reuse proof before the exact workflow becomes terminal", async () => {
    const h = await acceptedHarness(); h.run.status = "in_progress"; h.run.conclusion = null;
    await h.controller.tick(after(now, 2)); expect(h.evidence).toHaveBeenCalledTimes(1); expect(h.observe).not.toHaveBeenCalled();
  });
  it.each([
    ["schema", (a: Attempt) => { a.tests!.schemaVersion = 2 as 1; }],
    ...(["intentId", "attemptId", "dispatchEffectId", "sourceSha", "controlSha", "runId", "runAttempt"] as const).flatMap(key => [
      [`proof ${key}`, (a: Attempt) => { a.tests![key] = "substitution"; }],
      [`upload ${key}`, (a: Attempt) => { a.upload!.identity[key] = "substitution"; }],
    ] as const),
    ["upload schema", (a: Attempt) => { a.upload!.identity.schemaVersion = 2 as 1; }],
    ["input", (a: Attempt) => { a.tests!.appInputDigest = hash("other"); }],
    ["configuration", (a: Attempt) => { a.tests!.configurationDigest = hash("other"); }],
    ["attempt configuration", (a: Attempt) => { a.configurationDigest = hash("other"); }],
    ["scope", (a: Attempt) => { a.tests!.scope = "focused" as "full"; }],
    ["evidence hash", (a: Attempt) => { a.tests!.evidenceHash = "a".repeat(63); }],
    ["inventory hash", (a: Attempt) => { a.tests!.inventoryHash = "not-a-hash"; }],
    ["zero executions", (a: Attempt) => { a.tests!.executedCount = 0; }],
    ["fractional executions", (a: Attempt) => { a.tests!.executedCount = 1.5; }],
    ["unsafe executions", (a: Attempt) => { a.tests!.executedCount = Number.MAX_SAFE_INTEGER + 1; }],
    ["unexpected skip", (a: Attempt) => { a.tests!.skippedIds = ["unexpected"]; }],
    ["duplicate skip", (a: Attempt) => { a.tests!.skippedIds = ["unexpected", "unexpected"]; }],
    ["missing artifacts", (a: Attempt) => { a.tests!.artifacts = []; }],
    ["artifact hash", (a: Attempt) => { a.tests!.artifacts[0]!.sha256 = "wrong"; }],
    ["artifact name", (a: Attempt) => { a.tests!.artifacts[0]!.name = ""; }],
    ["validator hash", (a: Attempt) => { a.tests!.validator.sha256 = "wrong"; }],
    ["validator revision", (a: Attempt) => { a.tests!.validator.revision = "main" as "source"; }],
    ["artifact time", (a: Attempt) => { a.artifactsVerifiedAt = "invalid"; }],
    ["accepted time", (a: Attempt) => { a.upload!.acceptedAt = "invalid"; }],
    ["claim time", (a: Attempt) => { a.upload!.claimedAt = "invalid"; }],
    ["operation", (a: Attempt) => { a.upload!.id = "other-operation"; }],
    ["identity operation", (a: Attempt) => { a.upload!.identity.uploadOperationId = "other-operation"; }],
    ["fence zero", (a: Attempt) => { a.upload!.fence = 0; }],
    ["fence mismatch", (a: Attempt) => { a.upload!.fence++; }],
    ["current ledger fence", (a: Attempt, s: CdState) => { s.fences[a.id] = s.fences[a.id]! + 1; }],
    ["lease fence", (a: Attempt) => { a.lease!.fence++; }],
    ["lease owner", (a: Attempt) => { a.lease!.owner = "100/2"; }],
    ["lease time", (a: Attempt) => { a.lease!.expiresAt = "invalid"; }],
    ["app", (a: Attempt) => { a.upload!.identity.appId = "456"; }],
    ["version", (a: Attempt) => { a.upload!.identity.version = "2.0"; }],
    ["build", (a: Attempt) => { a.upload!.identity.buildNumber = "9"; }],
    ["IPA", (a: Attempt) => { a.upload!.identity.ipaSha256 = "wrong"; }],
    ["provider id", (a: Attempt) => { a.upload!.providerUploadId = ""; }],
    ["source catalogue", (_a: Attempt, s: CdState) => { s.sources[0]!.inputDigest = hash("different source inputs"); }],
    ["reservation missing", (a: Attempt, s: CdState) => { delete s.builds[`${a.appId}/${a.version}`]!.reservations[a.id]; }],
    ["reservation unburned", (a: Attempt, s: CdState) => { s.builds[`${a.appId}/${a.version}`]!.reservations[a.id]!.burned = false; }],
    ["reservation malformed", (a: Attempt, s: CdState) => { s.builds[`${a.appId}/${a.version}`]!.reservations[a.id]!.burned = "true" as unknown as boolean; }],
    ["reservation build", (a: Attempt, s: CdState) => { s.builds[`${a.appId}/${a.version}`]!.reservations[a.id]!.buildNumber = "9"; }],
    ["stale latest attempt", (a: Attempt, s: CdState) => { s.intents[a.tests!.intentId]!.attempts.push({ ...structuredClone(a), id: "newer", status: "failed" }); }],
  ] as const)("refuses conflicting reusable %s before Apple or artifact access", async (_label, change) => {
    const h = await acceptedHarness(change), result = await h.controller.tick(after(now, 2));
    expect(result.errors).toHaveLength(1); expect(result.errors[0]!.message).toContain("Reusable");
    expect(h.evidence).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
    expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
  });
  it.each(["head", "event", "path", "effect"])("still verifies fresh workflow %s before using durable proof", async kind => {
    const h = await acceptedHarness();
    if (kind === "head") h.run.head_sha = "f".repeat(40); else if (kind === "event") h.run.event = "push"; else if (kind === "path") h.run.path = ".github/workflows/other.yml"; else h.run.display_title = "CD other-effect";
    const result = await h.controller.tick(after(now, 2)); expect(result.errors).toHaveLength(1); expect(h.evidence).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled();
  });
  it("refuses an absent bound run in the complete sweep, while cancelling real duplicates before recovery", async () => {
    const h = await acceptedHarness(), duplicate = { ...h.run, id: 101, status: "in_progress", conclusion: null };
    h.runs.mockResolvedValue([duplicate]); await h.controller.tick(after(now, 2)); expect(h.cancel).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled();
    h.runs.mockResolvedValue([duplicate, h.run]); const result = await h.controller.tick(after(now, 8));
    expect(result.errors).toEqual([]); expect(h.cancel).toHaveBeenCalledExactlyOnceWith("101"); expect(h.observe).toHaveBeenCalledTimes(1); expect(h.evidence).not.toHaveBeenCalled();
    expect((await h.store.read()).state.intents[h.intentId]!.attempts[0]!.dispatch.runIds).toEqual(["100", "101"]);
  });
  it("resolves a newer visible rerun back to the accepted bound original attempt", async () => {
    const h = await acceptedHarness(); h.runs.mockResolvedValue([{ ...h.run, run_attempt: 2 }]);
    const exact = vi.spyOn(h.actions, "runAttempt").mockResolvedValue(h.run);
    const result = await h.controller.tick(after(now, 2)); expect(result.errors).toEqual([]); expect(exact).toHaveBeenCalledExactlyOnceWith("100", "1");
    expect(h.evidence).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.receipt!.runAttempt).toBe("1");
  });
  it("rechecks the pinned validator and refuses before Apple if it changed", async () => {
    const h = await acceptedHarness(); vi.mocked(verifyValidator).mockImplementation(() => { throw new Error("Test validator hash differs from trusted revision"); });
    const result = await h.controller.tick(after(now, 2)); expect(result.errors).toEqual([{ intentId: h.intentId, message: "Test validator hash differs from trusted revision" }]);
    expect(h.evidence).not.toHaveBeenCalled(); expect(h.observe).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
  });
  it.each(["PROCESSING", "beta", "wrong-group", "missing-testers"])("does not convert proof reuse into false Apple availability for %s", async kind => {
    const h = await acceptedHarness(), seen = observation();
    if (kind === "PROCESSING") seen.processingState = kind; else if (kind === "beta") seen.betaState = "PROCESSING"; else if (kind === "wrong-group") seen.group.id = "wrong"; else seen.group.testerIds = [];
    h.observe.mockResolvedValue({ observation: seen }); await h.controller.tick(after(now, 2));
    expect(h.evidence).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined(); expect(h.assign).not.toHaveBeenCalled();
  });
  it("retains normal missing-membership claim and read-first recovery", async () => {
    const h = await acceptedHarness(), seen = observation(); seen.group.buildIds = []; h.observe.mockResolvedValueOnce({ observation: seen });
    await h.controller.tick(after(now, 2)); expect(h.assign).toHaveBeenCalledExactlyOnceWith("apple-build", "staging"); expect((await h.store.read()).state.intents[h.intentId]!.receipt).toBeUndefined();
    await h.controller.tick(after(now, 8)); expect(h.assign).toHaveBeenCalledTimes(1); expect(h.evidence).not.toHaveBeenCalled(); expect((await h.store.read()).state.intents[h.intentId]!.receipt!.observation.buildId).toBe("apple-build");
  });
  it("respects a pause committed after proof validation without promoting or delivering", async () => {
    const h = await acceptedHarness(), transact = h.store.transact.bind(h.store); let injected = false;
    vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, at, transition) => {
      if (kind === "observe-workflow" && !injected) { injected = true; await transact("racing-pause", "fixture-pause", at, state => { state.pauses.push({ scope: h.intentId, actor: "operator", human: true, reason: "hold", resumeCondition: "explicit", createdAt: at }); return null; }); }
      return transact(id, kind, at, transition);
    });
    await h.controller.tick(after(now, 2)); const state = (await h.store.read()).state;
    expect(injected).toBe(true); expect(state.intents[h.intentId]!.receipt).toBeUndefined(); expect(h.assign).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled(); expect(state.pauses.map(p => p.reason)).toEqual(["hold"]);
  });
  it("keeps a receipt committed by another reconciler after proof validation immutable", async () => {
    const h = await acceptedHarness(), transact = h.store.transact.bind(h.store); let injected = false;
    vi.spyOn(h.store, "transact").mockImplementation(async (id, kind, at, transition) => {
      if (kind === "observe-workflow" && !injected) { injected = true; await transact("racing-receipt", "fixture-delivery", at, state => deliver(state, h.intentId, h.attemptId, observation(), after(now, 1))); }
      return transact(id, kind, at, transition);
    });
    const result = await h.controller.tick(after(now, 2)), intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(result.errors).toEqual([]); expect(injected).toBe(true); expect(intent.receipt!.deliveredAt).toBe(after(now, 1)); expect(h.assign).not.toHaveBeenCalled(); expect(h.evidence).not.toHaveBeenCalled();
  });
});
