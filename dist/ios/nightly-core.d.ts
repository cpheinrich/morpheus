/**
 * The host-side nightly TestFlight admission core, shared by every app whose
 * release is dispatched from the Mac mini.
 *
 * Two questions, answered from GitHub's own records rather than from memory:
 *
 *   1. May an automated release start now? At most one per local calendar day,
 *      whatever happened to it, and never while a previous upload's fate is
 *      unknown. The reservation is written *before* dispatch, so a timeout, a
 *      crash or a lost response never buys a second attempt.
 *   2. What did the last release actually upload? Judged from the upload step
 *      inside each attempt, not from a run's overall conclusion: a failed rerun
 *      must not hide a build an earlier attempt already sent to App Store
 *      Connect, and a step that started and did not finish may have sent one.
 *
 * Deliberately self-contained, with no imports at all. It runs from a pinned
 * copy in each app's host runtime, where no `node_modules` is reachable, so
 * `morpheus ios nightly-core --write <file>` vendors the compiled module and
 * records the version it came from. Notification delivery, incident hooks, the
 * installer and each app's names and time window belong to the app's adapter.
 *
 * Extracted from darwin-health/evo #307 and #309 without changing behaviour.
 */
export interface Step {
    name: string;
    conclusion: string | null;
    started_at?: string | null;
    completed_at?: string | null;
}
export interface Job {
    name: string;
    conclusion: string | null;
    run_attempt?: number;
    completed_at?: string | null;
    steps?: Step[];
}
export interface Run {
    id: number;
    run_attempt: number;
    created_at: string;
    updated_at: string;
    head_sha: string;
    status: string;
    conclusion: string | null;
    display_title?: string;
}
/** The job that uploads, and the one step inside it that reaches App Store Connect. */
export interface UploadNames {
    job: string;
    step: string;
}
export type UploadState = "uploaded" | "uncertain" | "none";
export interface Upload<R extends Run = Run> {
    state: Exclude<UploadState, "none">;
    attempt: number;
    at: string | null;
    run: R;
    time: number;
}
export interface AdmissionConfig {
    /** IANA zone whose calendar day bounds one automated release. */
    zone: string;
    /** Local minutes after midnight: admission opens at `start`, closes before `end`. */
    window: {
        start: number;
        end: number;
    };
    /** The run title the release workflow gives an automated dispatch for `nonce`. */
    title: (nonce: string) => string;
}
export interface DayEntry {
    status: "observed" | "no-changes" | "reserved" | "dispatched";
    run?: number;
    sha?: string;
    nonce?: string;
    baseline?: string;
    at?: string;
    actualSha?: string;
}
export interface State {
    version: 1;
    activatedAt: string;
    days: Record<string, DayEntry>;
    notifications: Record<string, unknown>;
    health: string;
}
/** What the admission decision needs from the outside world. */
export interface AdmissionDeps<R extends Run = Run> {
    /** An open incident that owns the release lane; optional for apps without one. */
    hasIncident?: () => Promise<boolean>;
    main: () => Promise<string>;
    lastUpload: (runs: R[]) => Promise<(R & {
        head_sha: string;
    }) | null>;
    uncertainUpload: (runs: R[]) => Promise<Upload<R> | null>;
    changes: (base: string | undefined, head: string) => Promise<{
        changed: boolean;
    }>;
    dispatch: (nonce: string) => Promise<unknown>;
}
export declare function localTime(value: string | number | Date, zone: string): {
    day: string;
    minute: number;
};
export declare function initialState(now: string): State;
/**
 * What one attempt's jobs say about an App Store Connect upload: `uploaded`
 * when the upload step completed successfully, `uncertain` when it ran and did
 * not, and `none` when a pre-upload gate left it skipped or absent.
 */
export declare function uploadOutcome(jobs: Job[], names: UploadNames): {
    state: UploadState;
    at?: string | null;
};
/** Every attempt of one run, not just the latest. `jobs` must cover all attempts. */
export declare function uploadsOf<R extends Run>(run: R, jobs: Job[], names: UploadNames): Upload<R>[];
/**
 * Upload evidence across runs, oldest first, ordered by when the upload itself
 * completed rather than by a run's overall conclusion or `updated_at`.
 */
export declare function uploadEvidence<R extends Run>(runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames, before?: number): Promise<Upload<R>[]>;
export declare function lastUpload<R extends Run>(runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames, before?: number): Promise<(R & {
    uploadedAt: string | null;
    uploadAttempt: number;
}) | null>;
/** An ambiguous upload newer than the last confirmed one; admission fails closed on it. */
export declare function uncertainUpload<R extends Run>(runs: R[], allJobs: (run: R) => Promise<Job[]>, names: UploadNames): Promise<Upload<R> | null>;
/**
 * Tie each reservation to the run GitHub created for it. The daily identity
 * survives main changing between reading its SHA and GitHub accepting the
 * dispatch; the workflow's exact-main preflight verifies the SHA it chose.
 */
export declare function reconcile<R extends Run>(state: State, runs: R[], now: string, config: AdmissionConfig): void;
/** One automated reservation per local day, even on failure. */
export declare function schedule<R extends Run>({ state, now, runs, config, deps, save }: {
    state: State;
    now: string;
    runs: R[];
    config: AdmissionConfig;
    deps: AdmissionDeps<R>;
    save: () => void;
}): Promise<void>;
/**
 * The scheduling half of one controller cycle. Apps run their own reporting
 * beside it, independently, so a failed notification cannot consume or repeat
 * a release and a scheduling error cannot silence a finished run's report.
 */
export declare function admit<R extends Run>({ state, now, runs, config, deps, save }: {
    state: State;
    now: string;
    runs: R[];
    config: AdmissionConfig;
    deps: AdmissionDeps<R>;
    save: () => void;
}): Promise<void>;
