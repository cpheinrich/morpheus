import { z } from "zod";
import { digest, hash, timestamp } from "./schema.js";
export const BLOCKER_PROOF_PREFIX = "morpheus-blocker-proof-v1:";
export const BLOCKER_PROOF_MAX_BYTES = 32_768;
const text = z.string().trim().min(1).max(2048);
const reference = text.refine(value => !/[\r\n\0]/.test(value) && /^(?:https:\/\/\S+|\/.*|(?:artifact|record|git|sha256):\S+)$/.test(value), "Evidence must be a reference, not raw command output");
const references = z.array(reference).min(1).max(16);
export const blockerBindingSchema = z.object({
    workId: text, invocationId: text, fence: z.number().int().positive().max(Number.MAX_SAFE_INTEGER), taskDigest: digest, contextDigest: digest,
    claimedAt: timestamp, deadlineAt: timestamp.describe("Exact accepted ownership lease expiry; never extends execution timeout or quota authority"),
}).strict();
export const blockerProofSchema = z.object({
    version: z.literal(1), binding: blockerBindingSchema, reportedAt: timestamp,
    symptom: z.object({ summary: text, identityRef: reference, observedAt: timestamp, evidenceRefs: references }).strict(),
    authority: z.object({ ref: reference, summary: text, checkedAt: timestamp }).strict(),
    tried: z.array(z.object({ route: text, action: text, outcome: text, observedAt: timestamp, checkedAt: timestamp, evidenceRefs: references }).strict()).max(16),
    excluded: z.array(z.object({ route: text, disposition: z.enum(["unavailable", "unsafe", "outside-authority", "disproportionate"]), reason: text, checkedAt: timestamp, evidenceRefs: references }).strict()).max(16),
    noPracticalAction: z.object({ boundary: z.enum(["human-only-judgment", "missing-authorized-access"]), requiredPrincipal: text, authorityRef: reference, explanation: text, evidenceRefs: references }).strict().optional(),
    exhaustionReason: text, missingCapability: text, minimumExternalStep: text,
    independentWork: z.array(text).min(1).max(16),
    nextWake: z.object({ event: text, at: timestamp }).strict(),
}).strict();
export function blockerProofInstructions(binding) {
    return `Blocker proof binding (copy exactly): ${JSON.stringify(binding)}\n` +
        `A blocked result is only a candidate for independent CTO verification. Include exactly one evidence string beginning ${BLOCKER_PROOF_PREFIX} followed by a JSON proof matching this schema: ${JSON.stringify(z.toJSONSchema(blockerProofSchema))}\n` +
        "The binding deadlineAt is the exact accepted ownership lease expiry; it never extends execution timeout or quota authority. Document every practical authorized route and actual outcomes; name excluded unsafe, unavailable or unauthorized routes with evidence-backed reasons. Never attempt a prohibited or spent effect to fill a count. If no practical authorized action exists, use noPracticalAction with its exact human-only/access boundary, named principal and authority/capability evidence. References must be HTTPS URLs, absolute evidence paths or artifact:/record:/git:/sha256: references, never secrets, environment assignments or raw output. Preserve actual observation times and freshly check historical evidence rather than replaying its effects. Shape validation never proves semantic exhaustion or CTO acceptance.\n";
}
/** Validate a candidate, never its truth or the CTO's independent acceptance. */
export function assessBlockedResult(result, binding, completedAt, currentContextDigest) {
    if (result.outcome !== "blocked")
        return { result, continueImmediately: false };
    const attemptedResult = structuredClone(result);
    const stale = currentContextDigest !== binding.contextDigest;
    const reject = (reason, proofDigest) => ({
        result: { ...result, outcome: "checkpoint", summary: `${result.summary}; blocker claim rejected: ${reason}; continue diagnosis`, missingCapability: "" },
        claim: { status: "rejected", reason, ...(proofDigest ? { proofDigest } : {}), attemptedResult },
        continueImmediately: stale,
    });
    if (!Array.isArray(result.evidence) || result.evidence.some(item => typeof item !== "string"))
        return reject("blocker evidence must be an array of references");
    const entries = result.evidence.filter(item => item.startsWith(BLOCKER_PROOF_PREFIX));
    if (entries.length !== 1)
        return reject("exactly one versioned blocker proof is required");
    const encoded = entries[0].slice(BLOCKER_PROOF_PREFIX.length);
    if (Buffer.byteLength(encoded, "utf8") > BLOCKER_PROOF_MAX_BYTES)
        return reject("blocker proof exceeds its byte bound");
    let raw;
    try {
        raw = JSON.parse(encoded);
    }
    catch {
        return reject("blocker proof is not valid JSON");
    }
    const parsed = blockerProofSchema.safeParse(raw);
    if (!parsed.success)
        return reject("blocker proof has missing, invalid or unsupported fields");
    const proof = parsed.data, proofDigest = hash(proof);
    if (!blockerBindingSchema.safeParse(binding).success || hash(proof.binding) !== hash(binding))
        return reject("blocker proof belongs to another task, invocation or claim", proofDigest);
    if (stale)
        return reject("delivery or diagnostic context changed after the prompt was frozen", proofDigest);
    if (typeof result.missingCapability !== "string" || proof.missingCapability !== result.missingCapability.trim())
        return reject("missing capability differs from the claimed result", proofDigest);
    const emptyPracticalSet = !proof.tried.length;
    if ((emptyPracticalSet && (!proof.noPracticalAction || !proof.excluded.length || proof.noPracticalAction.authorityRef !== proof.authority.ref)) || (!emptyPracticalSet && proof.noPracticalAction))
        return reject("an empty practical set needs an explicit authority boundary, capability evidence and excluded-route reasons", proofDigest);
    const start = Date.parse(binding.claimedAt), deadline = Date.parse(binding.deadlineAt), end = Date.parse(completedAt), reported = Date.parse(proof.reportedAt);
    const fresh = (at) => Date.parse(at) >= start && Date.parse(at) <= reported;
    // Historical attempts may be reused without repeating spent effects, but the
    // claimant must freshly check their evidence and the current authority.
    if (!Number.isFinite(end) || deadline <= start || end < start || reported < start || reported > Math.min(end, deadline) ||
        !fresh(proof.authority.checkedAt) || Date.parse(proof.symptom.observedAt) > reported ||
        proof.tried.some(route => !fresh(route.checkedAt) || Date.parse(route.observedAt) > Date.parse(route.checkedAt)) ||
        proof.excluded.some(route => !fresh(route.checkedAt)) || Date.parse(proof.nextWake.at) <= end)
        return reject("blocker proof observations, authority or next wake are not current within the actual claim", proofDigest);
    const routes = [...proof.tried, ...proof.excluded].map(route => route.route.toLowerCase());
    if (new Set(routes).size !== routes.length)
        return reject("practical routes must be distinct", proofDigest);
    return {
        result: { ...result, summary: `${result.summary}; blocker candidate requires independent CTO verification` },
        claim: { status: "cto-verification-required", reason: "Shape and binding checked; practical exhaustion and critical references remain unverified", proofDigest, attemptedResult },
        continueImmediately: false,
    };
}
//# sourceMappingURL=blocker-proof.js.map