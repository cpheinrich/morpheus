import { type GitHubApi } from "./github.js";
import { type HostConfig } from "./schema.js";
export interface SchedulerDeps {
    env?: NodeJS.ProcessEnv;
    github?: (token: string, env: NodeJS.ProcessEnv) => GitHubApi;
    ghToken?: (account: string, env: NodeJS.ProcessEnv) => Promise<string>;
    now?: () => Date;
    log?: (line: string) => void;
}
export declare function loadHostConfig(path: string): Promise<{
    config: HostConfig;
    statusPath: string;
}>;
/**
 * An explicit `githubAccount` asks the GitHub CLI for that account's token, with any ambient
 * token removed so it cannot answer instead; otherwise an explicitly supplied GH_TOKEN (the
 * GitHub-hosted backup). The token stays in this process: it is never printed or written.
 */
export declare function resolveToken(config: HostConfig, deps: SchedulerDeps): Promise<string>;
export declare function runScheduler(argv: string[], deps?: SchedulerDeps): Promise<number>;
