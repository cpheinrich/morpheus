import { z } from "zod";
import { createHash } from "node:crypto";

export const sha = z.string().regex(/^[a-f0-9]{40}$/);
export const digest = z.string().regex(/^[a-f0-9]{64}$/);
export const decimal = z.string().regex(/^[0-9]+$/);
export const timestamp = z.iso.datetime();
export const sourceAgeWaiverSchema = z.object({ authorizationRef: z.string().trim().min(10), grantedAt: timestamp }).strict();
export type SourceAgeWaiver = z.infer<typeof sourceAgeWaiverSchema>;
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
export const configSchema = z.object({
  schemaVersion: z.literal(1), repository: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
  mainBranch: z.string().default("main"), stateBranch: z.string().default("morpheus-cd-state"),
  mode: z.enum(["observe", "active"]).default("observe"), inputs: z.array(z.string().min(1)).min(1),
  controlRef: z.string().default("main"), deliveryWorkflow: z.string().default("cd-v2-delivery.yml"),
  channels: z.object({ staging: channel, production: channel }).strict(),
  tests: z.object({ allowedSkips: z.array(z.string()).default([]) }).default({ allowedSkips: [] }),
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
  if (config.channels.staging.schedule.kind !== "six-hour") context.addIssue({ code: "custom", path: ["channels", "staging"], message: "staging uses six-hour UTC slots" });
  if (config.channels.production.schedule.kind !== "daily" || config.channels.production.minimumAgeHours < 24) context.addIssue({ code: "custom", path: ["channels", "production"], message: "production requires daily UTC slots and at least 24 hours on main" });
  for (const name of ["staging", "production"] as const) {
    const app = config.channels[name], groups = app.externalGroupIds;
    if (groups && (new Set(groups).size !== groups.length || groups.includes(app.internalGroupId) || groups.includes(app.validationGroupId ?? ""))) context.addIssue({ code: "custom", path: ["channels", name, "externalGroupIds"], message: "external groups must be unique and separate from internal/validation groups" });
  }
});
export const budgetSpendingPolicySchema = z.object({
  mode: z.literal("spend-as-needed"), campaignId: z.string().regex(/^[A-Za-z0-9_.:-]{1,160}$/),
  capMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  authorizationRef: z.string().trim().min(10).max(2048), adoptedAt: timestamp,
}).strict();
export type BudgetSpendingPolicy = z.infer<typeof budgetSpendingPolicySchema>;
export type CdConfig = z.infer<typeof configSchema>;
export type Channel = "staging" | "production";
export interface SourceRevision { sha: string; inputDigest: string; mainEnteredAt: string; evidence: { kind: "merged-pr" | "observed"; ref: string }; order: number }
export interface Lease { owner: string; expiresAt: string; fence: number }
export interface Identity { schemaVersion: 1; intentId: string; attemptId: string; dispatchEffectId: string; sourceSha: string; controlSha: string; runId: string; runAttempt: string }
export interface Artifact { name: string; sha256: string; id?: string; path?: string }
export interface TestEvidence extends Identity { scope: "full"; appInputDigest: string; configurationDigest: string; inventory: { ids: string[]; sha256: string }; results: { id: string; status: "passed" | "failed" | "skipped" }[]; artifacts: Artifact[]; validator: { path: string; sha256: string; revision?: "control" | "source" } }
export interface TestProof extends Identity { scope: "full"; appInputDigest: string; configurationDigest: string; evidenceHash: string; inventoryHash: string; executedCount: number; skippedIds: string[]; artifacts: Artifact[]; validator: TestEvidence["validator"] }
export interface UploadEvidence extends Identity { appId: string; version: string; buildNumber: string; ipaSha256: string; uploadOperationId?: string; outcome?: "accepted" | "rejected" | "uncertain"; providerUploadId?: string; acceptedAt?: string; diagnostics?: string; acceptanceArtifact?: Artifact }
export interface InternalObservation { appId: string; version: string; buildNumber: string; buildId: string; processingState: string; betaState: string; group: { id: string; appId: string; internal: boolean; automaticDistribution: boolean; buildIds: string[]; testerIds: string[] }; observedAt: string; uploadState?: string; diagnostics?: string }
export interface Receipt extends Identity { appInputDigest: string; configurationDigest: string; ipaSha256: string; uploadOperationId: string; providerUploadId?: string; testEvidenceHash: string; observation: InternalObservation; deliveredAt: string }
export interface ExternalObservation {
  appId: string; version: string; buildNumber: string; buildId: string; processingState: string; betaState: string;
  detailId: string; autoNotifyEnabled: boolean; groups: InternalObservation["group"][];
  review?: { id: string; state: string }; observedAt: string;
}
export interface ExternalStatus {
  status: "pending" | "waiting-review" | "blocked" | "uncertain" | "available";
  nextAction: string; nextCheckAt: string; blocker?: string; observation?: ExternalObservation; terminal?: boolean;
}
export interface ExternalReview {
  appId: string; buildId: string;
  attempts: { claimedAt: string; outcome: "claimed" | "confirmed" | "conflict" | "rejected"; submissionId?: string; completedAt?: string }[];
}
export interface Attempt {
  id: string; dispatchEffectId: string; sourceSha: string; controlSha: string; appInputDigest: string; configurationDigest: string;
  appId: string; version: string; buildNumber: string; lane: "local" | "hosted"; createdAt: string;
  dispatch: { state: "intended" | "sent" | "uncertain"; sentAt?: string; runIds: string[] }; runId?: string; runAttempt?: string;
  lease?: Lease; tests?: TestProof; upload?: { id: string; claimedAt: string; fence: number; identity: UploadEvidence; outcome: "claimed" | "accepted" | "rejected" | "uncertain"; providerUploadId?: string; acceptedAt?: string; diagnostics?: string };
  artifactsVerifiedAt?: string;
  workflowTerminalAt?: string;
  uploadObservations?: { at: string; uploadState?: string; buildId?: string; processingState?: string; diagnostics?: string }[];
  status: "active" | "failed" | "retired-uncertain" | "delivered";
  observation?: InternalObservation; quiescence?: { kind: "host-terminated" | "hosted-terminated"; ref: string; observedAt: string };
}
export interface DeliveryIntent {
  id: string; channel: Channel; slot: string; originalSource: string; source: string; selectedMainEnteredAt: string; oldestDebtAt: string;
  lineage: { source: string; inputDigest: string; mainEnteredAt: string; reason: string; evidence: string }[];
  coveredSources: string[]; coveredSlots: string[]; validation: boolean; isolatedValidation: boolean; groupId: string; createdAt: string; deadlineAt: string;
  sourceAgeWaiver?: SourceAgeWaiver;
  state: "pending" | "testing" | "uploading" | "processing" | "delivered" | "repairing" | "waiting" | "paused";
  nextAction: string; nextCheckAt: string; blocker?: string; attempts: Attempt[]; receipt?: Receipt; eligibleAt?: string; external?: ExternalStatus;
}
export interface AgentWork {
  id: string; intentId: string; taskDigest: string; task: string; evidence: string[]; strategy: number; state: "pending" | "running" | "waiting" | "complete";
  createdAt: string; nextCheckAt: string; lease?: Lease; invocations: { id: string; executor: "local" | "hosted"; hostId?: string; startedAt: string; endedAt?: string; session?: string; result?: AgentResult; usage?: unknown[]; runIds?: string[]; dispatchState?: "intended" | "sent" | "uncertain"; dispatchCount?: number; lastDispatchAt?: string }[];
}
export interface AgentResult { outcome: "repaired" | "checkpoint" | "blocked"; summary: string; pullRequest?: string; sourceSha?: string; reviewHead?: string; evidence: string[]; missingCapability?: string }
export interface CdState {
  schemaVersion: 1; epoch: string; repository: string; configurationDigest: string; initializedAt: string;
  transitions: Record<string, { at: string; result: unknown; owner?: string }>; sources: SourceRevision[]; lastMain?: string;
  evaluatedSlots: Partial<Record<Channel, string>>; cursors: Partial<Record<Channel, { sourceSha: string; order: number; receiptId: string }>>;
  slots: { channel: Channel; slot: string; decision: "intent" | "no-change" | "covered" | "missed"; intentId?: string }[];
  intents: Record<string, DeliveryIntent>; builds: Record<string, { maximum: string; reservations: Record<string, { buildNumber: string; at: string; burned: boolean }> }>;
  agents: Record<string, AgentWork>; fences: Record<string, number>;
  groupOperations: Record<string, { attemptId: string; claimedAt: string; completedAt?: string }>;
  groupCursors: Record<string, { sourceSha: string; order: number; receiptId: string }>;
  externalReviews?: Record<string, ExternalReview>;
  pauses: { scope: string; actor: string; reason: string; resumeCondition: string; createdAt: string; human: boolean }[];
  budget: { spendingPolicy?: BudgetSpendingPolicy; spentMicros: number; reservations: Record<string, { digest: string; maximumMicros: number; status: "reserved" | "settled"; actualMicros?: number }>; telemetry: Record<string, QuotaSnapshot> };
}
export interface QuotaSnapshot { observedAt: string; windows: { id: string; usedPercent: number; resetsAt: string }[]; source: string; model?: string }
export interface CdEvent { id: string; at: string; kind: string; data: unknown; owner?: string }

