import { beforeEach, describe, expect, it, vi } from "vitest";
import { Controller } from "../../src/cd/controller.js";
import { ActionsAdapter, uploadEvidence, type WorkflowRun } from "../../src/cd/actions.js";
import { AppleAdapter } from "../../src/cd/apple.js";
import { GitHubStore } from "../../src/cd/store.js";
import { loadSources, verifyValidator } from "../../src/cd/source.js";
import { after, claimUpload, completeOperationalRepair, createIntent, recordTests, recordUpload } from "../../src/cd/state.js";
import { CdWait } from "../../src/cd/errors.js";
import { configurationDigest } from "../../src/cd/schema.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, observation, prepared, source } from "./fixtures.js";

vi.mock("../../src/cd/source.js", async original => ({ ...await original<typeof import("../../src/cd/source.js")>(), loadSources: vi.fn(), verifyValidator: vi.fn() }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(loadSources).mockResolvedValue([source()]); vi.mocked(verifyValidator).mockImplementation(() => {}); });
async function harness(upload = false, maximumNativeJobs = 2) {
  const cfg = config(); cfg.execution = { localRunner: "macos-vm", hostedRunner: "macos-26", maxNativeJobs: maximumNativeJobs };
  const api = new FakeGitHub(), original = api.request.bind(api);
  api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    if (path.endsWith("/commits/main")) return { sha: "c".repeat(40) } as T;
    if (path.includes("/jobs?")) return { jobs: [{ id: 1, status: "completed", started_at: now, labels: ["self-hosted", "macos-vm"] }] } as T;
    return original<T>(method, path, body);
  };
  const store = new GitHubStore(api, cfg), fixture = prepared(); fixture.state.configurationDigest = configurationDigest(cfg); fixture.tests.configurationDigest = configurationDigest(cfg); fixture.state.intents[fixture.intentId]!.attempts[0]!.configurationDigest = configurationDigest(cfg); fixture.state.intents[fixture.intentId]!.attempts[0]!.tests = undefined; fixture.state.evaluatedSlots = { staging: now, production: now };
  if (upload) { recordTests(fixture.state, cfg, fixture.tests); claimUpload(fixture.state, cfg, fixture.upload, now); recordUpload(fixture.state, { ...fixture.upload, outcome: "uncertain", providerUploadId: "resource" }, now); }
  await store.initialize(now, "epoch"); await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  const attempt = fixture.state.intents[fixture.intentId]!.attempts[0]!, run: WorkflowRun = { id: 100, run_attempt: 1, status: "in_progress", conclusion: null, head_sha: attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${attempt.dispatchEffectId}`, created_at: now, updated_at: now };
  const actions = new ActionsAdapter(api, cfg), runs = vi.spyOn(actions, "runs").mockResolvedValue([run]), dispatch = vi.spyOn(actions, "dispatch").mockResolvedValue(), cancel = vi.spyOn(actions, "cancel").mockResolvedValue(); vi.spyOn(actions, "evidence").mockResolvedValue({ tests: [fixture.tests], uploads: [], failures: [] });
  const apple = new AppleAdapter({ request: vi.fn() }), observe = vi.spyOn(apple, "observe").mockResolvedValue({}), assign = vi.spyOn(apple, "assign").mockResolvedValue(); vi.spyOn(apple, "maximum").mockResolvedValue("8");
  return { ...fixture, cfg, api, store, actions, apple, run, runs, dispatch, cancel, observe, assign, controller: new Controller(cfg, store, actions, apple, "/unused-source") };
}
describe("controller failure sequences", () => {
  it("finds an existing dispatch after restart without another request or build reservation", async () => {
    const h = await harness(); await h.controller.tick(after(now, 5)); const state = (await h.store.read()).state;
    expect(h.dispatch).not.toHaveBeenCalled(); expect(state.intents[h.intentId]!.attempts).toHaveLength(1); expect(state.intents[h.intentId]!.attempts[0]!.artifactsVerifiedAt).toBe(after(now, 5)); expect(state.builds["123/1.0"]!.maximum).toBe("8");
  });
  it("resolves ambiguous upload to the same exact accepted build without dispatch/upload replay", async () => {
    const h = await harness(true); h.observe.mockResolvedValue({ observation: observation() }); await h.controller.tick(after(now, 5)); const intent = (await h.store.read()).state.intents[h.intentId]!;
    expect(intent.state).toBe("delivered"); expect(intent.receipt!.observation.buildId).toBe("apple-build"); expect(intent.receipt!.providerUploadId).toBe("resource"); expect(intent.attempts).toHaveLength(1); expect(h.dispatch).not.toHaveBeenCalled(); expect(h.assign).not.toHaveBeenCalled();
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
