export declare const repairTokenPermissions: {
    contents: string;
    pull_requests: string;
    issues: string;
    actions: string;
    workflows: string;
    checks: string;
    statuses: string;
};
export declare function probeGitHubToken(environment: NodeJS.ProcessEnv, fetcher?: typeof fetch): Promise<unknown>;
/** Mirrors the official Claude action OIDC exchange, scoped to this Actions workflow. */
export declare function githubToken(environment: NodeJS.ProcessEnv, revoke?: boolean, fetcher?: typeof fetch): Promise<unknown>;
