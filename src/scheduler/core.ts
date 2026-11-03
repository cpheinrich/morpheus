import { Cron } from "croner";
import type { Schedule } from "./schema.js";

/** The backup dispatches only once a slot has gone this long without any acceptance. */
export const BACKUP_GRACE_MS = 30 * 60_000;
/** After a lost dispatch response, wait this long for the run to appear before resubmitting. */
export const VISIBILITY_GRACE_MS = 5 * 60_000;
/** History reads start this far before the slot, tolerating a dispatcher clock ahead of GitHub's. */
export const HISTORY_SKEW_MS = 60 * 60_000;

/** Canonical UTC instant, second precision: `2026-11-03T08:00:00Z`. */
export function instant(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Parses only the canonical form, so one occurrence has exactly one spelling. */
export function parseInstant(text: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(text)) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) || instant(date) !== text ? null : date;
}

/** The suffix a receiver's `run-name` must append, and the only identity history is read by. */
export function runNameSuffix(id: string, scheduledFor: string): string {
  return ` [schedule:${id}:${scheduledFor}]`;
}

export function parseRunIdentity(title: string): { id: string; scheduledFor: string } | null {
  const match = / \[schedule:([a-z0-9-]{1,64}):(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\]$/.exec(title);
  return match ? { id: match[1]!, scheduledFor: match[2]! } : null;
}

/** The most recent occurrence at or before `at` — inclusive, unlike Croner's `previousRuns`. */
export function slotAtOrBefore(schedule: Pick<Schedule, "cron" | "timezone">, at: Date): Date | null {
  const cron = new Cron(schedule.cron, { paused: true, mode: "5-part", timezone: schedule.timezone });
  const reference = new Date(Math.floor(at.getTime() / 1000) * 1000 + 1000);
  return cron.previousRuns(1, reference)[0] ?? null;
}

export type Mode = "primary" | "backup";

export interface DispatchMemory {
  scheduledFor: string;
  at: string;
  uncertain: boolean;
  runId?: number;
  runUrl?: string;
}

export interface PlanInput {
  schedule: Pick<Schedule, "cron" | "timezone">;
  now: Date;
  mode: Mode;
  /** Commit time of the registry file: slots before it are never replayed. */
  activatedAt: Date;
}

/**
 * Which slot is due, and from which slot on history must be read. The primary only ever looks at
 * the latest slot. The backup looks back to the newest slot already past grace: if neither it nor
 * anything newer was accepted, the primary is not running, and the latest slot is dispatched.
 * Probing from the past-grace slot rather than the latest one is what keeps a schedule whose
 * cadence is shorter than the grace from hiding a dead primary forever.
 */
export function window(input: PlanInput): { dueAt: Date; probeAt: Date } | null {
  const due = slotAtOrBefore(input.schedule, input.now);
  if (!due || due < input.activatedAt) return null;
  if (input.mode === "primary") return { dueAt: due, probeAt: due };
  const overdue = slotAtOrBefore(input.schedule, new Date(input.now.getTime() - BACKUP_GRACE_MS));
  if (!overdue || overdue < input.activatedAt) return null;
  return { dueAt: due, probeAt: overdue };
}

export type Decision =
  | { action: "accepted"; runId?: number; runUrl?: string }
  | { action: "wait"; reason: string }
  | { action: "dispatch" };

/**
 * `accepted` holds the scheduled-for instants of every visible run of this schedule created since
 * the probe slot. Any run counts, whatever its conclusion: a failed workflow spent its occurrence.
 */
export function decide(
  mode: Mode,
  due: { dueAt: Date; probeAt: Date },
  accepted: Map<string, { runId: number; runUrl: string }>,
  memory: DispatchMemory | undefined,
  now: Date,
): Decision {
  const dueAt = instant(due.dueAt);
  const seen = accepted.get(dueAt);
  if (seen) return { action: "accepted", ...seen };
  if (mode === "backup") {
    const newer = [...accepted.keys()].some(at => new Date(at) >= due.probeAt);
    return newer ? { action: "wait", reason: "the primary is accepting occurrences" } : { action: "dispatch" };
  }
  if (memory?.scheduledFor === dueAt) {
    if (!memory.uncertain) return { action: "accepted", runId: memory.runId, runUrl: memory.runUrl };
    if (now.getTime() - new Date(memory.at).getTime() < VISIBILITY_GRACE_MS) {
      return { action: "wait", reason: "an earlier dispatch response was lost; waiting for its run to appear" };
    }
  }
  return { action: "dispatch" };
}
