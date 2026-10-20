import { type SourceAgeWaiver, type Attempt, type CdConfig, type CdState, type Channel, type DeliveryIntent, type Identity, type InternalObservation, type QuotaSnapshot, type Receipt, type SourceRevision, type TestEvidence, type UploadEvidence } from "./schema.js";
export declare const milliseconds: (minutes: number) => number;
export declare const after: (at: string, minutes: number) => string;
export declare function invariant(condition: unknown, message: string): asserts condition;
export declare function newState(config: CdConfig, epoch: string, now: string): CdState;
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
export declare function planAttempt(state: CdState, config: CdConfig, intentId: string, controlSha: string, providerMaximum: string, now: string, lane?: "local" | "hosted"): Attempt;
export declare function checkIdentity(state: CdState, identity: Identity): {
    intent: DeliveryIntent;
    attempt: Attempt;
};
export declare function recordTests(state: CdState, config: CdConfig, evidence: TestEvidence): void;
export declare function claimUpload(state: CdState, config: CdConfig, evidence: UploadEvidence, now: string): string;
export declare function recordUpload(state: CdState, evidence: UploadEvidence, now: string): void;
export declare function validateObservation(intent: DeliveryIntent, attempt: Attempt, observation: InternalObservation): void;
export declare function deliver(state: CdState, intentId: string, attemptId: string, observation: InternalObservation, now: string): Receipt;
export declare function claimGroup(state: CdState, intentId: string, attemptId: string, now: string): void;
export declare function repairWork(state: CdState, intentId: string, evidence: string[], now: string): string;
export declare function adoptRepair(state: CdState, config: CdConfig, intentId: string, source: SourceRevision, evidence: string, now: string): void;
export declare function completeOperationalRepair(state: CdState, intentId: string, evidence: string[], now: string): void;
export declare function reservePaid(state: CdState, config: CdConfig, id: string, request: unknown, maximumMicros: number): void;
export declare function settlePaid(state: CdState, id: string, actualMicros: number): void;
export declare function quotaUsed(snapshot: QuotaSnapshot | undefined, now: string): number | undefined;
