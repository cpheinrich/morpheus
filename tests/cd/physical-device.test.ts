import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CD_PHYSICAL_DEVICE_EVIDENCE_VERSION, canonical, configSchema, configurationDigest, hash, type PhysicalDeviceProof, type TestEvidence } from "../../src/cd/schema.js";
import { adoptRepair, assertPhysicalDeviceProof, claimUpload, createIntent, newState, planAttempt, recordTests, recordUpload, releasePostResumeExecution, postResumeExecutionFingerprint, after } from "../../src/cd/state.js";
import { validatePayloadFiles } from "../../src/cd/evidence.js";
import { config, now, prepared, source } from "./fixtures.js";
import { optionalFixture } from "./post-resume-fixtures.js";
import { physicalPolicy } from "./physical-device-fixtures.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
function deviceConfig() { const cfg = config(); cfg.tests.physicalDevice = physicalPolicy(); return cfg; }
function fresh() {
  const cfg = deviceConfig(), f = prepared("staging", cfg);
  delete f.state.intents[f.intentId]!.attempts[0]!.tests;
  return { ...f, cfg };
}
describe("required physical-device evidence", () => {
  it("preserves the exact legacy normalized configuration digest and exposes executable opt-in capability", () => {
    const legacy = config();
    expect(legacy.tests).toEqual({ allowedSkips: [] });
    expect(canonical(legacy)).not.toContain("physicalDevice");
    expect(configurationDigest(legacy)).toBe("b71edea032bd39142b1cd27b61c211a9864e46f38f7d2d39463c89daf4f77127");
    expect(CD_PHYSICAL_DEVICE_EVIDENCE_VERSION).toBe(1);
    const cfg = deviceConfig(), parsed = configSchema.parse(cfg);
    expect(parsed.tests.physicalDevice).toEqual(physicalPolicy());
    expect(configurationDigest(parsed)).not.toBe(configurationDigest(legacy));
    expect(configSchema.safeParse({ ...cfg, tests: { ...cfg.tests, physicalDevice: { ...physicalPolicy(), schemaVersion: 2 } } }).success).toBe(false);
    expect(configSchema.safeParse({ ...cfg, tests: { ...cfg.tests, physicalDevice: { ...physicalPolicy(), testIds: ["same", "same"] } } }).success).toBe(false);
  });
  it("records one complete aggregate, compacts policy-bound hardware results and replays identically", () => {
    const f = fresh(); recordTests(f.state, f.cfg, f.tests);
    const proof = f.state.intents[f.intentId]!.attempts[0]!.tests!, before = structuredClone(f.state);
    expect(proof.physicalDevice).toEqual({ ...f.tests.physicalDevice, inventory: undefined, results: undefined,
      evidenceHash: hash(f.tests.physicalDevice), policyHash: hash(physicalPolicy()), inventoryHash: hash(physicalPolicy().testIds),
      executedCount: 2, firstAttemptPassed: true });
    recordTests(f.state, f.cfg, f.tests); expect(f.state).toEqual(before);
    assertPhysicalDeviceProof(f.cfg, proof);
    expect(() => recordTests(f.state, f.cfg, { ...f.tests, validator: { ...f.tests.validator, sha256: hash("changed") } })).toThrow("immutable");
  });
  const invalid: [string, (tests: TestEvidence) => void][] = [
    ["missing", tests => { delete tests.physicalDevice; }],
    ["device", tests => { tests.physicalDevice!.deviceId = "other-device"; }],
    ["host", tests => { tests.physicalDevice!.hostId = "other-host"; }],
    ["profile", tests => { tests.physicalDevice!.profile = "other-plan"; }],
    ["simulator", tests => { tests.physicalDevice!.simulated = true as false; }],
    ["empty", tests => { tests.physicalDevice!.inventory.ids = []; tests.physicalDevice!.results = []; }],
    ["partial self-declared plan", tests => { const child = tests.physicalDevice!; child.inventory.ids.pop(); child.results.pop(); child.inventory.sha256 = hash(child.inventory.ids); }],
    ["duplicate inventory", tests => { tests.physicalDevice!.inventory.ids[1] = tests.physicalDevice!.inventory.ids[0]!; }],
    ["duplicate result", tests => { tests.physicalDevice!.results[1] = tests.physicalDevice!.results[0]!; }],
    ["missing result", tests => { tests.physicalDevice!.results.pop(); }],
    ["failed", tests => { tests.physicalDevice!.results[0]!.status = "failed"; }],
    ["skipped", tests => { tests.physicalDevice!.results[0]!.status = "skipped"; }],
    ["retried pass", tests => { tests.physicalDevice!.results[0]!.attempts = 2; }],
    ["unreferenced payload", tests => { tests.physicalDevice!.artifacts = [{ name: "missing.json", sha256: hash("missing") }]; }],
    ["changed payload", tests => { tests.physicalDevice!.artifacts = [{ name: "physical-results.json", sha256: hash("changed") }]; }],
    ["duplicate payload", tests => { tests.physicalDevice!.artifacts.push({ ...tests.physicalDevice!.artifacts[0]! }); }],
    ...(["intentId", "attemptId", "dispatchEffectId", "sourceSha", "controlSha", "runId", "runAttempt", "appInputDigest", "configurationDigest"] as const).map(key =>
      [key, (tests: TestEvidence) => { tests.physicalDevice![key] = key.endsWith("Sha") ? "d".repeat(40) : key.endsWith("Digest") ? hash("stale") : "999"; }] as [string, (tests: TestEvidence) => void]),
  ];
  it.each(invalid)("refuses %s raw evidence without changing state", (_name, change) => {
    const f = fresh(); change(f.tests); const before = structuredClone(f.state);
    expect(() => recordTests(f.state, f.cfg, f.tests)).toThrow(); expect(f.state).toEqual(before);
  });
  it("rejects a hardware payload whose real sibling bytes differ", async () => {
    const f = fresh(), directory = await mkdtemp(join(tmpdir(), "cd-physical-")); directories.push(directory);
    await writeFile(join(directory, "results.json"), "results"); await writeFile(join(directory, "physical-results.json"), "tampered");
    await expect(validatePayloadFiles(f.tests, join(directory, "evidence.json"))).rejects.toThrow("hash mismatch");
    await writeFile(join(directory, "physical-results.json"), "physical-results");
    await expect(validatePayloadFiles(f.tests, join(directory, "evidence.json"))).resolves.toBeUndefined();
  });
  it("does not extend configured simulator skips to the required hardware lane", () => {
    const cfg = deviceConfig(); cfg.tests.allowedSkips = [...physicalPolicy().testIds];
    const f = prepared("staging", cfg); delete f.state.intents[f.intentId]!.attempts[0]!.tests;
    f.tests.physicalDevice!.results[0]!.status = "skipped";
    const before = structuredClone(f.state);
    expect(() => recordTests(f.state, cfg, f.tests)).toThrow("first attempt"); expect(f.state).toEqual(before);
  });
  it("refuses a policy/configuration change before recording any proof", () => {
    const f = fresh(); f.cfg.tests.physicalDevice!.testIds.push("DeviceTests/newRequiredCase");
    const before = structuredClone(f.state);
    expect(() => recordTests(f.state, f.cfg, f.tests)).toThrow("policy configuration"); expect(f.state).toEqual(before);
  });
  const badProof: [string, (proof: PhysicalDeviceProof) => void][] = [
    ["policy", proof => { proof.policyHash = hash("other"); }],
    ["inventory", proof => { proof.inventoryHash = hash("partial"); }],
    ["count", proof => { proof.executedCount = 1; }],
    ["host", proof => { proof.hostId = "other"; }],
    ["run", proof => { proof.runId = "101"; }],
    ["retry", proof => { proof.firstAttemptPassed = false as true; }],
  ];
  it.each(badProof)("refuses %s compact proof before upload owner, fence or identity mutation", (_name, change) => {
    const f = fresh(); recordTests(f.state, f.cfg, f.tests);
    change(f.state.intents[f.intentId]!.attempts[0]!.tests!.physicalDevice!);
    const before = structuredClone(f.state);
    expect(() => claimUpload(f.state, f.cfg, f.upload, now)).toThrow(); expect(f.state).toEqual(before);
  });
  it("refuses missing proof and stale execution before a new upload claim", () => {
    const f = fresh(); recordTests(f.state, f.cfg, f.tests);
    delete f.state.intents[f.intentId]!.attempts[0]!.tests!.physicalDevice;
    const before = structuredClone(f.state);
    expect(() => claimUpload(f.state, f.cfg, f.upload, now)).toThrow("Required physical-device proof"); expect(f.state).toEqual(before);
    const current = fresh(); recordTests(current.state, current.cfg, current.tests); const saved = structuredClone(current.state);
    expect(() => claimUpload(current.state, current.cfg, { ...current.upload, runId: "101" }, now)).toThrow("current upload execution"); expect(current.state).toEqual(saved);
  });
  it("does not turn uncertainty or an expired lease into a replacement upload", () => {
    const f = fresh(); recordTests(f.state, f.cfg, f.tests); claimUpload(f.state, f.cfg, f.upload, now);
    recordUpload(f.state, { ...f.upload, outcome: "uncertain", providerUploadId: "same-resource" }, now);
    f.state.intents[f.intentId]!.attempts[0]!.lease!.expiresAt = after(now, -1);
    const before = structuredClone(f.state);
    expect(() => claimUpload(f.state, f.cfg, f.upload, after(now, 300))).toThrow("already claimed"); expect(f.state).toEqual(before);
  });
  it("preserves typed post-resume proof replay after release without authorizing another effect", () => {
    const cfg = deviceConfig(), f = optionalFixture(true, cfg);
    f.attempt.workflowTerminalAt = now;
    f.attempt.quiescence = { kind: "host-terminated", ref: "synthetic:owned-executor-gone", observedAt: now };
    releasePostResumeExecution(f.state, f.identity, { fingerprint: postResumeExecutionFingerprint(f.state, f.identity), qualifiedAt: now, expiresAt: after(now, 5),
      quiescenceDigest: hash(f.attempt.quiescence), authorityClosureDigest: hash("closed"), evidenceRef: "synthetic:closed-execution" }, now);
    const before = structuredClone(f.state);
    recordTests(f.state, cfg, f.tests); expect(f.state).toEqual(before);
    expect(() => claimUpload(f.state, cfg, f.upload, now)).toThrow(); expect(f.state).toEqual(before);
  });
});

