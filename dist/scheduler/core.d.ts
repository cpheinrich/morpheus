import type { Schedule } from "./schema.js";
/** The backup dispatches only once a slot has gone this long without any acceptance. */
export declare const BACKUP_GRACE_MS: number;
/** After a lost dispatch response, wait this long for the run to appear before resubmitting. */
export declare const VISIBILITY_GRACE_MS: number;
/** History reads start this far before the slot, tolerating a dispatcher clock ahead of GitHub's. */
export declare const HISTORY_SKEW_MS: number;
/** Canonical UTC instant, second precision: `2026-11-03T08:00:00Z`. */
export declare function instant(date: Date): string;
/** Parses only the canonical form, so one occurrence has exactly one spelling. */
export declare function parseInstant(text: string): Date | null;
/** The suffix a receiver's `run-name` must append, and the only identity history is read by. */
export declare function runNameSuffix(id: string, scheduledFor: string): string;
export declare function parseRunIdentity(title: string): {
    id: string;
    scheduledFor: string;
} | null;
/** The most recent occurrence at or before `at` — inclusive, unlike Croner's `previousRuns`. */
export declare function slotAtOrBefore(schedule: Pick<Schedule, "cron" | "timezone">, at: Date): Date | null;
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
export declare function window(input: PlanInput): {
    dueAt: Date;
    probeAt: Date;
} | null;
export type Decision = {
    action: "accepted";
    runId?: number;
    runUrl?: string;
} | {
    action: "wait";
    reason: string;
} | {
    action: "dispatch";
};
/**
 * `accepted` holds the scheduled-for instants of every visible run of this schedule created since
 * the probe slot. Any run counts, whatever its conclusion: a failed workflow spent its occurrence.
 */
export declare function decide(mode: Mode, due: {
    dueAt: Date;
    probeAt: Date;
}, accepted: Map<string, {
    runId: number;
    runUrl: string;
}>, memory: DispatchMemory | undefined, now: Date): Decision;
