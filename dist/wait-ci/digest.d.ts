import { type Check, type Verdict } from "./checks.js";
import type { TrimmedLog } from "./logs.js";
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
    /** Keyed by {@link checkKey}. */
    details: Map<string, FailureDetail>;
    /** Earlier heads seen during the wait, oldest first. */
    movedFrom: string[];
    requiredOnly: boolean;
    truncated: boolean;
    /** Checks dropped by `--required-only`, so an empty required set is not mistaken for no CI. */
    ignored: number;
}
/** Checks are unique by name after {@link dedupe}, so the name is the key. */
export declare function checkKey(check: Check): string;
/**
 * The whole output of a wait: one line when green, and otherwise only what an
 * agent acts on — which check, where, and the failing step's own words.
 */
export declare function renderDigest(input: DigestInput): string;
