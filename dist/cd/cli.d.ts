import { type CdConfig, type Identity } from "./schema.js";
import { GitHubStore } from "./store.js";
import { ActionsAdapter } from "./actions.js";
export declare function environmentIdentity(environment: NodeJS.ProcessEnv): Identity;
/** New native/archive authority, including exact replay, always checks current ownership. */
export declare function verifyExecution(config: CdConfig, store: GitHubStore, actions: ActionsAdapter, sourceDir: string, identity: Identity, environment: NodeJS.ProcessEnv): Promise<unknown>;
/** Identity/provenance observation only; never grants native execution or writes a verify claim. */
export declare function verifyExecutionProvenance(config: CdConfig, store: GitHubStore, actions: ActionsAdapter, sourceDir: string, identity: Identity, environment: NodeJS.ProcessEnv): Promise<{
    verified: true;
    intentId: string;
    attemptId: string;
}>;
/** Separate parsing preserves every CD-owned flag without changing the established global grammar. */
export declare function cd(argv: string[], environment?: NodeJS.ProcessEnv): Promise<number>;
