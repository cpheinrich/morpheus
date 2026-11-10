import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLocalReview, REVIEW_FLOOR_RULE } from "../review/local.js";
import { type AgentExecutor, type AgentResult, type AgentWork, type CdConfig, type CdState, type QuotaSnapshot, type SourceRevision, configurationDigest, hash } from "./schema.js";
import { after, adoptRepair, assertRepairAdmissible, completeOperationalRepair, invariant, quotaUsed, repairWork, sourceAt } from "./state.js";
import { GitHubStore } from "./store.js";
import { ActionsAdapter } from "./actions.js";
import { git, loadSources } from "./source.js";
import { nativeQuota, QuotaReadError } from "./quota-reader.js";
import { claudeEnvironment, claudeQuota, claudeSessionProblem, CLAUDE_ISOLATION_ARGS, verifyClaudeLogin } from "./claude-quota.js";
import { awaitingSubscriptionAdmission } from "./admission-wait.js";
import { verifyRepairChecks } from "./repair-checks.js";
import { assessBlockedResult, blockerProofInstructions, type BlockerClaimReceipt } from "./blocker-proof.js";

const exec = promisify(execFile);
function quotaInvariant(condition: unknown, message: string): asserts condition { if (!condition) throw new QuotaReadError(message); }
const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
function paused(state: CdState, intentId: string): boolean { return state.pauses.some(pause => ["all", intentId, state.intents[intentId]!.channel].includes(pause.scope)); }
const CAPABILITY_RECHECK_MINUTES = 6 * 60;
/** Built-in tools that could outlive or escape a bounded repair invocation. */
export const CLAUDE_DISALLOWED_TOOLS: readonly string[] = Object.freeze(["RemoteTrigger", "CronCreate", "ScheduleWakeup", "PushNotification"]);
const CLAUDE_INIT_ID = "morpheus-cd-run-init", CLAUDE_BINDING_MS = 60_000;
function repairContext(state: CdState, work: AgentWork) {
  const intent = state.intents[work.intentId], attempt = intent?.attempts.at(-1);
  return { version: 1, workId: work.id, taskDigest: work.taskDigest, evidence: [...work.evidence],
    delivery: { source: intent?.source, attempt: attempt ? { id: attempt.id, sourceSha: attempt.sourceSha,
      controlSha: attempt.controlSha, runId: attempt.runId, runAttempt: attempt.runAttempt, status: attempt.status,
      workflowTerminalAt: attempt.workflowTerminalAt,
      quiescence: attempt.quiescence ? { kind: attempt.quiescence.kind, ref: attempt.quiescence.ref, observedAt: attempt.quiescence.observedAt } : null } : null } };
}
/**
 * Which merged source the controller can adopt. Shown to the agent but kept out of the
 * repairContext digest: main moving on its own must not wake a capability wait.
 */
