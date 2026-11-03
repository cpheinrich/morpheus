import type { GitHubApi } from "./github.js";
/**
 * The step name a receiver gives the no-op step that runs only when this guard admits. A
 * successful step of this name in another run, or an earlier attempt of this one, is what consumes
 * an occurrence: a duplicate that was queued and cancelled, or that the guard turned away, never
 * produced one.
 */
export declare const ADMISSION_STEP = "Scheduler admission";
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
