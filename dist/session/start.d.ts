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
}
/** Fetch into a private ref so concurrent sessions cannot replace FETCH_HEAD. */
export declare function fetchTrunk(root: string): Promise<{
    sha: string;
    trunk: string;
    branch: string;
}>;
/**
 * Startup does not allocate a task. Only an exactly named, clean local trunk
 * may fast-forward. Feature branches, detached work and dirty checkouts stay
 * untouched, with the missing commits reported instead of called current.
 */
export declare function prepareRepository(cwd: string, offline?: boolean): Promise<SourceState>;
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
