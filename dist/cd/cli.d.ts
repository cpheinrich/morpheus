import { type CdConfig, type Identity } from "./schema.js";
import { GitHubStore } from "./store.js";
import { ActionsAdapter } from "./actions.js";
export declare function environmentIdentity(environment: NodeJS.ProcessEnv): Identity;
export declare function verifyExecution(config: CdConfig, store: GitHubStore, actions: ActionsAdapter, sourceDir: string, identity: Identity, environment: NodeJS.ProcessEnv): Promise<unknown>;
/** Separate parsing preserves every CD-owned flag without changing the established global grammar. */
export declare function cd(argv: string[], environment?: NodeJS.ProcessEnv): Promise<number>;
