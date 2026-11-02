import { type Check, type Verdict } from "./checks.js";
import type { TrimmedLog } from "./logs.js";
import type { RunSnapshot } from "./runs.js";
/** What one failed check contributes beyond its line: its log, or why there is none. */
export interface FailureDetail {
    log?: TrimmedLog;
    logError?: string;
    labelRace?: boolean;
}
export interface DigestInput {
    repo: string;
    pr: number;
    headSha: string;
    verdict: Verdict;
    checks: Check[];
    elapsedMs: number;
    /** Deadline reached before every check finished. */
    timedOut: boolean;
    /** The visible checks passed, but current-head workflow runs remain unverified. */
    pendingWorkflows?: boolean;
    /** Keyed by {@link checkKey}. */
    details: Map<string, FailureDetail>;
    /** Earlier heads seen during the wait, oldest first. */
    movedFrom: string[];
    requiredOnly: boolean;
    truncated: boolean;
    /** Checks dropped by `--required-only`, so an empty required set is not mistaken for no CI. */
    ignored: number;
}
/**
 * The whole output of a wait: one line when green, and otherwise only what an
 * agent acts on — which check, where, and the failing step's own words.
 */
export declare function renderDigest(input: DigestInput): string;
export interface RunDigestInput {
    /** The run the verdict is about; absent when nothing matched. */
    run?: RunSnapshot;
    /** `owner/name`, from `--repo` or the run's URL. */
    repo?: string;
    verdict: Verdict;
    jobs: Check[];
    elapsedMs: number;
    /** Deadline reached before the run completed. */
    timedOut: boolean;
    /** Keyed by {@link checkKey}. */
    details: Map<string, FailureDetail>;
    /** Earlier matching runs replaced by a newer one during the wait, oldest first. */
    movedFrom: number[];
    /** `--workflow` without `--sha` found only a run that had already finished: it may not be the one expected. */
    alreadyComplete: boolean;
    /** Why the job list is missing, when the final read failed. */
    jobsError?: string;
    /** What was asked for, for the no-match line: `ci.yml on main`. */
    wanted: string;
}
/**
 * The whole output of a run wait, in the pull-request digest's shape: one line
 * when green, and otherwise which job, where, and the failing step's words.
 */
export declare function renderRunDigest(input: RunDigestInput): string;
