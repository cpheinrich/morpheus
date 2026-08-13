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