export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
export function hash(value: unknown): string { return createHash("sha256").update(typeof value === "string" ? value : canonical(value)).digest("hex"); }
export function configurationDigest(config: CdConfig): string { const { mode: _mode, ...identity } = config; return hash(identity); }
export function parseState(value: unknown): CdState {
  // State revisions are never silently reset or interpreted as an empty ledger.
  const state = value as CdState;
  if (!state || state.schemaVersion !== 1 || !state.epoch || !state.repository || !state.transitions || !state.intents || !Array.isArray(state.sources) || !state.builds || !state.budget || !state.agents || !state.fences || !Array.isArray(state.slots) || !Array.isArray(state.pauses)) throw new Error("Invalid or unsupported CD state; an explicit lossless migration is required");
  if (state.budget.spendingPolicy !== undefined) budgetSpendingPolicySchema.parse(state.budget.spendingPolicy);
  for (const intent of Object.values(state.intents)) {
    if (!Array.isArray(intent.attempts) || !Array.isArray(intent.lineage) || !intent.originalSource || !intent.oldestDebtAt || !intent.deadlineAt) throw new Error("Incomplete durable delivery intent");
    if (intent.state === "delivered" && !intent.receipt) throw new Error("Delivered intent is missing immutable receipt");
    if (intent.sourceAgeWaiver) {
      if (!intent.validation) throw new Error("Source-age waiver requires a validation intent");
      sourceAgeWaiverSchema.parse(intent.sourceAgeWaiver);
    }
  }
  return state;
}
