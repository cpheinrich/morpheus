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
export function slugOf(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `heinrich-money` → `heinrichMoney`. */
export function camelOf(name: string): string {
  const parts = slugOf(name).split("-").filter(Boolean);
  return parts
    .map((part, i) => (i === 0 ? part : part[0]!.toUpperCase() + part.slice(1)))
    .join("");
}

/** `heinrich-money` → `HeinrichMoney`. */
export function pascalOf(name: string): string {
  const camel = camelOf(name);
  return camel ? camel[0]!.toUpperCase() + camel.slice(1) : camel;
}

/** `heinrich-money` → `HEINRICH_MONEY`. */
export function constOf(name: string): string {
  return slugOf(name).replace(/-/g, "_").toUpperCase();
}

/** Host with no scheme, port, or path — what the allowlist compares against. */
export function hostOf(domainOrOrigin: string): string {
  const value = domainOrOrigin.trim();
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).host;
  } catch {
    return value;
  }
}

/**
 * Escape a host for the KNOWN_HOST character-for-character alternation.
 *
 * Only `.` occurs in a hostname and means "any character" in a regex; a host
 * that slipped through unescaped would also match `evoxmed`, which is exactly
 * the lookalike the allowlist exists to refuse.
 */
export function hostPatternOf(host: string): string {
  return host.replace(/\./g, "\\.");
}

/**
 * Relative specifier from `<webRoot>/__tests__/` to the shared user schema.
 *
 * Computed rather than hardcoded because the app is not always at `apps/web` —
 * a root-level app is one directory shallower, and a wrong depth here is a
 * test suite that fails on its first import.
 */
export function sharedSchemaFromTests(webRoot: string): string {
  const depth = webRoot === "." ? 1 : webRoot.split("/").length + 1;
  return `${"../".repeat(depth)}packages/shared/schema/user.ts`;
}

export function buildContext(input: BuildContextInput): ConsumerAuthContext {
  const slug = slugOf(input.name);
  const productionHost = hostOf(input.publicDomain);
  const stagingHost = hostOf(input.stagingDomain);

  return {
    name: input.name,
    upper: input.name.toUpperCase(),
    camel: camelOf(input.name),
    pascal: pascalOf(input.name),
    slug,
    constName: constOf(input.name),
    scope: input.sharedPackageName.split("/")[0] ?? input.sharedPackageName,
    productionHost,
    stagingHost,
    productionHostPattern: hostPatternOf(productionHost),
    stagingHostPattern: hostPatternOf(stagingHost),
    supportEmail: input.supportEmail,
    production: input.production,
    staging: input.staging,
    workloadIdentity: input.workloadIdentity,
    sharedSchemaFromTests: sharedSchemaFromTests(input.webRoot),
  };
}

/** Narrow `web init`'s FirebaseFacts to the fields the templates interpolate. */
export function environmentFacts(facts: FirebaseFacts): EnvironmentFacts {
  return {
    projectId: facts.projectId,
    apiKey: facts.apiKey,
    authDomain: facts.authDomain,
    storageBucket: facts.storageBucket,
    messagingSenderId: facts.messagingSenderId,
    appId: facts.appId,
  };
}
