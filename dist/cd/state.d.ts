import { type TestProof, type PostResumeOrigin, type PostResumeQualification, type PostResumeAcceptance, type SourceAgeWaiver, type Attempt, type CdConfig, type CdState, type Channel, type DeliveryIntent, type Identity, type InternalObservation, type QuotaSnapshot, type Receipt, type SourceRevision, type TestEvidence, type UploadEvidence } from "./schema.js";
import { type GitHubStore } from "./store.js";
export declare const milliseconds: (minutes: number) => number;
export declare const after: (at: string, minutes: number) => string;
export declare function invariant(condition: unknown, message: string): asserts condition;
export declare function newState(config: CdConfig, epoch: string, now: string): CdState;
export declare function externalReviewKey(appId: string, buildId: string): string;
/** A committed claim authorizes one call; uncertainty never authorizes another. */
export declare function claimExternalReview(state: CdState, intentId: string, now: string, config?: CdConfig): {
    key: string;
    index: number;
    claimed: boolean;
};
export declare function currentSlot(config: CdConfig, channel: Channel, now: string): string;
export declare function dueSlots(config: CdConfig, channel: Channel, last: string | undefined, now: string): string[];
export declare function eligible(source: SourceRevision, config: CdConfig, channel: Channel, cutoff: string): boolean;
export declare function sourceAt(state: CdState, sha: string): SourceRevision;
export declare function intentAt(state: CdState, id: string): DeliveryIntent;
export declare function attemptAt(state: CdState, intentId: string, attemptId: string): {
    intent: DeliveryIntent;
    attempt: Attempt;
};
export declare function activeIntent(state: CdState, channel: Channel): DeliveryIntent | undefined;
export declare function adoptSources(state: CdState, sources: SourceRevision[], now: string): void;
export declare function createIntent(state: CdState, config: CdConfig, channel: Channel, source: SourceRevision, slot: string, now: string, validation?: boolean, group?: string, requestId?: string, sourceAgeWaiver?: SourceAgeWaiver): DeliveryIntent;
/** Slot decisions and watermark mutate together inside one ledger transaction. */
export declare function evaluateSlots(state: CdState, config: CdConfig, now: string): void;
export declare function reserveBuild(state: CdState, appId: string, version: string, attemptId: string, providerMaximum: string, now: string): string;
/** A configured physical-device floor names the first main source that carries its test plan. */
export declare function assertSourceAdmissible(state: CdState, config: CdConfig, source: SourceRevision): void;
/** Checks only; adoptRepair applies it before mutating, and the worker before its completion CAS. */
export declare function assertRepairAdmissible(state: CdState, config: CdConfig, intentId: string, source: SourceRevision): void;
export declare function planAttempt(state: CdState, config: CdConfig, intentId: string, controlSha: string, providerMaximum: string, now: string, lane?: "local" | "hosted"): Attempt;
export declare function checkIdentity(state: CdState, identity: Identity): {
    intent: DeliveryIntent;
    attempt: Attempt;
};
/** Rechecked inside upload CAS and before accepted-upload proof reuse. No new authority. */
export declare function assertPhysicalDeviceProof(config: CdConfig, proof: TestProof, expected?: Identity & {
    appInputDigest: string;
    configurationDigest: string;
}): void;
export declare function recordTests(state: CdState, config: CdConfig, evidence: TestEvidence): void;
export declare function claimUpload(state: CdState, config: CdConfig, evidence: UploadEvidence, now: string): string;
export declare function recordUpload(state: CdState, evidence: UploadEvidence, now: string): void;
export declare function validateObservation(intent: DeliveryIntent, attempt: Attempt, observation: InternalObservation): void;
export declare function deliver(state: CdState, intentId: string, attemptId: string, observation: InternalObservation, now: string, config?: CdConfig): Receipt;
export declare function claimGroup(state: CdState, intentId: string, attemptId: string, now: string): void;
export declare function repairWork(state: CdState, intentId: string, evidence: string[], now: string): string;
export declare function adoptRepair(state: CdState, config: CdConfig, intentId: string, source: SourceRevision, evidence: string, now: string): void;
export declare function completeOperationalRepair(state: CdState, intentId: string, evidence: string[], now: string): void;
/** Explicit opt-in for one ledger/campaign; never reinterpret old requests as settlements. */
export declare function setBudgetSpendingPolicy(state: CdState, config: CdConfig, input: {
    campaignId: string;
    capMicros: number;
    authorizationRef: string;
}, now: string): {
    mode: "spend-as-needed";
    campaignId: string;
    capMicros: number;
    authorizationRef: string;
    adoptedAt: string;
};
/** Remaining is against recorded spend, not a provider balance or final invoice. */
export declare function budgetStatus(state: CdState, config: CdConfig): {
    mode: string;
    campaignId: string | undefined;
    capMicros: number;
    recordedSpentMicros: number;
    internalHeldMicros: number;
    remainingMicros: number;
    recordedOverspendMicros: number;
    unsettledOperationCount: number;
    remainingIsProviderBalance: boolean;
};
export declare function reservePaid(state: CdState, config: CdConfig, id: string, request: unknown, maximumMicros: number): void;
export declare function settlePaid(state: CdState, id: string, actualMicros: number): void;
export declare function quotaUsed(snapshot: QuotaSnapshot | undefined, now: string): number | undefined;
/** Separate journal: deliberately no legacy campaign result.fenceBinding shape. */
export declare function postResumeAcceptance(state: CdState, intent: DeliveryIntent): PostResumeAcceptance | undefined;
/** Ordinary eligibility includes due slots even before the evaluator commits them. */
export declare function ordinaryDemand(state: CdState, config: CdConfig, now: string): boolean;
/** Fingerprints relevant external qualification, without treating budget maxima as holds. */
export declare function postResumeFingerprint(state: CdState): string;
export declare function createPostResumeAcceptance(state: CdState, config: CdConfig, channel: Channel, raw: PostResumeOrigin, qualification: PostResumeQualification, now: string): string;
export declare function qualifyPostResumeAcceptance(state: CdState, intentId: string, raw: PostResumeQualification, now: string): void;
export declare function assertPostResumeAdmission(state: CdState, config: CdConfig, intentId: string, now: string, initial?: boolean): void;
export declare function assertPostResumeNewEffect(state: CdState, config: CdConfig, intent: DeliveryIntent, attempt: Attempt, now: string, initial?: boolean): void;
export declare function occupiesNative(state: CdState, intent: DeliveryIntent, attempt: Attempt): boolean;
export declare function protectedPostResumeUpload(state: CdState, intent: DeliveryIntent, attempt: Attempt): boolean;
export declare function yieldPostResumeAttempt(state: CdState, intentId: string, attemptId: string, now: string): void;
export declare function postResumeExecutionFingerprint(state: CdState, identity: Identity): string;
export declare function releasePostResumeExecution(state: CdState, identity: Identity, raw: {
    quiescenceDigest: string;
    authorityClosureDigest: string;
    evidenceRef: string;
    fingerprint: string;
    qualifiedAt: string;
    expiresAt: string;
}, now: string): void;
export declare function postResumeGroupKey(record: PostResumeAcceptance, attemptId: string, groupId: string, buildId: string): string;
export declare function claimPostResumeGroup(state: CdState, config: CdConfig, intentId: string, attemptId: string, buildId: string, now: string): string;
/** Supported normal Store entry; exact replay is observation, never an arm/dispatch. */
export declare function applyPostResumeAcceptance(store: GitHubStore, config: CdConfig, channel: Channel, rawOrigin: PostResumeOrigin, rawQualification: PostResumeQualification, clock?: () => string): Promise<{
    head: string;
    replayed: boolean;
    result: {
        kind: string;
        key: string;
        intentId: string;
        originDigest: string;
        qualificationDigest: string;
    };
    verifiedReadbackHead: string;
}>;
