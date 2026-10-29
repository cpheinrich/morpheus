import { z } from "zod";
export declare const sha: z.ZodString;
export declare const digest: z.ZodString;
export declare const decimal: z.ZodString;
export declare const timestamp: z.ZodISODateTime;
export declare const sourceAgeWaiverSchema: z.ZodObject<{
    authorizationRef: z.ZodString;
    grantedAt: z.ZodISODateTime;
}, z.core.$strict>;
export type SourceAgeWaiver = z.infer<typeof sourceAgeWaiverSchema>;
/** Consumers must check this exported capability before adopting an opt-in policy. */
export declare const CD_PHYSICAL_DEVICE_EVIDENCE_VERSION: 1;
export declare const physicalDevicePolicySchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    profile: z.ZodString;
    deviceId: z.ZodString;
    hostId: z.ZodString;
    testIds: z.ZodArray<z.ZodString>;
}, z.core.$strict>;
export declare const configSchema: z.ZodObject<{
    schemaVersion: z.ZodLiteral<1>;
    repository: z.ZodString;
    mainBranch: z.ZodDefault<z.ZodString>;
    stateBranch: z.ZodDefault<z.ZodString>;
    mode: z.ZodDefault<z.ZodEnum<{
        observe: "observe";
        active: "active";
    }>>;
    inputs: z.ZodArray<z.ZodString>;
    controlRef: z.ZodDefault<z.ZodString>;
    deliveryWorkflow: z.ZodDefault<z.ZodString>;
    channels: z.ZodObject<{
        staging: z.ZodObject<{
            appId: z.ZodString;
            bundleId: z.ZodString;
            version: z.ZodString;
            internalGroupId: z.ZodString;
            environment: z.ZodString;
            appEnvironment: z.ZodOptional<z.ZodString>;
            schedule: z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"six-hour">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"daily">;
                hourUtc: z.ZodNumber;
            }, z.core.$strict>], "kind">;
            minimumAgeHours: z.ZodDefault<z.ZodNumber>;
            scheme: z.ZodOptional<z.ZodString>;
            configuration: z.ZodOptional<z.ZodString>;
            validationGroupId: z.ZodOptional<z.ZodString>;
            externalGroupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
        production: z.ZodObject<{
            appId: z.ZodString;
            bundleId: z.ZodString;
            version: z.ZodString;
            internalGroupId: z.ZodString;
            environment: z.ZodString;
            appEnvironment: z.ZodOptional<z.ZodString>;
            schedule: z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"six-hour">;
            }, z.core.$strict>, z.ZodObject<{
                kind: z.ZodLiteral<"daily">;
                hourUtc: z.ZodNumber;
            }, z.core.$strict>], "kind">;
            minimumAgeHours: z.ZodDefault<z.ZodNumber>;
            scheme: z.ZodOptional<z.ZodString>;
            configuration: z.ZodOptional<z.ZodString>;
            validationGroupId: z.ZodOptional<z.ZodString>;
            externalGroupIds: z.ZodOptional<z.ZodArray<z.ZodString>>;
        }, z.core.$strict>;
    }, z.core.$strict>;
    tests: z.ZodDefault<z.ZodObject<{
        allowedSkips: z.ZodDefault<z.ZodArray<z.ZodString>>;
        physicalDevice: z.ZodOptional<z.ZodObject<{
            schemaVersion: z.ZodLiteral<1>;
            profile: z.ZodString;
            deviceId: z.ZodString;
            hostId: z.ZodString;
            testIds: z.ZodArray<z.ZodString>;
        }, z.core.$strict>>;
    }, z.core.$strip>>;
    native: z.ZodOptional<z.ZodObject<{
        workingDirectory: z.ZodString;
        project: z.ZodString;
        testScheme: z.ZodString;
        xcodeVersion: z.ZodString;
        destination: z.ZodString;
    }, z.core.$strip>>;
    execution: z.ZodOptional<z.ZodObject<{
        localRunner: z.ZodString;
        hostedRunner: z.ZodDefault<z.ZodString>;
        maxNativeJobs: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    hooks: z.ZodOptional<z.ZodObject<{
        preflightScript: z.ZodOptional<z.ZodString>;
        verifyScript: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>>;
    apple: z.ZodObject<{
        issuerIdEnv: z.ZodString;
        keyIdEnv: z.ZodString;
        privateKeyPathEnv: z.ZodString;
    }, z.core.$strict>;
    agents: z.ZodOptional<z.ZodObject<{
        local: z.ZodObject<{
            command: z.ZodDefault<z.ZodArray<z.ZodString>>;
            model: z.ZodOptional<z.ZodString>;
            quotaFile: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        hosted: z.ZodOptional<z.ZodObject<{
            workflow: z.ZodString;
            ref: z.ZodDefault<z.ZodString>;
            command: z.ZodDefault<z.ZodArray<z.ZodString>>;
            model: z.ZodOptional<z.ZodString>;
            quotaFile: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    budget: z.ZodDefault<z.ZodObject<{
        togetherLimitUsd: z.ZodDefault<z.ZodNumber>;
        subscriptionAdmitBelowPercent: z.ZodDefault<z.ZodNumber>;
        subscriptionStopAtPercent: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
    deadlines: z.ZodDefault<z.ZodObject<{
        wakeMinutes: z.ZodDefault<z.ZodNumber>;
        admissionMinutes: z.ZodDefault<z.ZodNumber>;
        testMinutes: z.ZodDefault<z.ZodNumber>;
        uploadMinutes: z.ZodDefault<z.ZodNumber>;
        agentMinutes: z.ZodDefault<z.ZodNumber>;
        appleObservationMinutes: z.ZodDefault<z.ZodNumber>;
        pollMinutes: z.ZodDefault<z.ZodNumber>;
        deliveryHours: z.ZodDefault<z.ZodNumber>;
    }, z.core.$strip>>;
}, z.core.$strict>;
export declare const budgetSpendingPolicySchema: z.ZodObject<{
    mode: z.ZodLiteral<"spend-as-needed">;
    campaignId: z.ZodString;
    capMicros: z.ZodNumber;
    authorizationRef: z.ZodString;
    adoptedAt: z.ZodISODateTime;
}, z.core.$strict>;
export type BudgetSpendingPolicy = z.infer<typeof budgetSpendingPolicySchema>;
export declare const postResumeOriginSchema: z.ZodObject<{
    kind: z.ZodLiteral<"post-resume-acceptance-v1">;
    campaignId: z.ZodString;
    purpose: z.ZodLiteral<"replyloss-and-wake-v1">;
    historyDigest: z.ZodString;
    resumeDigest: z.ZodString;
    sourceSha: z.ZodString;
    iosTreeSha: z.ZodString;
    previousIosTreeSha: z.ZodString;
    receiptIosTreeSha: z.ZodString;
    sourceReviewRef: z.ZodString;
    createdAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const postResumeQualificationSchema: z.ZodObject<{
    fingerprint: z.ZodString;
    qualifiedAt: z.ZodISODateTime;
    expiresAt: z.ZodISODateTime;
    executionDeadlineAt: z.ZodISODateTime;
    evidenceRef: z.ZodString;
}, z.core.$strict>;
export type PostResumeOrigin = z.infer<typeof postResumeOriginSchema>;
export type PostResumeQualification = z.infer<typeof postResumeQualificationSchema>;
export declare const postResumeExecutionProofSchema: z.ZodObject<{
    quiescenceDigest: z.ZodString;
    authorityClosureDigest: z.ZodString;
    evidenceRef: z.ZodString;
    fingerprint: z.ZodString;
    qualifiedAt: z.ZodISODateTime;
    expiresAt: z.ZodISODateTime;
}, z.core.$strict>;
export declare const postResumeAcceptanceSchema: z.ZodObject<{
    origin: z.ZodObject<{
        kind: z.ZodLiteral<"post-resume-acceptance-v1">;
        campaignId: z.ZodString;
        purpose: z.ZodLiteral<"replyloss-and-wake-v1">;
        historyDigest: z.ZodString;
        resumeDigest: z.ZodString;
        sourceSha: z.ZodString;
        iosTreeSha: z.ZodString;
        previousIosTreeSha: z.ZodString;
        receiptIosTreeSha: z.ZodString;
        sourceReviewRef: z.ZodString;
        createdAt: z.ZodISODateTime;
    }, z.core.$strict>;
    intentId: z.ZodString;
    qualifications: z.ZodArray<z.ZodObject<{
        fingerprint: z.ZodString;
        qualifiedAt: z.ZodISODateTime;
        expiresAt: z.ZodISODateTime;
        executionDeadlineAt: z.ZodISODateTime;
        evidenceRef: z.ZodString;
    }, z.core.$strict>>;
    yielded: z.ZodOptional<z.ZodObject<{
        attemptId: z.ZodString;
        at: z.ZodISODateTime;
    }, z.core.$strict>>;
    releases: z.ZodRecord<z.ZodUnion<[z.ZodString, z.ZodString]>, z.ZodObject<{
        quiescenceDigest: z.ZodString;
        authorityClosureDigest: z.ZodString;
        evidenceRef: z.ZodString;
        fingerprint: z.ZodString;
        qualifiedAt: z.ZodISODateTime;
        expiresAt: z.ZodISODateTime;
        identityDigest: z.ZodString;
        leaseOwner: z.ZodString;
        fence: z.ZodNumber;
        at: z.ZodISODateTime;
    }, z.core.$strict>>;
    groups: z.ZodRecord<z.ZodString, z.ZodObject<{
        attemptId: z.ZodString;
        groupId: z.ZodString;
        buildId: z.ZodString;
        claimedAt: z.ZodISODateTime;
        observedAt: z.ZodOptional<z.ZodISODateTime>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PostResumeAcceptance = z.infer<typeof postResumeAcceptanceSchema>;
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
export declare const physicalDeviceEvidenceSchema: z.ZodObject<{
    inventory: z.ZodObject<{
        ids: z.ZodArray<z.ZodString>;
        sha256: z.ZodString;
    }, z.core.$strict>;
    results: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        status: z.ZodEnum<{
            skipped: "skipped";
            failed: "failed";
            passed: "passed";
        }>;
        attempts: z.ZodNumber;
    }, z.core.$strict>>;
    schemaVersion: z.ZodLiteral<1>;
    intentId: z.ZodString;
    attemptId: z.ZodString;
    dispatchEffectId: z.ZodString;
    sourceSha: z.ZodString;
    controlSha: z.ZodString;
    runId: z.ZodString;
    runAttempt: z.ZodString;
    appInputDigest: z.ZodString;
    configurationDigest: z.ZodString;
    profile: z.ZodString;
    deviceId: z.ZodString;
    hostId: z.ZodString;
    platform: z.ZodLiteral<"iOS">;
    simulated: z.ZodLiteral<false>;
    artifacts: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export declare const physicalDeviceProofSchema: z.ZodObject<{
    policyHash: z.ZodString;
    evidenceHash: z.ZodString;
    inventoryHash: z.ZodString;
    executedCount: z.ZodNumber;
    firstAttemptPassed: z.ZodLiteral<true>;
    schemaVersion: z.ZodLiteral<1>;
    intentId: z.ZodString;
    attemptId: z.ZodString;
    dispatchEffectId: z.ZodString;
    sourceSha: z.ZodString;
    controlSha: z.ZodString;
    runId: z.ZodString;
    runAttempt: z.ZodString;
    appInputDigest: z.ZodString;
    configurationDigest: z.ZodString;
    profile: z.ZodString;
    deviceId: z.ZodString;
    hostId: z.ZodString;
    platform: z.ZodLiteral<"iOS">;
    simulated: z.ZodLiteral<false>;
    artifacts: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        sha256: z.ZodString;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type PhysicalDeviceEvidence = z.infer<typeof physicalDeviceEvidenceSchema>;
export type PhysicalDeviceProof = z.infer<typeof physicalDeviceProofSchema>;
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
    physicalDevice?: PhysicalDeviceEvidence;
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
    physicalDevice?: PhysicalDeviceProof;
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
    postResumeKey?: string;
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
    postResumeAcceptances?: Record<string, PostResumeAcceptance>;
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