function repairAdmissibility(state: CdState, config: CdConfig, work: AgentWork) {
  const policy = config.tests.physicalDevice;
  return { lastMain: state.lastMain ?? null, attemptedSources: [...new Set(state.intents[work.intentId]?.attempts.map(attempt => attempt.sourceSha) ?? [])],
    physicalDevice: policy ? { profile: policy.profile, testIds: [...policy.testIds], sourceFloor: policy.sourceFloor ?? null } : null };
}
/** Refuse a merged repair the controller could not adopt before the completion CAS, so the checkpoint says why. */
async function admitRepairSource(config: CdConfig, store: GitHubStore, sourceDir: string, intentId: string, sha: string): Promise<SourceRevision[]> {
  const sources = await loadSources(sourceDir, config, store.api, new Date().toISOString()), { state } = await store.read();
  if (state.intents[intentId]?.state === "delivered") return sources;
  const view = { ...state, sources: sources.map(source => state.sources.find(known => known.sha === source.sha) ?? source) };
  assertRepairAdmissible(view, config, intentId, sourceAt(view, sha));
  return sources;
}
type Invocation = AgentWork["invocations"][number];
interface StartReceipt { invocationId: string; fence: number; claimedAt: string; deadlineAt: string; capabilityContext: { version: 1; workId: string; taskDigest: string; digest: string } }
function capabilityRetry(state: CdState, work: AgentWork, now: string): { ready: boolean; nextCheckAt?: string } | undefined {
  const last = blockedOnCapability(state, work), at = Date.parse(now);
  if (!last) return;
  const endedAt = Date.parse(last.endedAt!);
  // Old/malformed receipts cannot justify suppressing a normal admission. One
  // invocation can establish a baseline; changed task bytes must reach refusal.
  const receipt = currentStartReceipt(state, work, last);
  if (hash(work.task) !== work.taskDigest || !Number.isFinite(at) || !Number.isFinite(endedAt) || endedAt > at || !receipt) return { ready: true };
  const candidate = blockerCandidate(state, work, last);
  if (!candidate) return { ready: true };
  const context = receipt.capabilityContext;
  const checked = assessBlockedResult(last.result!, { workId: work.id, invocationId: last.id, fence: receipt.fence,
    taskDigest: work.taskDigest, contextDigest: context.digest, claimedAt: receipt.claimedAt, deadlineAt: receipt.deadlineAt }, last.endedAt!, context.digest);
  if (checked.claim?.status !== "cto-verification-required" || checked.claim.proofDigest !== candidate.proofDigest) return { ready: true };
  const nextCheckAt = after(last.endedAt!, CAPABILITY_RECHECK_MINUTES);
  return { ready: at >= Date.parse(nextCheckAt), nextCheckAt };
}
/** The latest real invocation, when it ended blocked on a named missing capability after at least two strategies. */
function blockedOnCapability(state: CdState, work: AgentWork): Invocation | undefined {
  // A dispatch-only hosted placeholder has not consumed its prompt yet and
  // cannot erase the preceding actual blocked invocation's capability wait.
  const last = work.invocations.findLast(invocation => invocation.endedAt || invocation.executor !== "hosted" || !invocation.dispatchState || state.transitions[`worker-start-${invocation.id}`]);
  if (state.intents[work.intentId]?.postResumeKey || !Number.isSafeInteger(work.strategy) || work.strategy < 2) return undefined;
  if (typeof last?.endedAt !== "string" || last.result?.outcome !== "blocked" || typeof last.result.missingCapability !== "string" || !last.result.missingCapability.trim()) return undefined;
  return last;
}
/** The invocation's start receipt, when it is exactly current: same invocation and fence, and a context digest of today's repair context. */
function currentStartReceipt(state: CdState, work: AgentWork, last: Invocation): StartReceipt | undefined {
  const result = state.transitions[`worker-start-${last.id}`]?.result as Record<string, unknown> | undefined;
  if (!isRecord(result) || result.invocationId !== last.id || typeof result.fence !== "number" || !Number.isSafeInteger(result.fence) || result.fence <= 0 || result.fence !== state.fences[work.id]) return undefined;
  if (typeof result.claimedAt !== "string" || typeof result.deadlineAt !== "string") return undefined;
  return currentCapabilityContext(state, work, result.capabilityContext) ? result as unknown as StartReceipt : undefined;
}
function currentCapabilityContext(state: CdState, work: AgentWork, context: unknown): boolean {
  if (!isRecord(context) || Object.keys(context).sort().join(",") !== "digest,taskDigest,version,workId") return false;
  if (context.version !== 1 || context.workId !== work.id || context.taskDigest !== work.taskDigest) return false;
  return typeof context.digest === "string" && /^[a-f0-9]{64}$/.test(context.digest) && context.digest === hash(repairContext(state, work));
}
/** The completion's validated blocker candidate awaiting CTO verification. */
function blockerCandidate(state: CdState, work: AgentWork, last: Invocation): Partial<BlockerClaimReceipt> | undefined {
  const completion = state.transitions[`worker-ended-${last.id}`]?.result as Record<string, unknown> | undefined;
  const candidate = completion?.blockerClaim as Partial<BlockerClaimReceipt> | undefined;
  // A historical blocked string or self-attested clearance is not a validated
  // candidate. Recheck the exact saved proof rather than trusting its label.
  if (!isRecord(completion) || completion.workId !== work.id || completion.invocationId !== last.id || completion.outcome !== "blocked") return undefined;
  if (!isRecord(candidate) || candidate.status !== "cto-verification-required") return undefined;
  return candidate;
}
function selectDefaultRepair(state: CdState, now: string, admissionWaitsDue = false): AgentWork | undefined {
  const at = Date.parse(now), lastStart = (work: AgentWork) => Date.parse(work.invocations.at(-1)?.startedAt ?? work.createdAt);
  // Only the Claude executor treats a latest-event subscription admission wait as due; its own admission reads fresh.
  const admissionWait = (work: AgentWork) => admissionWaitsDue && awaitingSubscriptionAdmission(state, work);
  const due = Object.values(state.agents).filter(work => work.state !== "complete" && (!work.lease || Date.parse(work.lease.expiresAt) <= at))
    .map(work => ({ work, retry: capabilityRetry(state, work, now) })).filter(({ work, retry }) => retry || Date.parse(work.nextCheckAt) <= at || admissionWait(work));
  // Sort a derived array, never the ledger. Retry scheduling/checkpoint counts
  // cannot renew priority; ties use code-unit IDs consistently across hosts.
  due.sort(({ work: left }, { work: right }) => lastStart(left) - lastStart(right) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
  return (due.find(({ work, retry }) => retry?.ready !== false && !state.intents[work.intentId]?.postResumeKey && !paused(state, work.intentId)) ?? due[0])?.work;
}
export const agentResultSchema = { type: "object", additionalProperties: false, properties: { outcome: { type: "string", enum: ["repaired", "checkpoint", "blocked"] }, summary: { type: "string" }, pullRequest: { type: "string" }, sourceSha: { type: "string" }, reviewHead: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, missingCapability: { type: "string" } }, required: ["outcome", "summary", "pullRequest", "sourceSha", "reviewHead", "evidence", "missingCapability"] };
function claudeModelWindows(model: string): string[] {
  const family = model.toLowerCase().match(/^(?:claude-)?(opus|fable|sonnet|haiku)(?:$|[-\[])/)?.[1];
  quotaInvariant(family, "Configured Claude model has no known quota family; retain budget wait");
  return ["five_hour", "seven_day", `seven_day_${family}`];
}
export function normalizeClaudeQuota(value: unknown, now: string, model?: string): QuotaSnapshot {
  const raw = value as Record<string, { utilization?: number; resets_at?: string }>;
  const ids = model ? claudeModelWindows(model) : Object.keys(raw ?? {}).filter(id => /^(five_hour|seven_day)(_[a-z0-9_]+)?$/.test(id));
  if (model) quotaInvariant(ids.every(id => raw?.[id]), "Claude model usage response omitted a required runtime window; retain budget wait");
  const windows = ids.flatMap(id => raw?.[id] ? [{ id, usedPercent: raw[id]!.utilization as number, resetsAt: raw[id]!.resets_at as string }] : []);
  const snapshot = { observedAt: now, source: "Claude OAuth account usage readback", windows, ...(model ? { model } : {}) };
  quotaInvariant(quotaUsed(snapshot, now) !== undefined, "Claude usage response has no valid nonexpired runtime windows"); return snapshot;
}
/** No model request: read the same actual account limits exposed by the runtime. */
export async function codexQuota(command: string[], cwd: string, now: string): Promise<QuotaSnapshot> {
  return nativeQuota(command, cwd, now);
}
export class QuotaReader {
  private cached?: QuotaSnapshot;
  private retryAt = 0;
  constructor(readonly config: CdConfig, readonly executor: AgentExecutor, readonly sourceDir: string, readonly environment: NodeJS.ProcessEnv = process.env, readonly fetcher: typeof fetch = fetch) {}
  async read(now = new Date().toISOString()): Promise<QuotaSnapshot> {
    if (this.executor === "claude") {
      const claude = this.config.agents?.claude; quotaInvariant(claude, "Agent executor is not configured");
      // Never a file: Claude telemetry comes only from the bound CLI's own reading.
      quotaInvariant(this.environment.MORPHEUS_CD_QUOTA_FILE === undefined, "Claude subscription telemetry cannot be supplied by file; retain budget wait");
      return claudeQuota(claude.command, claude.account, claude.model, this.environment, now);
    }
    const agent = this.config.agents?.[this.executor]; quotaInvariant(agent, "Agent executor is not configured");
    const path = this.environment.MORPHEUS_CD_QUOTA_FILE ?? agent.quotaFile;
    if (path) return this.readTelemetryFile(path, agent.model, now);
    if (this.executor === "local") return codexQuota(agent.command, this.sourceDir, now);
    return this.readHostedUsage(agent.model, now);
  }
  private async readTelemetryFile(path: string, model: string | undefined, now: string): Promise<QuotaSnapshot> {
    const value = JSON.parse(await readFile(path, "utf8")) as QuotaSnapshot;
    quotaInvariant(this.executor !== "hosted" || !model || value.model === model, "Subscription telemetry file does not attest the configured Claude model");
    if (this.executor === "hosted" && model) {
      const ids = claudeModelWindows(model);
      quotaInvariant(ids.every(id => value.windows?.some(window => window.id === id)), "Subscription telemetry file omitted a required Claude runtime window");
      value.windows = value.windows.filter(window => ids.includes(window.id));
    }
    quotaInvariant(quotaUsed(value, now) !== undefined, "Subscription telemetry file is stale, missing or invalid"); return value;
  }
  private async readHostedUsage(model: string | undefined, now: string): Promise<QuotaSnapshot> {
    if (this.cached && this.cached.model === model && quotaUsed(this.cached, now) !== undefined) return this.cached;
    quotaInvariant(Date.parse(now) >= this.retryAt, "Claude usage endpoint backoff; retain budget wait");
    const token = this.environment.CLAUDE_CODE_OAUTH_TOKEN; quotaInvariant(token, "Hosted subscription usage requires actual runtime telemetry or authorized OAuth usage readback");
    this.retryAt = Date.parse(now) + 5 * 60_000;
    const response = await this.fetcher("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!response.ok) quotaInvariant(false, await usageFailure(response));
    this.cached = normalizeClaudeQuota(await response.json(), now, model); return this.cached;
  }
}
/** Provider messages can echo credentials, so a failed usage read names only fixed recognized diagnostics. */
async function usageFailure(response: Response): Promise<string> {
  let failure: { error?: { type?: unknown; message?: unknown } } | undefined;
  try { failure = await response.json() as typeof failure; } catch { /* HTTP status remains useful without JSON. */ }
  const error = failure?.error;
  const category = typeof error?.type === "string" && ["permission_error", "authentication_error", "invalid_request_error", "rate_limit_error"].includes(error.type) ? error.type : undefined;
  const scope = typeof error?.message === "string" && /scope requirement [`'"]?user:profile\b/.test(error.message) ? "required OAuth scope user:profile" : undefined;
  return `Claude usage readback HTTP ${response.status}${category ? `; ${category}` : ""}${scope ? `; ${scope}` : ""}; retain budget wait`;
}
export async function scheduleHosted(config: CdConfig, store: GitHubStore, now: string): Promise<void> {
  const hosted = config.agents?.hosted;
  if (!hosted) return;
  const snapshot = await store.read(), actions = new ActionsAdapter(store.api, config);
  for (const work of Object.values(snapshot.state.agents)) {
    const invocationId = hostedInvocationDue(config, snapshot.state, work, now);
    if (!invocationId) continue;
    const matching = await actions.runs(invocationId, hosted.workflow);
    if (matching.length) { await observeHostedRuns(config, store, work, invocationId, matching, now); continue; }
    const existing = work.invocations.find(item => item.id === invocationId);
    if (existing && Date.parse(now) - Date.parse(existing.lastDispatchAt ?? existing.startedAt) < config.deadlines.wakeMinutes * 60_000) continue;
    const ordinal = (existing?.dispatchCount ?? 0) + 1;
    const claim = await claimHostedDispatch(config, store, work, invocationId, ordinal, now);
    if (!claim.replayed) await store.api.request("POST", `repos/${config.repository}/actions/workflows/${hosted.workflow}/dispatches`, { ref: hosted.ref, inputs: { "work-id": work.id, "invocation-id": invocationId, "intent-id": work.intentId, strategy: String(work.strategy), "task-digest": work.taskDigest } });
  }
}
/** The hosted invocation id to observe or dispatch for due, unleased, unpaused work past its admission delay. */
function hostedInvocationDue(config: CdConfig, state: CdState, work: AgentWork, now: string): string | undefined {
  if (state.intents[work.intentId]?.postResumeKey || work.state === "complete" || paused(state, work.intentId)) return undefined;
  const retry = capabilityRetry(state, work, now);
  if (retry ? !retry.ready : Date.parse(work.nextCheckAt) > Date.parse(now)) return undefined;
  invariant(hash(work.task) === work.taskDigest, "Durable task was altered");
  const running = work.invocations.at(-1);
  if (running && !running.endedAt && work.lease && Date.parse(work.lease.expiresAt) > Date.parse(now)) return undefined;
  if (!running && Date.parse(now) - Date.parse(work.createdAt) < config.deadlines.admissionMinutes * 60_000) return undefined;
  return running?.executor === "hosted" && !running.endedAt ? running.id : `agent-${work.id}-i${work.invocations.length + 1}`;
}
async function observeHostedRuns(config: CdConfig, store: GitHubStore, work: AgentWork, invocationId: string, matching: { id: number; status: string }[], now: string): Promise<void> {
  await store.transact(`hosted-observe-${invocationId}-${hash(matching.map(run => ({ id: run.id, status: run.status }))).slice(0, 12)}`, "observe-hosted-agent", now, state => {
    const current = state.agents[work.id]!, invocation = current.invocations.find(item => item.id === invocationId);
    if (invocation) invocation.runIds = matching.map(run => String(run.id));
    if (matching.every(run => run.status === "completed") && current.state !== "complete") { current.state = "pending"; if (current.lease?.owner === invocationId) current.lease = undefined; if (invocation) invocation.endedAt ??= now; current.nextCheckAt = after(now, config.deadlines.pollMinutes); }
    return { invocationId, runs: matching.map(run => run.id) };
  });
}
async function claimHostedDispatch(config: CdConfig, store: GitHubStore, work: AgentWork, invocationId: string, ordinal: number, now: string) {
  return store.transact(`hosted-dispatch-${invocationId}-${ordinal}`, "claim-hosted-agent-dispatch", now, state => {
    const current = state.agents[work.id]!;
    invariant(current.state !== "complete", "Repair task already completed");
    invariant(current.taskDigest === work.taskDigest && hash(current.task) === current.taskDigest, "Durable task was altered during hosted dispatch");
    invariant(!state.intents[current.intentId]?.postResumeKey, "Post-resume acceptance cannot launch a repair model");
    invariant(!paused(state, current.intentId), "Repair is explicitly paused");
    invariant(capabilityRetry(state, current, now)?.ready !== false, "Repair capability context is unchanged");
    invariant(!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(now), "Repair agent lease is still live");
    if (!current.invocations.some(item => item.id === invocationId)) current.invocations.push({ id: invocationId, executor: "hosted", startedAt: now, dispatchState: "uncertain", runIds: [] });
    const invocation = current.invocations.find(item => item.id === invocationId)!;
    invariant((invocation.dispatchCount ?? 0) + 1 === ordinal, "Hosted dispatch changed during reconciliation; reload");
    invocation.dispatchCount = ordinal; invocation.lastDispatchAt = now;
    current.state = "waiting"; current.nextCheckAt = after(now, config.deadlines.pollMinutes); return { workId: work.id, invocationId };
  });
}
export async function verifyRepair(config: CdConfig, store: GitHubStore, sourceDir: string, result: AgentResult): Promise<string> {
  const match = result.pullRequest?.match(new RegExp(`^https://github\\.com/${config.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/([0-9]+)$`));
  invariant(match && result.reviewHead, "Repair needs exact reviewed PR provenance");
  const pull = await store.api.request<{ merged: boolean; merge_commit_sha: string; head: { sha: string; ref?: string; repo?: { id: number; full_name: string } | null }; base: { ref: string; sha: string; repo?: { id: number; full_name: string } | null }; body: string; labels: { name: string }[] }>("GET", `repos/${config.repository}/pulls/${match[1]}`);
  invariant(pull.merged && pull.head.sha === result.reviewHead && pull.base.ref === config.mainBranch, "Repair PR is not merged with its exact reviewed head");
  const checks = await verifyRepairChecks(store.api, config.repository, pull.head, pull.base.repo);
  git(sourceDir, ["fetch", "origin", pull.head.sha, pull.merge_commit_sha]);
  const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-review-"));
  try {
    git(sourceDir, ["worktree", "add", "--detach", directory, pull.head.sha]);
    // A review-floor waiver and a warning both report a validated record; every other finding, an
    // opt-out included, refuses.
    const findings = checkLocalReview({ root: directory, body: pull.body, labels: pull.labels.map(label => label.name), head: pull.head.sha, base: pull.base.sha })
      .filter(finding => finding.level !== "warning" && !(finding.level === "waived" && finding.rule === REVIEW_FLOOR_RULE));
    invariant(findings.length === 0, `Repair lacks valid independent review: ${findings.map(finding => finding.message).join("; ")}`);
  } finally { try { git(sourceDir, ["worktree", "remove", directory]); } finally { await rm(directory, { recursive: true, force: true }); } }
  invariant(!result.sourceSha || result.sourceSha === pull.merge_commit_sha, "Agent source differs from actual merged repair");
  if (checks.superseded.length) result.evidence.push(`Morpheus verified cancellation supersession: ${JSON.stringify(checks)}`);
  return pull.merge_commit_sha;
}
type WorkerOptions = { executor: AgentExecutor; hostId?: string; workId?: string; invocationId?: string; taskDigest?: string };
type AgentConfig = NonNullable<NonNullable<CdConfig["agents"]>[AgentExecutor]>;
type AdmissionFailure = "telemetry" | "capacity" | "authentication";
type InvocationClaim = { invocationId: string; fence: number; claimedAt: string; deadlineAt: string };

export async function runWorker(config: CdConfig, store: GitHubStore, sourceDir: string, options: WorkerOptions, environment: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  invariant(config.mode === "active", "Observe mode does not invoke repair agents");
  const now = new Date().toISOString(), agent = config.agents?.[options.executor]; invariant(agent, "Agent executor not configured");
  const hostId = workerHostId(options);
  const snapshot = await store.read();
  // The opt-in is proven by the reviewed migration that recorded this exact configuration in the ledger.
  invariant(options.executor !== "claude" || snapshot.state.configurationDigest === configurationDigest(config), "Claude executor requires the migrated configuration recorded in the ledger");
  const work = options.workId ? snapshot.state.agents[options.workId] : selectDefaultRepair(snapshot.state, now, options.executor === "claude");
  const skipped = workerSkip(snapshot.state, work, options, now);
  if (skipped) return skipped;
  const promptWork = structuredClone(work!), context = repairContext(snapshot.state, promptWork), admissibility = repairAdmissibility(snapshot.state, config, promptWork);
  const capabilityContext = { version: 1, workId: work!.id, taskDigest: work!.taskDigest, digest: hash(context) };
  const quota = new QuotaReader(config, options.executor, sourceDir, environment);
  const env = options.executor === "claude" ? claudeEnvironment(environment) : { ...environment }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; delete env.ANTHROPIC_API_KEY;
  const admitted = await admitSubscription(config, store, quota, agent, work!, options, sourceDir, env, now);
  if (!admitted.measured) return admitted.wait;
  const measured = admitted.measured;
  const invocationId = options.invocationId ?? `agent-${work!.id}-i${work!.invocations.length + 1}`;
  const claim = await claimInvocation(config, store, work!, options, hostId, invocationId, measured, capabilityContext);
  if (claim.replayed) return { state: "already-owned", invocationId };
  const blockerBinding = { workId: work!.id, invocationId, fence: claim.result.fence, taskDigest: work!.taskDigest,
    contextDigest: capabilityContext.digest, claimedAt: claim.result.claimedAt, deadlineAt: claim.result.deadlineAt };
  const run = new AgentRun(config, store, work!, options.executor, invocationId, claim.result.fence, quota);
  try {
    const proofInstructions = blockerProofInstructions(blockerBinding);
    const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-agent-"));
    const paths = { result: join(directory, "result.json"), schema: join(directory, "schema.json"), events: join(directory, "events.jsonl") };
    await writeFile(paths.schema, JSON.stringify(agentResultSchema), { mode: 0o600 });
    const args = agentArgs(config, agent, options.executor, sourceDir, previousSession(work!, options.executor, hostId), paths);
    const launchAt = new Date().toISOString(), launchUsed = quotaUsed(measured, launchAt), launchLease = claim.state.agents[work!.id]!.lease, timeout = config.deadlines.agentMinutes * 60_000;
    invariant(launchUsed !== undefined && launchUsed < config.budget.subscriptionAdmitBelowPercent, "Subscription admission telemetry expired or threshold reached before invocation");
    invariant(launchLease?.owner === invocationId && launchLease.fence === claim.result.fence && Date.parse(launchLease.expiresAt) > Date.parse(launchAt) + timeout, "Agent lease is not owned or cannot cover configured execution time before invocation");
    const prompt = repairPrompt(config, promptWork, context, admissibility, options.executor, invocationId, proofInstructions);
    const code = await run.supervise(agent.command, args, sourceDir, env, paths.events, prompt, timeout);
    const { result, repairedSha, sources, verificationError } = await verifyRepairResult(config, store, sourceDir, work!.intentId, await run.result(code, paths));
    const completion = await run.complete(result, blockerBinding, { repairedSha, sources, verificationError, directory });
    const receipt = completion.result.blockerClaim;
    return { workId: work!.id, invocationId, outcome: completion.result.outcome, repairedSha, checkpoint: directory,
      ...(receipt ? { blockerClaim: { status: receipt.status, proofDigest: receipt.proofDigest, reason: receipt.reason } } : {}) };
  } catch (error) {
    return run.fail(error);
  }
}
/** A claimed code repair must verify and be admissible; otherwise it becomes a checkpoint naming why. */
async function verifyRepairResult(config: CdConfig, store: GitHubStore, sourceDir: string, intentId: string, result: AgentResult): Promise<{ result: AgentResult; repairedSha?: string; sources?: SourceRevision[]; verificationError?: string }> {
  if (result.outcome !== "repaired" || !result.pullRequest) return { result };
  try {
    const repairedSha = await verifyRepair(config, store, sourceDir, result);
    return { result, repairedSha, sources: await admitRepairSource(config, store, sourceDir, intentId, repairedSha) };
  } catch (error) {
    const verificationError = error instanceof Error ? error.message : String(error);
    return { result: { ...result, outcome: "checkpoint", summary: `${result.summary}; deterministic verification pending: ${verificationError}` }, verificationError };
  }
}
function workerHostId(options: WorkerOptions): string | undefined {
  invariant(options.executor !== "hosted" || options.hostId === undefined, "Host identity is only supported for local workers");
  const hostId = options.executor !== "hosted" ? options.hostId ?? hostname() : undefined;
  invariant(hostId === undefined || /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/.test(hostId), "Local host identity must be a stable nonempty identifier");
  return hostId;
}
/** A status to return without admission when there is no runnable work, or the work is post-resume, paused or waiting on capability. */
function workerSkip(state: CdState, work: AgentWork | undefined, options: WorkerOptions, now: string): Record<string, unknown> | undefined {
  if (!work || work.state === "complete") return { state: "idle" };
  if (state.intents[work.intentId]?.postResumeKey) return { state: "observe-post-resume", workId: work.id };
  if (paused(state, work.intentId)) return { state: "paused", workId: work.id };
  invariant(!options.taskDigest || options.taskDigest === work.taskDigest, "Hosted task digest differs from immutable repair task");
  invariant(hash(work.task) === work.taskDigest, "Durable task was altered");
  const retry = capabilityRetry(state, work, now);
  if (retry?.ready === false) return { state: "capability-wait", workId: work.id, nextCheckAt: retry.nextCheckAt };
  return undefined;
}
/** Measured subscription headroom and a verified subscription login, or a recorded budget wait naming which of the three failed. */
async function admitSubscription(config: CdConfig, store: GitHubStore, quota: QuotaReader, agent: AgentConfig, work: AgentWork, options: WorkerOptions, sourceDir: string, env: NodeJS.ProcessEnv, now: string): Promise<{ measured: QuotaSnapshot; wait?: undefined } | { measured?: undefined; wait: Record<string, unknown> }> {
  const prefix = agent.command;
  let admissionFailure: AdmissionFailure = "telemetry";
  try {
    const measured = await quota.read(now);
    const used = quotaUsed(measured, now); invariant(used !== undefined, "Subscription telemetry is unavailable");
    admissionFailure = "capacity";
    invariant(used < config.budget.subscriptionAdmitBelowPercent, "Subscription admission threshold reached");
    admissionFailure = "authentication";
    const login = await exec(prefix[0]!, [...prefix.slice(1), ...(options.executor === "local" ? ["login", "status"] : options.executor === "claude" ? ["auth", "status", "--json"] : ["auth", "status"])], { cwd: sourceDir, env, timeout: 10_000 });
    verifySubscriptionLogin(config, options.executor, login);
    return { measured };
  } catch (error) {
    return { wait: await recordAdmissionWait(store, work, options.executor, admissionFailure, error, now) };
  }
}
function verifySubscriptionLogin(config: CdConfig, executor: AgentExecutor, login: { stdout: string; stderr: string }): void {
  if (executor === "local") invariant(/Logged in using ChatGPT/i.test(login.stdout + login.stderr), "Local worker must use the ChatGPT subscription");
  else if (executor === "claude") verifyClaudeLogin(login.stdout, config.agents!.claude!.account);
  else { const auth = JSON.parse(login.stdout); invariant(auth.loggedIn && auth.authMethod === "claude.ai" && auth.apiProvider === "firstParty", "Hosted worker must use its authorized Claude subscription"); }
}
async function recordAdmissionWait(store: GitHubStore, work: AgentWork, executor: AgentExecutor, admissionFailure: AdmissionFailure, error: unknown, now: string): Promise<Record<string, unknown>> {
  const reason = admissionFailure === "capacity" ? "Subscription admission threshold reached" : admissionFailure === "authentication" ? "Subscription authentication verification failed" : error instanceof QuotaReadError ? error.message : "Subscription telemetry acquisition failed; unavailable, stale or invalid";
  const nextAction = admissionFailure === "capacity" ? "wait-measured-subscription-capacity" : admissionFailure === "authentication" ? "wait-subscription-authentication" : "wait-subscription-telemetry";
  // Keep the guarded journal kind, but do not collapse a failed measurement
  // into measured exhaustion or replay another failure class in this bucket.
  // A Claude wait is scoped to its executor and never moves shared work out of another subscription's reach,
  // nor overwrites the status of a run another owner holds.
  const claudeWait = executor === "claude";
  await store.transact(`admission-wait-${claudeWait ? "claude-" : ""}${admissionFailure}-${work.id}-${Math.floor(Date.parse(now) / 300_000)}`, "agent-budget-wait", now, state => {
    const current = state.agents[work.id]!;
    if (claudeWait) {
      if (current.lease && Date.parse(current.lease.expiresAt) > Date.parse(now)) return { reason, failureKind: admissionFailure, executor: "claude", statusRetained: "live-lease" };
    } else { current.state = "waiting"; current.nextCheckAt = after(now, 5); }
    const intent = state.intents[current.intentId]!; intent.blocker = reason; intent.nextAction = nextAction; return { reason, failureKind: admissionFailure, ...(claudeWait ? { executor: "claude" } : {}) };
  }); return { state: "budget-wait", reason, failureKind: admissionFailure };
}
async function claimInvocation(config: CdConfig, store: GitHubStore, work: AgentWork, options: WorkerOptions, hostId: string | undefined, invocationId: string, measured: QuotaSnapshot, capabilityContext: Record<string, unknown>) {
  return store.transact(`worker-start-${invocationId}`, "claim-agent-invocation", new Date().toISOString(), state => {
    // Admission and each CAS reload may be slow; only the accepted claim attempt
    // starts the lease clock. Its quota must still be valid at that same time.
    const claimedAt = new Date().toISOString(), used = quotaUsed(measured, claimedAt);
    invariant(used !== undefined && used < config.budget.subscriptionAdmitBelowPercent, "Subscription admission telemetry expired or threshold reached before claim");
    const current = state.agents[work.id]!; invariant(current.state !== "complete" && (!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(claimedAt)), "Agent work already owned");
    invariant(current.taskDigest === work.taskDigest && hash(current.task) === current.taskDigest, "Durable task was altered during admission");
    invariant(!state.intents[current.intentId]?.postResumeKey, "Post-resume acceptance cannot launch a repair model");
    invariant(!paused(state, current.intentId), "Repair is explicitly paused");
    invariant(capabilityRetry(state, current, claimedAt)?.ready !== false, "Repair capability context is unchanged");
    invariant(!Object.values(state.agents).some(other => other.id !== current.id && other.lease && Date.parse(other.lease.expiresAt) > Date.parse(claimedAt) && other.invocations.at(-1)?.executor === options.executor), "This subscription executor already has an in-flight reservation");
    const fence = (state.fences[current.id] ?? 0) + 1; state.fences[current.id] = fence;
    current.lease = { owner: invocationId, expiresAt: after(claimedAt, config.deadlines.agentMinutes + 2), fence }; current.state = "running";
    if (!current.invocations.some(item => item.id === invocationId)) current.invocations.push({ id: invocationId, executor: options.executor, ...(hostId ? { hostId } : {}), startedAt: claimedAt });
    // Keep the pre-admission prompt digest across every CAS reload. Evidence
    // arriving while quota/login runs must remain new after this invocation.
    state.budget.telemetry[options.executor] = measured; return { invocationId, fence, capabilityContext, claimedAt, deadlineAt: current.lease.expiresAt } as InvocationClaim & { capabilityContext: Record<string, unknown> };
  });
}
/** Native sessions belong to one executor/host/user/session store. Never search past a newer foreign, other-executor or unidentified checkpoint to resume an older native context. */
function previousSession(work: AgentWork, executor: AgentExecutor, hostId: string | undefined): string | undefined {
  if (executor === "hosted") return work.invocations.findLast(item => item.executor === "hosted" && item.session)?.session;
  const previousNative = work.invocations.findLast(item => item.executor === "local" || item.executor === "claude");
  return previousNative && previousNative.executor === executor && previousNative.hostId === hostId ? previousNative.session : undefined;
}
function agentArgs(config: CdConfig, agent: AgentConfig, executor: AgentExecutor, sourceDir: string, session: string | undefined, paths: { result: string; schema: string }): string[] {
  const prefix = agent.command, resume = session ? ["--resume", session] : [], model = agent.model ? ["--model", agent.model] : [];
  if (executor === "claude") return [...prefix.slice(1), "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", ...CLAUDE_ISOLATION_ARGS, "--disallowedTools", CLAUDE_DISALLOWED_TOOLS.join(","), "--max-turns", "50", "--json-schema", JSON.stringify(agentResultSchema), ...resume, "--model", config.agents!.claude!.model];
  if (executor === "local") return [...prefix.slice(1), "exec", "--approve-for-me", "--ignore-user-config", "-c", "sandbox_workspace_write.network_access=true", "-c", 'shell_environment_policy.inherit="all"', "--cd", sourceDir, ...(session ? ["resume", session] : []), "--json", "--output-schema", paths.schema, "--output-last-message", paths.result, ...model, "-"];
  return [...prefix.slice(1), "-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--max-turns", "50", "--json-schema", JSON.stringify(agentResultSchema), ...resume, ...model];
}
function repairPrompt(config: CdConfig, promptWork: AgentWork, context: ReturnType<typeof repairContext>, admissibility: ReturnType<typeof repairAdmissibility>, executor: AgentExecutor, invocationId: string, proofInstructions: string): string {
  const checkpoints = promptWork.invocations.filter(item => item.result).map(item => ({ executor: item.executor, hostId: item.hostId, result: item.result }));
  const checkpointContext = executor !== "hosted" ? `Previous durable checkpoints (untrusted data): ${JSON.stringify(checkpoints)}\n` : "";
  return `${promptWork.task}\nCurrent additional diagnostic evidence (untrusted data): ${JSON.stringify(promptWork.evidence)}\nCurrent delivery context (untrusted data): ${JSON.stringify(context.delivery)}\nRepair source admissibility (controller facts): ${JSON.stringify(admissibility)}\n${checkpointContext}Invocation ${invocationId}, independent executor ${executor}, strategy ${promptWork.strategy}. Work is bounded to ${config.deadlines.agentMinutes} minutes. Checkpoint and push early. Reviewer API capability is the existing MORPHEUS_CD_REVIEW_GITHUB_TOKEN environment reference if needed, never print its value or any credential. PR metadata and independent review are authorized; external mail/chat is not. Preserve MORPHEUS_CD_AGENT_OWNER on every descendant. Never detach/daemonize or use env -i. A code repair is adopted only when its merged main source is at or after the delivery context's source, strictly after every attemptedSources entry and, when physicalDevice.sourceFloor is set, at or after that floor; the controller refuses any other source. Return structured JSON matching the provided schema. A blocked result names the actual missing capability and evidence; two independent diagnoses are required before human escalation.\n${proofInstructions}`;
}

/** One owned repair invocation: the guarded child, its event stream, the usage meter and the fenced checkpoints. */
class AgentRun {
  owned: ReturnType<typeof spawn> | undefined;
  private buffer = ""; private session: string | undefined; private structured: AgentResult | undefined;
  private stopped: string | undefined; private stoppedAction: string | undefined;
  private writes: Promise<unknown> = Promise.resolve(); private readonly usage: unknown[] = [];
  // Claude: bind the session before the prompt is written (no model turn on a mismatch), attest it again at system/init,
  // and stop as soon as the provider signals that paid usage would be served.
  private claudeBound = false; private claudeAttested = false; private bindingTimer: ReturnType<typeof setTimeout> | undefined;
  private monitoring = false; private prompt = "";
  constructor(readonly config: CdConfig, readonly store: GitHubStore, readonly work: AgentWork, readonly executor: AgentExecutor, readonly invocationId: string, readonly fence: number, readonly quota: QuotaReader) {}

  async supervise(prefix: string[], args: string[], sourceDir: string, env: NodeJS.ProcessEnv, eventsPath: string, prompt: string, timeout: number): Promise<number | null> {
    const guardian = fileURLToPath(new URL("./guarded-run.py", import.meta.url));
    const child = spawn("/usr/bin/python3", [guardian, String(timeout), prefix[0]!, ...args], { cwd: sourceDir, env, stdio: ["pipe", "pipe", "pipe"] }); this.owned = child;
    const log = createWriteStream(eventsPath, { mode: 0o600 }); this.prompt = prompt;
    child.stdout!.on("data", bytes => { log.write(bytes); this.buffer += String(bytes); this.drainLines(); });
    child.stderr!.on("data", bytes => log.write(bytes)); child.stdin!.on("error", () => {});
    if (this.executor === "claude") {
      child.stdin!.write(JSON.stringify({ type: "control_request", request_id: CLAUDE_INIT_ID, request: { subtype: "initialize" } }) + "\n");
      this.bindingTimer = setTimeout(() => { if (!this.claudeBound) this.stop("Claude session binding timed out", "wait-subscription-authentication"); }, CLAUDE_BINDING_MS);
    } else child.stdin!.end(prompt);
    const meter = setInterval(() => this.meter(), 30_000);
    const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => { clearInterval(meter); clearTimeout(this.bindingTimer); });
    await new Promise<void>(resolve => log.end(resolve)); await this.writes;
    if (this.executor === "claude" && !this.stopped && !(this.claudeBound && this.claudeAttested)) { this.stopped = "Claude run did not attest its bound session"; this.stoppedAction = "wait-subscription-authentication"; }
    return code;
  }
  private stop(reason: string, action: string): void { if (this.stopped) return; this.stopped = reason; this.stoppedAction = action; this.owned!.kill("SIGTERM"); }
  private drainLines(): void {
    while (this.buffer.includes("\n")) {
      const end = this.buffer.indexOf("\n"), line = this.buffer.slice(0, end); this.buffer = this.buffer.slice(end + 1);
      try { this.onEvent(JSON.parse(line)); } catch { /* raw tool output remains private diagnostic data */ }
    }
  }
  private onEvent(event: Record<string, unknown> & { thread_id?: string; session_id?: string; structured_output?: AgentResult; usage?: unknown }): void {
    if (this.executor === "claude" && isRecord(event)) this.claudeEvent(event);
    const foundSession = event.thread_id ?? event.session_id;
    if (foundSession && !this.session) this.checkpointSession(foundSession);
    if (event.type === "result" && event.structured_output && (this.executor !== "claude" || this.claudeBound && this.claudeAttested)) this.structured = event.structured_output;
    if (event.type === "turn.completed" && event.usage || event.type === "result" && event.usage) this.usage.push(event.usage);
  }
  private checkpointSession(session: string): void {
    this.session = session;
    this.writes = this.writes.then(() => this.store.transact(`session-${this.invocationId}`, "agent-session-checkpoint", new Date().toISOString(), state => { const current = state.agents[this.work.id]!; invariant(current.lease?.owner === this.invocationId && current.lease.fence === this.fence, "Agent session checkpoint lost its ownership fence"); current.invocations.find(item => item.id === this.invocationId)!.session = session; return { session }; })).catch(error => { this.stopped = `Session checkpoint failed: ${String(error)}`; this.owned!.kill("SIGTERM"); });
  }
  private claudeEvent(event: Record<string, unknown>): void {
    if (event.type === "control_response" && isRecord(event.response) && event.response.request_id === CLAUDE_INIT_ID) this.onClaudeBinding(event.response);
    else if (event.type === "system" && event.subtype === "init") {
      if (!this.claudeBound || event.apiKeySource !== "none") this.stop("Claude run is not using the bound subscription sign-in", "wait-subscription-authentication");
      else this.claudeAttested = true;
    } else if (event.type === "rate_limit_event" && isRecord(event.rate_limit_info) && paidUsageOffered(event.rate_limit_info))
      this.stop("Paid extra usage became available; repair stopped before relying on it", "wait-subscription-telemetry");
  }
  private onClaudeBinding(response: Record<string, unknown>): void {
    clearTimeout(this.bindingTimer);
    const problem = response.subtype === "success" ? claudeSessionProblem(response.response, this.config.agents!.claude!.account) : "Claude session binding was refused";
    if (problem) { this.stop(problem, "wait-subscription-authentication"); return; }
    if (!this.claudeBound && !this.stopped) { this.claudeBound = true; this.owned!.stdin!.end(JSON.stringify({ type: "user", message: { role: "user", content: this.prompt }, parent_tool_use_id: null }) + "\n"); }
  }
  /** Every 30 s: stop on delivery, pause, unreadable telemetry or the stop threshold; otherwise record usage. */
  private meter(): void {
    if (this.monitoring) return; this.monitoring = true;
    void (async () => {
      const at = new Date().toISOString(), stage = { checking: "state" as "state" | "telemetry" | "capacity" };
      try { await this.meterOnce(at, stage); }
      catch (error) {
        this.stopped = stage.checking === "telemetry" && !(error instanceof QuotaReadError) ? "Subscription telemetry acquisition failed; unavailable, stale or invalid" : error instanceof Error ? error.message : String(error);
        this.stoppedAction = stage.checking === "capacity" ? "wait-measured-subscription-capacity" : stage.checking === "telemetry" ? "wait-subscription-telemetry" : "recheck-repair-state";
        this.owned!.kill("SIGTERM");
      } finally { this.monitoring = false; }
    })();
  }
  private async meterOnce(at: string, stage: { checking: "state" | "telemetry" | "capacity" }): Promise<void> {
    const latest = (await this.store.read()).state;
    if (latest.intents[this.work.intentId]!.state === "delivered") throw new Error("Delivery receipt committed; stop obsolete repair invocation");
    if (paused(latest, this.work.intentId)) throw new Error("Repair is explicitly paused");
    stage.checking = "telemetry";
    const value = await this.quota.read(at), used = quotaUsed(value, at);
    if (used === undefined) throw new Error("Subscription telemetry is unavailable");
    stage.checking = "capacity";
    if (used >= this.config.budget.subscriptionStopAtPercent) throw new Error("Subscription stop threshold reached");
    stage.checking = "state";
    await this.store.transact(`usage-${this.invocationId}-${Math.floor(Date.parse(at) / 30_000)}`, "subscription-usage", at, state => { state.budget.telemetry[this.executor] = value; return value; });
  }
  async result(code: number | null, paths: { result: string; events: string }): Promise<AgentResult> {
    let result: AgentResult = this.structured ?? { outcome: "checkpoint", summary: this.stopped ?? `Agent exited ${code}; checkpoint retained`, evidence: [paths.events], missingCapability: "" };
    if (this.executor === "local") { try { result = JSON.parse(await readFile(paths.result, "utf8")); } catch { /* interrupted task retains its durable work */ } }
    invariant(["repaired", "checkpoint", "blocked"].includes(result.outcome) && typeof result.summary === "string" && Array.isArray(result.evidence), "Agent returned invalid completion schema");
    return result;
  }
  async complete(result: AgentResult, blockerBinding: Parameters<typeof assessBlockedResult>[1], outcome: { repairedSha?: string; sources?: SourceRevision[]; verificationError?: string; directory: string }) {
    const endedAt = new Date().toISOString(), { repairedSha, sources, directory } = outcome;
    return this.store.transact(`worker-ended-${this.invocationId}`, "agent-checkpoint", endedAt, state => {
      const current = state.agents[this.work.id]!; invariant(current.lease?.owner === this.invocationId && current.lease.fence === this.fence, "Agent completion lost its ownership fence");
      const assessed = assessBlockedResult(result, blockerBinding, endedAt, hash(repairContext(state, current))), effective = assessed.result;
      const invocation = current.invocations.find(item => item.id === this.invocationId)!; invocation.endedAt = endedAt; invocation.result = effective; invocation.session = this.session; invocation.usage = this.usage; current.lease = undefined;
      if (state.intents[current.intentId]!.state === "delivered") current.state = "complete";
      else if (repairedSha && sources) { state.sources = sources.map(source => state.sources.find(known => known.sha === source.sha) ?? source); state.lastMain = sources.at(-1)?.sha; adoptRepair(state, this.config, current.intentId, sourceAt(state, repairedSha), result.pullRequest!, endedAt); current.state = "complete"; }
      else if (effective.outcome === "repaired" && !effective.pullRequest) { completeOperationalRepair(state, current.intentId, effective.evidence, endedAt); current.state = "complete"; }
      else if (effective.outcome === "blocked" && current.strategy < 2) { current.state = "complete"; repairWork(state, current.intentId, [...current.evidence, effective.summary, effective.missingCapability ?? "unknown capability"], endedAt); }
      else this.continueLater(state, current, assessed, endedAt, outcome.verificationError);
      return { workId: current.id, invocationId: this.invocationId, outcome: effective.outcome, repairedSha, checkpoint: directory, ...(assessed.claim ? { blockerClaim: assessed.claim } : {}) };
    });
  }
  private continueLater(state: CdState, current: AgentWork, assessed: ReturnType<typeof assessBlockedResult>, endedAt: string, verificationError: string | undefined): void {
    const effective = assessed.result, stopped = this.stopped;
    current.state = effective.outcome === "blocked" || stopped ? "waiting" : "pending"; current.nextCheckAt = assessed.continueImmediately ? endedAt : after(endedAt, this.config.deadlines.pollMinutes);
    const intent = state.intents[current.intentId]!; intent.blocker = stopped ?? (effective.missingCapability || verificationError);
    intent.nextAction = stopped ? this.stoppedAction ?? "recheck-repair-state" : assessed.claim?.status === "rejected" ? "continue-blocker-diagnosis" : effective.outcome === "blocked" ? "verify-blocker-candidate-with-cto" : "resume-repair-checkpoint";
  }
  async fail(error: unknown): Promise<unknown> {
    const at = new Date().toISOString(), reason = error instanceof Error ? error.message : String(error), owned = this.owned, stillOwned = owned && owned.exitCode === null && owned.signalCode === null;
    if (stillOwned) owned!.kill("SIGTERM");
    await this.store.transact(`worker-error-${this.invocationId}`, "agent-error-checkpoint", at, state => { const current = state.agents[this.work.id]!; invariant(current.lease?.owner === this.invocationId && current.lease.fence === this.fence, "Agent error checkpoint lost its ownership fence"); const invocation = current.invocations.find(item => item.id === this.invocationId)!; invocation.result = { outcome: "checkpoint", summary: reason, evidence: [] }; if (!stillOwned) { invocation.endedAt = at; current.lease = undefined; } current.state = "waiting"; current.nextCheckAt = after(at, this.config.deadlines.pollMinutes); return { reason, ownedProcessStopping: Boolean(stillOwned) }; });
    return { workId: this.work.id, invocationId: this.invocationId, outcome: "checkpoint", reason };
  }
}
function paidUsageOffered(info: Record<string, unknown>): boolean {
  return info.isUsingOverage === true || info.overageInUse === true || info.overageStatus === "allowed" || info.overageStatus === "allowed_warning";
}
