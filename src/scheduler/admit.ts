import { HISTORY_SKEW_MS, parseInstant, runNameSuffix } from "./core.js";
import type { GitHubApi, Job } from "./github.js";
import { scheduleId } from "./schema.js";

/** The receiver's conventional name for the step that runs this guard. It succeeds for duplicates too. */
export const GUARD_STEP = "Scheduler admission";
/**
 * The no-op step a receiver runs only when this guard admits. A successful step of this name in
 * another run, or an earlier attempt of this one, is what consumes an occurrence: a duplicate that
 * was queued and cancelled, or that the guard turned away (its marker skipped), never produced one.
 * The guard step's own success proves nothing, so it is never read.
 */
export const ADMISSION_STEP = "Scheduler occurrence admitted";

export interface AdmitInput {
  schedulerId: string;
  scheduledFor: string;
  repository: string;
  runId: number;
  runAttempt: number;
}

export type Admission =
  | { admitted: true; reason: string }
  | { admitted: false; reason: string; duplicateOf: number };

/** Throws on anything malformed or unreadable; a guard that cannot decide must not admit. */
export async function admit(input: AdmitInput, github: GitHubApi | null): Promise<Admission> {
  const { schedulerId, scheduledFor } = input;
  // Admission only deduplicates scheduled occurrences; the receiver's own eligibility checks still apply.
  if (!schedulerId && !scheduledFor) return { admitted: true, reason: "manual run without scheduler inputs" };
  if (!schedulerId || !scheduledFor) throw new Error("scheduler-id and scheduled-for must be supplied together");
  if (!github) throw new Error("admitting a scheduled occurrence needs GitHub access");
  if (!scheduleId.safeParse(schedulerId).success) throw new Error(`invalid scheduler-id ${JSON.stringify(schedulerId.slice(0, 80))}`);
  const slot = parseInstant(scheduledFor);
  if (!slot) throw new Error(`scheduled-for must be a UTC instant like 2026-11-03T08:00:00Z`);

  const current = await github.run(input.repository, input.runId);
  const suffix = runNameSuffix(schedulerId, scheduledFor);
  if (!current.display_title.endsWith(suffix)) {
    throw new Error(`this run's name does not end with "${suffix}"; set the workflow's run-name from the scheduler inputs`);
  }
  if (typeof current.workflow_id !== "number") throw new Error("this run reports no workflow id");

  for (const job of await github.jobs(input.repository, input.runId)) {
    const attempt = job.run_attempt ?? 1;
    // The step running now is this guard. Named like the marker, every duplicate would mint one.
    if (attempt === input.runAttempt && job.steps?.some(s => s.name === ADMISSION_STEP && s.status === "in_progress")) {
      throw new Error(`name the guard step "${GUARD_STEP}"; "${ADMISSION_STEP}" is reserved for the step it gates`);
    }
    if (attempt < input.runAttempt && admitted(job)) {
      return { admitted: false, reason: "an earlier attempt of this run was admitted", duplicateOf: input.runId };
    }
  }
  const since = new Date(slot.getTime() - HISTORY_SKEW_MS);
  for (const run of await github.runs(input.repository, current.workflow_id, since)) {
    if (run.id === input.runId || !run.display_title.endsWith(suffix)) continue;
    if ((await github.jobs(input.repository, run.id)).some(admitted)) {
      return { admitted: false, reason: `run ${run.id} was already admitted for this occurrence`, duplicateOf: run.id };
    }
  }
  return { admitted: true, reason: "first admission for this occurrence" };
}

function admitted(job: Job): boolean {
  return (job.steps ?? []).some(step => step.name === ADMISSION_STEP && step.conclusion === "success");
}