describe("physical-device source floor", () => {
  const floorConfig = (floor: string) => { const cfg = deviceConfig(); cfg.tests.physicalDevice!.sourceFloor = floor; return cfg; };
  // a (order 0) predates the test plan; b (order 1) first carries it; c (order 2) follows.
  function planned(floor: string, selected = "a") {
    const cfg = floorConfig(floor), state = newState(cfg, "epoch", now); state.sources = [source("a", 0), source("b", 1), source("c", 2)];
    const intent = createIntent(state, cfg, "staging", state.sources.find(item => item.sha === selected.repeat(40))!, now, now);
    return { cfg, state, intent };
  }
  it("keeps existing physical configuration bytes when absent and refuses a malformed floor", () => {
    // Pinned from a4680c9f, before the field existed: an existing policy keeps its digest.
    expect(configurationDigest(deviceConfig())).toBe("7dcd8a463f9d0af583a28562e6dc9ccbf32b2ec21b6bb6f35835ffccc9e85e21");
    expect(canonical(configSchema.parse(deviceConfig()))).not.toContain("sourceFloor");
    const parsed = configSchema.parse(floorConfig("b".repeat(40)));
    expect(parsed.tests.physicalDevice!.sourceFloor).toBe("b".repeat(40));
    expect(configurationDigest(parsed)).not.toBe(configurationDigest(deviceConfig()));
    for (const floor of ["b".repeat(39), "b".repeat(41), "B".repeat(40), "main", ""]) expect(configSchema.safeParse(floorConfig(floor)).success).toBe(false);
  });
  it.each([["a", "a", true], ["a", "b", false], ["b", "b", true], ["c", "b", true]])("plans source %s against floor %s only at or after it (admitted: %s)", (selected, floor, admitted) => {
    const f = planned(floor.repeat(40), selected), before = structuredClone(f.state);
    if (admitted) { expect(planAttempt(f.state, f.cfg, f.intent.id, "c".repeat(40), "7", now).sourceSha).toBe(selected.repeat(40)); return; }
    expect(() => planAttempt(f.state, f.cfg, f.intent.id, "c".repeat(40), "7", now)).toThrow(`Source ${"a".repeat(40)} predates physical-device source floor ${"b".repeat(40)}`);
    expect(f.state).toEqual(before); expect(f.state.builds).toEqual({});
  });
  it("refuses an unknown floor instead of reading it as no floor", () => {
    const f = planned("f".repeat(40), "c"), before = structuredClone(f.state);
    expect(() => planAttempt(f.state, f.cfg, f.intent.id, "c".repeat(40), "7", now)).toThrow(`Physical-device source floor ${"f".repeat(40)} is not a verified first-parent main source`);
    expect(f.state).toEqual(before);
  });
  it("adopts a repair only at or after the floor, without mutating on refusal", () => {
    const f = planned("c".repeat(40)); f.cfg.tests.physicalDevice!.sourceFloor = undefined;
    planAttempt(f.state, f.cfg, f.intent.id, "c".repeat(40), "7", now).status = "failed";
    f.cfg.tests.physicalDevice!.sourceFloor = "c".repeat(40);
    const before = structuredClone(f.state);
    expect(() => adoptRepair(f.state, f.cfg, f.intent.id, f.state.sources[1]!, "reviewed merge below the floor", now)).toThrow(`Source ${"b".repeat(40)} predates physical-device source floor`);
    expect(f.state).toEqual(before);
    adoptRepair(f.state, f.cfg, f.intent.id, f.state.sources[2]!, "reviewed merge at the floor", now);
    expect(f.state.intents[f.intent.id]!.source).toBe("c".repeat(40)); expect(f.state.intents[f.intent.id]!.state).toBe("pending");
  });
});
