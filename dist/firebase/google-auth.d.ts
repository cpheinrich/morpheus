export interface CommandResult {
    stdout: string;
    stderr: string;
}
export interface CommandOptions {
    timeoutMs?: number;
}
/** Injectable boundary so setup behaviour is covered without a live cloud account. */
export type CommandRunner = (command: string, args: string[], cwd: string, options?: CommandOptions) => Promise<CommandResult>;
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
export interface GoogleAuthConfigInput {
    project: string;
    /** Public app origin or hostname, for example `https://example.com`. */
    domain?: string;
    supportEmail: string;
    brand: string;
}
export interface GoogleAuthSetupOptions {
    root: string;
    project: string;
    domain?: string;
    /** Additional intentional Firebase Auth hostnames declared by the project. */
    authorizedDomains?: string[];
    supportEmail?: string;
    brand: string;
    /** Defaults to true. Opens Firebase's console only when recovery is needed. */
    openBrowser?: boolean;
    runner?: CommandRunner;
    fetcher?: Fetcher;
}
export interface GoogleAuthCheckOptions {
    root: string;
    project: string;
    domain?: string;
    /** Additional intentional Firebase Auth hostnames declared by the project. */
    authorizedDomains?: string[];
    runner?: CommandRunner;
    fetcher?: Fetcher;
}
export interface GoogleAuthCheck {
    project: string;
    googleEnabled: boolean;
    authorizedDomains: string[];
    expectedDomains: string[];
    missingDomains: string[];
    /** Authorized remotely but no longer required by the current manifest. */
    unexpectedDomains: string[];
    ready: boolean;
}
export interface GoogleAuthSetupResult extends GoogleAuthCheck {
    configPath: string;
    supportEmail: string;
}
type Json = Record<string, unknown>;
/** Turn a hostname or bare origin into a stable, deployable HTTP(S) origin. */
export declare function normalizeOrigin(value: string): string;
/** Domains Firebase Auth must recognize before a web app can return from Google. */
export declare function expectedAuthorizedDomains(project: string, domain?: string, additionalDomains?: string[]): string[];
/**
 * Origins Firebase's Google-provider configuration should carry as code.
 *
 * **The project's own `firebaseapp.com` and `web.app` origins are deliberately
 * absent, and so is localhost.** Firebase derives the OAuth client's redirect
 * handlers from this list *and* adds its own default, so naming the default
 * fails the deploy with `OAuth 2 redirect URLs have duplicate
 * [https://<project>.firebaseapp.com/__/auth/handler]`; and it derives an
 * authorized *domain* from each entry, so anything carrying a port fails with
 * `INVALID_AUTHORIZED_DOMAIN : localhost:3000 should only contain the valid
 * domain`.
 *
 * Local development is not lost with it: `localhost` reaches Auth through
 * {@link expectedAuthorizedDomains}, which is a different list on a different
 * API and is where a host without a scheme or port belongs.
 *
 * All three facts were found the first time this ran against a freshly created
 * project (`cph-evo`, 2026-08-13). The previous list was written from the
 * documentation and had only ever run against projects whose provider was
 * already configured by hand, where the deploy is a no-op.
 */
export declare function expectedRedirectUris(_project: string, domain?: string): string[];
export declare function mergeGoogleProviderConfig(existing: Json, input: GoogleAuthConfigInput): Json;
export declare function writeGoogleProviderConfig(root: string, input: GoogleAuthConfigInput): Promise<string>;
/**
 * Configure Google Auth as deployable Firebase configuration, then prove the
 * remote provider and app domains agree. Both CLIs receive one automatic,
 * browser-backed login attempt before we ask a human to intervene.
 */
export declare function setupGoogleAuth(opts: GoogleAuthSetupOptions): Promise<GoogleAuthSetupResult>;
/** Read-only verification for CI and for agents deciding whether setup is needed. */
export declare function checkGoogleAuth(opts: GoogleAuthCheckOptions): Promise<GoogleAuthCheck>;
export {};
