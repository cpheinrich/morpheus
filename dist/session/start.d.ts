import { type Lag, type RescueDeps, type RescueResult } from "./trunk-rescue.js";
export declare const sessionGit: (root: string, args: string[]) => Promise<string>;
export declare function checkoutIdentity(cwd: string): Promise<{
    root: string;
    common: string;
    linked: boolean;
}>;
export interface SourceState {
    root: string;
    sha: string;
    trunk: string;
    branch: string;
    task?: string;
    behind: number;
    advanced: boolean;
    /** How far behind, and since when, after any fast-forward. */
    lag: Lag;
    /** What happened to tracked edits on the trunk branch. */
    rescue?: RescueResult;
    /** Why a fast-forward that should have happened did not. */
    fastForwardError?: string;
}
/** Fetch into a private ref so concurrent sessions cannot replace FETCH_HEAD. */
export declare function fetchTrunk(root: string): Promise<{
    sha: string;
    trunk: string;
    branch: string;
}>;
/**
 * Startup does not allocate a task. Only an exactly named local trunk may
 * fast-forward. Feature branches and detached work stay untouched, with the
 * missing commits reported instead of called current. Tracked edits on the
 * trunk branch are first moved to a pushed WIP branch and draft PR (see
 * `trunk-rescue.ts`); untracked files stay, and Git's own `--ff-only` refuses
 * when one would be overwritten. `rescueDeps: false` disables the rescue.
 */
export declare function prepareRepository(cwd: string, offline?: boolean, rescueDeps?: RescueDeps | false): Promise<SourceState>;
/** Local proof used even inside a receipt's term, including same-branch resets. */
export declare function containsSource(root: string, sha: string): Promise<boolean>;
/** Source freshness is independent of a receipt's local fingerprints. */
export declare function assertCurrentSource(root: string): Promise<string>;
export interface SessionStartInput {
    sessionId?: string;
    source?: string;
}
export declare function parseSessionInput(raw: string, threadId?: string): SessionStartInput;
export declare const sessionKey: (id: string) => string;
