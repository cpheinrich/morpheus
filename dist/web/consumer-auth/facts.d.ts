import type { EnvironmentFacts, WorkloadIdentityFacts } from "./context.js";
/**
 * Read both environments' Firebase facts back out of a generated
 * `lib/firebase/config.ts`.
 *
 * The single-environment reader in `survey.ts` matches the *first* occurrence
 * of each key, which on the two-environment consumer config is the production
 * block — correct for production, silent about staging. This one is
 * block-scoped: each set of keys is read from inside its own `*_CONFIG`
 * object, so the two cannot be crossed.
 *
 * Parsed rather than imported, for `survey.ts`'s reason: the file is
 * TypeScript, and evaluating a repository's code to answer a question about it
 * is a much larger thing to do than matching the keys we generated. Any
 * missing key returns null for that environment, so a hand-edited config is
 * treated as unknown rather than half-understood.
 */
export interface TwoEnvFacts {
    production: EnvironmentFacts | null;
    staging: EnvironmentFacts | null;
    workloadIdentity: WorkloadIdentityFacts | null;
}
export declare function parseTwoEnvFacts(source: string): TwoEnvFacts;
export declare function readTwoEnvFacts(root: string, webRoot: string): Promise<TwoEnvFacts>;
