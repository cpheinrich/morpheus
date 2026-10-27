import { hash, type PostResumeOrigin, type PostResumeQualification, type TestEvidence, type UploadEvidence } from "../../src/cd/schema.js";
import { after, createPostResumeAcceptance, newState, planAttempt, postResumeFingerprint, recordTests, claimUpload } from "../../src/cd/state.js";
import { config, now, source } from "./fixtures.js";

export function optionalFixture(upload = false, cfg = config()) {
  const state = newState(cfg, "epoch", now);
  state.sources = [source(), source("b", 1)]; state.lastMain = source("b", 1).sha;
  state.evaluatedSlots = { staging: now, production: now };
  state.cursors.staging = { sourceSha: source().sha, order: 0, receiptId: "previous" };
  state.groupCursors.staging = { sourceSha: source().sha, order: 0, receiptId: "previous" };
  const origin: PostResumeOrigin = { kind: "post-resume-acceptance-v1", campaignId: "synthetic-campaign", purpose: "replyloss-and-wake-v1", historyDigest: hash("original8"), resumeDigest: hash("actual-resume"), sourceSha: source("b", 1).sha, iosTreeSha: "b".repeat(40), previousIosTreeSha: "a".repeat(40), receiptIosTreeSha: "c".repeat(40), sourceReviewRef: "synthetic:independent-reviewed-main", createdAt: now };
  const qualification: PostResumeQualification = { fingerprint: postResumeFingerprint(state), qualifiedAt: now, expiresAt: after(now, 300), executionDeadlineAt: after(now, 300), evidenceRef: "synthetic:qualified-window-and-source" };
  const before = structuredClone(state), intentId = createPostResumeAcceptance(state, cfg, "staging", origin, qualification, now);
  const attempt = planAttempt(state, cfg, intentId, "c".repeat(40), "7", now);
  const identity = { schemaVersion: 1 as const, intentId, attemptId: attempt.id, dispatchEffectId: attempt.dispatchEffectId, sourceSha: attempt.sourceSha, controlSha: attempt.controlSha, runId: "100", runAttempt: "1" };
  const tests: TestEvidence = { ...identity, scope: "full", appInputDigest: attempt.appInputDigest, configurationDigest: attempt.configurationDigest, inventory: { ids: ["AppTests/testFull"], sha256: hash(["AppTests/testFull"]) }, results: [{ id: "AppTests/testFull", status: "passed" }], artifacts: [{ name: "results.json", sha256: hash("results") }], validator: { path: "scripts/verify.mjs", sha256: hash("validator") } };
  const evidence: UploadEvidence = { ...identity, appId: attempt.appId, version: attempt.version, buildNumber: attempt.buildNumber, ipaSha256: hash("ipa") };
  if (upload) { recordTests(state, cfg, tests); claimUpload(state, cfg, evidence, now); attempt.artifactsVerifiedAt = now; }
  return { cfg, state, before, origin, qualification, intentId, attemptId: attempt.id, attempt, identity, tests, upload: evidence };
}
