export declare function contextMcpSession(metadata: unknown, env?: NodeJS.ProcessEnv): string | undefined;
/** The launch cwd is supplied by the host. Only a validated session binding may move its worktree. */
export declare function contextMcpScope(cwd: string, session?: string): Promise<{
    root: string;
    session: string | undefined;
    task: string | undefined;
    config: import("./rollout.js").SearchConfig;
}>;
