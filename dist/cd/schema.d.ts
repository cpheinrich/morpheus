import { z } from "zod";
export declare const sha: any;
export declare const digest: any;
export declare const decimal: any;
export declare const timestamp: any;
export declare const sourceAgeWaiverSchema: any;
export type SourceAgeWaiver = z.infer<typeof sourceAgeWaiverSchema>;
export declare const configSchema: any;
export declare const budgetSpendingPolicySchema: any;
export type BudgetSpendingPolicy = z.infer<typeof budgetSpendingPolicySchema>;
export type CdConfig = z.infer<typeof configSchema>;
export type Channel = "staging" | "production";
export interface SourceRevision {
    sha: string;
    inputDigest: string;
    mainEnteredAt: string;
    evidence: {
        kind: "merged-pr" | "observed";
        ref: string;
    };
    order: number;
}
export interface Lease {
    owner: string;
    expiresAt: string;
    fence: number;
}
export interface Identity {
    schemaVersion: 1;
    intentId: string;
    attemptId: string;
    dispatchEffectId: string;
    sourceSha: string;
    controlSha: string;
    runId: string;
    runAttempt: string;
}
export interface Artifact {
    name: string;
    sha256: string;
    id?: string;
    path?: string;
}
export interface TestEvidence extends Identity {
    scope: "full";
    appInputDigest: string;
    configurationDigest: string;
    inventory: {
        ids: string[];
        sha256: string;
    };
    results: {
        id: string;
        status: "passed" | "failed" | "skipped";
    }[];
    artifacts: Artifact[];
    validator: {
        path: string;
        sha256: string;
        revision?: "control" | "source";
    };
}
export interface TestProof extends Identity {
    scope: "full";
    appInputDigest: string;
    configurationDigest: string;
    evidenceHash: string;
    inventoryHash: string;
    executedCount: number;
    skippedIds: string[];
    artifacts: Artifact[];
    validator: TestEvidence["validator"];
}
export interface UploadEvidence extends Identity {
    appId: string;
    version: string;
    buildNumber: string;
    ipaSha256: string;
    uploadOperationId?: string;
    outcome?: "accepted" | "rejected" | "uncertain";
    providerUploadId?: string;
    acceptedAt?: string;
    diagnostics?: string;
    acceptanceArtifact?: Artifact;
}
export interface InternalObservation {
    appId: string;
    version: string;
    buildNumber: string;
    buildId: string;
    processingState: string;
    betaState: string;
    group: {
        id: string;
        appId: string;
        internal: boolean;
        automaticDistribution: boolean;
        buildIds: string[];
        testerIds: string[];
    };
    observedAt: string;
    uploadState?: string;
    diagnostics?: string;
}
export interface Receipt extends Identity {
    appInputDigest: string;
    configurationDigest: string;
    ipaSha256: string;
    uploadOperationId: string;
    providerUploadId?: string;
    testEvidenceHash: string;
    observation: InternalObservation;
    deliveredAt: string;
}
export interface ExternalObservation {
    appId: string;
    version: string;
    buildNumber: string;
    buildId: string;
    processingState: string;
    betaState: string;
    detailId: string;
    autoNotifyEnabled: boolean;
    groups: InternalObservation["group"][];
    review?: {
        id: string;
        state: string;
    };
    observedAt: string;
}
export interface ExternalStatus {
    status: "pending" | "waiting-review" | "blocked" | "uncertain" | "available";
    nextAction: string;
    nextCheckAt: string;
    blocker?: string;
    observation?: ExternalObservation;
    terminal?: boolean;
}
export interface ExternalReview {
    appId: string;
    buildId: string;
    attempts: {
        claimedAt: string;
        outcome: "claimed" | "confirmed" | "conflict" | "rejected";
        submissionId?: string;
        completedAt?: string;
    }[];
}
export interface Attempt {
    id: string;
    dispatchEffectId: string;
    sourceSha: string;
    controlSha: string;
    appInputDigest: string;
    configurationDigest: string;
    appId: string;
    version: string;
    buildNumber: string;
    lane: "local" | "hosted";
    createdAt: string;
    dispatch: {
        state: "intended" | "sent" | "uncertain";
        sentAt?: string;
        runIds: string[];
    };
    runId?: string;
    runAttempt?: string;
    lease?: Lease;
    tests?: TestProof;
    upload?: {
        id: string;
        claimedAt: string;
        fence: number;
        identity: UploadEvidence;
        outcome: "claimed" | "accepted" | "rejected" | "uncertain";
        providerUploadId?: string;
        acceptedAt?: string;
        diagnostics?: string;
    };
    artifactsVerifiedAt?: string;
    workflowTerminalAt?: string;
    uploadObservations?: {
        at: string;
        uploadState?: string;
        buildId?: string;
        processingState?: string;
        diagnostics?: string;
    }[];
    status: "active" | "failed" | "retired-uncertain" | "delivered";
    observation?: InternalObservation;
    quiescence?: {
        kind: "host-terminated" | "hosted-terminated";
        ref: string;
        observedAt: string;
    };
}
export interface DeliveryIntent {
    id: string;
    channel: Channel;
    slot: string;
    originalSource: string;
    source: string;
    selectedMainEnteredAt: string;
    oldestDebtAt: string;
    lineage: {
        source: string;
        inputDigest: string;
        mainEnteredAt: string;
        reason: string;
        evidence: string;
    }[];
    coveredSources: string[];
    coveredSlots: string[];
    validation: boolean;
    isolatedValidation: boolean;
    groupId: string;
    createdAt: string;
    deadlineAt: string;
    sourceAgeWaiver?: SourceAgeWaiver;
    state: "pending" | "testing" | "uploading" | "processing" | "delivered" | "repairing" | "waiting" | "paused";
    nextAction: string;
    nextCheckAt: string;
    blocker?: string;
    attempts: Attempt[];
    receipt?: Receipt;
    eligibleAt?: string;
    external?: ExternalStatus;
}
export interface AgentWork {
    id: string;
    intentId: string;
    taskDigest: string;
    task: string;
    evidence: string[];
    strategy: number;
    state: "pending" | "running" | "waiting" | "complete";
    createdAt: string;
    nextCheckAt: string;
    lease?: Lease;
    invocations: {
        id: string;
        executor: "local" | "hosted";
        hostId?: string;
        startedAt: string;
        endedAt?: string;
        session?: string;
        result?: AgentResult;
        usage?: unknown[];
        runIds?: string[];
        dispatchState?: "intended" | "sent" | "uncertain";
        dispatchCount?: number;
        lastDispatchAt?: string;
    }[];
}
export interface AgentResult {
    outcome: "repaired" | "checkpoint" | "blocked";
    summary: string;
    pullRequest?: string;
    sourceSha?: string;
    reviewHead?: string;
    evidence: string[];
    missingCapability?: string;
}
export interface CdState {
    schemaVersion: 1;
    epoch: string;
    repository: string;
    configurationDigest: string;
    initializedAt: string;
    transitions: Record<string, {
        at: string;
        result: unknown;
        owner?: string;
    }>;
    sources: SourceRevision[];
    lastMain?: string;
    evaluatedSlots: Partial<Record<Channel, string>>;
    cursors: Partial<Record<Channel, {
        sourceSha: string;
        order: number;
        receiptId: string;
    }>>;
    slots: {
        channel: Channel;
        slot: string;
        decision: "intent" | "no-change" | "covered" | "missed";
        intentId?: string;
    }[];
    intents: Record<string, DeliveryIntent>;
    builds: Record<string, {
        maximum: string;
        reservations: Record<string, {
            buildNumber: string;
            at: string;
            burned: boolean;
        }>;
    }>;
    agents: Record<string, AgentWork>;
    fences: Record<string, number>;
    groupOperations: Record<string, {
        attemptId: string;
        claimedAt: string;
        completedAt?: string;
    }>;
    groupCursors: Record<string, {
        sourceSha: string;
        order: number;
        receiptId: string;
    }>;
    externalReviews?: Record<string, ExternalReview>;
    pauses: {
        scope: string;
        actor: string;
        reason: string;
        resumeCondition: string;
        createdAt: string;
        human: boolean;
    }[];
    budget: {
        spendingPolicy?: BudgetSpendingPolicy;
        spentMicros: number;
        reservations: Record<string, {
            digest: string;
            maximumMicros: number;
            status: "reserved" | "settled";
            actualMicros?: number;
        }>;
        telemetry: Record<string, QuotaSnapshot>;
    };
}
export interface QuotaSnapshot {
    observedAt: string;
    windows: {
        id: string;
        usedPercent: number;
        resetsAt: string;
    }[];
    source: string;
    model?: string;
}
export interface CdEvent {
    id: string;
    at: string;
    kind: string;
    data: unknown;
    owner?: string;
}
export declare function canonical(value: unknown): string;
export declare function hash(value: unknown): string;
export declare function configurationDigest(config: CdConfig): string;
export declare function parseState(value: unknown): CdState;
