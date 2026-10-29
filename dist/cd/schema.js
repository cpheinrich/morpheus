import { z } from "zod";
import { createHash } from "node:crypto";
export const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const decimal = z.string().regex(/^[0-9]+$/);
export const timestamp = z.iso.datetime();
export const sourceAgeWaiverSchema = z.object({ authorizationRef: z.string().trim().min(10), grantedAt: timestamp }).strict();
const command = z.array(z.string().min(1)).min(1);
const schedule = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("six-hour") }).strict(),
    z.object({ kind: z.literal("daily"), hourUtc: z.number().int().min(0).max(23) }).strict(),
]);
const channel = z.object({
    appId: decimal, bundleId: z.string().min(1), version: z.string().min(1),
    internalGroupId: z.string().min(1), environment: z.string().min(1),
    appEnvironment: z.string().optional(), schedule, minimumAgeHours: z.number().min(0).default(0),
    scheme: z.string().optional(), configuration: z.string().optional(),
    validationGroupId: z.string().optional(),
    externalGroupIds: z.array(z.string().min(1)).min(1).optional(),
}).strict();
const relativeScript = z.string().refine(value => !value.startsWith("/") && !value.split("/").includes(".."), "must be repository relative");
/** Consumers must check this exported capability before adopting an opt-in policy. */
export const CD_PHYSICAL_DEVICE_EVIDENCE_VERSION = 1;
const physicalIdentifier = z.string().min(1).max(1024).refine(value => value === value.trim() && !/[\x00-\x1f\x7f]/.test(value), "must be nonblank without surrounding whitespace or controls");
export const physicalDevicePolicySchema = z.object({
    schemaVersion: z.literal(1), profile: physicalIdentifier, deviceId: physicalIdentifier, hostId: physicalIdentifier,
    testIds: z.array(physicalIdentifier).min(1).max(2048).refine(ids => new Set(ids).size === ids.length, "physical test IDs must be unique"),
}).strict();
export const configSchema = z.object({
    schemaVersion: z.literal(1), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    mainBranch: z.string().default("main"), stateBranch: z.string().default("morpheus-cd-state"),
    mode: z.enum(["observe", "active"]).default("observe"), inputs: z.array(z.string().min(1)).min(1),
    controlRef: z.string().default("main"), deliveryWorkflow: z.string().default("cd-v2-delivery.yml"),
    channels: z.object({ staging: channel, production: channel }).strict(),
    tests: z.object({ allowedSkips: z.array(z.string()).default([]), physicalDevice: physicalDevicePolicySchema.optional() }).default({ allowedSkips: [] }),
    native: z.object({ workingDirectory: relativeScript, project: z.string(), testScheme: z.string(), xcodeVersion: z.string(), destination: z.string() }).optional(),
    execution: z.object({ localRunner: z.string(), hostedRunner: z.string().default("macos-26"), maxNativeJobs: z.number().int().min(1).max(2).default(2) }).optional(),
    hooks: z.object({ preflightScript: relativeScript.optional(), verifyScript: relativeScript.optional() }).optional(),
    apple: z.object({ issuerIdEnv: z.string(), keyIdEnv: z.string(), privateKeyPathEnv: z.string() }).strict(),
    agents: z.object({
        local: z.object({ command: command.default(["codex"]), model: z.string().optional(), quotaFile: z.string().optional() }),
        hosted: z.object({ workflow: z.string(), ref: z.string().default("main"), command: command.default(["claude"]), model: z.string().optional(), quotaFile: z.string().optional() }).optional(),
    }).optional(),
    budget: z.object({ togetherLimitUsd: z.number().min(0).max(250).default(250), subscriptionAdmitBelowPercent: z.number().min(0).max(80).default(80), subscriptionStopAtPercent: z.number().min(0).max(90).default(90) }).default({ togetherLimitUsd: 250, subscriptionAdmitBelowPercent: 80, subscriptionStopAtPercent: 90 }),
    deadlines: z.object({ wakeMinutes: z.number().positive().default(15), admissionMinutes: z.number().positive().default(15), testMinutes: z.number().positive().default(180), uploadMinutes: z.number().positive().default(90), agentMinutes: z.number().positive().max(45).default(45), appleObservationMinutes: z.number().positive().default(30), pollMinutes: z.number().positive().default(5), deliveryHours: z.number().positive().max(6).default(6) }).default({ wakeMinutes: 15, admissionMinutes: 15, testMinutes: 180, uploadMinutes: 90, agentMinutes: 45, appleObservationMinutes: 30, pollMinutes: 5, deliveryHours: 6 }),
}).strict().superRefine((config, context) => {
    if (config.channels.staging.schedule.kind !== "six-hour")
        context.addIssue({ code: "custom", path: ["channels", "staging"], message: "staging uses six-hour UTC slots" });
    if (config.channels.production.schedule.kind !== "daily" || config.channels.production.minimumAgeHours < 24)
        context.addIssue({ code: "custom", path: ["channels", "production"], message: "production requires daily UTC slots and at least 24 hours on main" });
    for (const name of ["staging", "production"]) {
        const app = config.channels[name], groups = app.externalGroupIds;
        if (groups && (new Set(groups).size !== groups.length || groups.includes(app.internalGroupId) || groups.includes(app.validationGroupId ?? "")))
            context.addIssue({ code: "custom", path: ["channels", name, "externalGroupIds"], message: "external groups must be unique and separate from internal/validation groups" });
    }
});
export const budgetSpendingPolicySchema = z.object({
    mode: z.literal("spend-as-needed"), campaignId: z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/),
    capMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
    authorizationRef: z.string().trim().min(10).max(2048), adoptedAt: timestamp,
}).strict();
const postResumeId = z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/);
export const postResumeOriginSchema = z.object({
    kind: z.literal("post-resume-acceptance-v1"), campaignId: postResumeId,
    purpose: z.literal("replyloss-and-wake-v1"), historyDigest: digest, resumeDigest: digest,
    sourceSha: sha, iosTreeSha: sha, previousIosTreeSha: sha, receiptIosTreeSha: sha,
    sourceReviewRef: z.string().min(10).max(2048), createdAt: timestamp,
}).strict();
export const postResumeQualificationSchema = z.object({
    fingerprint: digest, qualifiedAt: timestamp, expiresAt: timestamp,
    executionDeadlineAt: timestamp, evidenceRef: z.string().min(10).max(2048),
}).strict();
export const postResumeExecutionProofSchema = z.object({
    quiescenceDigest: digest, authorityClosureDigest: digest, evidenceRef: z.string().min(10).max(2048),
    fingerprint: digest, qualifiedAt: timestamp, expiresAt: timestamp,
}).strict();
export const postResumeAcceptanceSchema = z.object({
    origin: postResumeOriginSchema, intentId: postResumeId,
    qualifications: z.array(postResumeQualificationSchema).min(1),
    yielded: z.object({ attemptId: postResumeId, at: timestamp }).strict().optional(),
    releases: z.record(digest.or(postResumeId), postResumeExecutionProofSchema.extend({ identityDigest: digest, leaseOwner: z.string().min(1), fence: z.number().int().positive(), at: timestamp }).strict()),
    groups: z.record(digest, z.object({ attemptId: postResumeId, groupId: z.string().min(1), buildId: z.string().min(1), claimedAt: timestamp, observedAt: timestamp.optional() }).strict()),
}).strict();
const physicalBinding = {
    schemaVersion: z.literal(1), intentId: physicalIdentifier, attemptId: physicalIdentifier, dispatchEffectId: physicalIdentifier,
    sourceSha: sha, controlSha: sha, runId: z.string().regex(/^[1-9][0-9]*$/), runAttempt: z.string().regex(/^[1-9][0-9]*$/),
    appInputDigest: digest, configurationDigest: digest, profile: physicalIdentifier, deviceId: physicalIdentifier, hostId: physicalIdentifier,
    platform: z.literal("iOS"), simulated: z.literal(false),
    artifacts: z.array(z.object({ name: physicalIdentifier, sha256: digest }).strict()).min(1).max(64),
};
export const physicalDeviceEvidenceSchema = z.object({
    ...physicalBinding, inventory: z.object({ ids: z.array(physicalIdentifier).min(1).max(2048), sha256: digest }).strict(),
    results: z.array(z.object({ id: physicalIdentifier, status: z.enum(["passed", "failed", "skipped"]), attempts: z.number().int().positive() }).strict()).min(1).max(2048),
}).strict();
export const physicalDeviceProofSchema = z.object({
    ...physicalBinding, policyHash: digest, evidenceHash: digest, inventoryHash: digest, executedCount: z.number().int().positive().max(2048),
    firstAttemptPassed: z.literal(true),
}).strict();
export function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value !== null && typeof value === "object")
        return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(value) ?? "null";
}
export function hash(value) { return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex"); }
export function configurationDigest(config) { const { mode: _mode, ...identity } = config; return hash(identity); }
export function parseState(value) {
    // State revisions are never silently reset or interpreted as an empty ledger.
    const state = value;
    if (!state || state.schemaVersion !== 1 || !state.epoch || !state.repository || !state.transitions || !state.intents || !Array.isArray(state.sources) || !state.builds || !state.budget || !state.agents || !state.fences || !Array.isArray(state.slots) || !Array.isArray(state.pauses))
        throw new Error("Invalid or unsupported CD state; an explicit lossless migration is required");
    if (state.postResumeAcceptances !== undefined)
        z.record(digest, postResumeAcceptanceSchema).parse(state.postResumeAcceptances);
    if (state.budget.spendingPolicy !== undefined)
        budgetSpendingPolicySchema.parse(state.budget.spendingPolicy);
    for (const intent of Object.values(state.intents)) {
        if (!Array.isArray(intent.attempts) || !Array.isArray(intent.lineage) || !intent.originalSource || !intent.oldestDebtAt || !intent.deadlineAt)
            throw new Error("Incomplete durable delivery intent");
        if (intent.state === "delivered" && !intent.receipt)
            throw new Error("Delivered intent is missing immutable receipt");
        if (intent.sourceAgeWaiver) {
            if (!intent.validation)
                throw new Error("Source-age waiver requires a validation intent");
            sourceAgeWaiverSchema.parse(intent.sourceAgeWaiver);
        }
    }
    return state;
}
//# sourceMappingURL=schema.js.map