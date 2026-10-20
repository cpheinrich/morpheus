import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { createWriteStream } from "node:fs";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkLocalReview } from "../review/local.js";
import { type AgentResult, type CdConfig, type CdState, type QuotaSnapshot, hash } from "./schema.js";
import { after, adoptRepair, completeOperationalRepair, invariant, quotaUsed, repairWork, sourceAt } from "./state.js";
import { GitHubStore, pages } from "./store.js";
import { ActionsAdapter } from "./actions.js";
import { git, loadSources } from "./source.js";

const exec = promisify(execFile);
function paused(state: CdState, intentId: string): boolean { return state.pauses.some(pause => ["all", intentId, state.intents[intentId]!.channel].includes(pause.scope)); }
export const agentResultSchema = { type: "object", additionalProperties: false, properties: { outcome: { type: "string", enum: ["repaired", "checkpoint", "blocked"] }, summary: { type: "string" }, pullRequest: { type: "string" }, sourceSha: { type: "string" }, reviewHead: { type: "string" }, evidence: { type: "array", items: { type: "string" } }, missingCapability: { type: "string" } }, required: ["outcome", "summary", "pullRequest", "sourceSha", "reviewHead", "evidence", "missingCapability"] };
function claudeModelWindows(model: string): string[] {
  const family = model.toLowerCase().match(/^(?:claude-)?(opus|fable|sonnet|haiku)(?:$|[-\[])/)?.[1];
  invariant(family, "Configured Claude model has no known quota family; retain budget wait");
  return ["five_hour", "seven_day", `seven_day_${family}`];
}
export function normalizeClaudeQuota(value: unknown, now: string, model?: string): QuotaSnapshot {
  const raw = value as Record<string, { utilization?: number; resets_at?: string }>;
  const ids = model ? claudeModelWindows(model) : Object.keys(raw ?? {}).filter(id => /^(five_hour|seven_day)(_[a-z0-9_]+)?$/.test(id));
  if (model) invariant(ids.every(id => raw?.[id]), "Claude model usage response omitted a required runtime window; retain budget wait");
  const windows = ids.flatMap(id => raw?.[id] ? [{ id, usedPercent: raw[id]!.utilization as number, resetsAt: raw[id]!.resets_at as string }] : []);
  const snapshot = { observedAt: now, source: "Claude OAuth account usage readback", windows, ...(model ? { model } : {}) };
  invariant(quotaUsed(snapshot, now) !== undefined, "Claude usage response has no valid nonexpired runtime windows"); return snapshot;
}
/** No model request: read the same actual account limits exposed by the runtime. */
export async function codexQuota(command: string[], cwd: string, now: string): Promise<QuotaSnapshot> {
  return new Promise((resolve, reject) => {
    const child = spawn(command[0]!, [...command.slice(1), "app-server"], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let buffer = "", settled = false;
    const finish = (error?: Error, value?: QuotaSnapshot) => { if (settled) return; settled = true; clearTimeout(timer); child.kill("SIGTERM"); if (error) reject(error); else resolve(value!); };
    const timer = setTimeout(() => finish(new Error("Codex account quota read timed out")), 10_000);
    child.on("error", error => finish(error)); child.stdin.on("error", error => finish(error));
    child.stdout.on("data", bytes => {
      buffer += String(bytes);
      while (buffer.includes("\n")) {
        const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        let message: { id?: number; error?: { message: string }; result?: unknown }; try { message = JSON.parse(line); } catch { continue; }
        if (message.error) { finish(new Error(message.error.message)); return; }
        if (message.id === 1) { child.stdin.write(JSON.stringify({ method: "initialized", params: {} }) + "\n"); child.stdin.write(JSON.stringify({ id: 2, method: "account/rateLimits/read", params: {} }) + "\n"); }
        if (message.id === 2) {
          const value = message.result as { rateLimitsByLimitId?: { codex?: { primary?: Record<string, number>; secondary?: Record<string, number> } }; rateLimits?: { primary?: Record<string, number>; secondary?: Record<string, number> } };
          const bucket = value.rateLimitsByLimitId?.codex ?? value.rateLimits;
          const windows = (["primary", "secondary"] as const).flatMap(id => bucket?.[id] ? [{ id, usedPercent: bucket[id]!.usedPercent!, resetsAt: new Date(bucket[id]!.resetsAt! * 1000).toISOString() }] : []);
          const snapshot = { observedAt: now, source: "Codex account/rateLimits/read", windows };
          if (quotaUsed(snapshot, now) === undefined) finish(new Error("Codex returned unknown/expired quota telemetry")); else finish(undefined, snapshot);
        }
      }
    });
    child.on("close", () => { if (!settled) finish(new Error("Codex account quota reader exited without telemetry")); });
    child.stdin.write(JSON.stringify({ id: 1, method: "initialize", params: { clientInfo: { name: "morpheus-cd", version: "1" }, capabilities: { experimentalApi: true } } }) + "\n");
  });
}
export class QuotaReader {
  private cached?: QuotaSnapshot;
  private retryAt = 0;
  constructor(readonly config: CdConfig, readonly executor: "local" | "hosted", readonly sourceDir: string, readonly environment: NodeJS.ProcessEnv = process.env, readonly fetcher: typeof fetch = fetch) {}
  async read(now = new Date().toISOString()): Promise<QuotaSnapshot> {
    const agent = this.config.agents?.[this.executor]; invariant(agent, "Agent executor is not configured");
    const path = this.environment.MORPHEUS_CD_QUOTA_FILE ?? agent.quotaFile;
    if (path) {
      const value = JSON.parse(await readFile(path, "utf8")) as QuotaSnapshot;
      invariant(this.executor !== "hosted" || !agent.model || value.model === agent.model, "Subscription telemetry file does not attest the configured Claude model");
      if (this.executor === "hosted" && agent.model) invariant(claudeModelWindows(agent.model).every(id => value.windows?.some(window => window.id === id)), "Subscription telemetry file omitted a required Claude runtime window");
      invariant(quotaUsed(value, now) !== undefined, "Subscription telemetry file is stale, missing or invalid"); return value;
    }
    if (this.executor === "local") return codexQuota(agent.command, this.sourceDir, now);
    if (this.cached && this.cached.model === agent.model && quotaUsed(this.cached, now) !== undefined) return this.cached;
    invariant(Date.parse(now) >= this.retryAt, "Claude usage endpoint backoff; retain budget wait");
    const token = this.environment.CLAUDE_CODE_OAUTH_TOKEN; invariant(token, "Hosted subscription usage requires actual runtime telemetry or authorized OAuth usage readback");
    this.retryAt = Date.parse(now) + 5 * 60_000;
    const response = await this.fetcher("https://api.anthropic.com/api/oauth/usage", { headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" }, signal: AbortSignal.timeout(15_000), redirect: "error" });
    invariant(response.ok, `Claude usage readback HTTP ${response.status}; retain budget wait`);
    this.cached = normalizeClaudeQuota(await response.json(), now, agent.model); return this.cached;
  }
}
export async function scheduleHosted(config: CdConfig, store: GitHubStore, now: string): Promise<void> {
  if (!config.agents) return;
  const snapshot = await store.read(), actions = new ActionsAdapter(store.api, config);
  for (const work of Object.values(snapshot.state.agents)) {
    if (work.state === "complete" || paused(snapshot.state, work.intentId) || Date.parse(work.nextCheckAt) > Date.parse(now)) continue;
    const running = work.invocations.at(-1);
    if (running && !running.endedAt && work.lease && Date.parse(work.lease.expiresAt) > Date.parse(now)) continue;
    if (!running && Date.parse(now) - Date.parse(work.createdAt) < config.deadlines.admissionMinutes * 60_000) continue;
    const invocationId = running?.executor === "hosted" && !running.endedAt ? running.id : `agent-${work.id}-i${work.invocations.length + 1}`;
    const matching = await actions.runs(invocationId, config.agents.hosted.workflow);
    if (matching.length) {
      await store.transact(`hosted-observe-${invocationId}-${hash(matching.map(run => ({ id: run.id, status: run.status }))).slice(0, 12)}`, "observe-hosted-agent", now, state => {
        const current = state.agents[work.id]!, invocation = current.invocations.find(item => item.id === invocationId);
        if (invocation) invocation.runIds = matching.map(run => String(run.id));
        if (matching.every(run => run.status === "completed") && current.state !== "complete") { current.state = "pending"; if (current.lease?.owner === invocationId) current.lease = undefined; if (invocation) invocation.endedAt ??= now; current.nextCheckAt = after(now, config.deadlines.pollMinutes); }
        return { invocationId, runs: matching.map(run => run.id) };
      }); continue;
    }
    const existing = work.invocations.find(item => item.id === invocationId);
    if (existing && Date.parse(now) - Date.parse(existing.lastDispatchAt ?? existing.startedAt) < config.deadlines.wakeMinutes * 60_000) continue;
    const ordinal = (existing?.dispatchCount ?? 0) + 1;
    const claim = await store.transact(`hosted-dispatch-${invocationId}-${ordinal}`, "claim-hosted-agent-dispatch", now, state => {
      const current = state.agents[work.id]!;
      invariant(current.state !== "complete", "Repair task already completed");
      invariant(!paused(state, current.intentId), "Repair is explicitly paused");
      invariant(!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(now), "Repair agent lease is still live");
      if (!current.invocations.some(item => item.id === invocationId)) current.invocations.push({ id: invocationId, executor: "hosted", startedAt: now, dispatchState: "uncertain", runIds: [] });
      const invocation = current.invocations.find(item => item.id === invocationId)!;
      invariant((invocation.dispatchCount ?? 0) + 1 === ordinal, "Hosted dispatch changed during reconciliation; reload");
      invocation.dispatchCount = ordinal; invocation.lastDispatchAt = now;
      current.state = "waiting"; current.nextCheckAt = after(now, config.deadlines.pollMinutes); return { workId: work.id, invocationId };
    });
    if (!claim.replayed) await store.api.request("POST", `repos/${config.repository}/actions/workflows/${config.agents.hosted.workflow}/dispatches`, { ref: config.agents.hosted.ref, inputs: { "work-id": work.id, "invocation-id": invocationId, "intent-id": work.intentId, strategy: String(work.strategy), "task-digest": work.taskDigest } });
  }
}
export async function verifyRepair(config: CdConfig, store: GitHubStore, sourceDir: string, result: AgentResult): Promise<string> {
  const match = result.pullRequest?.match(new RegExp(`^https://github\\.com/${config.repository.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/pull/([0-9]+)$`));
  invariant(match && result.reviewHead, "Repair needs exact reviewed PR provenance");
  const pull = await store.api.request<{ merged: boolean; merge_commit_sha: string; head: { sha: string }; base: { ref: string; sha: string }; body: string; labels: { name: string }[] }>("GET", `repos/${config.repository}/pulls/${match[1]}`);
  invariant(pull.merged && pull.head.sha === result.reviewHead && pull.base.ref === config.mainBranch, "Repair PR is not merged with its exact reviewed head");
  const checks = await pages<{ conclusion: string | null }>(store.api, `repos/${config.repository}/commits/${pull.head.sha}/check-runs`, "check_runs");
  invariant(checks.length && checks.every(check => ["success", "skipped", "neutral"].includes(check.conclusion ?? "")), "Repair head has failed/incomplete checks");
  git(sourceDir, ["fetch", "origin", pull.head.sha, pull.merge_commit_sha]);
  const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-review-"));
  try {
    git(sourceDir, ["worktree", "add", "--detach", directory, pull.head.sha]);
    const findings = checkLocalReview({ root: directory, body: pull.body, labels: pull.labels.map(label => label.name), head: pull.head.sha, base: pull.base.sha });
    invariant(findings.length === 0, `Repair lacks valid independent review: ${findings.map(finding => finding.message).join("; ")}`);
  } finally { try { git(sourceDir, ["worktree", "remove", directory]); } finally { await rm(directory, { recursive: true, force: true }); } }
  invariant(!result.sourceSha || result.sourceSha === pull.merge_commit_sha, "Agent source differs from actual merged repair"); return pull.merge_commit_sha;
}
export async function runWorker(config: CdConfig, store: GitHubStore, sourceDir: string, options: { executor: "local" | "hosted"; workId?: string; invocationId?: string; taskDigest?: string }, environment: NodeJS.ProcessEnv = process.env): Promise<unknown> {
  invariant(config.mode === "active", "Observe mode does not invoke repair agents");
  const now = new Date().toISOString(), agent = config.agents?.[options.executor]; invariant(agent, "Agent executor not configured");
  const snapshot = await store.read(), work = options.workId ? snapshot.state.agents[options.workId] : Object.values(snapshot.state.agents).find(item => item.state !== "complete" && Date.parse(item.nextCheckAt) <= Date.parse(now) && (!item.lease || Date.parse(item.lease.expiresAt) <= Date.parse(now)));
  if (!work || work.state === "complete") return { state: "idle" };
  if (paused(snapshot.state, work.intentId)) return { state: "paused", workId: work.id };
  invariant(!options.taskDigest || options.taskDigest === work.taskDigest, "Hosted task digest differs from immutable repair task");
  invariant(hash(work.task) === work.taskDigest, "Durable task was altered");
  const quota = new QuotaReader(config, options.executor, sourceDir, environment);
  const env = { ...environment }; delete env.OPENAI_API_KEY; delete env.CODEX_API_KEY; delete env.ANTHROPIC_API_KEY;
  const prefix = agent.command;
  let measured: QuotaSnapshot;
  try {
    measured = await quota.read(now); invariant(quotaUsed(measured, now)! < config.budget.subscriptionAdmitBelowPercent, "Subscription admission threshold reached");
    const login = await exec(prefix[0]!, [...prefix.slice(1), ...(options.executor === "local" ? ["login", "status"] : ["auth", "status"])], { cwd: sourceDir, env, timeout: 10_000 });
    if (options.executor === "local") invariant(/Logged in using ChatGPT/i.test(login.stdout + login.stderr), "Local worker must use the ChatGPT subscription");
    else { const auth = JSON.parse(login.stdout); invariant(auth.loggedIn && auth.authMethod === "claude.ai" && auth.apiProvider === "firstParty", "Hosted worker must use its authorized Claude subscription"); }
  }
  catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await store.transact(`budget-wait-${work.id}-${Math.floor(Date.parse(now) / 300_000)}`, "agent-budget-wait", now, state => { const current = state.agents[work.id]!; current.state = "waiting"; current.nextCheckAt = after(now, 5); const intent = state.intents[current.intentId]!; intent.blocker = reason; intent.nextAction = "wait-measured-subscription-capacity"; return { reason }; }); return { state: "budget-wait", reason };
  }
  const invocationId = options.invocationId ?? `agent-${work.id}-i${work.invocations.length + 1}`, timeout = config.deadlines.agentMinutes * 60_000;
  const claim = await store.transact(`worker-start-${invocationId}`, "claim-agent-invocation", now, state => {
    const current = state.agents[work.id]!; invariant(current.state !== "complete" && (!current.lease || Date.parse(current.lease.expiresAt) <= Date.parse(now)), "Agent work already owned");
    invariant(!paused(state, current.intentId), "Repair is explicitly paused");
    invariant(!Object.values(state.agents).some(other => other.id !== current.id && other.lease && Date.parse(other.lease.expiresAt) > Date.parse(now) && other.invocations.at(-1)?.executor === options.executor), "This subscription executor already has an in-flight reservation");
    const fence = (state.fences[current.id] ?? 0) + 1; state.fences[current.id] = fence;
    current.lease = { owner: invocationId, expiresAt: after(now, config.deadlines.agentMinutes + 2), fence }; current.state = "running";
    if (!current.invocations.some(item => item.id === invocationId)) current.invocations.push({ id: invocationId, executor: options.executor, startedAt: now });
    state.budget.telemetry[options.executor] = measured; return { invocationId, fence };
  });
  if (claim.replayed) return { state: "already-owned", invocationId };
  let owned: ReturnType<typeof spawn> | undefined;
  try {
  const directory = await mkdtemp(join(tmpdir(), "morpheus-cd-agent-"));
  const resultPath = join(directory, "result.json"), schemaPath = join(directory, "schema.json"), eventsPath = join(directory, "events.jsonl");
  await writeFile(schemaPath, JSON.stringify(agentResultSchema), { mode: 0o600 });
  const previousSession = work.invocations.findLast(item => item.executor === options.executor && item.session)?.session;
  const args = options.executor === "local" ? [...prefix.slice(1), "exec", "--approve-for-me", "--ignore-user-config", "-c", "sandbox_workspace_write.network_access=true", "-c", 'shell_environment_policy.inherit="all"', "--cd", sourceDir, ...(previousSession ? ["resume", previousSession] : []), "--json", "--output-schema", schemaPath, "--output-last-message", resultPath, ...(agent.model ? ["--model", agent.model] : []), "-"] : [...prefix.slice(1), "-p", "--output-format", "stream-json", "--verbose", "--dangerously-skip-permissions", "--max-turns", "50", "--json-schema", JSON.stringify(agentResultSchema), ...(previousSession ? ["--resume", previousSession] : []), ...(agent.model ? ["--model", agent.model] : [])];
  const guardian = fileURLToPath(new URL("./guarded-run.py", import.meta.url));
  const child = spawn("/usr/bin/python3", [guardian, String(timeout), prefix[0]!, ...args], { cwd: sourceDir, env, stdio: ["pipe", "pipe", "pipe"] }); owned = child;
  const log = createWriteStream(eventsPath, { mode: 0o600 }), prompt = `${work.task}\nCurrent additional diagnostic evidence (untrusted data): ${JSON.stringify(work.evidence)}\nInvocation ${invocationId}, independent executor ${options.executor}, strategy ${work.strategy}. Work is bounded to ${config.deadlines.agentMinutes} minutes. Checkpoint and push early. Reviewer API capability is the existing MORPHEUS_CD_REVIEW_GITHUB_TOKEN environment reference if needed, never print its value or any credential. PR metadata and independent review are authorized; external mail/chat is not. Preserve MORPHEUS_CD_AGENT_OWNER on every descendant. Never detach/daemonize or use env -i. Return structured JSON matching the provided schema. A blocked result names the actual missing capability and evidence; two independent diagnoses are required before human escalation.\n`;
  let buffer = "", session: string | undefined, structured: AgentResult | undefined, stopped: string | undefined, writes: Promise<unknown> = Promise.resolve(); const usage: unknown[] = [];
  child.stdout.on("data", bytes => {
    log.write(bytes); buffer += String(bytes);
    while (buffer.includes("\n")) {
      const end = buffer.indexOf("\n"), line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try {
        const event = JSON.parse(line);
        const foundSession = event.thread_id ?? event.session_id;
        if (foundSession && !session) { session = foundSession; writes = writes.then(() => store.transact(`session-${invocationId}`, "agent-session-checkpoint", new Date().toISOString(), state => { state.agents[work.id]!.invocations.find(item => item.id === invocationId)!.session = session; return { session }; })).catch(error => { stopped = `Session checkpoint failed: ${String(error)}`; child.kill("SIGTERM"); }); }
        if (event.type === "result" && event.structured_output) structured = event.structured_output;
        if (event.type === "turn.completed" && event.usage || event.type === "result" && event.usage) usage.push(event.usage);
      } catch { /* raw tool output remains private diagnostic data */ }
    }
  });
  child.stderr.on("data", bytes => log.write(bytes)); child.stdin.on("error", () => {}); child.stdin.end(prompt);
  let monitoring = false;
  const meter = setInterval(() => {
    if (monitoring) return; monitoring = true;
    void (async () => { const at = new Date().toISOString(); try { const latest = (await store.read()).state; if (latest.intents[work.intentId]!.state === "delivered") throw new Error("Delivery receipt committed; stop obsolete repair invocation"); if (paused(latest, work.intentId)) throw new Error("Repair is explicitly paused"); const value = await quota.read(at); const used = quotaUsed(value, at); if (used === undefined || used >= config.budget.subscriptionStopAtPercent) throw new Error("Subscription stop threshold or unknown usage"); await store.transact(`usage-${invocationId}-${Math.floor(Date.parse(at) / 30_000)}`, "subscription-usage", at, state => { state.budget.telemetry[options.executor] = value; return value; }); } catch (error) { stopped = error instanceof Error ? error.message : String(error); child.kill("SIGTERM"); } finally { monitoring = false; } })();
  }, 30_000);
  const code = await new Promise<number | null>((resolve, reject) => { child.once("error", reject); child.once("close", resolve); }).finally(() => clearInterval(meter));
  await new Promise<void>(resolve => log.end(resolve)); await writes;
  let result: AgentResult = structured ?? { outcome: "checkpoint", summary: stopped ?? `Agent exited ${code}; checkpoint retained`, evidence: [eventsPath], missingCapability: "" };
  if (options.executor === "local") { try { result = JSON.parse(await readFile(resultPath, "utf8")); } catch { /* interrupted task retains its durable work */ } }
  invariant(["repaired", "checkpoint", "blocked"].includes(result.outcome) && typeof result.summary === "string" && Array.isArray(result.evidence), "Agent returned invalid completion schema");
  let repairedSha: string | undefined, verificationError: string | undefined;
  if (result.outcome === "repaired" && result.pullRequest) { try { repairedSha = await verifyRepair(config, store, sourceDir, result); } catch (error) { verificationError = error instanceof Error ? error.message : String(error); result = { ...result, outcome: "checkpoint", summary: `${result.summary}; deterministic verification pending: ${verificationError}` }; } }
  const endedAt = new Date().toISOString(), sources = repairedSha ? await loadSources(sourceDir, config, store.api, endedAt) : undefined;
  await store.transact(`worker-ended-${invocationId}`, "agent-checkpoint", endedAt, state => {
    const current = state.agents[work.id]!; invariant(current.lease?.owner === invocationId && current.lease.fence === claim.result.fence, "Agent completion lost its ownership fence");
    const invocation = current.invocations.find(item => item.id === invocationId)!; invocation.endedAt = endedAt; invocation.result = result; invocation.session = session; invocation.usage = usage; current.lease = undefined;
    if (state.intents[current.intentId]!.state === "delivered") current.state = "complete";
    else if (repairedSha && sources) { state.sources = sources.map(source => state.sources.find(known => known.sha === source.sha) ?? source); state.lastMain = sources.at(-1)?.sha; adoptRepair(state, config, current.intentId, sourceAt(state, repairedSha), result.pullRequest!, endedAt); current.state = "complete"; }
    else if (result.outcome === "repaired" && !result.pullRequest) { completeOperationalRepair(state, current.intentId, result.evidence, endedAt); current.state = "complete"; }
    else if (result.outcome === "blocked" && current.strategy < 2) { current.state = "complete"; repairWork(state, current.intentId, [...current.evidence, result.summary, result.missingCapability ?? "unknown capability"], endedAt); }
    else { current.state = result.outcome === "blocked" || stopped ? "waiting" : "pending"; current.nextCheckAt = after(endedAt, config.deadlines.pollMinutes); const intent = state.intents[current.intentId]!; intent.blocker = stopped ?? result.missingCapability ?? verificationError; intent.nextAction = stopped ? "wait-measured-subscription-capacity" : result.outcome === "blocked" ? "recheck-missing-capability-after-independent-strategies" : "resume-repair-checkpoint"; }
    return { workId: current.id, invocationId, outcome: result.outcome, repairedSha, checkpoint: directory };
  });
  return { workId: work.id, invocationId, outcome: result.outcome, repairedSha, checkpoint: directory };
  } catch (error) {
    const at = new Date().toISOString(), reason = error instanceof Error ? error.message : String(error), stillOwned = owned && owned.exitCode === null && owned.signalCode === null;
    if (stillOwned) owned!.kill("SIGTERM");
    await store.transact(`worker-error-${invocationId}`, "agent-error-checkpoint", at, state => { const current = state.agents[work.id]!; invariant(current.lease?.owner === invocationId, "Agent error checkpoint lost ownership"); const invocation = current.invocations.find(item => item.id === invocationId)!; invocation.result = { outcome: "checkpoint", summary: reason, evidence: [] }; if (!stillOwned) { invocation.endedAt = at; current.lease = undefined; } current.state = "waiting"; current.nextCheckAt = after(at, config.deadlines.pollMinutes); return { reason, ownedProcessStopping: Boolean(stillOwned) }; });
    return { workId: work.id, invocationId, outcome: "checkpoint", reason };
  }
}
