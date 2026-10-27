import { describe, expect, it } from "vitest";
import { hash } from "../../src/cd/schema.js";
import { assertTransition } from "../../src/cd/invariants.js";
import { adoptRepair, after, assertPostResumeAdmission, assertPostResumeNewEffect, claimGroup, claimPostResumeGroup, claimUpload, completeOperationalRepair, createIntent, createPostResumeAcceptance, deliver, occupiesNative, ordinaryDemand, planAttempt, postResumeAcceptance, postResumeExecutionFingerprint, postResumeFingerprint, qualifyPostResumeAcceptance, recordTests, recordUpload, releasePostResumeExecution, repairWork, yieldPostResumeAttempt } from "../../src/cd/state.js";
import { config, now, observation, prepared, source } from "./fixtures.js";
import { optionalFixture } from "./post-resume-fixtures.js";

function quiesce(f: ReturnType<typeof optionalFixture>) {
  f.attempt.workflowTerminalAt = now; f.attempt.quiescence = { kind: "host-terminated", ref: "synthetic:owned-executor-and-descendants-gone", observedAt: now };
  return { fingerprint: postResumeExecutionFingerprint(f.state, f.identity), qualifiedAt: now, expiresAt: after(now, 5), quiescenceDigest: hash(f.attempt.quiescence), authorityClosureDigest: hash("closed-pinned-writers-no-queued-authority"), evidenceRef: "synthetic:actual-quiescence-qualification" };
}
describe("closed post-resume journal and ordinary priority", () => {
  it("adds only a distinct validation origin/intent; preserves original whole objects and rejects replay/ordinary enrollment", () => {
    const f = optionalFixture(), intent = f.state.intents[f.intentId]!;
    expect({ validation: intent.validation, isolated: intent.isolatedValidation, source: intent.source }).toEqual({ validation: true, isolated: false, source: source("b", 1).sha });
    const stripped = structuredClone(f.state); delete stripped.postResumeAcceptances; delete stripped.intents[f.intentId]; stripped.builds = f.before.builds;
    expect(stripped).toEqual(f.before);
    expect(() => createPostResumeAcceptance(f.state, f.cfg, "staging", f.origin, f.qualification, now)).toThrow("purpose already exists");
    const old = prepared(), before = structuredClone(old.state); old.state.intents[old.intentId]!.postResumeKey = Object.keys(f.state.postResumeAcceptances!)[0]; old.state.postResumeAcceptances = structuredClone(f.state.postResumeAcceptances);
    expect(() => assertTransition(before, old.state)).toThrow("association is immutable");
  });
  it.each(["history", "origin", "yield", "release", "qualification"])("refuses rewriting/removing append-only %s authority", kind => {
    const f = optionalFixture(kind === "release"), record = postResumeAcceptance(f.state, f.state.intents[f.intentId]!)!;
    if (kind === "yield") yieldPostResumeAttempt(f.state, f.intentId, f.attemptId, now);
    if (kind === "release") releasePostResumeExecution(f.state, f.identity, quiesce(f), now);
    const before = structuredClone(f.state);
    if (kind === "history") delete f.state.postResumeAcceptances;
    if (kind === "origin") record.origin.historyDigest = hash("rewritten");
    if (kind === "yield") delete record.yielded;
    if (kind === "release") record.releases[f.attemptId]!.authorityClosureDigest = hash("different");
    if (kind === "qualification") record.qualifications[0]!.evidenceRef = "rewritten:qualification";
    expect(() => assertTransition(before, f.state)).toThrow(/cannot|immutable|append-only/);
  });
  it("detects due ordinary work before the normal slot evaluator creates an intent", () => {
    const f = optionalFixture(); f.state.evaluatedSlots.staging = after(now, -360);
    expect(ordinaryDemand(f.state, f.cfg, now)).toBe(true);
    const before = structuredClone(f.state); expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now)).toThrow("priority"); expect(f.state).toEqual(before);
  });
  it.each([-1, 0, 1])("qualification expiry boundary at %+d ms", delta => {
    const f = optionalFixture(), time = new Date(Date.parse(f.qualification.expiresAt) + delta).toISOString();
    // Keep the ordinary slot clock from introducing a second reason to refuse.
    f.state.evaluatedSlots = { staging: after(now, 360), production: after(now, 1440) };
    if (delta < 0) expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, time)).not.toThrow();
    else expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, time)).toThrow("expired");
  });
  it("expired/fingerprint-drifted facts need a new appended exact qualification", () => {
    const f = optionalFixture(); f.state.pauses.push({ scope: "unrelated", actor: "human", human: true, reason: "separate", resumeCondition: "normal", createdAt: now });
    expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now)).toThrow("differs");
    qualifyPostResumeAcceptance(f.state, f.intentId, { ...f.qualification, fingerprint: postResumeFingerprint(f.state) }, now);
    expect(postResumeAcceptance(f.state, f.state.intents[f.intentId]!)!.qualifications).toHaveLength(2); expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now)).not.toThrow();
  });
  it.each(["same-ios", "same-receipt-ios", "source-age", "ordinary", "old-source"])("refuses ineligible creation: %s", kind => {
    const f = optionalFixture(), state = structuredClone(f.before), origin = { ...f.origin };
    if (kind === "same-ios") origin.iosTreeSha = origin.previousIosTreeSha;
    if (kind === "same-receipt-ios") origin.iosTreeSha = origin.receiptIosTreeSha;
    if (kind === "source-age") state.sources[1]!.mainEnteredAt = now;
    if (kind === "ordinary") createIntent(state, f.cfg, "staging", state.sources[0]!, now, now);
    if (kind === "old-source") origin.sourceSha = state.sources[0]!.sha;
    const before = structuredClone(state), q = { ...f.qualification, fingerprint: postResumeFingerprint(state) };
    expect(() => createPostResumeAcceptance(state, f.cfg, kind === "source-age" ? "production" : "staging", origin, q, now)).toThrow(); expect(state).toEqual(before);
  });
});

  it("keeps optional group effects keyed to the exact accepted build without touching ordinary group ownership", () => {
    const f = optionalFixture(true); recordUpload(f.state, { ...f.upload, outcome: "accepted" }, now); f.attempt.observation = observation();
    const ordinary = structuredClone(f.state.groupOperations), key = claimPostResumeGroup(f.state, f.cfg, f.intentId, f.attemptId, "apple-build", now);
    expect(postResumeAcceptance(f.state, f.state.intents[f.intentId]!)!.groups[key]).toMatchObject({ attemptId: f.attemptId, groupId: "staging", buildId: "apple-build" });
    const before = structuredClone(f.state);
    expect(() => claimPostResumeGroup(f.state, f.cfg, f.intentId, f.attemptId, "different-build", now)).toThrow("exact accepted");
    expect(() => claimPostResumeGroup(f.state, f.cfg, f.intentId, f.attemptId, "apple-build", now)).toThrow("UNKNOWN"); expect(f.state).toEqual(before); expect(f.state.groupOperations).toEqual(ordinary);
    expect(() => claimGroup(f.state, f.intentId, f.attemptId, now)).toThrow("separate stable");
  });
  it("does not rewrite or treat incomplete historical invocation rows of completed unleased work as a new queue owner", () => {
    const f = optionalFixture(); f.state.agents.old = { id: "old", intentId: "old-delivered", strategy: 1, state: "complete", task: "old", taskDigest: hash("old"), evidence: [], createdAt: now, nextCheckAt: now, invocations: [{ id: "historical", executor: "local", startedAt: now }] };
    const history = structuredClone(f.state.agents.old); expect(ordinaryDemand(f.state, f.cfg, now)).toBe(false); expect(f.state.agents.old).toEqual(history);
    f.state.agents.old.lease = { owner: "still-current", expiresAt: after(now, 1), fence: 1 }; expect(ordinaryDemand(f.state, f.cfg, now)).toBe(true);
  });
  it("does not introduce internal financial holds or reuse a settled-cost fiction", () => {
    const f = optionalFixture(); f.state.budget.reservations.legacy = { digest: hash("legacy"), maximumMicros: 999_000_000, status: "reserved" };
    const budget = structuredClone(f.state.budget); expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now)).not.toThrow(); expect(f.state.budget).toEqual(budget);
  });
  it.each([-1, 0, 1])("preserves the15minute actual-dispatch stagger at %+d ms", delta => {
    const f = optionalFixture(), legacy = prepared();
    const i = legacy.state.intents[legacy.intentId]!; i.validation = true; i.id = "old-validation"; i.attempts[0]!.dispatch.sentAt = new Date(Date.parse(now) - 900_000 - delta).toISOString();
    f.state.intents[i.id] = i;
    if (delta < 0) expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now, true)).toThrow("stagger");
    else expect(() => assertPostResumeAdmission(f.state, f.cfg, f.intentId, now, true)).not.toThrow();
  });
  it("does not pretend a running optional executor gives arbitrary later ordinary work zero resource delay", () => {
    const f = optionalFixture(), p = createIntent(f.state, f.cfg, "production", f.state.sources[0]!, now, now);
    planAttempt(f.state, f.cfg, p.id, "c".repeat(40), "1", now);
    const s = createIntent(f.state, f.cfg, "staging", f.state.sources[0]!, after(now, 360), now);
    expect(() => planAttempt(f.state, f.cfg, s.id, "c".repeat(40), "1", now)).toThrow("capacity");
    expect(occupiesNative(f.state, f.state.intents[f.intentId]!, f.attempt)).toBe(true);
  });

