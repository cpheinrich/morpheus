import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLocalReview, REVIEW_FLOOR_RULE } from "../review/local.js";
import { configurationDigest, hash } from "./schema.js";
import { after, adoptRepair, completeOperationalRepair, invariant, quotaUsed, repairWork, sourceAt } from "./state.js";
import { ActionsAdapter } from "./actions.js";
import { git, loadSources } from "./source.js";
import { nativeQuota, QuotaReadError } from "./quota-reader.js";
import { claudeEnvironment, claudeQuota, claudeSessionProblem, CLAUDE_ISOLATION_ARGS, verifyClaudeLogin } from "./claude-quota.js";
import { awaitingSubscriptionAdmission } from "./admission-wait.js";
import { verifyRepairChecks } from "./repair-checks.js";
import { assessBlockedResult, blockerProofInstructions } from "./blocker-proof.js";
const exec = promisify(execFile);
function quotaInvariant(condition, message) { if (!condition)
    throw new QuotaReadError(message); }
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
function paused(state, intentId) { return state.pauses.some(pause => ["all", intentId, state.intents[intentId].channel].includes(pause.scope)); }
const CAPABILITY_RECHECK_MINUTES = 6 * 60;
/** Built-in tools that could outlive or escape a bounded repair invocation. */
export const CLAUDE_DISALLOWED_TOOLS = Object.freeze(["RemoteTrigger", "CronCreate", "ScheduleWakeup", "PushNotification"]);
const CLAUDE_INIT_ID = "morpheus-cd-run-init", CLAUDE_BINDING_MS = 60_000;
function repairContext(state, work) {
    const intent = state.intents[work.intentId], attempt = intent?.attempts.at(-1);
    return { version: 1, workId: work.id, taskDigest: work.taskDigest, evidence: [...work.evidence],
        delivery: { source: intent?.source, attempt: attempt ? { id: attempt.id, sourceSha: attempt.sourceSha,
                controlSha: attempt.controlSha, runId: attempt.runId, runAttempt: attempt.runAttempt, status: attempt.status,
                workflowTerminalAt: attempt.workflowTerminalAt,
                quiescence: attempt.quiescence ? { kind: attempt.quiescence.kind, ref: attempt.quiescence.ref, observedAt: attempt.quiescence.observedAt } : null } : null } };
}
function capabilityRetry(state, work, now) {
    // A dispatch-only hosted placeholder has not consumed its prompt yet and
    // cannot erase the preceding actual blocked invocation's capability wait.
    const last = work.invocations.findLast(invocation => invocation.endedAt || invocation.executor !== "hosted" || !invocation.dispatchState || state.transitions[`worker-start-${invocation.id}`]), at = Date.parse(now);
    if (state.intents[work.intentId]?.postResumeKey || !Number.isSafeInteger(work.strategy) || work.strategy < 2 || typeof last?.endedAt !== "string" || last.result?.outcome !== "blocked" || typeof last.result.missingCapability !== "string" || !last.result.missingCapability.trim())
        return;
    const result = state.transitions[`worker-start-${last.id}`]?.result;
    const context = result?.capabilityContext;
    const endedAt = Date.parse(last.endedAt);
    // Old/malformed receipts cannot justify suppressing a normal admission. One
    // invocation can establish a baseline; changed task bytes must reach refusal.
    if (hash(work.task) !== work.taskDigest || !Number.isFinite(at) || !Number.isFinite(endedAt) || endedAt > at ||
        !result || typeof result !== "object" || Array.isArray(result) || result.invocationId !== last.id ||
        typeof result.fence !== "number" || !Number.isSafeInteger(result.fence) || result.fence <= 0 || result.fence !== state.fences[work.id] ||
        typeof result.claimedAt !== "string" || typeof result.deadlineAt !== "string" ||
        !context || typeof context !== "object" || Array.isArray(context) || Object.keys(context).sort().join(",") !== "digest,taskDigest,version,workId" ||
        context.version !== 1 || context.workId !== work.id || context.taskDigest !== work.taskDigest ||
        typeof context.digest !== "string" || !/^[a-f0-9]{64}$/.test(context.digest) || context.digest !== hash(repairContext(state, work)))
        return { ready: true };
    const completion = state.transitions[`worker-ended-${last.id}`]?.result;
    const candidate = completion?.blockerClaim;
    // A historical blocked string or self-attested clearance is not a validated
    // candidate. Recheck the exact saved proof rather than trusting its label.
    if (!completion || typeof completion !== "object" || Array.isArray(completion) || completion.workId !== work.id || completion.invocationId !== last.id || completion.outcome !== "blocked" ||
        !candidate || typeof candidate !== "object" || Array.isArray(candidate) || candidate.status !== "cto-verification-required")
        return { ready: true };
    const checked = assessBlockedResult(last.result, { workId: work.id, invocationId: last.id, fence: result.fence,
        taskDigest: work.taskDigest, contextDigest: context.digest, claimedAt: result.claimedAt, deadlineAt: result.deadlineAt }, last.endedAt, context.digest);
    if (checked.claim?.status !== "cto-verification-required" || checked.claim.proofDigest !== candidate.proofDigest)
        return { ready: true };
    const nextCheckAt = after(last.endedAt, CAPABILITY_RECHECK_MINUTES);
    return { ready: at >= Date.parse(nextCheckAt), nextCheckAt };
}
function selectDefaultRepair(state, now, admissionWaitsDue = false) {
    const at = Date.parse(now), lastStart = (work) => Date.parse(work.invocations.at(-1)?.startedAt ?? work.createdAt);
    // Only the Claude executor treats a latest-event subscription admission wait as due; its own admission reads fresh.
    const admissionWait = (work) => admissionWaitsDue && awaitingSubscriptionAdmission(state, work);
    const due = Object.values(state.agents).filter(work => work.state !== "complete" && (!work.lease || Date.parse(work.lease.expiresAt) <= at))
        .map(work => ({ work, retry: capabilityRetry(state, work, now) })).filter(({ work, retry }) => retry || Date.parse(work.nextCheckAt) <= at || admissionWait(work));
    // Sort a derived array, never the ledger. Retry scheduling/checkpoint counts
    // cannot renew priority; ties use code-unit IDs consistently across hosts.
    due.sort(({ work: left }, { work: right }) => lastStart(left) - lastStart(right) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0));
    return (due.find(({ work, retry }) => retry?.ready !== false && !state.intents[work.intentId]?.postResumeKey && !paused(state, work.intentId)) ?? due[0])?.work;
}
export const agentResultSchema = { type: "object", additionalProperties: false, properties: { outcome: { type: "string", enum: ["repaired", "checkpoint", "blocked"] }, summary: { type: "string" }, pullRequest: { type: "string" }, sourceSha: { type: "string" }, reviewHead: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, missingCapability: { type: "string" } }, required: ["outcome", "summary", "pullRequest", "sourceSha", "reviewHead", "evidence", "missingCapability"] };
function claudeModelWindows(model) {
    const family = model.toLowerCase().match(/^(?:claude-)?(opus|fable|sonnet|haiku)(?:$|[-\[])/)?.[1];
    quotaInvariant(family, "Configured Claude model has no known quota family; retain budget wait");
    return ["five_hour", "seven_day", `seven_day_${family}`];
}
export function normalizeClaudeQuota(value, now, model) {
    const raw = value;
    const ids = model ? claudeModelWindows(model) : Object.keys(raw ?? {}).filter(id => /^(five_hour|seven_day)(_[a-z0-9_]+)?$/.test(id));
    if (model)
        quotaInvariant(ids.every(id => raw?.[id]), "Claude model usage response omitted a required runtime window; retain budget wait");
    const windows = ids.flatMap(id => raw?.[id] ? [{ id, usedPercent: raw[id].utilization, resetsAt: raw[id].resets_at }] : []);
    const snapshot = { observedAt: now, source: "Claude OAuth account usage readback", windows, ...(model ? { model } : {}) };
    quotaInvariant(quotaUsed(snapshot, now) !== undefined, "Claude usage response has no valid nonexpired runtime windows");
    return snapshot;
}
/** No model request: read the same actual account limits exposed by the runtime. */
export async function codexQuota(command, cwd, now) {
    return nativeQuota(command, cwd, now);
}
export class QuotaReader {
    config;
    executor;
    sourceDir;
    environment;
    fetcher;
    cached;
    retryAt = 0;
    constructor(config, executor, sourceDir, environment = process.env, fetcher = fetch) {
        this.config = config;
        this.executor = executor;
        this.sourceDir = sourceDir;
        this.environment = environment;
        this.fetcher = fetcher;
    }
    async read(now = new Date().toISOString()) {
        if (this.executor === "claude") {
            const claude = this.config.agents?.claude;
            quotaInvariant(claude, "Agent executor is not configured");
            // Never a file: Claude telemetry comes only from the bound CLI's own reading.
            quotaInvariant(this.environment.MORPHEUS_CD_QUOTA_FILE === undefined, "Claude subscription telemetry cannot be supplied by file; retain budget wait");
            return claudeQuota(claude.command, claude.account, claude.model, this.environment, now);
        }
        const agent = this.config.agents?.[this.executor];
        quotaInvariant(agent, "Agent executor is not configured");
        const path = this.environment.MORPHEUS_CD_QUOTA_FILE ?? agent.quotaFile;
        if (path) {
            const value = JSON.parse(await readFile(path, "utf8"));
            quotaInvariant(this.executor !== "hosted" || !agent.model || value.model === agent.model, "Subscription telemetry file does not attest the configured Claude model");
            if (this.executor === "hosted" && agent.model) {
                const ids = claudeModelWindows(agent.model);
                quotaInvariant(ids.every(id => value.windows?.some(window => window.id === id)), "Subscription telemetry file omitted a required Claude runtime window");
                value.windows = value.windows.filter(window => ids.includes(window.id));
            }
            quotaInvariant(quotaUsed(value, now) !== undefined, "Subscription telemetry file is stale, missing or invalid");
            return value;
        }
        if (this.executor === "local")
            return codexQuota(agent.command, this.sourceDir, now);
        if (this.cached && this.cached.model === agent.model && quotaUsed(this.cached, now) !== undefined)
            return this.cached;
        quotaInvariant(Date.parse(now) >= this.retryAt, "Claude usage endpoint backoff; retain budget wait");
        const token = this.environment.CLAUDE_CODE_OAUTH_TOKEN;
        quotaInvariant(token, "Hosted subscription usage requires actual runtime telemetry or authorized OAuth usage readback");
        this.retryAt = Date.parse(now) + 5 * 60_000;
        const response = await this.fetcher("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
        if (!response.ok) {
            let failure;
            try {
                failure = await response.json();
            }
            catch { /* HTTP status remains useful without JSON. */ }
            const error = failure?.error;
            const category = typeof error?.type === "string" && ["permission_error", "authentication_error", "invalid_request_error", "rate_limit_error"].includes(error.type) ? error.type : undefined;
            const scope = typeof error?.message === "string" && /scope requirement [`'"]?user:profile\b/.test(error.message) ? "required OAuth scope user:profile" : undefined;
            // Provider messages can echo credentials. Emit only fixed recognized diagnostics.
            quotaInvariant(false, `Claude usage readback HTTP ${response.status}${category ? `; ${category}` : ""}${scope ? `; ${scope}` : ""}; retain budget wait`);
        }
        this.cached = normalizeClaudeQuota(await response.json(), now, agent.model);
        return this.cached;
    }
}
export async function scheduleHosted(config, store, now) {
    const hosted = config.agents?.hosted;
    if (!hosted)
        return;
    const snapshot = await store.read(), actions = new ActionsAdapter(store.api, config);
    for (const work of Object.values(snapshot.state.agents)) {
        if (snapshot.state.intents[work.intentId]?.postResumeKey || work.state === "complete" || paused(snapshot.state, work.intentId))
            continue;
        const retry = capabilityRetry(snapshot.state, work, now);
        if (retry ? !retry.ready : Date.parse(work.nextCheckAt) > Date.parse(now))
            continue;
        invariant(hash(work.task) === work.taskDigest, "Durable task was altered");
        const running = work.invocations.at(-1);
        if (running && !running.endedAt && work.lease && Date.parse(work.lease.expiresAt) > Date.parse(now))
            continue;
        if (!running && Date.parse(now) - Date.parse(work.createdAt) < config.deadlines.admissionMinutes * 60_000)
            continue;
        const invocationId = running?.executor === "hosted" && !running.endedAt ? running.id : `agent-${work.id}-i${work.invocations.length + 1}`;
        const matching = await actions.runs(invocationId, hosted.workflow);
        if (matching.length) {
            await store.transact(`hosted-observe-${invocationId}-${hash(matching.map(run => ({ id: run.id, status: run.status }))).slice(0, 12)}`, "observe-hosted-agent", now, state => {
                const current = state.agents[work.id], invocation = current.invocations.find(item => item.id === invocationId);
                if (invocation)
                    invocation.runIds = matching.map(run => String(run.id));
                if (matching.every(run => run.status === "completed") && current.state !== "complete") {
                    current.state = "pending";
                    if (current.lease?.owner === invocationId)
                        current.lease = undefined;
                    if (invocation)
                        invocation.endedAt ??= now;
                    current.nextCheckAt = after(now, config.deadlines.pollMinutes);
                }
                return { invocationId, runs: matching.map(run => run.id) };
            });
            continue;
        }
        const existing = work.invocations.find(item => item.id === invocationId);
        if (existing && Date.parse(now) - Date.parse(existing.lastDispatchAt ?? existing.startedAt) < config.deadlines.wakeMinutes * 60_000)
            continue;
        const ordinal = (existing?.dispatchCount ?? 0) + 1;
        const claim = await store.transact(`hosted-dispatch-${invocationId}-${ordinal}`, "claim-hosted-agent-dispatch", now, state => {
            const current = state.agents[work.id];
            invariant(current.state !== "complete", "Repair task already completed");
            invariant(current.taskDigest === work.taskDigest && hash(current.task) === current.taskDigest, "Durable task was altered during hosted dispatch");
            invariant(!state.intents[current.intentId]?.postResumeKey, "Post-resume acceptance cannot launch a repair model");
            invariant(!paused(state, current.intentId), "Repair is explicitly paused");
            invariant(capabilityRetry(state, current, now)?.ready !== false, "Repair capability context is unchanged");
            invariant(!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(now), "Repair agent lease is still live");
            if (!current.invocations.some(item => item.id === invocationId))
                current.invocations.push({ id: invocationId, executor: "hosted", startedAt: now, dispatchState: "uncertain", runIds: [] });
            const invocation = current.invocations.find(item => item.id === invocationId);
            invariant((invocation.dispatchCount ?? 0) + 1 === ordinal, "Hosted dispatch changed during reconciliation; reload");
            invocation.dispatchCount = ordinal;
            invocation.lastDispatchAt = now;
            current.state = "waiting";
            current.nextCheckAt = after(now, config.deadlines.pollMinutes);
            return { workId: work.id, invocationId };
        });
        if (!claim.replayed)
            await store.api.request("POST", `repos/${config.repository}/actions/workflows/${hosted.workflow}/dispatches`, { ref: hosted.ref, inputs: { "work-id": work.id, "invocation-id": invocationId, "intent-id": work.intentId, strategy: String(work.strategy), "task-digest": work.taskDigest } });
    }
}
export async function verifyRepair(config, store, sourceDir, result) {
    const match = result.pullRequest?.match(new RegExp(`^https://github\\.com/${config.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/([0-9]+)$`));
    invariant(match && result.reviewHead, "Repair needs exact reviewed PR provenance");
    const pull = await store.api.request("GET", `repos/${config.repository}/pulls/${match[1]}`);
    invariant(pull.merged && pull.head.sha === result.reviewHead && pull.base.ref === config.mainBranch, "Repair PR is not merged with its exact reviewed head");
    const checks = await verifyRepairChecks(store.api, config.repository, pull.head, pull.base.repo);
    git(sourceDir, ["fetch", "origin", pull.head.sha, pull.merge_commit_sha]);
    const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-review-"));
    try {
        git(sourceDir, ["worktree", "add", "--detach", directory, pull.head.sha]);
        // A review-floor waiver reports a validated record; every other finding, an opt-out included, refuses.
        const findings = checkLocalReview({ root: directory, body: pull.body, labels: pull.labels.map(label => label.name), head: pull.head.sha, base: pull.base.sha })
            .filter(finding => !(finding.level === "waived" && finding.rule === REVIEW_FLOOR_RULE));
        invariant(findings.length === 0, `Repair lacks valid independent review: ${findings.map(finding => finding.message).join("; ")}`);
    }
    finally {
        try {
            git(sourceDir, ["worktree", "remove", directory]);
        }
        finally {
            await rm(directory, { recursive: true, force: true });
        }
    }
    invariant(!result.sourceSha || result.sourceSha === pull.merge_commit_sha, "Agent source differs from actual merged repair");
    if (checks.superseded.length)
        result.evidence.push(`Morpheus verified cancellation supersession: ${JSON.stringify(checks)}`);
    return pull.merge_commit_sha;
}
export async function runWorker(config, store, sourceDir, options, environment = process.env) {
    invariant(config.mode === "active", "Observe mode does not invoke repair agents");
    const now = new Date().toISOString(), agent = config.agents?.[options.executor];
    invariant(agent, "Agent executor not configured");
    invariant(options.executor !== "hosted" || options.hostId === undefined, "Host identity is only supported for local workers");
    const hostId = options.executor !== "hosted" ? options.hostId ?? hostname() : undefined;
    invariant(hostId === undefined || /^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,254}$/.test(hostId), "Local host identity must be a stable nonempty identifier");
    const snapshot = await store.read();
    // The opt-in is proven by the reviewed migration that recorded this exact configuration in the ledger.
    invariant(options.executor !== "claude" || snapshot.state.configurationDigest === configurationDigest(config), "Claude executor requires the migrated configuration recorded in the ledger");
    const work = options.workId ? snapshot.state.agents[options.workId] : selectDefaultRepair(snapshot.state, now, options.executor === "claude");
    if (!work || work.state === "complete")
        return { state: "idle" };
    if (snapshot.state.intents[work.intentId]?.postResumeKey)
        return { state: "observe-post-resume", workId: work.id };
    if (paused(snapshot.state, work.intentId))
        return { state: "paused", workId: work.id };
    invariant(!options.taskDigest || options.taskDigest === work.taskDigest, "Hosted task digest differs from immutable repair task");
    invariant(hash(work.task) === work.taskDigest, "Durable task was altered");
    const retry = capabilityRetry(snapshot.state, work, now);
    if (retry?.ready === false)
        return { state: "capability-wait", workId: work.id, nextCheckAt: retry.nextCheckAt };
    const promptWork = structuredClone(work), context = repairContext(snapshot.state, promptWork);
    const capabilityContext = { version: 1, workId: work.id, taskDigest: work.taskDigest, digest: hash(context) };
    const quota = new QuotaReader(config, options.executor, sourceDir, environment);
    const env = options.executor === "claude" ? claudeEnvironment(environment) : { ...environment };
    delete env.OPENAI_API_KEY;
    delete env.CODEX_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    const prefix = agent.command;
    let measured;
    let admissionFailure = "telemetry";
    try {
        measured = await quota.read(now);
        const used = quotaUsed(measured, now);
        invariant(used !== undefined, "Subscription telemetry is unavailable");
        admissionFailure = "capacity";
        invariant(used < config.budget.subscriptionAdmitBelowPercent, "Subscription admission threshold reached");
        admissionFailure = "authentication";
        const login = await exec(prefix[0], [...prefix.slice(1), ...(options.executor === "local" ? ["login", "status"] : options.executor === "claude" ? ["auth", "status", "--json"] : ["auth", "status"])], { cwd: sourceDir, env, timeout: 10_000 });
        if (options.executor === "local")
            invariant(/Logged in using ChatGPT/i.test(login.stdout + login.stderr), "Local worker must use the ChatGPT subscription");
        else if (options.executor === "claude")
            verifyClaudeLogin(login.stdout, config.agents.claude.account);
        else {
            const auth = JSON.parse(login.stdout);
            invariant(auth.loggedIn && auth.authMethod === "claude.ai" && auth.apiProvider === "firstParty", "Hosted worker must use its authorized Claude subscription");
        }
    }
    catch (error) {
        const reason = admissionFailure === "capacity" ? "Subscription admission threshold reached" : admissionFailure === "authentication" ? "Subscription authentication verification failed" : error instanceof QuotaReadError ? error.message : "Subscription telemetry acquisition failed; unavailable, stale or invalid";
        const nextAction = admissionFailure === "capacity" ? "wait-measured-subscription-capacity" : admissionFailure === "authentication" ? "wait-subscription-authentication" : "wait-subscription-telemetry";
        // Keep the guarded journal kind, but do not collapse a failed measurement
        // into measured exhaustion or replay another failure class in this bucket.
        // A Claude wait is scoped to its executor and never moves shared work out of another subscription's reach,
        // nor overwrites the status of a run another owner holds.
        const claudeWait = options.executor === "claude";
        await store.transact(`admission-wait-${claudeWait ? "claude-" : ""}${admissionFailure}-${work.id}-${Math.floor(Date.parse(now) / 300_000)}`, "agent-budget-wait", now, state => {
            const current = state.agents[work.id];
            if (claudeWait) {
                if (current.lease && Date.parse(current.lease.expiresAt) > Date.parse(now))
                    return { reason, failureKind: admissionFailure, executor: "claude", statusRetained: "live-lease" };
            }
            else {
                current.state = "waiting";
                current.nextCheckAt = after(now, 5);
            }
            const intent = state.intents[current.intentId];
            intent.blocker = reason;
            intent.nextAction = nextAction;
            return { reason, failureKind: admissionFailure, ...(claudeWait ? { executor: "claude" } : {}) };
        });
        return { state: "budget-wait", reason, failureKind: admissionFailure };
    }
    const invocationId = options.invocationId ?? `agent-${work.id}-i${work.invocations.length + 1}`, timeout = config.deadlines.agentMinutes * 60_000;
    const claim = await store.transact(`worker-start-${invocationId}`, "claim-agent-invocation", new Date().toISOString(), state => {
        // Admission and each CAS reload may be slow; only the accepted claim attempt
        // starts the lease clock. Its quota must still be valid at that same time.
        const claimedAt = new Date().toISOString(), used = quotaUsed(measured, claimedAt);
        invariant(used !== undefined && used < config.budget.subscriptionAdmitBelowPercent, "Subscription admission telemetry expired or threshold reached before claim");
        const current = state.agents[work.id];
        invariant(current.state !== "complete" && (!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(claimedAt)), "Agent work already owned");
        invariant(current.taskDigest === work.taskDigest && hash(current.task) === current.taskDigest, "Durable task was altered during admission");
        invariant(!state.intents[current.intentId]?.postResumeKey, "Post-resume acceptance cannot launch a repair model");
        invariant(!paused(state, current.intentId), "Repair is explicitly paused");
        invariant(capabilityRetry(state, current, claimedAt)?.ready !== false, "Repair capability context is unchanged");
        invariant(!Object.values(state.agents).some(other => other.id !== current.id && other.lease && Date.parse(other.lease.expiresAt) > Date.parse(claimedAt) && other.invocations.at(-1)?.executor === options.executor), "This subscription executor already has an in-flight reservation");
        const fence = (state.fences[current.id] ?? 0) + 1;
        state.fences[current.id] = fence;
        current.lease = { owner: invocationId, expiresAt: after(claimedAt, config.deadlines.agentMinutes + 2), fence };
        current.state = "running";
        if (!current.invocations.some(item => item.id === invocationId))
            current.invocations.push({ id: invocationId, executor: options.executor, ...(hostId ? { hostId } : {}), startedAt: claimedAt });
        // Keep the pre-admission prompt digest across every CAS reload. Evidence
        // arriving while quota/login runs must remain new after this invocation.
        state.budget.telemetry[options.executor] = measured;
        return { invocationId, fence, capabilityContext, claimedAt, deadlineAt: current.lease.expiresAt };
    });
    if (claim.replayed)
        return { state: "already-owned", invocationId };
    const blockerBinding = { workId: work.id, invocationId, fence: claim.result.fence, taskDigest: work.taskDigest,
        contextDigest: capabilityContext.digest, claimedAt: claim.result.claimedAt, deadlineAt: claim.result.deadlineAt };
    let owned;
    try {
        const proofInstructions = blockerProofInstructions(blockerBinding);
        const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-agent-"));
        const resultPath = join(directory, "result.json"), schemaPath = join(directory, "schema.json"), eventsPath = join(directory, "events.jsonl");
        await writeFile(schemaPath, JSON.stringify(agentResultSchema), { mode: 0o600 });
        const previousNative = work.invocations.findLast(item => item.executor === "local" || item.executor === "claude");
        // Native sessions belong to one executor/host/user/session store. Never search past a newer
        // foreign, other-executor or unidentified checkpoint to resume an older native context.
        const previousSession = options.executor !== "hosted"
            ? (previousNative && previousNative.executor === options.executor && previousNative.hostId === hostId ? previousNative.session : undefined)
            : work.invocations.findLast(item => item.executor === "hosted" && item.session)?.session;
        const claudeArgs = () => [...prefix.slice(1), "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions", ...CLAUDE_ISOLATION_ARGS, "--disallowedTools", CLAUDE_DISALLOWED_TOOLS.join(","), "--max-turns", "50", "--json-schema", JSON.stringify(agentResultSchema), ...(previousSession ? ["--resume", previousSession] : []), "--model", config.agents.claude.model];
        const args = options.executor === "claude" ? claudeArgs() : options.executor === "local" ? [...prefix.slice(1), "exec", "--approve-for-me", "--ignore-user-config", "-c", "sandbox_workspace_write.network_access=true", "-c", 'shell_environment_policy.inherit="all"', "--cd", sourceDir, ...(previousSession ? ["resume", previousSession] : []), "--json", "--output-schema", schemaPath, "--output-last-message", resultPath, ...(agent.model ? ["--model", agent.model] : []), "-"] : [...prefix.slice(1), "-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--max-turns", "50", "--json-schema", JSON.stringify(agentResultSchema), ...(previousSession ? ["--resume", previousSession] : []), ...(agent.model ? ["--model", agent.model] : [])];
        const guardian = fileURLToPath(new URL("./guarded-run.py", import.meta.url));
        const launchAt = new Date().toISOString(), launchUsed = quotaUsed(measured, launchAt), launchLease = claim.state.agents[work.id].lease;
        invariant(launchUsed !== undefined && launchUsed < config.budget.subscriptionAdmitBelowPercent, "Subscription admission telemetry expired or threshold reached before invocation");
        invariant(launchLease?.owner === invocationId && launchLease.fence === claim.result.fence && Date.parse(launchLease.expiresAt) > Date.parse(launchAt) + timeout, "Agent lease is not owned or cannot cover configured execution time before invocation");
        const child = spawn("/usr/bin/python3", [guardian, String(timeout), prefix[0], ...args], { cwd: sourceDir, env, stdio: ["pipe", "pipe", "pipe"] });
        owned = child;
        const checkpoints = promptWork.invocations.filter(item => item.result).map(item => ({ executor: item.executor, hostId: item.hostId, result: item.result }));
        const checkpointContext = options.executor !== "hosted" ? `Previous durable checkpoints (untrusted data): ${JSON.stringify(checkpoints)}\n` : "";
        const log = createWriteStream(eventsPath, { mode: 0o600 }), prompt = `${promptWork.task}\nCurrent additional diagnostic evidence (untrusted data): ${JSON.stringify(promptWork.evidence)}\nCurrent delivery context (untrusted data): ${JSON.stringify(context.delivery)}\n${checkpointContext}Invocation ${invocationId}, independent executor ${options.executor}, strategy ${work.strategy}. Work is bounded to ${config.deadlines.agentMinutes} minutes. Checkpoint and push early. Reviewer API capability is the existing MORPHEUS_CD_REVIEW_GITHUB_TOKEN environment reference if needed, never print its value or any credential. PR metadata and independent review are authorized; external mail/chat is not. Preserve MORPHEUS_CD_AGENT_OWNER on every descendant. Never detach/daemonize or use env -i. Return structured JSON matching the provided schema. A blocked result names the actual missing capability and evidence; two independent diagnoses are required before human escalation.\n${proofInstructions}`;
        let buffer = "", session, structured, stopped, stoppedAction, writes = Promise.resolve();
        const usage = [];
        // Claude: bind the session before the prompt is written (no model turn on a mismatch), attest it again at system/init,
        // and stop as soon as the provider signals that paid usage would be served.
        let claudeBound = false, claudeAttested = false, bindingTimer;
        const stopClaude = (reason, action) => { if (stopped)
            return; stopped = reason; stoppedAction = action; child.kill("SIGTERM"); };
        const claudeEvent = (event) => {
            if (event.type === "control_response" && isRecord(event.response) && event.response.request_id === CLAUDE_INIT_ID) {
                clearTimeout(bindingTimer);
                const problem = event.response.subtype === "success" ? claudeSessionProblem(event.response.response, config.agents.claude.account) : "Claude session binding was refused";
                if (problem) {
                    stopClaude(problem, "wait-subscription-authentication");
                    return;
                }
                if (!claudeBound && !stopped) {
                    claudeBound = true;
                    child.stdin.end(JSON.stringify({ type: "user", message: { role: "user", content: prompt }, parent_tool_use_id: null }) + "\n");
                }
            }
            else if (event.type === "system" && event.subtype === "init") {
                if (!claudeBound || event.apiKeySource !== "none")
                    stopClaude("Claude run is not using the bound subscription sign-in", "wait-subscription-authentication");
                else
                    claudeAttested = true;
            }
            else if (event.type === "rate_limit_event" && isRecord(event.rate_limit_info)) {
                const info = event.rate_limit_info;
                if (info.isUsingOverage === true || info.overageInUse === true || info.overageStatus === "allowed" || info.overageStatus === "allowed_warning")
                    stopClaude("Paid extra usage became available; repair stopped before relying on it", "wait-subscription-telemetry");
            }
        };
        child.stdout.on("data", bytes => {
            log.write(bytes);
            buffer += String(bytes);
            while (buffer.includes("\n")) {
                const end = buffer.indexOf("\n"), line = buffer.slice(0, end);
                buffer = buffer.slice(end + 1);
                try {
                    const event = JSON.parse(line);
                    if (options.executor === "claude" && isRecord(event))
                        claudeEvent(event);
                    const foundSession = event.thread_id ?? event.session_id;
                    if (foundSession && !session) {
                        session = foundSession;
                        writes = writes.then(() => store.transact(`session-${invocationId}`, "agent-session-checkpoint", new Date().toISOString(), state => { const current = state.agents[work.id]; invariant(current.lease?.owner === invocationId && current.lease.fence === claim.result.fence, "Agent session checkpoint lost its ownership fence"); current.invocations.find(item => item.id === invocationId).session = session; return { session }; })).catch(error => { stopped = `Session checkpoint failed: ${String(error)}`; child.kill("SIGTERM"); });
                    }
                    if (event.type === "result" && event.structured_output && (options.executor !== "claude" || claudeBound && claudeAttested))
                        structured = event.structured_output;
                    if (event.type === "turn.completed" && event.usage || event.type === "result" && event.usage)
                        usage.push(event.usage);
                }
                catch { /* raw tool output remains private diagnostic data */ }
            }
        });
        child.stderr.on("data", bytes => log.write(bytes));
        child.stdin.on("error", () => { });
        if (options.executor === "claude") {
            child.stdin.write(JSON.stringify({ type: "control_request", request_id: CLAUDE_INIT_ID, request: { subtype: "initialize" } }) + "\n");
            bindingTimer = setTimeout(() => { if (!claudeBound)
                stopClaude("Claude session binding timed out", "wait-subscription-authentication"); }, CLAUDE_BINDING_MS);
        }
        else
            child.stdin.end(prompt);
        let monitoring = false;
        const meter = setInterval(() => {
            if (monitoring)
                return;
            monitoring = true;
            void (async () => {
                const at = new Date().toISOString();
                let checking = "state";
                try {
                    const latest = (await store.read()).state;
                    if (latest.intents[work.intentId].state === "delivered")
                        throw new Error("Delivery receipt committed; stop obsolete repair invocation");
                    if (paused(latest, work.intentId))
                        throw new Error("Repair is explicitly paused");
                    checking = "telemetry";
                    const value = await quota.read(at), used = quotaUsed(value, at);
                    if (used === undefined)
                        throw new Error("Subscription telemetry is unavailable");
                    checking = "capacity";
                    if (used >= config.budget.subscriptionStopAtPercent)
                        throw new Error("Subscription stop threshold reached");
                    checking = "state";
                    await store.transact(`usage-${invocationId}-${Math.floor(Date.parse(at) / 30_000)}`, "subscription-usage", at, state => { state.budget.telemetry[options.executor] = value; return value; });
                }
                catch (error) {
                    stopped = checking === "telemetry" && !(error instanceof QuotaReadError) ? "Subscription telemetry acquisition failed; unavailable, stale or invalid" : error instanceof Error ? error.message : String(error);
                    stoppedAction = checking === "capacity" ? "wait-measured-subscription-capacity" : checking === "telemetry" ? "wait-subscription-telemetry" : "recheck-repair-state";
                    child.kill("SIGTERM");
                }
                finally {
                    monitoring = false;
                }
            })();
        }, 30_000);
        const code = await new Promise((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => { clearInterval(meter); clearTimeout(bindingTimer); });
        await new Promise(resolve => log.end(resolve));
        await writes;
        if (options.executor === "claude" && !stopped && !(claudeBound && claudeAttested)) {
            stopped = "Claude run did not attest its bound session";
            stoppedAction = "wait-subscription-authentication";
        }
        let result = structured ?? { outcome: "checkpoint", summary: stopped ?? `Agent exited ${code}; checkpoint retained`, evidence: [eventsPath], missingCapability: "" };
        if (options.executor === "local") {
            try {
                result = JSON.parse(await readFile(resultPath, "utf8"));
            }
            catch { /* interrupted task retains its durable work */ }
        }
        invariant(["repaired", "checkpoint", "blocked"].includes(result.outcome) && typeof result.summary === "string" && Array.isArray(result.evidence), "Agent returned invalid completion schema");
        let repairedSha, verificationError;
        if (result.outcome === "repaired" && result.pullRequest) {
            try {
                repairedSha = await verifyRepair(config, store, sourceDir, result);
            }
            catch (error) {
                verificationError = error instanceof Error ? error.message : String(error);
                result = { ...result, outcome: "checkpoint", summary: `${result.summary}; deterministic verification pending: ${verificationError}` };
            }
        }
        const endedAt = new Date().toISOString(), sources = repairedSha ? await loadSources(sourceDir, config, store.api, endedAt) : undefined;
        const completion = await store.transact(`worker-ended-${invocationId}`, "agent-checkpoint", endedAt, state => {
            const current = state.agents[work.id];
            invariant(current.lease?.owner === invocationId && current.lease.fence === claim.result.fence, "Agent completion lost its ownership fence");
            const assessed = assessBlockedResult(result, blockerBinding, endedAt, hash(repairContext(state, current))), effective = assessed.result;
            const invocation = current.invocations.find(item => item.id === invocationId);
            invocation.endedAt = endedAt;
            invocation.result = effective;
            invocation.session = session;
            invocation.usage = usage;
            current.lease = undefined;
            if (state.intents[current.intentId].state === "delivered")
                current.state = "complete";
            else if (repairedSha && sources) {
                state.sources = sources.map(source => state.sources.find(known => known.sha === source.sha) ?? source);
                state.lastMain = sources.at(-1)?.sha;
                adoptRepair(state, config, current.intentId, sourceAt(state, repairedSha), result.pullRequest, endedAt);
                current.state = "complete";
            }
            else if (effective.outcome === "repaired" && !effective.pullRequest) {
                completeOperationalRepair(state, current.intentId, effective.evidence, endedAt);
                current.state = "complete";
            }
            else if (effective.outcome === "blocked" && current.strategy < 2) {
                current.state = "complete";
                repairWork(state, current.intentId, [...current.evidence, effective.summary, effective.missingCapability ?? "unknown capability"], endedAt);
            }
            else {
                current.state = effective.outcome === "blocked" || stopped ? "waiting" : "pending";
                current.nextCheckAt = assessed.continueImmediately ? endedAt : after(endedAt, config.deadlines.pollMinutes);
                const intent = state.intents[current.intentId];
                intent.blocker = stopped ?? effective.missingCapability ?? verificationError;
                intent.nextAction = stopped ? stoppedAction ?? "recheck-repair-state" : assessed.claim?.status === "rejected" ? "continue-blocker-diagnosis" : effective.outcome === "blocked" ? "verify-blocker-candidate-with-cto" : "resume-repair-checkpoint";
            }
            return { workId: current.id, invocationId, outcome: effective.outcome, repairedSha, checkpoint: directory, ...(assessed.claim ? { blockerClaim: assessed.claim } : {}) };
        });
        const receipt = completion.result.blockerClaim;
        return { workId: work.id, invocationId, outcome: completion.result.outcome, repairedSha, checkpoint: directory,
            ...(receipt ? { blockerClaim: { status: receipt.status, proofDigest: receipt.proofDigest, reason: receipt.reason } } : {}) };
    }
    catch (error) {
        const at = new Date().toISOString(), reason = error instanceof Error ? error.message : String(error), stillOwned = owned && owned.exitCode === null && owned.signalCode === null;
        if (stillOwned)
            owned.kill("SIGTERM");
        await store.transact(`worker-error-${invocationId}`, "agent-error-checkpoint", at, state => { const current = state.agents[work.id]; invariant(current.lease?.owner === invocationId && current.lease.fence === claim.result.fence, "Agent error checkpoint lost its ownership fence"); const invocation = current.invocations.find(item => item.id === invocationId); invocation.result = { outcome: "checkpoint", summary: reason, evidence: [] }; if (!stillOwned) {
            invocation.endedAt = at;
            current.lease = undefined;
        } current.state = "waiting"; current.nextCheckAt = after(at, config.deadlines.pollMinutes); return { reason, ownedProcessStopping: Boolean(stillOwned) }; });
        return { workId: work.id, invocationId, outcome: "checkpoint", reason };
    }
}
//# sourceMappingURL=worker.js.map