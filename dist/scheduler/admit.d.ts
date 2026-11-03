import type { GitHubApi } from "./github.js";
/** The receiver's conventional name for the step that runs this guard. It succeeds for duplicates too. */
export declare const GUARD_STEP = "Scheduler admission";
/**
 * The no-op step a receiver runs only when this guard admits. A successful step of this name in
 * another run, or an earlier attempt of this one, is what consumes an occurrence: a duplicate that
 * was queued and cancelled, or that the guard turned away (its marker skipped), never produced one.
 * The guard step's own success proves nothing, so it is never read.
 */
export declare const ADMISSION_STEP = "Scheduler occurrence admitted";
export interface AdmitInput {
    schedulerId: string;
    scheduledFor: string;
    repository: string;
    runId: number;
    runAttempt: number;
}
export type Admission = {
    admitted: true;
    reason: string;
} | {
    admitted: false;
    reason: string;
    duplicateOf: number;
};
/** Throws on anything malformed or unreadable; a guard that cannot decide must not admit. */
export declare function admit(input: AdmitInput, github: GitHubApi | null): Promise<Admission>;
