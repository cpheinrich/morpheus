import { describe, expect, it } from "vitest";
import { assessBlockedResult, blockerProofInstructions, BLOCKER_PROOF_MAX_BYTES, BLOCKER_PROOF_PREFIX, type BlockerProof } from "../../src/cd/blocker-proof.js";
import { hash, type AgentResult } from "../../src/cd/schema.js";

const claimedAt = "2026-10-28T20:00:00.000Z", reportedAt = "2026-10-28T20:01:00.000Z", completedAt = "2026-10-28T20:01:01.000Z";
const binding = { workId: "synthetic-repair-2", invocationId: "synthetic-invocation-4", fence: 4, taskDigest: hash("synthetic task"), contextDigest: hash("synthetic context"), claimedAt, deadlineAt: "2026-10-28T20:45:00.000Z" };
function proof(): BlockerProof {
  return {
    version: 1, binding: { ...binding }, reportedAt,
    symptom: { summary: "Synthetic delivery remains unavailable", identityRef: "record:synthetic-attempt-3/run-100", observedAt: reportedAt, evidenceRefs: ["artifact:synthetic-run-observation"] },
    authority: { ref: "record:synthetic-current-mandate", summary: "Normal repair authorized; account grants remain external", checkedAt: claimedAt },
    tried: [{ route: "Inspect exact saved operation", action: "Compared the retained exact-operation journal with the failed boundary", outcome: "Missing access is identified without replaying an uncertain effect", observedAt: "2026-10-27T10:00:00.000Z", checkedAt: reportedAt, evidenceRefs: ["artifact:synthetic-operation-journal", "artifact:synthetic-current-readback"] }],
    excluded: [{ route: "Use an unrelated account", disposition: "outside-authority", reason: "The current mandate grants no alternative account", checkedAt: claimedAt, evidenceRefs: ["record:synthetic-current-mandate"] }],
    exhaustionReason: "The retained operation requires the named account; the only other account route is outside authority",
    missingCapability: "The named account needs its owner's access grant", minimumExternalStep: "The named owner grants the already identified access",
    independentWork: ["Continue the separate ordinary production diagnosis"], nextWake: { event: "Access-grant evidence changes, otherwise bounded recheck", at: "2026-10-28T20:15:00.000Z" },
  };
}
function result(value: unknown = proof()): AgentResult {
  return { outcome: "blocked", summary: "Synthetic access boundary", missingCapability: proof().missingCapability, evidence: ["artifact:synthetic-retained-evidence", BLOCKER_PROOF_PREFIX + JSON.stringify(value)] };
}
function assess(value: AgentResult, current = binding.contextDigest) { return assessBlockedResult(value, binding, completedAt, current); }