describe("yield, permanent execution release and unmodified provider recovery", () => {
  it("burns the zero-effect plan without freeing/reusing its build or admitting stale direct effects", () => {
    const f = optionalFixture(), before = structuredClone(f.state); yieldPostResumeAttempt(f.state, f.intentId, f.attemptId, now);
    expect(occupiesNative(f.state, f.state.intents[f.intentId]!, f.attempt)).toBe(false); expect(f.state.builds).toEqual(before.builds);
    expect(() => assertPostResumeNewEffect(f.state, f.cfg, f.state.intents[f.intentId]!, f.attempt, now)).toThrow("Yielded/released");
    expect(() => claimUpload(f.state, f.cfg, f.upload, now)).toThrow("Yielded/released");
    expect(() => recordTests(f.state, f.cfg, f.tests)).toThrow("Released/yielded");
  });
  it.each(["claimed", "uncertain", "run", "tests", "upload"])("never labels possible %s effect as never-dispatched", kind => {
    const f = optionalFixture(kind === "upload");
    if (kind === "claimed") f.state.transitions[`dispatch-call-${f.attemptId}-initial`] = { at: now, result: {}, owner: "actor" };
    if (kind === "uncertain") { f.attempt.dispatch.state = "uncertain"; f.attempt.dispatch.sentAt = now; }
    if (kind === "run") f.attempt.runId = "100";
    if (kind === "tests") recordTests(f.state, f.cfg, f.tests);
    expect(() => yieldPostResumeAttempt(f.state, f.intentId, f.attemptId, now)).toThrow("Possible dispatch");
  });
  it("terminal workflow alone does not release an unaccepted native slot", () => {
    const f = optionalFixture(true); f.attempt.workflowTerminalAt = now;
    expect(() => releasePostResumeExecution(f.state, f.identity, { fingerprint: postResumeExecutionFingerprint(f.state, f.identity), qualifiedAt: now, expiresAt: after(now, 5), quiescenceDigest: hash("no evidence"), authorityClosureDigest: hash("closed"), evidenceRef: "synthetic:not-quiescence" }, now)).toThrow("quiescence");
    expect(occupiesNative(f.state, f.state.intents[f.intentId]!, f.attempt)).toBe(true);
  });
  it("releases only native execution, preserves SAME unknown active upload, and refuses every replacement route", () => {
    const f = optionalFixture(true), proof = quiesce(f), before = structuredClone(f.state); releasePostResumeExecution(f.state, f.identity, proof, now);
    expect(occupiesNative(f.state, f.state.intents[f.intentId]!, f.attempt)).toBe(false); expect(f.attempt).toEqual(before.intents[f.intentId]!.attempts[0]);
    for (const action of [() => adoptRepair(f.state, f.cfg, f.intentId, source("c", 2), "synthetic:review", now), () => completeOperationalRepair(f.state, f.intentId, ["synthetic:repair"], now), () => planAttempt(f.state, f.cfg, f.intentId, "d".repeat(40), "20", now), () => repairWork(f.state, f.intentId, ["diagnostic"], now), () => claimUpload(f.state, f.cfg, f.upload, now)]) expect(action).toThrow();
    recordTests(f.state, f.cfg, f.tests); recordUpload(f.state, { ...f.upload, outcome: "accepted", acceptedAt: now, providerUploadId: "actual-resource" }, now);
    expect(f.attempt.status).toBe("active"); expect(f.attempt.upload!.providerUploadId).toBe("actual-resource");
    expect(deliver(f.state, f.intentId, f.attemptId, observation(), now, f.cfg).attemptId).toBe(f.attemptId); expect(f.state.cursors.staging).toEqual(before.cursors.staging);
    const receipt = structuredClone(f.state.intents[f.intentId]!.receipt); expect(deliver(f.state, f.intentId, f.attemptId, observation(), after(now, 1000))).toEqual(receipt);
  });
  it.each(["lease", "fence", "descendant", "quiescence"])("refuses stale/outstanding release authority: %s", kind => {
    const f = optionalFixture(true), proof = quiesce(f);
    if (kind === "lease") f.attempt.lease = undefined;
    if (kind === "fence") f.state.fences[f.attemptId] = 99;
    if (kind === "descendant") f.state.agents.other = { id: "other", intentId: f.intentId, strategy: 1, task: "x", taskDigest: hash("x"), state: "running", evidence: [], createdAt: now, nextCheckAt: now, invocations: [{ id: "child", executor: "local", startedAt: now }] };
    if (kind === "quiescence") proof.quiescenceDigest = hash("wrong");
    expect(() => releasePostResumeExecution(f.state, f.identity, proof, now)).toThrow();
  });
  it("records definitive rejection honestly without creating a replacement optional purpose/attempt", () => {
    const f = optionalFixture(true); recordUpload(f.state, { ...f.upload, outcome: "rejected", diagnostics: "synthetic exact rejection" }, now);
    expect(f.attempt.status).toBe("failed"); expect(f.state.agents).toEqual({}); expect(f.state.intents[f.intentId]!.attempts).toHaveLength(1);
    expect(() => planAttempt(f.state, f.cfg, f.intentId, "c".repeat(40), "8", now)).toThrow("cannot retry");
  });
  it("rejects unknown origin fields instead of treating ordinary false or an approval flag as authority", () => {
    const f = optionalFixture(), before = structuredClone(f.before);
    for (const extra of [{ validation: false }, { approved: true }, { fenceBinding: "legacy" }]) expect(() => createPostResumeAcceptance(f.before, f.cfg, "staging", { ...f.origin, ...extra }, f.qualification, now)).toThrow();
    expect(f.before).toEqual(before);
  });
  it("accepted ordinary upload still releases normal capacity without new quiescence gates", () => {
    const f = prepared(); claimUpload(f.state, config(), f.upload, now); recordUpload(f.state, { ...f.upload, outcome: "accepted" }, now);
    expect(occupiesNative(f.state, f.state.intents[f.intentId]!, f.state.intents[f.intentId]!.attempts[0]!)).toBe(false);
  });
});
