import { randomUUID } from "node:crypto";
import { type Attempt, type CdConfig, type CdState, configurationDigest, type DeliveryIntent, hash } from "./schema.js";
import { ActionsAdapter, type WorkflowRun } from "./actions.js";
import { AppleAdapter, AppleRequestError } from "./apple.js";
import { GitHubStore, pages } from "./store.js";
import { loadSources, verifyValidator } from "./source.js";
import { CdWait } from "./errors.js";
import { adoptSources, after, attemptAt, claimExternalReview, claimGroup, deliver, evaluateSlots, externalReviewKey, invariant, planAttempt, recordTests, recordUpload, repairWork, validateObservation } from "./state.js";

interface WorkflowJob {
  id: number; run_id: number; run_attempt?: number; head_sha: string;
  status: string; conclusion: string | null; created_at?: unknown; started_at: string | null; completed_at: string | null;
  labels: string[]; runner_id: number | null; runner_name: string | null; runner_group_id?: unknown; runner_group_name?: unknown;
  steps: { status: string; conclusion: string | null; started_at?: string | null; completed_at?: string | null }[];
}
function knownJob(value: unknown): value is WorkflowJob {
  const job = value as WorkflowJob | null;
  return !!job && Number.isSafeInteger(job.id) && job.id > 0 && Number.isSafeInteger(job.run_id) && typeof job.head_sha === "string"
    && ["queued", "in_progress", "completed"].includes(job.status) && (job.conclusion === null || typeof job.conclusion === "string")
    && (job.started_at === null || typeof job.started_at === "string" && Number.isFinite(Date.parse(job.started_at)))
    && (job.completed_at === null || typeof job.completed_at === "string" && Number.isFinite(Date.parse(job.completed_at)))
    && Array.isArray(job.labels) && job.labels.every(label => typeof label === "string")
    && (job.runner_id === null || Number.isSafeInteger(job.runner_id) && job.runner_id >= 0) && (job.runner_name === null || typeof job.runner_name === "string")
    && Array.isArray(job.steps) && job.steps.every(step => step && ["queued", "in_progress", "completed"].includes(step.status) && (step.conclusion === null || typeof step.conclusion === "string"));
}
function unassigned(job: WorkflowJob): boolean {
  // Null/zero runner identity and null/empty name are insufficient on their own:
  // a start timestamp or any executed step contradicts a no-start claim.
  return job.started_at === null && (job.runner_id === null || job.runner_id === 0) && (job.runner_name === null || job.runner_name === "")
    && job.steps.every(step => step.status === "queued" && step.conclusion === null && step.started_at == null && step.completed_at == null);
}
function neverRan(job: WorkflowJob, conclusions: string[]): boolean {
  if (job.status !== "completed" || !conclusions.includes(job.conclusion ?? "")) return false;
  // GitHub does not leave started_at null on every terminal job that never ran: retained
  // skipped rows (null runner fields) and a job cancelled while queued (0/"") copy created_at
  // into started_at, with no runner group and no step. Only that exact copy on a completed row
  // qualifies; queued rows, any other start time and any listed step keep the strict rule.
  return unassigned(job) || job.completed_at !== null && job.started_at === job.created_at
    && (job.runner_id === null || job.runner_id === 0) && (job.runner_name === null || job.runner_name === "")
    && (job.runner_group_id === null || job.runner_group_id === 0) && (job.runner_group_name === null || job.runner_group_name === "") && job.steps.length === 0;
}
function jobAdmission(jobs: unknown[], config: CdConfig, lane: Attempt["lane"]): { waiting: boolean; neverStarted: boolean; hostedEnded: boolean } {
  if (!jobs.length || !jobs.every(knownJob)) return { waiting: false, neverStarted: false, hostedEnded: false };
  const local = (job: WorkflowJob) => job.labels.includes(config.execution?.localRunner ?? "self-hosted") || job.labels.includes("self-hosted");
  const hosted = (job: WorkflowJob) => !local(job) && job.labels.some(label => /^macos-/.test(label));
  const native = jobs.filter(lane === "local" ? local : hosted);
  // Only known hosted Linux preflight work or explicitly skipped/unassigned
  // downstream jobs may accompany the native census. Unknown executors need repair.
  const other = jobs.filter(job => !native.includes(job));
  const skipped = (job: WorkflowJob) => neverRan(job, ["skipped"]);
  const preflight = (job: WorkflowJob) => !local(job) && job.labels.some(label => /^ubuntu-/.test(label));
  const recognized = native.length > 0 && other.every(job => preflight(job) || skipped(job));
  return {
    waiting: recognized && native.some(job => job.status === "queued") && native.every(job => skipped(job) || job.status === "queued" && job.conclusion === null && job.completed_at === null && unassigned(job)),
    neverStarted: recognized && native.some(job => job.conclusion === "cancelled") && native.every(job => neverRan(job, ["cancelled", "skipped"]))
      && other.every(job => skipped(job) || preflight(job) && job.status === "completed" && job.conclusion === "success"),
    hostedEnded: lane === "hosted" && recognized && jobs.every(job => job.status === "completed" && !local(job)),
  };
}

