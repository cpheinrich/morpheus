import { randomUUID } from "node:crypto";
import { type Attempt, type CdConfig, type CdState, configurationDigest, type DeliveryIntent, hash, type InternalObservation } from "./schema.js";
import { ActionsAdapter, type WorkflowRun } from "./actions.js";
import { AppleAdapter } from "./apple.js";
import { GitHubStore, pages } from "./store.js";
import { loadSources } from "./source.js";
import { adoptSources, after, attemptAt, claimGroup, deliver, evaluateSlots, invariant, planAttempt, recordTests, recordUpload, repairWork, sourceAt, validateObservation } from "./state.js";

export interface TickResult { mode: "observe" | "active"; stateHead: string; intents: unknown[]; decisions: unknown[]; errors: { intentId: string; message: string }[] }
export function status(state: CdState, now: string): unknown[] {
  return Object.values(state.intents).map(intent => ({ id: intent.id, channel: intent.channel, validation: intent.validation, state: intent.state, originalSource: intent.originalSource, source: intent.source, slot: intent.slot, oldestDebtAt: intent.oldestDebtAt, deadlineAt: intent.deadlineAt, overdue: intent.state !== "delivered" && Date.parse(now) > Date.parse(intent.deadlineAt), nextAction: intent.nextAction, nextCheckAt: intent.nextCheckAt, blocker: intent.blocker, attempts: intent.attempts.map(attempt => ({ id: attempt.id, buildNumber: attempt.buildNumber, lane: attempt.lane, runId: attempt.runId, status: attempt.status, upload: attempt.upload?.outcome })), receipt: intent.receipt }));
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
    for (const intent of Object.values(evaluated.state.intents)) {
      for (const retired of intent.attempts.filter(attempt => attempt.status === "retired-uncertain")) {
        try {
          const late = await this.apple.observe(retired, intent.groupId, now);
          await this.store.transact(`late-observation-${retired.id}-${Math.floor(Date.parse(now) / 300_000)}`, "monitor-retired-upload", now, state => { const old = attemptAt(state, intent.id, retired.id).attempt; old.uploadObservations ??= []; old.uploadObservations.push({ at: now, uploadState: late.uploadState, buildId: late.observation?.buildId, processingState: late.observation?.processingState, diagnostics: late.diagnostics }); return { attemptId: old.id, lateBuildId: late.observation?.buildId, promoted: false }; });
        } catch (error) { errors.push({ intentId: intent.id, message: `Retired identity observation unavailable: ${String(error)}` }); }
      }
      if (intent.state === "delivered" || Date.parse(intent.nextCheckAt) > Date.parse(now)) continue;
      if (evaluated.state.pauses.some(pause => ["all", intent.channel, intent.id].includes(pause.scope))) continue;
      try { await this.reconcileIntent(intent, now); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error); errors.push({ intentId: intent.id, message });
        await this.store.transact(`wait-${randomUUID()}`, "reconcile-wait", now, state => { const current = state.intents[intent.id]!; if (current.state === "delivered") return null; current.blocker = message; current.nextCheckAt = after(now, this.config.deadlines.pollMinutes); current.nextAction = "diagnose-reconcile-failure"; repairWork(state, current.id, [message], now); return { intentId: current.id, message }; });
      }
    }
    const final = await this.store.read(); return { mode: "active", stateHead: final.head, intents: status(final.state, now), decisions: final.state.slots, errors };
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
    await this.store.transact(`observe-run-${attempt.id}-${hash({ run, evidence }).slice(0, 24)}`, "observe-workflow", now, state => {
      const found = attemptAt(state, current.id, attempt.id); if (found.attempt.status !== "active") return null;
      found.attempt.dispatch.runIds = runs.map(item => String(item.id));
      found.attempt.runId ??= String(run.id); found.attempt.runAttempt ??= String(run.run_attempt);
      for (const tests of evidence.tests) { recordTests(state, this.config, tests); found.attempt.artifactsVerifiedAt = now; }
      for (const upload of evidence.uploads) if (found.attempt.upload) recordUpload(state, upload, now);
      return { runId: String(run.id), artifacts: evidence.tests.length + evidence.uploads.length };
    });
    const observedAttempt = (await this.store.read()).state.intents[current.id]!.attempts.find(item => item.id === attempt.id)!;
    if (observedAttempt.upload) { await this.reconcileUpload(current.id, observedAttempt, run, now); return; }
    const elapsed = Date.parse(now) - Date.parse(attempt.createdAt);
    if (run.status !== "completed" && elapsed > (run.status === "queued" ? this.config.deadlines.admissionMinutes : this.config.deadlines.testMinutes) * 60_000) {
      await this.actions.cancel(String(run.id));
      await this.store.transact(`cancel-${attempt.id}`, "cancel-expired-native-job", now, state => { const item = attemptAt(state, current.id, attempt.id); item.intent.nextAction = "verify-executor-quiescence"; item.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { runId: String(run.id) }; });
    } else if (run.status === "completed" && run.conclusion !== "success") await this.failedRun(current.id, observedAttempt, run, now);
    else if (run.status === "completed" && !observedAttempt.upload) await this.failedRun(current.id, observedAttempt, run, now, "Workflow completed without the durable upload claim/acceptance");
  }
  private async dispatch(intentId: string, channel: string, attempt: Attempt, now: string, suffix = "initial"): Promise<void> {
    const claim = await this.store.transact(`dispatch-call-${attempt.id}-${suffix}`, "claim-workflow-dispatch", now, state => { const current = attemptAt(state, intentId, attempt.id); invariant(current.attempt.status === "active" && !current.attempt.upload, "Stale dispatch attempt"); current.attempt.dispatch.state = "uncertain"; current.attempt.dispatch.sentAt = now; return { effectId: attempt.dispatchEffectId }; });
    if (claim.replayed) return;
    await this.actions.dispatch(attempt, intentId, channel);
    await this.store.transact(`dispatch-ack-${attempt.id}-${suffix}`, "workflow-dispatch-ack", now, state => { const current = attemptAt(state, intentId, attempt.id); current.attempt.dispatch.state = "sent"; return { effectId: attempt.dispatchEffectId }; });
  }
  private async failedRun(intentId: string, attempt: Attempt, run: WorkflowRun, now: string, reason = `Workflow ${run.id} ended ${run.conclusion}`): Promise<void> {
    const jobs = await pages<{ id: number; status: string; started_at: string | null; labels: string[] }>(this.store.api, `repos/${this.config.repository}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`, "jobs");
    const localJobs = jobs.filter(job => job.labels.includes(this.config.execution?.localRunner ?? "self-hosted") || job.labels.includes("self-hosted"));
    const neverStarted = localJobs.every(job => job.started_at === null), hostedEnded = attempt.lane === "hosted" && jobs.every(job => job.status === "completed" && !job.labels.includes("self-hosted"));
    await this.store.transact(`failure-${attempt.id}-${run.run_attempt}`, "native-failure", now, state => {
      const current = attemptAt(state, intentId, attempt.id);
      if (neverStarted || hostedEnded) {
        current.attempt.quiescence = { kind: hostedEnded ? "hosted-terminated" : "host-terminated", ref: hostedEnded ? `GitHub hosted ephemeral VM job completion: ${jobs.map(job => job.id).join(",")}` : `GitHub complete job census: no native job was assigned/started, run ${run.id}`, observedAt: now };
        current.attempt.status = "failed";
      }
      const admissionFailure = neverStarted && attempt.lane === "local";
      current.intent.state = admissionFailure ? "pending" : "repairing";
      current.intent.nextAction = admissionFailure ? "dispatch-hosted" : "run-repair-agent"; current.intent.nextCheckAt = now;
      if (!admissionFailure) repairWork(state, intentId, [reason, `https://github.com/${this.config.repository}/actions/runs/${run.id}`, ...(!neverStarted && !hostedEnded ? ["Host-side owned process/VM termination evidence is required before replacement"] : [])], now);
      return { reason, neverStarted, hostedEnded };
    });
  }
  private async reconcileUpload(intentId: string, attempt: Attempt, run: WorkflowRun, now: string): Promise<void> {
    const state = (await this.store.read()).state, intent = state.intents[intentId]!, provider = await this.apple.observe(attempt, intent.groupId, now);
    const observation = provider.observation;
    await this.store.transact(`upload-observation-${attempt.id}-${Math.floor(Date.parse(now) / 300_000)}`, "observe-upload-and-build", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.uploadObservations ??= []; current.attempt.uploadObservations.push({ at: now, uploadState: provider.uploadState, buildId: observation?.buildId, processingState: observation?.processingState, diagnostics: provider.diagnostics }); current.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { buildId: observation?.buildId, uploadState: provider.uploadState }; });
    if (["FAILED", "INVALID"].includes(provider.uploadState ?? "") || observation && ["FAILED", "INVALID"].includes(observation.processingState)) {
      await this.store.transact(`provider-rejected-${attempt.id}`, "provider-rejection", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.upload!.outcome = "rejected"; current.attempt.upload!.diagnostics = provider.diagnostics; current.attempt.status = "failed"; repairWork(next, intentId, [`Apple rejected ${attempt.appId}/${attempt.version}/${attempt.buildNumber}`, provider.diagnostics ?? "No additional diagnostics"], now); return { uploadState: provider.uploadState, processingState: observation?.processingState }; }); return;
    }
    if (observation) {
      await this.store.transact(`provider-visible-${attempt.id}-${hash(observation).slice(0, 20)}`, "exact-build-observation", now, next => { const current = attemptAt(next, intentId, attempt.id); current.attempt.observation = observation; current.attempt.upload!.acceptedAt ??= now; current.attempt.upload!.outcome = "accepted"; current.intent.state = "processing"; current.intent.nextAction = "verify-internal-distribution"; current.intent.nextCheckAt = after(now, this.config.deadlines.pollMinutes); return { buildId: observation.buildId, processingState: observation.processingState }; });
      if (observation.processingState !== "VALID") { await this.processingDiagnosis(intentId, attempt, now, "Apple processing has not reached VALID"); return; }
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
        await this.store.transact(`retire-${attempt.id}`, "retire-uncertain-upload", now, next => { const current = attemptAt(next, intentId, attempt.id); invariant(current.attempt.quiescence, "Quiescence evidence disappeared"); current.attempt.status = "retired-uncertain"; current.intent.state = "pending"; current.intent.nextAction = "dispatch-full-tests"; current.intent.nextCheckAt = now; return { burnedBuild: attempt.buildNumber, monitorLateAppearance: true }; });
      } else await this.processingDiagnosis(intentId, attempt, now, `Upload/build absent after bounded observation; executor ${run.id} requires confirmed host/provider quiescence before replacement`);
    }
  }
  private async processingDiagnosis(intentId: string, attempt: Attempt, now: string, reason: string): Promise<void> {
    if (Date.parse(now) - Date.parse(attempt.upload!.acceptedAt ?? attempt.upload!.claimedAt) < this.config.deadlines.appleObservationMinutes * 60_000) return;
    await this.store.transact(`apple-diagnosis-${attempt.id}`, "processing-diagnosis", now, state => { repairWork(state, intentId, [reason, `Exact identity ${attempt.appId}/${attempt.version}/${attempt.buildNumber}, upload ${attempt.upload!.providerUploadId ?? "unknown"}. Do not reupload accepted or uncertain bytes.`], now); return { reason }; });
  }
}
