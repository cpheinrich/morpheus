import { type DispatchMemory, type Mode } from "./core.js";
import { type GitHubApi } from "./github.js";
import { type HostConfig } from "./schema.js";
export type Outcome = "idle" | "accepted" | "waiting" | "planned" | "dispatched" | "uncertain" | "skipped" | "error";
export interface ScheduleStatus {
    id: string;
    workflow: string;
    /** The desired slot this tick judged, or null before the first slot since activation. */
    dueAt: string | null;
    outcome: Outcome;
    reason?: string;
    runId?: number;
    runUrl?: string;
    error?: string;
    /** The primary's own last submission, carried between ticks so a slow history cannot cause a repeat. */
    lastDispatch?: DispatchMemory;
}
export interface RepositoryStatus {
    repository: string;
    ok: boolean;
    defaultBranch?: string;
    activatedAt?: string;
    error?: string;
    schedules: ScheduleStatus[];
}
export interface SchedulerStatus {
    schemaVersion: 1;
    instanceId: string;
    schedulerVersion: string;
    mode: Mode;
    dryRun: boolean;
    observedAt: string;
    tick: {
        startedAt: string;
        finishedAt: string;
    };
    ok: boolean;
    errors: number;
    repositories: RepositoryStatus[];
}
export interface TickOptions {
    config: HostConfig;
    github: GitHubApi;
    mode: Mode;
    dryRun: boolean;
    previous?: SchedulerStatus | null;
    now?: () => Date;
}
export declare function tick(options: TickOptions): Promise<SchedulerStatus>;
/**
 * The top-level `run-name` value, including a folded (`>-`) or literal (`|`) block's indented
 * lines. Only a containment heuristic for the suffix, so no YAML parser: a flow scalar is its one
 * line, a block scalar runs until the next unindented line.
 */
export declare function runNameOf(source: string): string | null;
export declare function readStatus(path: string): Promise<SchedulerStatus | null>;
/** Write-then-rename, so a reader never sees half a status file. */
export declare function writeStatus(path: string, status: SchedulerStatus): Promise<void>;
/** Who holds a lock: a PID is only an owner within one boot and one process incarnation. */
export interface LockOwner {
    pid: number;
    bootAt: number;
    startedAt: number;
}
export interface OwnerProbe {
    bootAt(): number;
    alive(pid: number): boolean;
    /** When the process now holding `pid` started, or null when that cannot be read. */
    startedAt(pid: number): number | null;
}
/** True unless the OS says no such process; EPERM means it exists under another user. */
export declare function processAlive(pid: number): boolean;
/** POSIX `ps -o etime` elapsed time, `[[dd-]hh:]mm:ss`, in milliseconds. */
export declare function parseElapsed(text: string): number | null;
export declare const systemProbe: OwnerProbe;
/**
 * Whether the lock's recorded owner is still running. A different boot, a dead PID, or a PID now
 * held by a process that started at another time are all a gone owner, so a lock left by a
 * shutdown is recovered even when the PID has been reused. When the start time cannot be read the
 * PID alone decides, which can only refuse a stale lock, never overlap a live one.
 */
export declare function ownerRunning(owner: LockOwner, probe: OwnerProbe): boolean;
/**
 * One tick per status file. launchd never overlaps its own job, but a manual tick could, and two
 * ticks racing would both read an empty history and dispatch twice. A tick has no overall time
 * bound (paginated reads, per-request timeouts), so age never frees an owned lock: it is taken
 * over only when its recorded owner is gone (see `ownerRunning`). Two contenders recovering the
 * same dead lock at the same instant can both proceed; that narrow race is accepted, and the
 * receivers' admission guard absorbs a duplicate it causes.
 */
export declare function withLock<T>(statusPath: string, body: () => Promise<T>, probe?: OwnerProbe): Promise<T>;
export interface Health {
    healthy: boolean;
    reasons: string[];
}
/** Fresh means a tick finished recently enough for its cadence; it says nothing of the jobs' own success. */
export declare function health(status: SchedulerStatus | null, now: Date): Health;
