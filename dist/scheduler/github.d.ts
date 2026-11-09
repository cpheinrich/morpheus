/**
 * The handful of GitHub REST reads and the one write the scheduler needs. Every failure throws:
 * an unreadable answer is never returned as an empty one, because an empty run history would
 * read as "never dispatched" and cause a duplicate. Error text carries the route and status,
 * never a header, so a token cannot reach a log.
 */
export declare class GitHubError extends Error {
    readonly status: number | null;
    /** True when the request may have taken effect: network failure, timeout or a 5xx. */
    readonly uncertain: boolean;
    constructor(message: string, status: number | null, 
    /** True when the request may have taken effect: network failure, timeout or a 5xx. */
    uncertain: boolean);
}
export interface Run {
    id: number;
    display_title: string;
    html_url: string;
    created_at: string;
    run_attempt?: number;
    workflow_id?: number;
}
export interface Job {
    id: number;
    run_attempt?: number;
    steps?: Array<{
        name: string;
        status: string;
        conclusion: string | null;
    }>;
}
export interface GitHubApi {
    defaultBranch(repo: string): Promise<string>;
    /** File text, or null for a definite 404 in a repository already shown to be readable. */
    file(repo: string, path: string, ref: string): Promise<string | null>;
    lastCommitAt(repo: string, path: string, ref: string): Promise<Date>;
    workflow(repo: string, file: string): Promise<{
        id: number;
        state: string;
    } | null>;
    runs(repo: string, workflow: string | number, since: Date): Promise<Run[]>;
    run(repo: string, runId: number): Promise<Run>;
    jobs(repo: string, runId: number): Promise<Job[]>;
    dispatch(repo: string, workflow: string, ref: string, inputs: Record<string, string | number | boolean>): Promise<{
        runId: number;
        runUrl: string;
    }>;
}
export declare function createGitHub(token: string, options?: {
    baseUrl?: string;
    timeoutMs?: number;
    fetch?: typeof fetch;
}): GitHubApi;
