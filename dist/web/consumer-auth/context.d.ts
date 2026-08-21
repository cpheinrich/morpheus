/**
 * Everything a consumer-auth template may vary on.
 *
 * The templates in this directory are Evo's working files with these values
 * lifted out (cpheinrich/morpheus#135). The context is deliberately flat and
 * string-typed: a template interpolates, it never computes, so anything that
 * needs deriving is derived once here — where it can be unit-tested — rather
 * than in nineteen template literals.
 */
import type { FirebaseFacts } from "../templates.js";
/** The SDK config of one Firebase web app — same shape `web init` reads. */
export interface EnvironmentFacts {
    projectId: string;
    apiKey: string;
    authDomain: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
}
export interface WorkloadIdentityFacts {
    poolId: string;
    providerId: string;
    serviceAccount: string;
}
export interface ConsumerAuthContext {
    /** Display name, e.g. `Evo`. Appears in copy and comments. */
    name: string;
    /** `EVO` — the wordmark fallback in generated headers and mail. */
    upper: string;
    /** `evo` — a lower-case identifier prefix, e.g. `evoActionLink`. */
    camel: string;
    /** `Evo` — identifier infix, e.g. `toEvoActionLink`, `isKnownEvoHost`. */
    pascal: string;
    /** `evo` — cookie names, storage keys, and the URL-parser sentinel host. */
    slug: string;
    /** `EVO` — environment-variable prefix, e.g. `EVO_MAIL_FROM`. */
    constName: string;
    /** Workspace package scope, e.g. `@evo` — the shared package is `@evo/shared`. */
    scope: string;
    /** Production host, no scheme: `evo.med`. */
    productionHost: string;
    /** Staging host, no scheme: `staging.evo.med`. */
    stagingHost: string;
    /** The same two, regex-escaped for the known-host allowlist. */
    productionHostPattern: string;
    stagingHostPattern: string;
    /** From the manifest; lands in `firebase.json`'s OAuth brand block. */
    supportEmail: string;
    production: EnvironmentFacts;
    staging: EnvironmentFacts;
    /** Production only: staging authenticates with a scoped key, deliberately. */
    workloadIdentity: WorkloadIdentityFacts;
    /**
     * Relative specifier from the app's `__tests__/` directory to the shared
     * user schema — the one import `node --test` resolves by path, because it
     * reads neither tsconfig paths nor the workspace alias.
     */
    sharedSchemaFromTests: string;
}
export interface BuildContextInput {
    /** Display name from the manifest, e.g. `Evo`. */
    name: string;
    /** Package name of `packages/shared`, e.g. `@evo/shared`. */
    sharedPackageName: string;
    /** `publicDomain` from the manifest — host or origin. */
    publicDomain: string;
    /** `stagingDomain` from the manifest — host or origin. */
    stagingDomain: string;
    supportEmail: string;
    production: EnvironmentFacts;
    staging: EnvironmentFacts;
    workloadIdentity: WorkloadIdentityFacts;
    /** The web app directory relative to the repo root, e.g. `apps/web`. */
    webRoot: string;
}
/** `Heinrich Money` → `heinrich-money`; also the identifier stem. */
export declare function slugOf(name: string): string;
/** `heinrich-money` → `heinrichMoney`. */
export declare function camelOf(name: string): string;
/** `heinrich-money` → `HeinrichMoney`. */
export declare function pascalOf(name: string): string;
/** `heinrich-money` → `HEINRICH_MONEY`. */
export declare function constOf(name: string): string;
/** Host with no scheme, port, or path — what the allowlist compares against. */
export declare function hostOf(domainOrOrigin: string): string;
/**
 * Escape a host for the KNOWN_HOST character-for-character alternation.
 *
 * Only `.` occurs in a hostname and means "any character" in a regex; a host
 * that slipped through unescaped would also match `evoxmed`, which is exactly
 * the lookalike the allowlist exists to refuse.
 */
export declare function hostPatternOf(host: string): string;
/**
 * Relative specifier from `<webRoot>/__tests__/` to the shared user schema.
 *
 * Computed rather than hardcoded because the app is not always at `apps/web` —
 * a root-level app is one directory shallower, and a wrong depth here is a
 * test suite that fails on its first import.
 */
export declare function sharedSchemaFromTests(webRoot: string): string;
export declare function buildContext(input: BuildContextInput): ConsumerAuthContext;
/** Narrow `web init`'s FirebaseFacts to the fields the templates interpolate. */
export declare function environmentFacts(facts: FirebaseFacts): EnvironmentFacts;