describe("blocker candidates require bounded current evidence", () => {
  it("supplies the exact actual claim binding and versioned schema without suggesting self-approval", () => {
    const instructions = blockerProofInstructions(binding);
    expect(instructions.split("\n")[0]).toBe("Blocker proof binding (copy exactly): " + JSON.stringify(binding));
    expect(instructions).toContain(BLOCKER_PROOF_PREFIX);
    const encoded = instructions.split("\n")[1]!.split("matching this schema: ")[1]!;
    const schema = JSON.parse(encoded);
    expect(schema.type).toBe("object"); expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["version", "binding", "reportedAt", "symptom", "authority", "tried", "excluded", "exhaustionReason", "missingCapability", "minimumExternalStep", "independentWork", "nextWake"]);
    expect(instructions).toContain("Never attempt a prohibited or spent effect");
    expect(instructions).toContain("never extends execution timeout or quota authority");
    expect(instructions).toContain("Shape validation never proves semantic exhaustion or CTO acceptance");
  });

  it("accepts shape and exact binding only as a CTO-pending candidate, retaining the original claim", () => {
    const value = result(), before = structuredClone(value), checked = assess(value);
    expect(checked).toEqual({ result: { ...value, summary: value.summary + "; blocker candidate requires independent CTO verification" }, continueImmediately: false,
      claim: { status: "cto-verification-required", reason: "Shape and binding checked; practical exhaustion and critical references remain unverified", proofDigest: hash(proof()), attemptedResult: before } });
    expect(value).toEqual(before); expect(checked.claim!.attemptedResult).not.toBe(value);
  });

  it("leaves a checkpoint outside the blocker contract", () => {
    const value: AgentResult = { outcome: "checkpoint", summary: "Continue a bounded diagnosis", evidence: [] };
    expect(assess(value)).toEqual({ result: value, continueImmediately: false });
  });

  it("normalizes a malformed result capability without throwing or losing its attempted value", () => {
    const value = result(); Object.assign(value, { missingCapability: 7 });
    const checked = assess(value);
    expect(checked.result.outcome).toBe("checkpoint"); expect(checked.claim!.attemptedResult).toEqual(value);
    expect(checked.claim!.reason).toBe("missing capability differs from the claimed result");
  });

  it.each([null, [7]])("retains and rejects malformed historical evidence %j without throwing", evidence => {
    const value = result(); Object.assign(value, { evidence });
    const checked = assess(value);
    expect(checked.result.outcome).toBe("checkpoint"); expect(checked.claim!.attemptedResult).toEqual(value);
    expect(checked.claim!.reason).toBe("blocker evidence must be an array of references");
  });

  it.each(["missing", "duplicate", "json", "version", "self-approval", "missing-action", "raw-command-reference", "duplicate-route", "missing-capability", "empty-practical-set"])("retains and normalizes an unsupported %s claim to continued diagnosis", invalid => {
    const value = result(), document = proof();
    if (invalid === "missing") value.evidence = [];
    else if (invalid === "duplicate") value.evidence.push(value.evidence[1]!);
    else if (invalid === "json") value.evidence[1] = BLOCKER_PROOF_PREFIX + "{";
    else {
      if (invalid === "version") Object.assign(document, { version: 2 });
      if (invalid === "self-approval") Object.assign(document, { ctoAccepted: true });
      if (invalid === "missing-action") document.tried[0]!.action = "";
      if (invalid === "raw-command-reference") document.tried[0]!.evidenceRefs = ["TOKEN=synthetic-secret /bin/tool"];
      if (invalid === "duplicate-route") document.excluded[0]!.route = "  INSPECT EXACT SAVED OPERATION  ";
      if (invalid === "missing-capability") document.missingCapability = "Different unproved capability";
      if (invalid === "empty-practical-set") document.tried = [];
      value.evidence[1] = BLOCKER_PROOF_PREFIX + JSON.stringify(document);
    }
    const saved = structuredClone(value), checked = assess(value);
    expect(checked.result.outcome).toBe("checkpoint"); expect(checked.result.missingCapability).toBe("");
    expect(checked.result.summary).toContain("blocker claim rejected:"); expect(checked.result.summary).toContain("continue diagnosis");
    expect(checked.claim!.status).toBe("rejected"); expect(checked.claim!.attemptedResult).toEqual(saved);
    expect(checked.continueImmediately).toBe(false); expect(value).toEqual(saved);
    expect(checked.claim!.reason).not.toContain("synthetic-secret");
  });

  it.each(["workId", "invocationId", "fence", "taskDigest", "contextDigest", "claimedAt", "deadlineAt"] as const)("rejects a proof borrowed from a different %s", field => {
    const document = proof();
    if (field === "fence") document.binding.fence += 1;
    else document.binding[field] = field.endsWith("Digest") ? hash("another binding") : field.endsWith("At") ? "2026-10-28T19:59:00.000Z" : "another-identity";
    const checked = assess(result(document));
    expect(checked.claim!.status).toBe("rejected"); expect(checked.claim!.reason).toBe("blocker proof belongs to another task, invocation or claim");
    expect(checked.result.outcome).toBe("checkpoint"); expect(checked.claim!.proofDigest).toBe(hash(document));
  });

  it("rejects newly stale context and makes the changed work immediately eligible", () => {
    const value = result(), checked = assess(value, hash("new exact quiescence evidence"));
    expect(checked.claim!.reason).toBe("delivery or diagnostic context changed after the prompt was frozen");
    expect(checked.result.outcome).toBe("checkpoint"); expect(checked.continueImmediately).toBe(true);
    expect(checked.claim!.attemptedResult).toEqual(value);
    const missing = { ...value, evidence: [] };
    expect(assess(missing, hash("new evidence")).continueImmediately).toBe(true);
  });

  it("can recheck historical evidence without repeating a spent external effect", () => {
    const document = proof(); document.tried[0]!.observedAt = "2026-10-01T00:00:00.000Z";
    expect(assess(result(document)).claim!.status).toBe("cto-verification-required");
  });

  it.each(["authority-before-claim", "authority-after-report", "report-before-claim", "report-after-completion", "report-after-deadline", "future-symptom", "future-attempt", "stale-attempt-check", "stale-exclusion-check", "no-future-wake"])("rejects %s using actual claimant bounds", invalid => {
    const document = proof();
    if (invalid === "authority-before-claim") document.authority.checkedAt = "2026-10-28T19:59:59.999Z";
    if (invalid === "authority-after-report") document.authority.checkedAt = "2026-10-28T20:01:00.001Z";
    if (invalid === "report-before-claim") document.reportedAt = "2026-10-28T19:59:59.999Z";
    if (invalid === "report-after-completion") document.reportedAt = "2026-10-28T20:01:01.001Z";
    if (invalid === "report-after-deadline") document.reportedAt = "2026-10-28T20:45:00.001Z";
    if (invalid === "future-symptom") document.symptom.observedAt = "2026-10-28T20:01:00.001Z";
    if (invalid === "future-attempt") document.tried[0]!.observedAt = "2026-10-28T20:01:00.001Z";
    if (invalid === "stale-attempt-check") document.tried[0]!.checkedAt = "2026-10-28T19:59:59.999Z";
    if (invalid === "stale-exclusion-check") document.excluded[0]!.checkedAt = "2026-10-28T19:59:59.999Z";
    if (invalid === "no-future-wake") document.nextWake.at = completedAt;
    if (invalid === "report-after-deadline") document.nextWake.at = "2026-10-28T21:00:00.000Z";
    const checked = invalid === "report-after-deadline" ? assessBlockedResult(result(document), binding, "2026-10-28T20:46:00.000Z", binding.contextDigest) : assess(result(document));
    expect(checked.claim!.status).toBe("rejected");
    expect(checked.claim!.reason).toBe("blocker proof observations, authority or next wake are not current within the actual claim");
    expect(checked.result.outcome).toBe("checkpoint");
  });

  it("includes equality at the actual claim/report bounds and requires the next wake strictly afterward", () => {
    const document = proof(); document.reportedAt = completedAt; document.symptom.observedAt = completedAt;
    document.authority.checkedAt = claimedAt; document.tried[0]!.checkedAt = completedAt;
    document.nextWake.at = "2026-10-28T20:01:01.001Z";
    expect(assess(result(document)).claim!.status).toBe("cto-verification-required");
  });

  it("accepts a report at the exact ownership deadline rather than treating an old dispatch time as the claim", () => {
    const document = proof(); document.reportedAt = binding.deadlineAt; document.authority.checkedAt = binding.deadlineAt;
    document.nextWake.at = "2026-10-28T21:00:00.000Z";
    expect(assessBlockedResult(result(document), binding, "2026-10-28T20:46:00.000Z", binding.contextDigest).claim!.status).toBe("cto-verification-required");
  });

  it.each([BLOCKER_PROOF_MAX_BYTES, BLOCKER_PROOF_MAX_BYTES + 1])("bounds the encoded proof at exactly %s UTF-8 bytes", bytes => {
    const encoded = JSON.stringify(proof()), padded = encoded + " ".repeat(bytes - Buffer.byteLength(encoded));
    const value = result(); value.evidence[1] = BLOCKER_PROOF_PREFIX + padded;
    const checked = assess(value);
    expect(checked.claim!.status).toBe(bytes === BLOCKER_PROOF_MAX_BYTES ? "cto-verification-required" : "rejected");
    if (bytes > BLOCKER_PROOF_MAX_BYTES) expect(checked.claim!.reason).toBe("blocker proof exceeds its byte bound");
  });

  it("permits a concrete human-only boundary without forcing an unauthorized attempt", () => {
    const document = proof(); document.tried = [];
    document.noPracticalAction = { boundary: "human-only-judgment", requiredPrincipal: "Synthetic named owner", authorityRef: document.authority.ref,
      explanation: "The specific account grant is reserved to the named owner", evidenceRefs: ["record:synthetic-current-mandate", "artifact:synthetic-access-readback"] };
    const checked = assess(result(document));
    expect(checked.claim!.status).toBe("cto-verification-required"); expect(checked.result.outcome).toBe("blocked");
    expect(checked.claim!.attemptedResult).toEqual(result(document));
  });

  it.each(["generic-rationale", "no-excluded-routes", "borrowed-authority", "missing-rationale"])("rejects a lazy empty practical set with %s", invalid => {
    const document = proof(); document.tried = [];
    const boundary = { boundary: "missing-authorized-access" as const, requiredPrincipal: "Synthetic named owner", authorityRef: document.authority.ref,
      explanation: "Only the named owner can grant this exact access", evidenceRefs: ["artifact:synthetic-access-readback"] };
    document.noPracticalAction = boundary;
    if (invalid === "generic-rationale") Object.assign(document, { noPracticalAction: "Nothing else to try" });
    if (invalid === "no-excluded-routes") document.excluded = [];
    if (invalid === "borrowed-authority") boundary.authorityRef = "record:unrelated-mandate";
    if (invalid === "missing-rationale") boundary.explanation = "";
    const checked = assess(result(document));
    expect(checked.claim!.status).toBe("rejected"); expect(checked.result.outcome).toBe("checkpoint");
    expect(checked.claim!.attemptedResult).toEqual(result(document));
  });
});
