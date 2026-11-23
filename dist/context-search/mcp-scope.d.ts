export declare function contextMcpSession(metadata: unknown, env?: NodeJS.ProcessEnv): string | undefined;
/** Explicit reads do not rebind the session; implicit reads retain the existing binding. */
export declare function contextMcpScope(cwd: string, session?: string, worktree?: string): Promise<{
    root: string;
    session: string | undefined;
    task: string | undefined;
    config: import("./rollout.js").SearchConfig;
}>;