export interface TickResult { mode: "observe" | "active"; stateHead: string; intents: unknown[]; decisions: unknown[]; errors: { intentId: string; message: string }[] }
export function status(state: CdState, now: string): unknown[] {
  return Object.values(state.intents).map(intent => ({ id: intent.id, channel: intent.channel, validation: intent.validation, sourceAgeWaiver: intent.sourceAgeWaiver, state: intent.state, originalSource: intent.originalSource, source: intent.source, slot: intent.slot, oldestDebtAt: intent.oldestDebtAt, deadlineAt: intent.deadlineAt, overdue: intent.state !== "delivered" && Date.parse(now) > Date.parse(intent.deadlineAt), nextAction: intent.nextAction, nextCheckAt: intent.nextCheckAt, blocker: intent.blocker, attempts: intent.attempts.map(attempt => ({ id: attempt.id, buildNumber: attempt.buildNumber, lane: attempt.lane, runId: attempt.runId, status: attempt.status, upload: attempt.upload?.outcome })), receipt: intent.receipt, ...(intent.external ? { external: intent.external } : {}) }));
}
export class Controller {
  constructor(readonly config: CdConfig, readonly store: GitHubStore, readonly actions: ActionsAdapter, readonly apple: AppleAdapter, readonly sourceDir: string) {}
  async tick(now: string, observe = false): Promise<TickResult> {
    const snapshot = await this.store.read();
    invariant(snapshot.state.configurationDigest === configurationDigest(this.config), "Configuration changed; explicit ledger configuration migration is required before continuing");
    const sources = await loadSources(this.sourceDir, this.config, this.store.api, now);
    const pure = (state: CdState) => { adoptSources(state, sources, now); evaluateSlots(state, this.config, now); return { slots: state.slots.length }; };
    if (observe || this.config.mode === "observe") {
      const state = structuredClone(snapshot.state); pure(state);
      return { mode: "observe", stateHead: snapshot.head, intents: status(state, now), decisions: state.slots, errors: [] };
    }
    await this.store.repairBackup();
    const evaluated = await this.store.transact(`tick-${randomUUID()}`, "evaluate-slots", now, pure), errors: TickResult["errors"] = [];
    // Internal obligations run first. Bound optional external work so a backlog
    // cannot consume this invocation before current deliveries are reconciled.
    let externalRemaining = 2;
    const intents = Object.values(evaluated.state.intents).sort((a, b) => Number(a.state === "delivered") - Number(b.state === "delivered") || Date.parse(a.external?.nextCheckAt ?? a.nextCheckAt) - Date.parse(b.external?.nextCheckAt ?? b.nextCheckAt));
    for (const intent of intents) {
      for (const retired of intent.attempts.filter(attempt => attempt.status === "retired-uncertain")) {
        try {
          const late = await this.apple.observe(retired, intent.groupId, now);
          await this.store.transact(`late-observation-${retired.id}-${Math.floor(Date.parse(now) / 300_000)}`, "monitor-retired-upload", now, state => { const old = attemptAt(state, intent.id, retired.id).attempt; old.uploadObservations ??= []; old.uploadObservations.push({ at: now, uploadState: late.uploadState, buildId: late.observation?.buildId, processingState: late.observation?.processingState, diagnostics: late.diagnostics }); return { attemptId: old.id, lateBuildId: late.observation?.buildId, promoted: false }; });
        } catch (error) { errors.push({ intentId: intent.id, message: `Retired identity observation unavailable: ${String(error)}` }); }
      }
      if (evaluated.state.pauses.some(pause => ["all", intent.channel, intent.id].includes(pause.scope))) continue;
      if (intent.state === "delivered") {
        if (externalRemaining > 0 && this.config.channels[intent.channel].externalGroupIds && intent.receipt?.configurationDigest === configurationDigest(this.config) && !intent.isolatedValidation && !intent.external?.terminal && intent.external?.status !== "available" && Date.parse(intent.external?.nextCheckAt ?? now) <= Date.parse(now)) {
          externalRemaining--;
          try { await this.reconcileExternal(intent.id, now); }
          catch (error) {
            const message = error instanceof Error ? error.message : String(error); errors.push({ intentId: intent.id, message });
            await this.store.transact(`external-wait-${randomUUID()}`, "external-distribution-wait", now, state => {
              const current = state.intents[intent.id]!, identity = current.receipt!.observation;
              if (current.external?.status === "available" || current.external?.terminal) return null;
              const claim = state.externalReviews?.[externalReviewKey(identity.appId, identity.buildId)]?.attempts.at(-1);
              const transient = error instanceof CdWait && error.code !== "apple-review-limit";
              current.external = { ...current.external, status: claim?.outcome === "claimed" ? "uncertain" : transient ? "pending" : "blocked", nextAction: "observe-exact-external-build", nextCheckAt: after(now, claim?.outcome === "claimed" ? 60 : transient ? this.config.deadlines.pollMinutes : 1440), blocker: message }; return { intentId: intent.id, message };
            });
          }
        }
        continue;
      }
      if (Date.parse(intent.nextCheckAt) > Date.parse(now)) continue;
      try { await this.reconcileIntent(intent, now); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error); errors.push({ intentId: intent.id, message });
        await this.store.transact(`wait-${randomUUID()}`, "reconcile-wait", now, state => { const current = state.intents[intent.id]!; if (current.state === "delivered") return null; current.blocker = message; current.nextCheckAt = after(now, this.config.deadlines.pollMinutes); if (error instanceof CdWait) { current.state = "waiting"; current.nextAction = `wait-${error.code}`; } else { current.nextAction = "diagnose-reconcile-failure"; repairWork(state, current.id, [message], now); } return { intentId: current.id, message }; });
      }
    }
    const final = await this.store.read(); return { mode: "active", stateHead: final.head, intents: status(final.state, now), decisions: final.state.slots, errors };
  }
  private async reconcileExternal(intentId: string, now: string): Promise<void> {
    const snapshot = await this.store.read(), intent = snapshot.state.intents[intentId]!, receipt = intent.receipt;
    const groups = this.config.channels[intent.channel].externalGroupIds;
    invariant(receipt && intent.state === "delivered" && receipt.configurationDigest === configurationDigest(this.config) && !intent.isolatedValidation && groups, "External follow-up requires a delivery qualified under the opted-in configuration");
    if (snapshot.state.pauses.some(pause => ["all", intent.channel, intent.id].includes(pause.scope))) return;
    const observation = await this.apple.external(receipt, groups, now), key = externalReviewKey(observation.appId, observation.buildId);
    invariant(observation.appId === receipt.observation.appId && observation.version === receipt.observation.version && observation.buildNumber === receipt.observation.buildNumber && observation.buildId === receipt.observation.buildId, "External provider observation substituted another receipt identity");
    invariant(observation.groups.length === groups.length && new Set(observation.groups.map(group => group.id)).size === groups.length && observation.groups.every(group => groups.includes(group.id) && group.appId === observation.appId && !group.internal && !group.automaticDistribution && group.testerIds.length > 0), "Configured external group must belong to the exact app, contain testers, and disable automatic all-build distribution");
    const record = async (status: NonNullable<DeliveryIntent["external"]>["status"], nextAction: string, blocker?: string, terminal = false) => {
      await this.store.transact(`external-observe-${randomUUID()}`, "exact-external-build-observation", now, state => {
        const current = state.intents[intentId]!;
        if (current.external?.status === "available" || current.external?.terminal) return { intentId, status: current.external.status };
        current.external = { status, nextAction, nextCheckAt: after(now, status === "blocked" ? 1440 : status === "uncertain" ? 60 : this.config.deadlines.pollMinutes), observation, ...(blocker ? { blocker } : {}), ...(terminal ? { terminal: true } : {}) };
        const operation = state.externalReviews?.[key]?.attempts.at(-1);
        if (operation?.outcome === "claimed" && (observation.review || status === "available")) { operation.outcome = "confirmed"; operation.completedAt = now; if (observation.review) operation.submissionId = observation.review.id; }
        return { intentId, buildId: observation.buildId, status, nextAction };
      });
    };
    if (observation.processingState !== "VALID" || ["BETA_REJECTED", "EXPIRED", "PROCESSING_EXCEPTION", "MISSING_EXPORT_COMPLIANCE", "NOT_APPLICABLE"].includes(observation.betaState) || observation.review?.state === "REJECTED") {
      await record("blocked", "diagnose-external-build", `Exact external build state ${observation.processingState}/${observation.betaState}, review ${observation.review?.state ?? "absent"}`, observation.betaState === "EXPIRED"); return;
    }
    if (!["READY_FOR_BETA_SUBMISSION", "READY_FOR_BETA_TESTING", "IN_BETA_TESTING", "BETA_APPROVED", "WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW"].includes(observation.betaState)) {
      await record("blocked", "observe-exact-external-build", `External state ${observation.betaState} does not authorize distribution or review`); return;
    }
    const missing = observation.groups.find(group => !group.buildIds.includes(observation.buildId));
    if (!missing && observation.betaState === "IN_BETA_TESTING") { await record("available", "complete"); return; }
    await record("pending", "reconcile-external-distribution");
    const mutationAllowed = (state: CdState) => {
      const current = state.intents[intentId]!;
      invariant(current.receipt?.observation.buildId === observation.buildId && !current.isolatedValidation, "External mutation must retain its exact delivered identity");
      return !current.external?.terminal && current.external?.status !== "available" && !state.pauses.some(pause => ["all", current.channel, current.id].includes(pause.scope));
    };
    if (!observation.autoNotifyEnabled || missing) {
      // These are idempotent settings/set membership. Every invocation first reads
      // provider state, then claims a bounded call; a lost reply cannot reupload.
      const effect = !observation.autoNotifyEnabled ? { action: "notify", id: observation.detailId } : { action: "group", id: missing!.id };
      const claim = await this.store.transact(`external-setting-${hash({ key, effect, poll: Math.floor(Date.parse(now) / (this.config.deadlines.pollMinutes * 60_000)) })}`, "claim-external-setting", now, mutationAllowed);
      if (claim.replayed || !claim.result) return;
      if (effect.action === "notify") await this.apple.notifyExternal(effect.id);
      else await this.apple.assign(observation.buildId, effect.id);
      return;
    }
    if (observation.review && ["WAITING_FOR_REVIEW", "IN_REVIEW"].includes(observation.review.state) || ["WAITING_FOR_BETA_REVIEW", "IN_BETA_REVIEW"].includes(observation.betaState)) {
      await record("waiting-review", "observe-exact-external-review"); return;
    }
    if (observation.betaState !== "READY_FOR_BETA_SUBMISSION" || observation.review) {
      await record("pending", "observe-exact-external-build", `Awaiting exact-build external availability: ${observation.betaState}, review ${observation.review?.state ?? "absent"}`); return;
    }
    const claim = await this.store.transact(`external-review-${randomUUID()}`, "claim-external-review", now, state => claimExternalReview(state, intentId, now));
    if (claim.replayed || !claim.result.claimed) {
      const operation = claim.state.externalReviews![key]!.attempts.at(-1)!;
      await record(operation.outcome === "claimed" ? "uncertain" : operation.outcome === "rejected" ? "blocked" : "waiting-review", "observe-exact-external-review", operation.outcome === "claimed" ? "A prior submission may have started; exact-build readback is required, never blind resubmission" : operation.outcome === "rejected" ? "Apple rejected the submission; repair metadata/authority and explicitly resolve it without replaying an unchanged request" : "Awaiting exact submission visibility or bounded conflict retry"); return;
    }
    const finish = async (outcome: "confirmed" | "conflict" | "rejected", submissionId?: string) => {
      await this.store.transact(`external-review-result-${key}-${claim.result.index}`, "external-review-result", now, state => {
        const operation = state.externalReviews![key]!.attempts[claim.result.index]!;
        operation.outcome = outcome; operation.completedAt = now; if (submissionId) operation.submissionId = submissionId;
        return { key, outcome, submissionId };
      });
    };
    try { await finish("confirmed", await this.apple.submitReview(observation.buildId)); }
    catch (error) {
      if (error instanceof AppleRequestError && error.status >= 400 && error.status < 500 && error.status !== 409) { await finish("rejected"); throw error; }
      if (!(error instanceof AppleRequestError && error.status === 409)) throw error;
      // An explicit conflict rejected this request. Wait at least an hour and
      // re-read this exact build before another claim, including sibling review.
      await finish("conflict");
    }
    await record("waiting-review", "observe-exact-external-review");
  }
  private async reconcileIntent(intent: DeliveryIntent, now: string): Promise<void> {
    const latest = await this.store.read(), current = latest.state.intents[intent.id]!;
    const attempt = current.attempts.find(item => item.status === "active");
    if (!attempt) {
      if (current.state === "repairing" || current.state === "paused") return;
      if (current.eligibleAt && Date.parse(current.eligibleAt) > Date.parse(now)) return;
      const app = this.config.channels[current.channel], maximum = await this.apple.maximum(app.appId, app.version);
      const control = await this.store.api.request<{ sha: string }>("GET", `repos/${this.config.repository}/commits/${encodeURIComponent(this.config.controlRef)}`);
      await this.store.transact(`plan-${current.id}-a${current.attempts.length + 1}`, "plan-attempt", now, state => ({ attemptId: planAttempt(state, this.config, current.id, control.sha, maximum, now, current.nextAction === "dispatch-hosted" ? "hosted" : "local").id }));
      const planned = (await this.store.read()).state.intents[current.id]!.attempts.at(-1)!;
      await this.dispatch(current.id, current.channel, planned, now); return;
    }
    let runs = await this.actions.runs(attempt.dispatchEffectId);
    for (let index = 0; index < runs.length; index++) {
      const run = runs[index]!;
      if (attempt.runId === String(run.id) && attempt.runAttempt && String(run.run_attempt) !== attempt.runAttempt) runs[index] = await this.actions.runAttempt(attempt.runId, attempt.runAttempt);
      this.actions.verifyRun(runs[index]!, attempt);
    }
    if (!runs.length) {
      if (attempt.dispatch.state === "intended") await this.dispatch(current.id, current.channel, attempt, now);
      else if (Date.parse(now) - Date.parse(attempt.dispatch.sentAt ?? attempt.createdAt) >= this.config.deadlines.wakeMinutes * 60_000) {
        // A duplicate dispatch is permitted only after the full paginated visibility sweep.
        // It reuses the same effect/build; duplicate workflows cannot claim another upload.
        await this.dispatch(current.id, current.channel, attempt, now, `retry-${Math.floor(Date.parse(now) / (this.config.deadlines.wakeMinutes * 60_000))}`);
      }
      return;
    }
    runs = runs.sort((a, b) => a.id - b.id);
    const run = attempt.runId ? runs.find(item => String(item.id) === attempt.runId) : runs[0]; invariant(run, "Bound workflow is absent from complete effect sweep");
    for (const duplicate of runs.filter(item => item.id !== run.id && item.status !== "completed")) await this.actions.cancel(String(duplicate.id));
    const evidence = await this.actions.evidence(run, attempt);
    for (const tests of evidence.tests) verifyValidator(this.sourceDir, tests);
    await this.store.transact(`observe-run-${attempt.id}-${hash({ run, evidence }).slice(0, 24)}`, "observe-workflow", now, state => {
      const found = attemptAt(state, current.id, attempt.id); if (found.attempt.status !== "active") return null;
      found.attempt.dispatch.runIds = runs.map(item => String(item.id));
      found.attempt.runId ??= String(run.id); found.attempt.runAttempt ??= String(run.run_attempt);
      if (run.status === "completed") found.attempt.workflowTerminalAt ??= now;
      for (const tests of evidence.tests) { recordTests(state, this.config, tests); found.attempt.artifactsVerifiedAt = now; }
      for (const upload of evidence.uploads) if (found.attempt.upload) recordUpload(state, upload, now);
      return { runId: String(run.id), artifacts: evidence.tests.length + evidence.uploads.length };
    });
    const observedAttempt = (await this.store.read()).state.intents[current.id]!.attempts.find(item => item.id === attempt.id)!;
    if (observedAttempt.upload) { await this.reconcileUpload(current.id, observedAttempt, run, now); return; }
    const elapsed = Date.parse(now) - Date.parse(attempt.createdAt);
    let jobs: unknown[] | undefined, censusError: unknown;
    try { jobs = await this.jobs(run); } catch (error) { censusError = error; }
    // A failed census cannot establish admission or no-start quiescence, but
    // must not remove the existing running-work cancellation bound either.
    const admission = jobAdmission(jobs ?? [], this.config, attempt.lane);
    if (run.status !== "completed" && elapsed > (admission.waiting && !observedAttempt.tests ? this.config.deadlines.admissionMinutes : this.config.deadlines.testMinutes) * 60_000) {
      await this.actions.cancel(String(run.id));
      await this.store.transact(`cancel-${attempt.id}`, "cancel-expired-native-job", now, state => { const item = attemptAt(state, current.id, attempt.id); item.intent.nextAction = "verify-executor-quiescence"; item.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { runId: String(run.id) }; });
    } else if (jobs && run.status === "completed" && run.conclusion !== "success") await this.failedRun(current.id, observedAttempt, run, jobs, now);
    else if (jobs && run.status === "completed" && !observedAttempt.upload) await this.failedRun(current.id, observedAttempt, run, jobs, now, "Workflow completed without the durable upload claim/acceptance");
    if (jobs === undefined) throw censusError;
  }
  private async jobs(run: WorkflowRun): Promise<unknown[]> {
    let total: number | undefined, received = 0;
    const jobs = await pages<unknown>({ request: async <T>(method: string, path: string): Promise<T> => {
      const page = await this.store.api.request<{ total_count: number; jobs: unknown[] }>(method, path);
      if (!page || !Number.isSafeInteger(page.total_count) || page.total_count < 0 || !Array.isArray(page.jobs) || page.jobs.length > 100 || total !== undefined && total !== page.total_count) throw new CdWait("Exact-attempt job census is incomplete or changing", "native-job-evidence");
      received += page.jobs.length;
      if (received > page.total_count) throw new CdWait("Exact-attempt job census exceeds its declared total", "native-job-evidence");
      total = page.total_count; return page as T;
    } }, `repos/${this.config.repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, "jobs");
    if (jobs.length !== total || new Set(jobs.map(job => (job as WorkflowJob | null)?.id)).size !== jobs.length) throw new CdWait("Exact-attempt job census has missing or duplicate jobs", "native-job-evidence");
    if (jobs.some(value => { const job = value as WorkflowJob | null; return !job || job.run_id !== run.id || job.head_sha !== run.head_sha || job.run_attempt !== undefined && job.run_attempt !== run.run_attempt; })) throw new CdWait("Job census does not match the exact workflow run attempt", "native-job-evidence");
    return jobs;
  }
  private async dispatch(intentId: string, channel: string, attempt: Attempt, now: string, suffix = "initial"): Promise<void> {
    const claim = await this.store.transact(`dispatch-call-${attempt.id}-${suffix}`, "claim-workflow-dispatch", now, state => { const current = attemptAt(state, intentId, attempt.id); invariant(current.attempt.status === "active" && !current.attempt.upload, "Stale dispatch attempt"); current.attempt.dispatch.state = "uncertain"; current.attempt.dispatch.sentAt = now; return { effectId: attempt.dispatchEffectId }; });
    if (claim.replayed) return;
    await this.actions.dispatch(attempt, intentId, channel);
    await this.store.transact(`dispatch-ack-${attempt.id}-${suffix}`, "workflow-dispatch-ack", now, state => { const current = attemptAt(state, intentId, attempt.id); current.attempt.dispatch.state = "sent"; return { effectId: attempt.dispatchEffectId }; });
  }
  private async failedRun(intentId: string, attempt: Attempt, run: WorkflowRun, jobs: unknown[], now: string, reason = `Workflow ${run.id} ended ${run.conclusion}`): Promise<void> {
    const admission = jobAdmission(jobs, this.config, attempt.lane), neverStarted = admission.neverStarted && !attempt.tests, hostedEnded = admission.hostedEnded;
    await this.store.transact(`failure-${attempt.id}-${run.run_attempt}-${hash({ jobs, quiescence: attempt.quiescence }).slice(0, 12)}`, "native-failure", now, state => {
      const current = attemptAt(state, intentId, attempt.id);
      // An upload hook or another reconciler can win after the census was read.
      // Failure classification cannot release that newer owner or revive old work.
      if (current.attempt.status !== "active" || current.intent.attempts.at(-1)?.id !== attempt.id || current.attempt.upload || current.intent.state === "delivered") return null;
      const noStart = neverStarted && !current.attempt.tests;
      if (current.attempt.quiescence || noStart || hostedEnded) {
        current.attempt.quiescence ??= { kind: hostedEnded ? "hosted-terminated" : "host-terminated", ref: hostedEnded ? `GitHub hosted ephemeral VM job completion: ${jobs.map(job => (job as WorkflowJob).id).join(",")}` : `GitHub complete exact-attempt job census: no native job assigned/started, run ${run.id}/${run.run_attempt}`, observedAt: now };
        current.attempt.status = "failed";
      }
      const admissionFailure = noStart && attempt.lane === "local";
      current.intent.state = admissionFailure ? "pending" : "repairing";
      current.intent.nextAction = admissionFailure ? "dispatch-hosted" : "run-repair-agent"; current.intent.nextCheckAt = now;
      if (!admissionFailure) repairWork(state, intentId, [reason, `https://github.com/${this.config.repository}/actions/runs/${run.id}`, ...(!noStart && !hostedEnded ? ["Native admission absence is not proved; host-side owned process/VM termination evidence is required before replacement"] : [])], now);
      return { reason, neverStarted, hostedEnded };
    });
  }
  private async reconcileUpload(intentId: string, attempt: Attempt, run: WorkflowRun, now: string): Promise<void> {
    const state = (await this.store.read()).state, intent = state.intents[intentId]!, provider = await this.apple.observe(attempt, intent.groupId, now);
    const observation = provider.observation;
    await this.store.transact(`upload-observation-${attempt.id}-${Math.floor(Date.parse(now) / 300_000)}`, "observe-upload-and-build", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.uploadObservations ??= []; current.attempt.uploadObservations.push({ at: now, uploadState: provider.uploadState, buildId: observation?.buildId, processingState: observation?.processingState, diagnostics: provider.diagnostics }); current.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { buildId: observation?.buildId, uploadState: provider.uploadState }; });
    if (["FAILED", "INVALID"].includes(provider.uploadState ?? "") || observation && ["FAILED", "INVALID"].includes(observation.processingState)) {
      await this.store.transact(`provider-rejected-${attempt.id}`, "provider-rejection", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.upload!.diagnostics = provider.diagnostics; if (current.attempt.status !== "active" || current.intent.attempts.at(-1)?.id !== attempt.id || current.intent.state === "delivered") return { late: true }; if (!current.attempt.upload!.acceptedAt) current.attempt.upload!.outcome = "rejected"; current.attempt.status = "failed"; if (next.groupOperations[current.intent.groupId]?.attemptId === attempt.id) next.groupOperations[current.intent.groupId]!.completedAt = now; repairWork(next, intentId, [`Apple rejected ${attempt.appId}/${attempt.version}/${attempt.buildNumber}`, provider.diagnostics ?? "No additional diagnostics"], now); return { uploadState: provider.uploadState, processingState: observation?.processingState }; }); return;
    }
    if (observation) {
      const recorded = await this.store.transact(`provider-visible-${attempt.id}-${hash(observation).slice(0, 20)}`, "exact-build-observation", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.observation = observation; current.attempt.upload!.acceptedAt ??= now; current.attempt.upload!.outcome = "accepted"; if (current.attempt.status !== "active" || current.intent.attempts.at(-1)?.id !== attempt.id || current.intent.state === "delivered") return { late: true, buildId: observation.buildId }; current.intent.state = "processing"; current.intent.nextAction = "verify-internal-distribution"; current.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { late: false, buildId: observation.buildId, processingState: observation.processingState }; });
      if (recorded.result.late) return;
      if (observation.processingState !== "VALID") { await this.processingDiagnosis(intentId, attempt, now, "Apple processing has not reached VALID"); return; }
      // Processing can be VALID before TestFlight exposes an assignable beta build.
      // Keep the accepted upload and observe readiness; never replace its bytes.
      if (!["READY_FOR_BETA_TESTING", "IN_BETA_TESTING"].includes(observation.betaState)) {
        await this.processingDiagnosis(intentId, attempt, now, "Apple internal beta readiness has not reached READY_FOR_BETA_TESTING or IN_BETA_TESTING"); return;
      }
      invariant(observation.group.internal && observation.group.appId === attempt.appId && !observation.group.automaticDistribution, "Configured internal group must disable automatic all-build distribution");
      if (!observation.group.buildIds.includes(observation.buildId)) {
        const groupClaim = await this.store.transact(`group-${attempt.id}-${randomUUID()}`, "claim-internal-group-promotion", now, next => { claimGroup(next, intentId, attempt.id, now); return { buildId: observation.buildId, groupId: intent.groupId }; });
        // This provider operation is idempotent set membership; uncertain replies are
        // reconciled by readback before another safe add, never another upload.
        await this.apple.assign(groupClaim.result.buildId, groupClaim.result.groupId);
        return;
      }
      validateObservation(intent, attempt, observation);
      await this.store.transact(`delivered-${intentId}`, "internal-delivery-receipt", now, next => deliver(next, intentId, attempt.id, observation, now)); return;
    }
    const elapsed = Date.parse(now) - Date.parse(attempt.upload!.claimedAt);
    if (elapsed >= this.config.deadlines.appleObservationMinutes * 60_000) {
      // Terminal self-hosted job state alone does not prove its uploader is dead.
      // Retain reservation and ask the repair executor for host/provider evidence.
      const observations = (await this.store.read()).state.intents[intentId]!.attempts.find(item => item.id === attempt.id)!.uploadObservations ?? [];
      const observationStart = Math.max(Date.parse(observations[0]?.at ?? now), Date.parse(attempt.quiescence?.observedAt ?? now));
      if (attempt.quiescence && run.status === "completed" && !attempt.upload!.acceptedAt && observations.length >= 2 && Date.parse(now) - observationStart >= this.config.deadlines.appleObservationMinutes * 60_000) {
        await this.store.transact(`retire-${attempt.id}`, "retire-uncertain-upload", now, next => {
          const current = attemptAt(next, intentId, attempt.id), upload = current.attempt.upload;
          // Acceptance/resource hooks can commit after the absence read above. Only
          // this CAS transition's current state can release an uncertain reservation.
          if (current.attempt.status !== "active" || current.intent.attempts.at(-1)?.id !== attempt.id || current.intent.state === "delivered" || !upload || upload.acceptedAt || ["accepted", "rejected"].includes(upload.outcome)) return { retired: false };
          const observations = current.attempt.uploadObservations ?? [], quiescence = current.attempt.quiescence;
          const start = Math.max(Date.parse(observations[0]?.at ?? now), Date.parse(quiescence?.observedAt ?? now));
          if (!quiescence || !current.attempt.workflowTerminalAt || observations.some(item => item.buildId) || observations.length < 2 || Date.parse(now) - start < this.config.deadlines.appleObservationMinutes * 60_000) return { retired: false };
          current.attempt.status = "retired-uncertain"; current.intent.state = "pending"; current.intent.nextAction = "dispatch-full-tests"; current.intent.nextCheckAt = now;
          return { retired: true, burnedBuild: attempt.buildNumber, monitorLateAppearance: true };
        });
      } else await this.processingDiagnosis(intentId, attempt, now, `Upload/build absent after bounded observation; executor ${run.id} requires confirmed host/provider quiescence before replacement`);
    }
  }
  private async processingDiagnosis(intentId: string, attempt: Attempt, now: string, reason: string): Promise<void> {
    if (Date.parse(now) - Date.parse(attempt.upload!.acceptedAt ?? attempt.upload!.claimedAt) < this.config.deadlines.appleObservationMinutes * 60_000) return;
    await this.store.transact(`apple-diagnosis-${attempt.id}-${randomUUID()}`, "processing-diagnosis", now, state => { repairWork(state, intentId, [reason, `Exact identity ${attempt.appId}/${attempt.version}/${attempt.buildNumber}, upload ${attempt.upload!.providerUploadId ?? "unknown"}. Do not reupload accepted or uncertain bytes.`], now); return { reason }; });
  }
}
