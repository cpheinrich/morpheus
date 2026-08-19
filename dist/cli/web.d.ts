export interface WebInitOptions {
    root: string;
    /** Firebase / GCP project id. Defaults to the manifest's. */
    project?: string;
    /** Public origin, e.g. `https://evo.med`. Defaults to the manifest's. */
    domain?: string;
    /** Google account to provision as. */
    account?: string;
    /** GCP organisation id for a project this run creates. */
    organization?: string;
    /** Vercel team slug. Defaults to `accounts.vercel`. */
    vercelTeam?: string;
    provision: boolean;
    waitlist: boolean;
    hq: boolean;
    openBrowser: boolean;
}
export declare function webInit(opts: WebInitOptions): Promise<number>;
/** What the web surface has, and what it does not. Read-only. */
export declare function webStatus(root: string): Promise<number>;
export interface AddConsumerAuthOptions {
    root: string;
    /** Staging Firebase / GCP project id. Defaults to the manifest's pair. */
    stagingProject?: string;
    /** Google account to provision the staging project as. */
    account?: string;
    provision: boolean;
    /** Report drift against the current templates instead of writing. */
    check: boolean;
}
/**
 * `morpheus web add-consumer-auth` — consumer accounts on the Morpheus stack
 * contract, extracted from Evo (cpheinrich/morpheus#135).
 *
 * Builds on `web init` the way Evo's consumer accounts built on its HQ auth:
 * the app, the shared package, the `@/` alias, the production Firebase project
 * and its Workload Identity are all assumed to exist, because `web init` (and
 * the console runbook) is where they come from. What this adds is the second
 * Firebase project's config, the auth plumbing, the consumer policy routes,
 * the starter surfaces, and the three test suites that hold it all.
 */
export declare function webAddConsumerAuth(opts: AddConsumerAuthOptions): Promise<number>;
