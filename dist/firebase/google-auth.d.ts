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
    runner?: CommandRunner;
    fetcher?: Fetcher;
}
export interface GoogleAuthCheck {
    project: string;
    googleEnabled: boolean;
    authorizedDomains: string[];
    expectedDomains: string[];
    missingDomains: string[];
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
export declare function expectedAuthorizedDomains(project: string, domain?: string): string[];
/** Origins Firebase's Google-provider configuration should carry as code. */
export declare function expectedRedirectUris(project: string, domain?: string): string[];
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
