import { hash, type CdConfig, type TestEvidence } from "../../src/cd/schema.js";

export function physicalPolicy(): NonNullable<CdConfig["tests"]["physicalDevice"]> {
  return { schemaVersion: 1, profile: "regression-v1", deviceId: "synthetic-device", hostId: "synthetic-host",
    testIds: ["DeviceTests/testCamera", "DeviceTests/testHealth"] };
}
export function addPhysicalEvidence(tests: TestEvidence, policy = physicalPolicy()): void {
  const artifact = { name: "physical-results.json", sha256: hash("physical-results") };
  tests.artifacts.push(artifact);
  tests.physicalDevice = { schemaVersion: 1, intentId: tests.intentId, attemptId: tests.attemptId,
    dispatchEffectId: tests.dispatchEffectId, sourceSha: tests.sourceSha, controlSha: tests.controlSha,
    runId: tests.runId, runAttempt: tests.runAttempt, appInputDigest: tests.appInputDigest, configurationDigest: tests.configurationDigest,
    profile: policy.profile, deviceId: policy.deviceId, hostId: policy.hostId, platform: "iOS", simulated: false,
    inventory: { ids: [...policy.testIds], sha256: hash([...policy.testIds].sort()) },
    results: policy.testIds.map(id => ({ id, status: "passed", attempts: 1 })), artifacts: [artifact] };
}
