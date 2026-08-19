/**
 * Consumer-auth library templates — Layer A of cpheinrich/morpheus#135.
 *
 * Every function below is Evo's actual file (darwin-health/evo#58, #62) with
 * project-specific values lifted into `ConsumerAuthContext`. Rendering with
 * Evo's own values reproduces Evo's files byte-for-byte, and that property is
 * the review contract for edits here: change a template only the way you would
 * change the running code it was extracted from.
 *
 * GENERATED-THEN-CURATED: produced by transcribing the Evo sources, then
 * hand-edited only where a comment stated an Evo-only fact. Do not regenerate
 * blindly.
 */
/** lib/firebase/config.ts */
export const libFirebaseConfig = (ctx) => `/**
 * Firebase web config, one per environment.
 *
 * These values are public by design — they identify the project to Google,
 * they do not authorise anything. Access is enforced by Firebase Auth, the
 * \`role\` custom claim, and Firestore rules, never by hiding these strings.
 * Committing them keeps preview deploys working without a per-environment
 * secret, and it is why both environments can live in one file rather than
 * behind six more variables to configure per deployment.
 */
export type FirebaseEnvironment = "production" | "staging";

const PRODUCTION_CONFIG = {
  apiKey: "${ctx.production.apiKey}",
  authDomain: "${ctx.production.authDomain}",
  projectId: "${ctx.production.projectId}",
  storageBucket: "${ctx.production.storageBucket}",
  messagingSenderId: "${ctx.production.messagingSenderId}",
  appId: "${ctx.production.appId}",
} as const;

const STAGING_CONFIG = {
  apiKey: "${ctx.staging.apiKey}",
  authDomain: "${ctx.staging.authDomain}",
  projectId: "${ctx.staging.projectId}",
  storageBucket: "${ctx.staging.storageBucket}",
  messagingSenderId: "${ctx.staging.messagingSenderId}",
  appId: "${ctx.staging.appId}",
} as const;

/**
 * Which project a build talks to.
 *
 * **Staging is the default and production is the exception.** Only a Vercel
 * Production deployment reaches real user data; previews, the \`staging\` branch
 * and every local \`next dev\` land on \`${ctx.staging.projectId}\` with no configuration
 * and nothing to remember to switch. Getting this backwards — defaulting to
 * production and opting into staging — means the day someone forgets, they
 * write test rows into the real database, which is exactly what the second
 * project exists to prevent.
 *
 * \`NEXT_PUBLIC_FIREBASE_ENV\` overrides, for the rare deliberate case of
 * pointing a preview at production data.
 *
 * Split out and exported so it can be tested directly: the branch is one line
 * and picking the wrong side of it is invisible until data lands in the wrong
 * place.
 */
export function resolveEnvironment(env: {
  NEXT_PUBLIC_FIREBASE_ENV?: string;
  VERCEL_ENV?: string;
}): FirebaseEnvironment {
  if (env.NEXT_PUBLIC_FIREBASE_ENV === "production") return "production";
  if (env.NEXT_PUBLIC_FIREBASE_ENV === "staging") return "staging";
  return env.VERCEL_ENV === "production" ? "production" : "staging";
}

/**
 * Resolved at build time. \`next.config.ts\` computes the value and inlines it,
 * because \`VERCEL_ENV\` exists only on the server and this module is imported
 * by client components — reading it directly here would resolve to \`undefined\`
 * in the browser bundle and silently send every signed-in user to staging.
 */
export const FIREBASE_ENVIRONMENT: FirebaseEnvironment = resolveEnvironment({
  NEXT_PUBLIC_FIREBASE_ENV: process.env.NEXT_PUBLIC_FIREBASE_ENV,
  VERCEL_ENV: process.env.VERCEL_ENV,
});

export const firebaseConfig =
  FIREBASE_ENVIRONMENT === "production" ? PRODUCTION_CONFIG : STAGING_CONFIG;

export const PROJECT_ID = firebaseConfig.projectId;

/**
 * Workload Identity Federation, which is how the Admin SDK authenticates on
 * Vercel. None of these are secrets — they name a trust relationship rather
 * than prove one. The proof is the OIDC token Vercel mints per request, which
 * GCP validates against Vercel's published certificates.
 *
 * There is deliberately no service-account key: nothing to create, store, leak,
 * or rotate, and key creation is disabled by org policy on some organisations
 * anyway.
 */
export const WORKLOAD_IDENTITY = {
  /** Project *number*, not id — the audience is built from the number. */
  projectNumber: firebaseConfig.messagingSenderId,
  poolId: "${ctx.workloadIdentity.poolId}",
  providerId: "${ctx.workloadIdentity.providerId}",
  serviceAccount: "${ctx.workloadIdentity.serviceAccount}",
} as const;

/** The \`audience\` an external-account credential presents to STS. */
export const WORKLOAD_IDENTITY_AUDIENCE =
  \`//iam.googleapis.com/projects/\${WORKLOAD_IDENTITY.projectNumber}\` +
  \`/locations/global/workloadIdentityPools/\${WORKLOAD_IDENTITY.poolId}\` +
  \`/providers/\${WORKLOAD_IDENTITY.providerId}\`;

export type CredentialStrategy = "service-account" | "workload-identity" | "adc";

/**
 * How the Admin SDK should authenticate, given the environment.
 *
 * Split out from \`admin.ts\` so it can be tested without importing
 * \`server-only\`, and because the choice is the part worth pinning: picking the
 * wrong branch does not fail loudly, it falls back to a credential that is
 * absent, and the first symptom is sign-in breaking in a deployed environment.
 */
export function credentialStrategy(
  env: {
    FIREBASE_SERVICE_ACCOUNT?: string;
    VERCEL?: string;
  },
  environment: FirebaseEnvironment = FIREBASE_ENVIRONMENT,
): CredentialStrategy {
  if (env.FIREBASE_SERVICE_ACCOUNT) return "service-account";

  if (env.VERCEL) {
    // The pool, provider and service account below belong to \`${ctx.production.projectId}\` and
    // only to it. Federating from a staging deployment would mint a perfectly
    // valid token for the *production* identity, then present it to the
    // staging project — a 403 whose message says nothing about the actual
    // mistake, on a deployment whose sign-in works, because Auth and Firestore
    // fail independently behind one credential (see admin.ts).
    //
    // Failing here instead names the cause. Staging authenticates with the key
    // in FIREBASE_SERVICE_ACCOUNT, scoped to Vercel's Preview environment;
    // absent that, there is no credential to fall back to.
    if (environment !== "production") {
      throw new Error(
        "No FIREBASE_SERVICE_ACCOUNT set for a staging deployment. Workload " +
          "Identity Federation is configured for ${ctx.production.projectId} only, so falling back " +
          "to it would authenticate as production against the staging project. " +
          "Set FIREBASE_SERVICE_ACCOUNT in Vercel's Preview environment.",
      );
    }
    return "workload-identity";
  }

  return "adc";
}

/**
 * Name of the session cookie. Firebase issues the value; we choose where it
 * lives. \`__session\` is not arbitrary — it is the only cookie name Firebase
 * Hosting forwards to a CDN-cached origin, so keeping it here means the hosting
 * choice can change without invalidating every live session.
 */
export const SESSION_COOKIE_NAME = "__session";

/**
 * A second cookie that says only "somebody is signed in", set and cleared
 * beside the session cookie.
 *
 * Not httpOnly, on purpose — that is the entire point of it. The header on the
 * public pages has to render "Sign in" or "Dashboard", and those pages are
 * statically prerendered; reading the real session server-side would make
 * every content page dynamic, trading away the prerendering the public pages
 * earn search traffic with. So the header reads this instead and renders
 * correctly on first paint with no flash and no round trip.
 *
 * It carries no identity, and it grants nothing. Anyone can set it in devtools;
 * the result is a button that leads to a redirect back to sign-in. Never read
 * it to decide access — that is \`verifySessionCookie\`'s job, and only its job.
 */
export const SIGNED_IN_HINT_COOKIE_NAME = "${ctx.slug}_signed_in";

/** Firebase caps session cookies at 14 days. */
export const SESSION_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;
`;
/** lib/firebase/admin.ts */
export const libFirebaseAdmin = (ctx) => `import "server-only";

import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
  type Credential,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getVercelOidcToken } from "@vercel/functions/oidc";
import { ExternalAccountClient } from "google-auth-library";

import {
  credentialStrategy,
  PROJECT_ID,
  WORKLOAD_IDENTITY,
  WORKLOAD_IDENTITY_AUDIENCE,
} from "@/lib/firebase/config";

const ADMIN_APP = "${ctx.production.projectId}-admin";

/**
 * Admin SDK, for what the client cannot do: mint a session cookie from an ID
 * token, read a session cookie with revocation checked, and write to
 * collections the rules deny every client.
 *
 * Credentials resolve most specific first — an explicit service-account blob,
 * then Workload Identity Federation on Vercel, then Application Default Credentials, so a local
 * \`gcloud auth application-default login\` just works under \`next dev\`.
 */
function getAdminApp(): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP);
  if (existing) return existing;

  return initializeApp({ credential: resolveCredential(), projectId: PROJECT_ID }, ADMIN_APP);
}

function resolveCredential(): Credential {
  // Read through explicitly: \`process.env\` is an index signature, so passing it
  // whole would type-check against anything.
  const env = {
    FIREBASE_SERVICE_ACCOUNT: process.env.FIREBASE_SERVICE_ACCOUNT,
    VERCEL: process.env.VERCEL,
  };

  switch (credentialStrategy(env)) {
    case "service-account":
      return serviceAccountKey(env.FIREBASE_SERVICE_ACCOUNT!);
    case "workload-identity":
      return workloadIdentity();
    case "adc":
      return applicationDefault();
  }
}

function serviceAccountKey(raw: string): Credential {
  let parsed: { project_id: string; client_email: string; private_key: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT is set but is not valid JSON. Paste the whole " +
        "service-account key, not just the private key.",
    );
  }

  // Newlines survive most secret stores literally; the SDK needs them real.
  return cert({
    projectId: parsed.project_id,
    clientEmail: parsed.client_email,
    privateKey: parsed.private_key.replace(/\\\\n/g, "\\n"),
  });
}

/**
 * Exchange Vercel's per-deployment OIDC token for short-lived GCP credentials.
 *
 * Vercel signs a JWT asserting which team, project and environment is running.
 * GCP's STS validates it against Vercel's published certificates, applies the
 * provider's attribute condition, and returns a federated token, which is then
 * used to impersonate the service account. There is no key anywhere in that
 * chain.
 *
 * The token is fetched per call rather than read once from
 * \`process.env.VERCEL_OIDC_TOKEN\`. Vercel injects a fresh token per invocation
 * and each lives about twelve hours, so a token captured at module load works
 * on a warm deployment and then starts failing with \`invalid_grant\` once it
 * ages out — the slowest possible way to find a bug.
 */
function workloadIdentity(): Credential {
  const client = ExternalAccountClient.fromJSON({
    type: "external_account",
    audience: WORKLOAD_IDENTITY_AUDIENCE,
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      \`\${WORKLOAD_IDENTITY.serviceAccount}:generateAccessToken\`,
    subject_token_supplier: {
      getSubjectToken: () => getVercelOidcToken(),
    },
  });

  if (!client) {
    throw new Error(
      \`Could not build a Workload Identity credential from \${WORKLOAD_IDENTITY_AUDIENCE}. \` +
        "That is a malformed audience, not a missing token.",
    );
  }

  return {
    async getAccessToken() {
      const { token } = await client.getAccessToken();

      if (!token) {
        throw new Error(
          "Workload Identity Federation returned no access token. Check that OIDC " +
            "Federation is enabled on the Vercel project and its issuer mode is Team.",
        );
      }

      // firebase-admin wants a lifetime, not a deadline.
      const expiry = client.credentials?.expiry_date;
      return {
        access_token: token,
        expires_in: expiry ? Math.max(0, Math.floor((expiry - Date.now()) / 1000)) : 3600,
      };
    },
  };
}

export function adminAuth() {
  return getAuth(getAdminApp());
}

/**
 * A Google access token for the identity this deployment runs as.
 *
 * Firestore is reached over its REST API rather than through
 * \`firebase-admin\`'s Firestore client, and that is not a style preference —
 * that client goes through google-gax, which wants a real GoogleAuth credential
 * and rejects the token-minting object \`firebase-admin\` accepts everywhere
 * else. The symptom is \`firestore/invalid-credential\` on the first write of a
 * deployment whose sign-in works perfectly, because Auth and Firestore fail
 * independently behind one credential. Found in production on ${ctx.name}.
 *
 * Going through the credential resolved above means all three strategies —
 * service-account key, federation, local ADC — mint a token the same way, so
 * there is one path to test rather than one per environment.
 *
 * Still requires \`roles/datastore.user\` on that identity. A missing grant
 * surfaces as a 403 on the first write and nowhere earlier.
 */
let cachedCredential: Credential | undefined;

export async function googleAccessToken(): Promise<string> {
  cachedCredential ??= resolveCredential();
  const token = await cachedCredential.getAccessToken();
  if (!token?.access_token) {
    throw new Error("Could not mint a Google access token for the Firestore REST API.");
  }
  return token.access_token;
}
`;
/** lib/firebase/client.ts */
export const libFirebaseClient = (ctx) => `"use client";

import { getApp, getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, GoogleAuthProvider, getAuth, type Auth } from "firebase/auth";

import { firebaseConfig } from "@/lib/firebase/config";

/**
 * Browser-side Firebase. Next.js re-executes modules across HMR and route
 * transitions, so guard against a second \`initializeApp\` for the same name.
 */
export function getClientApp() {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

/**
 * \`NEXT_PUBLIC_USE_EMULATORS\` is inlined at build time, which is the safety
 * property: it is set only by the \`build:e2e\` script, so a production bundle
 * does not contain a live emulator branch — the condition below compiles to
 * \`false\` and disappears. Set it on a deployed build and sign-in simply breaks,
 * loudly, at the first attempt.
 */
const USE_EMULATORS = process.env.NEXT_PUBLIC_USE_EMULATORS === "1";

const AUTH_EMULATOR_URL = "http://127.0.0.1:9099";

/** connectAuthEmulator throws if called twice on one Auth instance across HMR. */
const connected = new WeakSet<Auth>();

export function getClientAuth(): Auth {
  const auth = getAuth(getClientApp());
  if (USE_EMULATORS && !connected.has(auth)) {
    connected.add(auth);
    connectAuthEmulator(auth, AUTH_EMULATOR_URL, { disableWarnings: true });
  }
  return auth;
}

export function googleProvider() {
  const provider = new GoogleAuthProvider();
  // Always show the chooser. Without this, anyone with several Google accounts
  // is silently signed in as whichever one the browser prefers, which is
  // usually the personal account that is not on the allowlist.
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}
`;
/** lib/firebase/emulator.ts */
export const libFirebaseEmulator = (ctx) => `import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Pointing ${ctx.name} at the Firebase Emulator Suite.
 *
 * Two capabilities, wildly different amounts of work, for the reason the rest
 * of this directory keeps repeating: **Auth and Firestore are reached by
 * different code paths, so configuring one is not evidence for the other.**
 *
 * **Auth needs nothing here.** \`firebase-admin\` checks
 * \`FIREBASE_AUTH_EMULATOR_HOST\` itself before it talks to Identity Toolkit, and
 * \`firebase emulators:exec\` sets that variable in the process it runs. So
 * \`adminAuth()\` in \`admin.ts\` reaches the emulator with no change at all.
 *
 * **Firestore needs all of it.** \`FIRESTORE_EMULATOR_HOST\` is auto-detected by
 * \`firebase-admin\`'s *Firestore client* — which this codebase deliberately does
 * not use. It writes over the Firestore REST API instead, because google-gax
 * rejects the Workload Identity credential that Auth accepts (the long version
 * is on \`googleAccessToken\` in \`admin.ts\`). The consequence is easy to miss and
 * expensive to discover: under \`emulators:exec\` the variable is set, the
 * emulator is listening, everything *looks* configured — and every write still
 * goes to the production database in \`${ctx.production.projectId}\`. Nothing errors, the test
 * passes, and the row is real.
 *
 * These helpers close that gap by reading the same standard variable by hand.
 * \`FIRESTORE_EMULATOR_HOST\` rather than a bespoke \`EVO_*\` name on purpose:
 * \`emulators:exec\` already sets it, so an emulator-backed test needs no
 * environment of its own, and anything in the ecosystem that reads it agrees
 * with us instead of contradicting us.
 *
 * Deliberately dependency-free — no \`server-only\`, no \`firebase-admin\`, no
 * import from \`config.ts\`. \`server-only\` throws when a plain Node process
 * imports it, which is why \`record.ts\` and \`firestore-value.ts\` are testable
 * and \`store.ts\` is not; this module has to be importable from
 * \`node --experimental-strip-types --test\`, so it stays on that side of the
 * line. The production token minter is passed in rather than imported for the
 * same reason.
 *
 * This module resolves configuration; it does not apply it. Wiring it into
 * \`store.ts\` is a separate change.
 */

/**
 * Why \`firebase.json\` looks the way it does — it is strict JSON and cannot say
 * any of this itself.
 *
 * **Ports are pinned** (auth 9099, firestore 8080) rather than left to the
 * CLI's defaults, because \`@firebase/rules-unit-testing\` is configured with a
 * literal host and port in \`infra/firebase/firestore-rules.test.mjs\` and a
 * default that moved would make that suite *hang* rather than fail.
 *
 * **\`singleProjectMode\` is off.** It warns when a client addresses a project id
 * other than the one the suite booted with, which sounds like exactly the guard
 * you want — but the rules suite uses its own id on purpose, so that mismatch
 * is the design rather than the mistake.
 *
 * **The UI is enabled but costs CI nothing**: \`emulators:exec\` starts only the
 * emulators it needs, so the UI is downloaded and run by \`pnpm run emulators\`
 * locally and never by the workflow.
 */

/**
 * The two variables \`firebase emulators:exec\` sets, and the only two read here.
 */
export type EmulatorEnv = {
  FIRESTORE_EMULATOR_HOST?: string;
  FIREBASE_AUTH_EMULATOR_HOST?: string;
};

/**
 * The ambient environment, read through key by key rather than passed whole —
 * the same move \`credentialStrategy\` makes in \`config.ts\`, for the same reason:
 * \`process.env\` is an index signature, so handing it over entire type-checks
 * against a misspelled variable name that is then never set.
 *
 * Called per invocation, not captured at module load, because a test that sets
 * the variables itself must be able to change the answer.
 */
function ambientEnv(): EmulatorEnv {
  return {
    FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST,
    FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST,
  };
}

/** Where the REST writes go when no emulator is configured. */
export const PRODUCTION_FIRESTORE_REST_BASE = "https://firestore.googleapis.com/v1";

/** Where Identity Toolkit lives when no emulator is configured. */
export const PRODUCTION_IDENTITY_TOOLKIT_REST_BASE =
  "https://identitytoolkit.googleapis.com/v1";

/**
 * The emulator's magic credential. It verifies nothing and grants everything:
 * \`owner\` is full administrative access, and it bypasses \`firestore.rules\` the
 * way the production service account does. So a test using this exercises the
 * server's write path, and proves nothing whatsoever about the rules.
 *
 * Rules are a separate suite with a separate library
 * (\`@firebase/rules-unit-testing\`), which authenticates as a *user* rather than
 * as the owner. Do not read a green emulator run as rules coverage.
 */
export const EMULATOR_BEARER_TOKEN = "owner";

/**
 * Normalise a \`host:port\` variable.
 *
 * Firebase writes these without a scheme (\`127.0.0.1:8080\`), but people set
 * them by hand from a browser address bar, and \`http://http://127.0.0.1:8080/v1\`
 * fails as a DNS error several layers from the mistake.
 */
function hostFrom(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.replace(/^https?:\\/\\//i, "").replace(/\\/+$/, "") || undefined;
}

export function firestoreEmulatorHost(env: EmulatorEnv = ambientEnv()): string | undefined {
  return hostFrom(env.FIRESTORE_EMULATOR_HOST);
}

export function authEmulatorHost(env: EmulatorEnv = ambientEnv()): string | undefined {
  return hostFrom(env.FIREBASE_AUTH_EMULATOR_HOST);
}

/** True when Firestore traffic from this process is going to the emulator. */
export function usingFirestoreEmulator(env: EmulatorEnv = ambientEnv()): boolean {
  return firestoreEmulatorHost(env) !== undefined;
}

/**
 * The base URL for Firestore REST calls — the seam \`store.ts\` needs.
 *
 * The emulator serves the same REST surface as production under \`/v1\`, so the
 * paths built around it (\`projects/…/databases/(default)/documents/…\`,
 * \`documents:commit\`, \`updateMask\`, \`updateTransforms\`) are unchanged. Only the
 * origin moves. That is the whole reason emulator support is cheap here despite
 * the REST detour.
 *
 * Plain \`http\`, and \`127.0.0.1\` rather than \`localhost\`: on a machine that
 * resolves \`localhost\` to \`::1\` first, a client dialling the name misses an
 * emulator bound to the IPv4 address, and the failure looks like a dead
 * emulator rather than a naming mismatch. \`firebase.json\` pins the same literal
 * on the listening side.
 */
export function firestoreRestBaseUrl(env: EmulatorEnv = ambientEnv()): string {
  const host = firestoreEmulatorHost(env);
  return host ? \`http://\${host}/v1\` : PRODUCTION_FIRESTORE_REST_BASE;
}

/**
 * The base URL for Identity Toolkit REST calls.
 *
 * \`firebase-admin\` finds the Auth emulator on its own, so nothing in the app
 * needs this. Tests do: creating a user, minting an ID token for it, or
 * clearing all accounts between cases is REST against the emulator, and the
 * emulator's shape is not the obvious one — the production hostname reappears
 * as a *path prefix* under the emulator's own origin.
 */
export function identityToolkitRestBaseUrl(env: EmulatorEnv = ambientEnv()): string {
  const host = authEmulatorHost(env);
  return host
    ? \`http://\${host}/identitytoolkit.googleapis.com/v1\`
    : PRODUCTION_IDENTITY_TOOLKIT_REST_BASE;
}

/**
 * The bearer token for Firestore REST calls — the other half of the seam.
 *
 * Takes the production minter as an argument instead of importing
 * \`googleAccessToken\`, so this module never pulls in \`server-only\` or
 * \`firebase-admin\` and stays loadable from a plain test process. In \`store.ts\`
 * the call reads \`await firestoreBearerToken(googleAccessToken)\`.
 *
 * Against the emulator the minter is never called, which matters more than it
 * looks: minting a real token needs a real credential, so a CI job with no
 * secrets — a fork's pull request, say — would otherwise fail at the first
 * write with an authentication error that has nothing to do with the change.
 */
export async function firestoreBearerToken(
  mintProductionToken: () => Promise<string>,
  env: EmulatorEnv = ambientEnv(),
): Promise<string> {
  if (usingFirestoreEmulator(env)) return EMULATOR_BEARER_TOKEN;
  return mintProductionToken();
}

/**
 * Refuse to run when the emulators are not configured.
 *
 * The guard exists because the failure it prevents is silent and permanent. A
 * test that seeds a signup, asserts on it and deletes it is harmless against
 * the emulator and is a write to the live waitlist against production — same
 * code, same exit status, no error anywhere. Call this at the top of any suite
 * that writes.
 */
export function requireEmulators(env: EmulatorEnv = ambientEnv()): void {
  const missing: string[] = [];
  if (!firestoreEmulatorHost(env)) missing.push("FIRESTORE_EMULATOR_HOST");
  if (!authEmulatorHost(env)) missing.push("FIREBASE_AUTH_EMULATOR_HOST");
  if (missing.length === 0) return;

  throw new Error(
    \`\${missing.join(" and ")} not set, so this would run against the real \` +
      "${ctx.production.projectId} project. Run it under the emulators: \`pnpm run test:emulator\` " +
      "from the repository root.",
  );
}

/**
 * Confirm both emulators are actually answering.
 *
 * \`emulators:exec\` will not start the command until the suite reports ready, so
 * this is belt and braces — but it is what keeps the CI job honest while there
 * are no emulator-backed tests yet. Without it a workflow whose test step is
 * \`--if-present\` against a script nobody has written passes green having
 * verified nothing, and stays that way until someone notices.
 *
 * Both roots are unauthenticated liveness endpoints; neither reads or writes
 * data.
 */
export async function probeEmulators(env: EmulatorEnv = ambientEnv()): Promise<string[]> {
  requireEmulators(env);

  const targets = [
    { name: "Firestore", url: \`http://\${firestoreEmulatorHost(env)}/\` },
    { name: "Auth", url: \`http://\${authEmulatorHost(env)}/\` },
  ];

  const reached: string[] = [];
  for (const target of targets) {
    let response: Response;
    try {
      response = await fetch(target.url);
    } catch (cause) {
      throw new Error(
        \`The \${target.name} emulator did not answer on \${target.url}. It is \` +
          "configured but not listening — check the ports in firebase.json " +
          "against what emulators:exec reported.",
        { cause },
      );
    }
    if (!response.ok) {
      throw new Error(
        \`The \${target.name} emulator answered \${response.status} on \${target.url}.\`,
      );
    }
    reached.push(\`\${target.name} on \${target.url}\`);
  }

  return reached;
}

/**
 * Runnable directly, which is how the root \`test:emulator\` script uses it:
 *
 *   node --experimental-strip-types apps/web/lib/firebase/emulator.ts
 *
 * Guarded on being the entry point so importing this module has no side
 * effects — under Next it is never the entry point, so the branch is dead
 * weight in the bundle rather than behaviour.
 */
function invokedDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && resolve(entry) === fileURLToPath(import.meta.url);
}

if (invokedDirectly()) {
  probeEmulators().then(
    (reached) => {
      for (const line of reached) console.log(\`ok  \${line}\`);
    },
    (error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    },
  );
}
`;
/** lib/auth/roles.ts */
export const libAuthRoles = (ctx) => `/**
 * The role vocabulary. One \`role\` claim is the single fact that gates route
 * middleware and Firestore rules — which is the whole reason \`/hq\` is not on
 * Auth.js.
 *
 * The allowlists themselves live in \`morpheus.json\` and are applied to Firebase
 * custom claims by \`morpheus access sync\`. Nothing here reads that file at
 * runtime: the claim on the token is the authority, and this module only
 * describes what the claim is allowed to say.
 */
export const ROLES = ["admin", "employee", "investor"] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Roles that may load \`/hq\` at all. \`investor\` is deliberately absent: the
 * investor surface is a separate route with its own allowlist in
 * \`morpheus.json\`, and conflating the two is how an investor ends up reading
 * supplier terms.
 *
 * This list and the vocabulary above must match Morpheus's \`access/schema.ts\`
 * exactly — \`morpheus access sync\` writes those strings, and a role this file
 * does not recognise is treated as no role at all. \`employee\`, not \`member\`.
 */
const HQ_ROLES: readonly Role[] = ["admin", "employee"];

export function canAccessHq(role: Role | null): boolean {
  return role !== null && HQ_ROLES.includes(role);
}

export function isAdmin(role: Role | null): boolean {
  return role === "admin";
}
`;
/** lib/auth/session-cookie.ts */
export const libAuthSessionCookie = (ctx) => `import { decodeJwt, importX509, jwtVerify, type JWTPayload } from "jose";

// Relative, not the \`@/\` alias, and deliberately so: the test runner is
// \`node --experimental-strip-types\`, which resolves neither tsconfig paths nor
// Next's alias. A module that must be unit-testable therefore imports its
// siblings by path. \`roles\` is one directory over; nothing is lost.
import { isRole, type Role } from "./roles.ts";

/**
 * Edge-safe verification of a Firebase session cookie.
 *
 * \`firebase-admin\` cannot run in the route gate — it needs Node built-ins the
 * Edge runtime does not provide. So the gate verifies the cookie itself,
 * against the same Google-published certificates the Admin SDK uses. That keeps
 * the role check at the edge rather than deferring every decision to a server
 * component, which is what makes the gate real rather than a redirect for
 * unauthenticated users.
 *
 * Session cookies are signed with a *different* key set than ID tokens and
 * carry a different issuer. Using the ID-token keys here silently fails to
 * verify every cookie.
 */
const SESSION_COOKIE_CERT_URL =
  "https://www.googleapis.com/identitytoolkit/v3/relyingparty/publicKeys";

/** jose 6 returns a WebCrypto key from importX509; it dropped the KeyLike alias. */
type PublicKey = Awaited<ReturnType<typeof importX509>>;

export type SessionClaims = {
  uid: string;
  email: string | null;
  /**
   * Whether Firebase has confirmed the address. Read from the token rather
   * than from a profile document, for the same reason \`role\` is: the gate and
   * every page must agree about it, and a document can be stale or absent
   * while the token cannot.
   *
   * Consumer accounts may sign in unverified — stranding someone whose
   * verification mail is slow is worse than the alternative — but writes are
   * refused until it is true, in the route handlers and again in the Firestore
   * rules. Google accounts arrive verified; email/password accounts do not.
   */
  emailVerified: boolean;
  role: Role | null;
};

type CertCache = { keys: Map<string, PublicKey>; expiresAt: number };

let cache: CertCache | null = null;

/**
 * Google returns X.509 certificates keyed by kid, not a JWKS document, so
 * \`createRemoteJWKSet\` cannot be pointed at this URL. The cache honours the
 * endpoint's own \`max-age\`; these certificates rotate roughly daily.
 */
async function getCertificates(): Promise<Map<string, PublicKey>> {
  if (cache && cache.expiresAt > Date.now()) return cache.keys;

  const response = await fetch(SESSION_COOKIE_CERT_URL);
  if (!response.ok) {
    throw new Error(\`Failed to fetch session cookie certificates: \${response.status}\`);
  }

  const certificates: Record<string, string> = await response.json();
  const keys = new Map<string, PublicKey>();
  for (const [kid, pem] of Object.entries(certificates)) {
    keys.set(kid, await importX509(pem, "RS256"));
  }

  const maxAge = /max-age=(\\d+)/.exec(response.headers.get("cache-control") ?? "");
  const ttlMs = maxAge ? Number(maxAge[1]) * 1000 : 60 * 60 * 1000;
  cache = { keys, expiresAt: Date.now() + ttlMs };

  return keys;
}

/** Exported for tests — certificate rotation must not leak between cases. */
export function resetCertificateCache(): void {
  cache = null;
}

/** Exported for tests: the payload-to-claims mapping is worth pinning down. */
export function toClaims(payload: JWTPayload): SessionClaims | null {
  const uid = typeof payload.sub === "string" ? payload.sub : null;
  if (!uid) return null;

  return {
    uid,
    email: typeof payload.email === "string" ? payload.email : null,
    // Strict equality, not truthiness. An absent claim, the string "false", or
    // anything else Google did not put there means unverified — the safe
    // reading, since this value decides whether a write is allowed.
    emailVerified: payload.email_verified === true,
    role: isRole(payload.role) ? payload.role : null,
  };
}

/**
 * Returns the claims, or null for any cookie that is missing, malformed,
 * expired, or signed by something other than Google for this project. Never
 * throws on an untrusted cookie — a bad cookie is a signed-out user.
 */
/**
 * The Auth emulator signs nothing — its tokens and session cookies are
 * \`alg: none\` — so the certificate verification below rejects every cookie it
 * mints and an E2E run would fail at the route gate before testing anything.
 *
 * This branch trusts the payload without a signature when, and only when,
 * \`FIREBASE_AUTH_EMULATOR_HOST\` is present — read at *call* time, never baked
 * into a build. Vercel does not set it; nothing in the repo sets it outside
 * \`firebase emulators:exec\`. Audience, expiry and issuer shape are still
 * checked so a test exercises the same claims path production uses, and a unit
 * test pins that this branch is dead when the variable is absent.
 */
function emulatorClaims(cookie: string, projectId: string): SessionClaims | null {
  try {
    const payload = decodeJwt(cookie);
    if (payload.aud !== projectId) return null;
    if (typeof payload.iss !== "string" || !payload.iss.includes(projectId)) return null;
    if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
    return toClaims(payload);
  } catch {
    return null;
  }
}

export async function verifySessionCookie(
  cookie: string | undefined,
  projectId: string,
): Promise<SessionClaims | null> {
  if (!cookie) return null;

  if (process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    return emulatorClaims(cookie, projectId);
  }

  try {
    const keys = await getCertificates();

    const { payload } = await jwtVerify(
      cookie,
      async (header) => {
        const key = header.kid ? keys.get(header.kid) : undefined;
        if (!key) throw new Error(\`Unknown key id: \${header.kid}\`);
        return key;
      },
      {
        issuer: \`https://session.firebase.google.com/\${projectId}\`,
        audience: projectId,
        algorithms: ["RS256"],
      },
    );

    return toClaims(payload);
  } catch {
    return null;
  }
}
`;
/** lib/auth/current-user.ts */
export const libAuthCurrentUser = (ctx) => `import "server-only";

import { cookies } from "next/headers";

import { PROJECT_ID, SESSION_COOKIE_NAME } from "@/lib/firebase/config";
import { verifySessionCookie, type SessionClaims } from "@/lib/auth/session-cookie";

/**
 * The signed-in user for server components.
 *
 * Uses the same edge-safe verifier as the route gate rather than the Admin SDK,
 * so a page and the gate protecting it can never disagree about who someone is.
 *
 * **Signature and expiry only — revocation is not checked here.** A render
 * tolerates that gap; a write does not, because every server-side write uses
 * the deployment's own credential and so bypasses the Firestore rules. Use
 * \`writingUser()\` from \`lib/auth/writing-user.ts\` on any path that mutates.
 *
 * An earlier version of this comment claimed revocation was checked "when it is
 * used to write". Nothing checked it. That was true only in the sense that no
 * write existed yet.
 */
export async function currentUser(): Promise<SessionClaims | null> {
  const store = await cookies();
  return verifySessionCookie(store.get(SESSION_COOKIE_NAME)?.value, PROJECT_ID);
}
`;
/** lib/auth/writing-user.ts */
export const libAuthWritingUser = (ctx) => `import "server-only";

import { cookies } from "next/headers";

import { isRole } from "@/lib/auth/roles.ts";
import type { SessionClaims } from "@/lib/auth/session-cookie.ts";
import { adminAuth } from "@/lib/firebase/admin";
import { SESSION_COOKIE_NAME } from "@/lib/firebase/config";

/**
 * The signed-in user, with revocation checked. For writes, and for API reads
 * that return data (a password reset must end a leaked cookie's read access
 * too, not only its writes).
 *
 * \`currentUser()\` verifies the cookie's signature and expiry against Google's
 * published certificates and stops there. That is the right trade for
 * *rendering* — it runs at the edge, needs no Admin SDK, and lets the route
 * gate and a page agree about identity without a network call each.
 *
 * It is the wrong trade for a **write**. Every server-side profile write uses
 * the deployment's own credential and therefore bypasses the Firestore rules
 * entirely, so the cookie is the only thing standing between a request and the
 * database. Disabling an account, deleting it, or calling \`revokeRefreshTokens\`
 * would not stop an already-issued cookie from changing that user's data for
 * the rest of its fourteen days.
 *
 * \`current-user.ts\` claimed revocation was "checked when the session is minted
 * and when it is used to write". The first half was true and the second was
 * not — nothing checked it, because until consumer accounts there were no
 * server-side writes behind a session. This module is that missing half, and
 * the comment there now points here rather than describing it.
 *
 * The cost is one Firebase round trip per mutation, which is the correct price
 * for a write and too high for a render.
 */
export async function writingUser(): Promise<SessionClaims | null> {
  const store = await cookies();
  const cookie = store.get(SESSION_COOKIE_NAME)?.value;
  if (!cookie) return null;

  try {
    // \`true\` is the entire point of this function: check revocation, and treat
    // a disabled or deleted user as signed out.
    const decoded = await adminAuth().verifySessionCookie(cookie, true);

    return {
      uid: decoded.uid,
      email: typeof decoded.email === "string" ? decoded.email : null,
      emailVerified: decoded.email_verified === true,
      role: isRole(decoded.role) ? decoded.role : null,
    };
  } catch {
    // Revoked, expired, malformed, or belonging to a user who no longer
    // exists — all of which are "not signed in" as far as a write is concerned.
    return null;
  }
}
`;
/** lib/auth/request-origin.ts */
export const libAuthRequestOrigin = (ctx) => `/**
 * Same-origin enforcement for state-changing requests.
 *
 * Without this, \`/api/auth/session\` is a **login CSRF**: another site can
 * top-level POST an attacker-owned Firebase ID token and the response installs
 * that identity as the victim's 14-day session. The victim then types their
 * name — and later their health data — into an account the attacker controls
 * and can read.
 *
 * \`SameSite=Lax\` does not help. It governs whether the browser *sends* an
 * existing cookie cross-site; it says nothing about a response *setting* one.
 * Nor does the JSON body: a cross-site \`<form enctype="text/plain">\` can post a
 * body that parses as JSON, and \`request.json()\` does not check Content-Type,
 * so there is no preflight to rely on either. Firebase's own session-cookie
 * guide requires CSRF protection on this endpoint for exactly this reason.
 *
 * Two conditions, both required: \`Origin\` must equal the request's own host
 * (so per-PR previews work without enumeration), and that host must be one ${ctx.name}
 * actually serves (so the comparison cannot be satisfied by controlling both
 * sides of it). See KNOWN_HOST for why the second exists.
 *
 * A leaf module with no imports, so it can be unit-tested directly.
 */

/**
 * Hosts ${ctx.name} actually serves.
 *
 * The check below compares two values from the *same request* — \`Origin\`
 * against the forwarded host — which is sound only while the platform pins the
 * host headers to domains it routes for. Vercel does: it routes by Host and
 * writes \`x-forwarded-host\` itself. But a review rightly noted that leaving
 * that assumption implicit means the CSRF check's soundness rests on
 * undocumented platform behaviour — and \`requestOrigin()\` builds *mailed*
 * action links from the same headers, where a spoofed host would put a real
 * oobCode on an attacker's origin. This allowlist pins both: a request whose
 * host is not one ${ctx.name} serves fails the origin check and never anchors a link.
 *
 * A new domain (an \`app.${ctx.productionHost}\` split, say) must be added here, and the
 * sign-in failing on it loudly is exactly how that will be remembered.
 */
const KNOWN_HOST =
  /^(${ctx.productionHostPattern}|${ctx.stagingHostPattern}|localhost(:\\d+)?|127\\.0\\.0\\.1(:\\d+)?|[a-z0-9-]+\\.vercel\\.app)$/i;

export function isKnown${ctx.pascal}Host(host: string): boolean {
  return KNOWN_HOST.test(host);
}

/** Hosts a request may legitimately arrive as. */
function requestHost(headers: Headers): string | null {
  // \`x-forwarded-host\` is what the platform sets in front of the function;
  // \`host\` is what the runtime sees. Prefer the outer one, since that is the
  // origin a browser actually used.
  return headers.get("x-forwarded-host") ?? headers.get("host");
}

/**
 * True when this request demonstrably came from a page on this same origin.
 *
 * Absent \`Origin\` is treated as cross-site rather than same-site. Every browser
 * sends it on \`fetch\`, \`XMLHttpRequest\` and form POSTs, so a missing header on
 * a state-changing request is not an ordinary browser — and defaulting the
 * unknown case to "allow" is how a check like this quietly stops working.
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get("origin");
  if (!origin) return false;

  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    return false;
  }

  const host = requestHost(headers);
  if (!host) return false;

  return originHost === host && isKnown${ctx.pascal}Host(host);
}
`;
/** lib/auth/safe-next.ts */
export const libAuthSafeNext = (ctx) => `/**
 * Where a sign-in may send someone afterwards.
 *
 * The obvious check — starts with \`/\`, does not start with \`//\` — has a hole:
 * **\`/\\evil.example\` passes it.** The WHATWG URL parser treats a backslash as a
 * forward slash, so a browser resolves that to \`https://evil.example/\`, and the
 * result is an open redirect on the page a person has just decided to trust
 * with their password. That is the most valuable moment there is to phish
 * someone, which is why this is worth more than a \`startsWith\` pair.
 *
 * So the value is *parsed* rather than pattern-matched, against a base that is
 * thrown away afterwards, and only the path, query and fragment survive. A
 * destination that resolves anywhere other than that base is discarded whole.
 *
 * A leaf module with no imports, so it can be unit-tested directly.
 */

/** Never leaves this origin; it exists only to give the parser something to resolve against. */
const SENTINEL = "https://${ctx.slug}.invalid";

export const DEFAULT_NEXT = "/app/";

export function safeNext(value: string | undefined, fallback: string = DEFAULT_NEXT): string {
  if (!value) return fallback;

  // Backslashes and control characters are rejected before parsing rather than
  // normalised by it — \`\\\` is the whole trick above, and a stray newline or NUL
  // can split a header further downstream.
  if (/[\\\\ -]/.test(value)) return fallback;

  let url: URL;
  try {
    url = new URL(value, SENTINEL);
  } catch {
    return fallback;
  }

  // Anything absolute, protocol-relative, or carrying credentials resolves to
  // some other origin and is refused here — including \`javascript:\` and \`data:\`,
  // which parse fine and are not paths.
  if (url.origin !== SENTINEL) return fallback;

  const local = \`\${url.pathname}\${url.search}\${url.hash}\`;
  return local.startsWith("/") ? local : fallback;
}
`;
/** lib/auth/action-link.ts */
export const libAuthActionLink = (ctx) => `/**
 * Rewrite a Firebase-generated action link onto ${ctx.name}'s own handler.
 *
 * This is the whole trick behind sending our own auth mail.
 *
 * \`generateEmailVerificationLink\` and \`generatePasswordResetLink\` return a URL
 * on the project's *configured* action URL — \`${ctx.production.authDomain}/__/auth/action\`
 * — and that configuration is exactly what Firebase refuses to change
 * (\`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED\`). So the returned link cannot be mailed
 * as-is without landing people on a Google page.
 *
 * It does not need to be. The \`oobCode\` in that URL is just a bearer token:
 * \`applyActionCode\`, \`verifyPasswordResetCode\` and \`confirmPasswordReset\` all
 * redeem it against the Identity Toolkit API and none of them care which URL
 * delivered it. The action URL is a delivery vehicle, not part of the
 * credential. Keeping the code and discarding the rest of the link puts the
 * flow on \`/auth/action\`, which is what that page was built for.
 *
 * \`apiKey\` and \`continueUrl\` are deliberately dropped. \`/auth/action\` knows the
 * project it belongs to and decides its own destination, so forwarding either
 * would only widen what a mailed URL can influence.
 *
 * A leaf module with no imports, so it can be unit-tested directly — see the
 * note in \`session-cookie.ts\` about the test runner and path aliases.
 */

export type ActionMode = "verifyEmail" | "resetPassword";

/**
 * Pull the single-use code out of a Firebase action link.
 *
 * Returns null rather than throwing: the caller is a mail send, and a link it
 * cannot parse must not take down sign-up. A null means "don't send", which is
 * the safe direction.
 */
export function extractOobCode(firebaseLink: string): string | null {
  let url: URL;
  try {
    url = new URL(firebaseLink);
  } catch {
    return null;
  }

  const code = url.searchParams.get("oobCode");
  return code && code.length > 0 ? code : null;
}

/**
 * Build the ${ctx.name} link a person actually receives.
 *
 * \`origin\` is passed in rather than read from config because the correct value
 * differs per deployment and is already known to the caller from the incoming
 * request — which keeps localhost, ${ctx.stagingHost} and ${ctx.productionHost} each mailing
 * links back to themselves with nothing to configure.
 */
export function ${ctx.camel}ActionLink(origin: string, mode: ActionMode, oobCode: string): string {
  const url = new URL("/auth/action", origin);
  url.searchParams.set("mode", mode);
  url.searchParams.set("oobCode", oobCode);
  return url.toString();
}

/**
 * The two together: Firebase's link in, ${ctx.name}'s link out, or null.
 */
export function to${ctx.pascal}ActionLink(
  firebaseLink: string,
  origin: string,
  mode: ActionMode,
): string | null {
  const code = extractOobCode(firebaseLink);
  return code ? ${ctx.camel}ActionLink(origin, mode, code) : null;
}
`;
/** lib/auth/send-action-email.ts */
export const libAuthSendActionEmail = (ctx) => `import "server-only";

import { to${ctx.pascal}ActionLink, type ActionMode } from "@/lib/auth/action-link";
import { isKnown${ctx.pascal}Host } from "@/lib/auth/request-origin.ts";
import { canDeliver, deliver } from "@/lib/email/send";
import { passwordResetEmail, verificationEmail } from "@/lib/email/templates";
import { adminAuth } from "@/lib/firebase/admin";

/**
 * Generate a Firebase action code, put it on an ${ctx.name} URL, and mail it.
 *
 * Shared by the verification and reset routes so the two cannot drift on the
 * part that matters — dropping \`apiKey\`/\`continueUrl\`, and never letting a mail
 * failure become a request failure.
 */

/**
 * The origin to build links against, taken from the request that asked — so
 * localhost, previews and staging each mail links back to themselves.
 *
 * Falls back to production for a host ${ctx.name} does not serve: this value ends up
 * in an email carrying a live action code, and anchoring it to a spoofed host
 * header would mail that code to a real address on an attacker's origin. The
 * platform should make that impossible; the allowlist makes it not matter.
 */
export function requestOrigin(request: Request): string {
  // \`origin\` is absent on some server-side fetches; the URL is always present.
  const url = new URL(request.url);
  return isKnown${ctx.pascal}Host(url.host) ? url.origin : "https://${ctx.productionHost}";
}

type Outcome = { sent: boolean; reason?: string };

export async function sendVerificationEmail(
  email: string,
  origin: string,
): Promise<Outcome> {
  return send("verifyEmail", email, origin);
}

export async function sendPasswordResetEmail(
  email: string,
  origin: string,
): Promise<Outcome> {
  return send("resetPassword", email, origin);
}

async function send(mode: ActionMode, email: string, origin: string): Promise<Outcome> {
  // Before anything is generated. Generating a code and then failing the send
  // is not a harmless failure: Firebase revokes the user's previous code of
  // the same type at generation, so this path would silently kill the link
  // already in their inbox and deliver nothing to replace it.
  if (!canDeliver()) {
    console.error(\`[auth] \${mode} not attempted: no mail credential in a deployed environment.\`);
    return { sent: false, reason: "no-mail-credential" };
  }

  const auth = adminAuth();

  let firebaseLink: string;
  try {
    firebaseLink =
      mode === "verifyEmail"
        ? await auth.generateEmailVerificationLink(email)
        : await auth.generatePasswordResetLink(email);
  } catch (error) {
    // An unknown address arrives here as \`auth/internal-error\`
    // ("INTERNAL ASSERT FAILED: Unable to create the email action link"), *not*
    // as \`auth/user-not-found\` — email enumeration protection means Firebase
    // will not tell the Admin SDK the user is missing either, so the SDK sees a
    // 200 with no link in it and asserts. Verified against staging.
    //
    // The consequence worth knowing: "no such user" and "Firebase is broken"
    // are the same code here and cannot be separated. That is fine for the
    // reset route, which must answer identically regardless, but it means this
    // log line is not an alerting signal — it fires on ordinary typos.
    const code = (error as { code?: string }).code ?? "unknown";

    // Firebase rate-limits action-code generation per account, and aggressively:
    // a click seconds after sign-up's automatic send trips it. It arrives as
    // auth/internal-error with TOO_MANY_ATTEMPTS buried in the message, and
    // reporting it as a delivery failure invites exactly the retry loop that
    // keeps the limit tripped. Observed on staging and then reproduced on
    // production by the first real sign-up.
    const rateLimited = /TOO_MANY_ATTEMPTS/.test(String(error));
    console.error(\`[auth] generating \${mode} link failed: \${code}\`, error);
    return { sent: false, reason: rateLimited ? "rate-limited" : code };
  }

  const link = to${ctx.pascal}ActionLink(firebaseLink, origin, mode);
  if (!link) {
    console.error(\`[auth] \${mode} link had no oobCode; not sending\`);
    return { sent: false, reason: "malformed-link" };
  }

  const message =
    mode === "verifyEmail" ? verificationEmail(email, link) : passwordResetEmail(email, link);

  const result = await deliver(message);
  return { sent: result.delivered, reason: result.delivered ? undefined : "delivery" };
}
`;
/** lib/auth/session-client.ts */
export const libAuthSessionClient = (ctx) => `"use client";

import type { User } from "firebase/auth";

import { getClientAuth } from "@/lib/firebase/client";
import { sessionErrorMessage } from "@/lib/auth/errors";

/**
 * Turn a signed-in Firebase user into an ${ctx.name} session, or explain why not.
 *
 * Every entry point — Google, email sign-in, email sign-up — ends here, because
 * signing in to Firebase is only half of it: the server session cookie is what
 * the route gate and every server component read, and a browser that holds the
 * first without the second looks signed in and 403s on every request.
 *
 * On failure it signs out of Firebase too, for exactly that reason.
 */
export async function establishSession(user: User): Promise<{ error: string } | null> {
  const idToken = await user.getIdToken();

  const response = await fetch("/api/auth/session/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    await getClientAuth().signOut();
    // Logged as well as shown: a 500 has no JSON body, so without this the
    // person and whoever debugs it both see the same generic sentence.
    console.error(\`[auth] /api/auth/session refused: HTTP \${response.status}\`, body);
    return { error: sessionErrorMessage(response.status, body) };
  }

  // Create the profile document. Deliberately after the session exists — the
  // route authorises off the session cookie — and deliberately not fatal: a
  // failure here must not strand someone outside an account they just created.
  // \`/app\` calls the same idempotent endpoint on load, so this retries itself.
  try {
    await fetch("/api/account/", { method: "POST" });
  } catch (error) {
    console.error("[auth] profile provisioning failed; /app will retry", error);
  }

  return null;
}

/**
 * Sign out of both halves, server first.
 *
 * Order is load-bearing. Clearing the Firebase client session first would leave
 * a window where the cookie is still valid and the UI already believes it is
 * signed out — and if the network drops between the two, the person is left
 * holding a live session they think they ended.
 */
export async function endSession(): Promise<void> {
  await fetch("/api/auth/session/", { method: "DELETE" });
  await getClientAuth().signOut();
}

/**
 * Escape hatch for a zombie session.
 *
 * A session cookie can be revoked — a sign-out elsewhere, a password reset —
 * while remaining signature-valid, and pages check only the signature. The
 * browser then renders as signed in while every revocation-checked API answers
 * 401: a limbo where the header shows your email and the buttons say "Not
 * signed in", with nothing suggesting the one action that fixes it. Observed
 * live on a preview deployment within hours of consumer accounts existing.
 *
 * So a 401 from an authenticated API is treated as what it is — this session
 * is over — and the person is walked to sign-in rather than left to decode a
 * contradiction. A full navigation, not a router push: every piece of client
 * state built on the dead session should go with it.
 */
export async function recoverDeadSession(next: string): Promise<void> {
  try {
    await endSession();
  } catch (error) {
    console.error("[auth] clearing a dead session failed; redirecting anyway", error);
  }
  window.location.assign(\`/sign-in/?next=\${encodeURIComponent(next)}\`);
}
`;
/** lib/auth/errors.ts */
export const libAuthErrors = (ctx) => `/**
 * Firebase error codes, translated into something a person can act on.
 *
 * Firebase's own messages are written for whoever wrote the code, not whoever
 * hit the problem — "There is no user record corresponding to this identifier"
 * is a sentence nobody should ever be shown. Each string below says what went
 * wrong and what to do next, per \`hq/brand/voice.md\`: lead with the useful
 * answer, prefer the shorter sentence, no exclamation marks.
 *
 * **Email enumeration protection changes what arrives here.** It is on by
 * default for new Firebase projects, and it deliberately collapses
 * \`auth/user-not-found\` and \`auth/wrong-password\` into a single
 * \`auth/invalid-credential\` — so the sign-in form cannot be used to test
 * whether an address has an account. Both older codes are still mapped, for
 * projects where the setting is off, and all three say the same thing. Writing
 * a more specific message for one of them would reopen the hole the setting
 * closes.
 */

const MESSAGES: Record<string, string> = {
  // Sign-in
  "auth/invalid-credential": "That email and password don't match. Try again, or reset your password.",
  "auth/wrong-password": "That email and password don't match. Try again, or reset your password.",
  "auth/user-not-found": "That email and password don't match. Try again, or reset your password.",
  "auth/invalid-email": "Enter a valid email address.",
  "auth/user-disabled": "This account has been disabled. Write to us if that looks wrong.",
  "auth/too-many-requests": "Too many attempts. Try again in a few minutes.",

  // Sign-up
  "auth/email-already-in-use": "That address already has an account. Sign in instead.",
  "auth/weak-password": "Use at least 8 characters.",
  "auth/operation-not-allowed": "Email sign-up is not enabled for this site. Tell an admin.",

  // Popup / provider
  "auth/popup-closed-by-user": "Sign-in was cancelled.",
  "auth/cancelled-popup-request": "Sign-in was cancelled.",
  "auth/popup-blocked": "Your browser blocked the sign-in window. Allow popups and try again.",
  "auth/account-exists-with-different-credential":
    "That address already has an account using a different sign-in method.",
  // Fires on a Vercel preview URL, which Firebase's authorized-domain list
  // cannot cover with a wildcard. Names the cause rather than looking like a
  // rejected account.
  "auth/unauthorized-domain": "This domain is not authorised for sign-in. Tell an admin.",
  "auth/network-request-failed": "Could not reach the sign-in service. Check your connection.",

  // Action links (verification, reset)
  "auth/expired-action-code": "That link has expired. Request a new one.",
  "auth/invalid-action-code": "That link is no longer valid. It may have been used already.",
  "auth/requires-recent-login": "Sign in again before making this change.",
};

const FALLBACK = "Something went wrong. Try again.";

/** The code off a Firebase error, if it has one. */
export function errorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";
}

/**
 * Always returns something showable. An unmapped code gets the generic
 * message — never the raw code, which tells a person nothing and tells an
 * attacker whether an address exists.
 */
export function authErrorMessage(error: unknown): string {
  return MESSAGES[errorCode(error)] ?? FALLBACK;
}

/**
 * Whether a failed sign-in should be reported as a server fault rather than a
 * credential one.
 *
 * Without this, a 500 from \`/api/auth/session\` reaches the person as "Could not
 * sign in", which reads exactly like a refused account — and they retype a
 * correct password until they give up. The existing HQ form learned this the
 * hard way; the comment there is preserved in spirit.
 */
export function sessionErrorMessage(status: number, body: { error?: string }): string {
  if (body.error) return body.error;
  return status >= 500
    ? "Sign-in is broken on the server, not with your account. Try again shortly."
    : "Could not sign in.";
}

/** Minimum length we enforce ourselves, matching Firebase's own floor. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Client-side password check, so someone learns the rule before a round trip
 * rather than after it. Firebase enforces its own minimum regardless; this
 * exists for the message, not the security.
 */
export function passwordProblem(password: string): string | null {
  if (password.length === 0) return "Enter a password.";
  if (password.length < MIN_PASSWORD_LENGTH) return \`Use at least \${MIN_PASSWORD_LENGTH} characters.\`;
  return null;
}

/** Shared by every form that takes an address, so they all reject the same set. */
export function emailProblem(email: string): string | null {
  const trimmed = email.trim();
  if (!trimmed) return "Enter your email address.";
  // Deliberately permissive: the authority on whether an address exists is the
  // verification mail, not a regex. This only catches what is obviously not an
  // address, so nobody is locked out by a valid but unusual one.
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(trimmed)) return "Enter a valid email address.";
  return null;
}
`;
/** lib/email/send.ts */
export const libEmailSend = (ctx) => `import "server-only";

/**
 * Transactional email.
 *
 * ${ctx.name} sends its own auth mail rather than letting Firebase send it, because
 * Firebase refuses to point its templates at \`/auth/action\`
 * (\`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED\`, on production and on a fresh project
 * alike). Sending it ourselves also retires a problem that was coming anyway:
 * Firebase's default sender is \`noreply@${ctx.production.authDomain}\`, and password
 * reset mail from an unknown firebaseapp.com subdomain to a health-adjacent
 * audience is a spam-folder problem, not a theoretical one.
 *
 * The provider sits behind this interface deliberately. Resend is the default
 * because its API is one POST and its DNS setup is three records, but nothing
 * above this file knows that — swapping to Postmark or SES is a new \`deliver\`
 * implementation and no other change.
 */

export type Email = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export type SendResult = { delivered: boolean; provider: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Who the mail comes from. A real address on ${ctx.productionHost}, not a firebaseapp.com
 * subdomain — the domain a person recognises is most of what stops a password
 * reset being reported as phishing.
 */
function sender(): string {
  return process.env.${ctx.constName}_MAIL_FROM ?? "${ctx.name} <noreply@${ctx.productionHost}>";
}

/**
 * Whether this process is a developer's machine rather than a deployment.
 *
 * Vercel sets \`VERCEL\` in every deployed environment including Preview, so its
 * absence is the signal. Preview matters as much as Production here: a preview
 * without a mail key is exactly where an action link would otherwise be written
 * to a shared log.
 */
function isLocal(): boolean {
  return !process.env.VERCEL;
}

/**
 * Whether a send attempted right now could reach anyone.
 *
 * Exported so the auth-mail path can check it *before* generating an action
 * code, and the ordering is the entire point. Firebase invalidates a user's
 * outstanding code when a new one of the same type is generated — so
 * generate-then-fail-to-send does not merely lose the new link, it **revokes
 * the one already sitting in the person's inbox**. That exact sequence
 * happened on 2026-08-19: a preview build without the mail key generated a
 * fresh code, failed the send, and the link delivered minutes earlier died
 * before it was ever clicked.
 *
 * Locally there is no key and no problem: the console fallback "delivers" by
 * printing the link, so generation is safe.
 */
export function canDeliver(): boolean {
  return Boolean(process.env.RESEND_API_KEY) || isLocal();
}

/**
 * Log the message instead of sending it.
 *
 * **The link is printed only on a developer's own machine.** An action link
 * contains the \`oobCode\`, which is not a diagnostic — it is the bearer
 * credential that authorises a password reset. Printing it from a deployment
 * writes a usable reset credential into Vercel's runtime logs and into every
 * log drain attached to them, where it outlives the request and is readable by
 * anyone with log access. On a deployed environment this logs redacted
 * metadata and nothing else, so a missing mail key degrades to "no mail" rather
 * than to "reset links in the logs".
 *
 * Locally it is not a stub: printing the link is what lets the whole
 * verification and reset flow be walked end to end with no API key and no DNS.
 */
function logInstead(email: Email, reason: string): SendResult {
  if (!isLocal()) {
    console.error(
      \`[email] not sent (\${reason}) — subject: \${email.subject}. \` +
        "Recipient and action link withheld: this is a deployed environment.",
    );
    return { delivered: false, provider: "none" };
  }

  // \`https?\`, not \`https\` — local development is http://localhost:3000, which
  // is exactly where this fallback is used, so an https-only pattern printed
  // every line of this message except the one worth having.
  const link = /https?:\\/\\/[^\\s"<]+auth\\/action[^\\s"<]*/.exec(email.text)?.[0];
  console.info(
    \`[email] delivered to the console (\${reason})\\n  to: \${email.to}\\n  subject: \${email.subject}\` +
      (link ? \`\\n  link: \${link}\` : ""),
  );

  // \`delivered: true\`, deliberately: locally the console IS the delivery
  // channel — \`canDeliver()\` already says so, and that is why action codes are
  // generated at all here. Reporting false made the two modules disagree, and
  // every local resend answered 502 "could not send" for a send that did
  // everything it was supposed to. Caught by the E2E suite's first run.
  return { delivered: true, provider: "console" };
}

/**
 * Send, or log and say so.
 *
 * Never throws. A failed send must not fail the request that triggered it: an
 * account whose verification mail bounced is still an account, and the caller
 * offers a resend. Throwing here would turn a mail outage into a sign-up
 * outage.
 */
export async function deliver(email: Email): Promise<SendResult> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return logInstead(email, "RESEND_API_KEY is not set");

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: \`Bearer \${key}\`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: sender(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });

    if (!response.ok) {
      // The body names the actual cause — an unverified domain, a bad key, a
      // suppressed address — and none of that may reach the browser, because
      // the reset endpoint must answer identically for every address.
      const detail = await response.text().catch(() => "");
      console.error(\`[email] provider refused (\${response.status}): \${detail.slice(0, 400)}\`);
      return { delivered: false, provider: "resend" };
    }

    return { delivered: true, provider: "resend" };
  } catch (error) {
    console.error("[email] send failed", error);
    return { delivered: false, provider: "resend" };
  }
}
`;
/** lib/email/templates.ts */
export const libEmailTemplates = (ctx) => `import type { Email } from "@/lib/email/send";

/**
 * The two auth emails.
 *
 * Written to \`hq/brand/voice.md\`: lead with the useful thing, prefer the
 * shorter sentence, no exclamation marks, no "we're excited to". An auth email
 * has one job and a person reading it is mid-task, so the link comes first and
 * the explanation after.
 *
 * Colours are inlined hex rather than the CSS custom properties the site uses.
 * That is not drift — no mail client resolves \`var()\`, and several strip
 * \`<style>\` blocks entirely, so every rule has to be an inline attribute. The
 * values below are a neutral starter palette — restyle them with the
 * project's brand values (inlined, for the same reason).
 */

const CREAM = "#f8f0ea";
const INK = "#082f3a";
const SECONDARY = "#365f68";
const TERTIARY = "#6b7e80";
const CORAL = "#ff6b7d";
const ON_CORAL = "#052b35";
const BORDER = "#c8dcda";

/** Escapes anything interpolated into the HTML body. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function layout({ heading, body, link, cta }: {
  heading: string;
  body: string;
  link: string;
  cta: string;
}): string {
  const safeLink = escapeHtml(link);
  return \`<!doctype html>
<html lang="en">
<body style="margin:0;padding:0;background:\${CREAM};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:\${CREAM};padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;">
        <tr><td style="padding-bottom:28px;">
          <span style="font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:700;letter-spacing:-0.02em;color:\${INK};">${ctx.upper}<span style="color:\${CORAL};">/</span></span>
        </td></tr>
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:26px;font-weight:400;letter-spacing:-0.03em;line-height:1.2;color:\${INK};padding-bottom:16px;">
          \${escapeHtml(heading)}
        </td></tr>
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:\${SECONDARY};padding-bottom:28px;">
          \${escapeHtml(body)}
        </td></tr>
        <tr><td style="padding-bottom:28px;">
          <a href="\${safeLink}" style="display:inline-block;background:\${CORAL};color:\${ON_CORAL};font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;text-decoration:none;padding:14px 28px;border-radius:999px;">\${escapeHtml(cta)}</a>
        </td></tr>
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:13px;line-height:1.6;color:\${TERTIARY};padding-bottom:8px;">
          If the button doesn't work, paste this into your browser:
        </td></tr>
        <tr><td style="font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:\${TERTIARY};word-break:break-all;padding-bottom:28px;">
          \${safeLink}
        </td></tr>
        <tr><td style="border-top:1px solid \${BORDER};padding-top:20px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:\${TERTIARY};">
          The link expires in an hour. If you didn't ask for this, you can ignore this email — nothing changes until the link is used.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>\`;
}

export function verificationEmail(to: string, link: string): Email {
  return {
    to,
    subject: "Confirm your email address",
    html: layout({
      heading: "Confirm your email",
      body: "Confirming your address lets you save your name and settings. It takes one click.",
      link,
      cta: "Confirm email",
    }),
    text: [
      "Confirm your email",
      "",
      "Confirming your address lets you save your name and settings.",
      "",
      link,
      "",
      "The link expires in an hour. If you didn't ask for this, you can ignore this",
      "email — nothing changes until the link is used.",
      "",
      "${ctx.name} — ${ctx.productionHost}",
    ].join("\\n"),
  };
}

export function passwordResetEmail(to: string, link: string): Email {
  return {
    to,
    subject: "Reset your password",
    html: layout({
      heading: "Reset your password",
      body: "Use the link below to choose a new password. Your current one keeps working until you do.",
      link,
      cta: "Choose a new password",
    }),
    text: [
      "Reset your password",
      "",
      "Use the link below to choose a new password. Your current one keeps working",
      "until you do.",
      "",
      link,
      "",
      "The link expires in an hour. If you didn't ask for this, you can ignore this",
      "email — nothing changes until the link is used.",
      "",
      "${ctx.name} — ${ctx.productionHost}",
    ].join("\\n"),
  };
}
`;
/** lib/users/decode.ts */
export const libUsersDecode = (ctx) => `/**
 * The inverse of \`waitlist/firestore-value.ts\`.
 *
 * That module exists because the REST API refuses untagged JSON on the way in.
 * This one exists because it returns the same tagged union on the way out, and
 * nothing read a document until profiles did — the waitlist only ever wrote.
 *
 * Two decisions worth stating, because both are the opposite of what a
 * permissive decoder would do:
 *
 * **\`integerValue\` comes back as a number.** It travels as a string precisely
 * so Firestore does not read it as a double; handing that string to the rest of
 * the app would leak the transport into every consumer, and \`signupCount + 1\`
 * would concatenate.
 *
 * **An unrecognised tag throws.** The alternative — returning \`undefined\` — is
 * how a field silently disappears between storage and render, which looks
 * exactly like data loss and is the hardest kind to trace. Anything that
 * reaches here unhandled is a shape we started writing without teaching this
 * file about, and that should stop the request.
 */

export type EncodedValue = Record<string, unknown>;

/** Integers outside this range cannot survive as a JS number. */
const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

export function fromFirestoreValue(value: EncodedValue): unknown {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue as string;
  if ("booleanValue" in value) return value.booleanValue as boolean;
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("timestampValue" in value) return value.timestampValue as string;

  if ("integerValue" in value) {
    // Firestore's integers are 64-bit; JavaScript's safe range is not. Silently
    // rounding past 2^53 would corrupt an id or a counter in a way that reads
    // as a plausible number, so refuse instead.
    const raw = BigInt(String(value.integerValue));
    if (raw > MAX_SAFE || raw < MIN_SAFE) {
      throw new Error(\`Firestore integer \${raw} is outside JavaScript's safe range.\`);
    }
    return Number(raw);
  }

  if ("mapValue" in value) {
    const map = value.mapValue as { fields?: Record<string, EncodedValue> };
    return fromFirestoreFields(map.fields ?? {});
  }

  if ("arrayValue" in value) {
    const array = value.arrayValue as { values?: EncodedValue[] };
    return (array.values ?? []).map(fromFirestoreValue);
  }

  throw new Error(\`Unsupported Firestore value: \${JSON.stringify(value).slice(0, 120)}\`);
}

export function fromFirestoreFields(
  fields: Record<string, EncodedValue>,
): Record<string, unknown> {
  const record: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    record[key] = fromFirestoreValue(value);
  }
  return record;
}
`;
/** lib/users/store.ts */
export const libUsersStore = (ctx) => `import "server-only";

import {
  parseUserProfile,
  USERS_COLLECTION,
  USER_SCHEMA_VERSION,
  type UserProfile,
} from "${ctx.scope}/shared/schema/user";

import { googleAccessToken } from "@/lib/firebase/admin";
import { PROJECT_ID } from "@/lib/firebase/config";
import { firestoreBearerToken, firestoreRestBaseUrl } from "@/lib/firebase/emulator";
import { documentName, toFirestoreFields } from "@/lib/waitlist/firestore-value";
import { fromFirestoreFields, type EncodedValue } from "@/lib/users/decode";

/**
 * Profile reads and writes, over the Firestore REST API.
 *
 * Same reasoning as the waitlist store, and the same constraint: \`firebase-admin\`'s
 * Firestore client goes through google-gax, which rejects the credential
 * Workload Identity Federation mints and answers \`firestore/invalid-credential\`
 * — on a deployment whose sign-in works, because Auth and Firestore fail
 * independently behind one credential. REST takes a plain bearer token, so all
 * three credential strategies authenticate identically.
 *
 * Writes go through the server rather than the browser's Firestore SDK, even
 * though the rules would permit the client directly. Two reasons: the session
 * cookie is already the session of record for rendering, and a second one would
 * split the truth; and validation that must hold — the display-name cap, the
 * frozen \`email\` — is then enforced somewhere the client cannot skip. The rules
 * assert the same bounds independently (\`profileShapeOk()\`), because defence in
 * depth is the point, not redundancy — and because for a time this comment
 * claimed that and the rules did not, which is worse than either.
 */

/** Base URL and token both route through the seam, so tests reach the emulator. */
async function firestore(
  path: string,
  init: { method: string; body?: unknown; query?: string },
): Promise<Response> {
  const token = await firestoreBearerToken(googleAccessToken);
  return fetch(\`\${firestoreRestBaseUrl()}/\${path}\${init.query ?? ""}\`, {
    method: init.method,
    headers: {
      Authorization: \`Bearer \${token}\`,
      "Content-Type": "application/json",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

async function failure(response: Response, context: string): Promise<Error> {
  const detail = await response.text().catch(() => "");
  return new Error(\`\${context} failed (\${response.status}): \${detail.slice(0, 500)}\`);
}

const NOT_FOUND = 404;
const ALREADY_EXISTS = 409;

function profilePath(uid: string): string {
  return \`projects/\${PROJECT_ID}/databases/(default)/documents/\${USERS_COLLECTION}/\${encodeURIComponent(uid)}\`;
}

/**
 * Read a profile, or null when the account has none yet.
 *
 * A missing profile is an ordinary state, not an error: it is what every
 * account looks like between the moment Firebase creates the user and the
 * moment \`ensureProfile\` runs.
 */
export async function getProfile(uid: string): Promise<UserProfile | null> {
  const response = await firestore(profilePath(uid), { method: "GET" });
  if (response.status === NOT_FOUND) return null;
  if (!response.ok) throw await failure(response, "Reading a profile");

  const document = (await response.json()) as { fields?: Record<string, EncodedValue> };
  if (!document.fields) return null;

  // Validated, not cast: a document predating a field or edited by hand would
  // otherwise satisfy the type while carrying \`undefined\` where a string is
  // promised, and surface as "undefined" rendered in a header.
  return parseUserProfile(fromFirestoreFields(document.fields));
}

/**
 * Create the profile if it is absent, and report whether it was.
 *
 * Create-first rather than read-then-write, for the same reason the waitlist
 * does it: the common path is a single round trip, and the race is decided by
 * Firestore rather than by us. Two tabs finishing sign-in together both attempt
 * the create; one gets 409 and takes it as success, because the document it
 * wanted now exists.
 *
 * \`email\` is copied from the verified token by the caller, never from anything
 * the browser sent — the rules pin the same thing, and both matter: \`email\` is
 * immutable after create, so a client free to name its own would permanently
 * stamp someone else's address onto a document it fully controls.
 */
export async function ensureProfile(
  uid: string,
  email: string,
  now: string = new Date().toISOString(),
): Promise<{ created: boolean }> {
  const fields = toFirestoreFields({
    schema_version: USER_SCHEMA_VERSION,
    email,
    createdAt: now,
    updatedAt: now,
  });

  const created = await firestore(
    \`projects/\${PROJECT_ID}/databases/(default)/documents/\${USERS_COLLECTION}\`,
    { method: "POST", query: \`?documentId=\${encodeURIComponent(uid)}\`, body: { fields } },
  );

  if (created.ok) return { created: true };
  if (created.status === ALREADY_EXISTS) return { created: false };
  throw await failure(created, "Creating a profile");
}

/**
 * Update the display name.
 *
 * \`updateMask\` limits the write to the two fields named, which is what keeps
 * this a merge rather than a replace — without it the commit would drop
 * \`email\`, \`createdAt\` and \`schema_version\`, and the rules would reject it for
 * deleting keys the update whitelist does not cover. That rejection is the
 * safety net working, but a 403 on every rename is not how anyone wants to
 * discover the mask was missing.
 *
 * An empty string clears the name rather than being refused: someone who filled
 * it in must be able to take it back out.
 */
export async function setDisplayName(
  uid: string,
  displayName: string,
  now: string = new Date().toISOString(),
): Promise<void> {
  const fields = toFirestoreFields({ displayName, updatedAt: now });

  const response = await firestore(
    \`projects/\${PROJECT_ID}/databases/(default)/documents:commit\`,
    {
      method: "POST",
      body: {
        writes: [
          {
            update: { name: documentName(PROJECT_ID, USERS_COLLECTION, uid), fields },
            updateMask: { fieldPaths: ["displayName", "updatedAt"] },
          },
        ],
      },
    },
  );

  if (!response.ok) throw await failure(response, "Updating a display name");
}
`;
/** packages/shared/schema/user.ts */
export const sharedUserSchema = (ctx) => `/**
 * Canonical shape of an ${ctx.name} consumer account.
 *
 * Provider-neutral, like \`schema/waitlist.ts\` and \`schema/analytics.ts\`.
 * Firestore is where profiles live today; this file says what a profile *is*,
 * so a second surface — the planned iOS app — writes the same fields under the
 * same names rather than inventing its own.
 *
 * Deliberately narrow, and it must stay that way. Two rules govern what may be
 * added here:
 *
 * 1. **Nothing that grants anything.** No plan, role, credit balance or feature
 *    flag. The Firestore rules let the owning client rewrite every field below,
 *    so an entitlement stored here would be self-issued. Those belong in a
 *    collection the client cannot write, or in a custom claim.
 * 2. **No health data.** It lives in the \`health\` subcollection, so its rules
 *    can be tightened without waiting on the profile's, and so a later decision
 *    to expose a display name publicly cannot widen access to it by accident.
 */

export const USERS_COLLECTION = "users";

export const USER_SCHEMA_VERSION = 1 as const;

/** Firestore subcollection under \`users/{uid}\`. Nothing writes it yet. */
export const USER_HEALTH_SUBCOLLECTION = "health";

/**
 * Longest display name we will store.
 *
 * Not a validation nicety: this string is rendered in the app's own header and
 * may later appear anywhere a person is named. A cap here means neither the
 * layout nor any consumer of it has to defend against a 10,000-character name.
 */
export const DISPLAY_NAME_MAX_LENGTH = 64;

/**
 * User-controlled preferences.
 *
 * One nested map rather than a flat set of top-level fields, because the rules
 * whitelist top-level keys — a new preference then needs no rules change.
 *
 * The cost of that convenience is exact and worth stating: Firestore's
 * \`affectedKeys()\` is top-level only, so the whole map is client-writable
 * wholesale. Anything that grants something would be forgeable while *looking*,
 * in the rules file, like it was covered. Preferences only.
 */
export interface UserSettings {
  /** Product email beyond transactional mail. Defaults off; opt-in, never out. */
  marketingEmail?: boolean;
}

/**
 * A profile document, keyed in Firestore by the Firebase Auth uid.
 *
 * The uid is the document id, so ownership is a string comparison in the rules
 * — no lookup, no billed read, and no ordering problem between a document and
 * the thing that authorises it.
 */
export interface UserProfile {
  /** The version the document was written at — reported as stored, because a
   * field that always reads as the current version cannot do the one job it
   * exists for: telling a reader it is looking at an older shape. */
  schema_version: number;
  /**
   * Mirrored from the Auth token at create, then frozen — the rules refuse to
   * change it. Auth remains the source of truth; this copy exists so a support
   * lookup or an export does not need to join against the Auth user list.
   */
  email: string;
  /** What the person calls themselves. Optional: an account is usable without one. */
  displayName?: string;
  /** Provider avatar, or one the person sets later. No upload path exists yet. */
  photoURL?: string;
  settings?: UserSettings;
  createdAt: string;
  updatedAt: string;
}

/**
 * Trim, collapse internal runs of whitespace, and cap.
 *
 * Shared rather than duplicated in the form and the route because they must
 * agree: if the client trims and the server does not, a name that looks
 * accepted comes back with the whitespace the person could not see.
 */
export function normalizeDisplayName(value: string): string {
  return value.trim().replace(/\\s+/g, " ").slice(0, DISPLAY_NAME_MAX_LENGTH);
}

/**
 * Read a decoded Firestore document as a profile, or null if it is not one.
 *
 * A validator rather than a cast. The document comes from outside the program
 * and nothing guarantees its shape: it may predate a field, have been written
 * by an older schema version, or been edited by hand in the console. Asserting
 * \`as UserProfile\` over that would put \`undefined\` behind a type that promises
 * a string, and the failure would surface somewhere else entirely — in a header
 * rendering "undefined", not here.
 *
 * Optional fields are dropped when malformed rather than failing the whole
 * read: a bad \`photoURL\` should not make an account unloadable. The required
 * ones return null, because a profile without an email or timestamps is not a
 * profile and the caller should treat it as missing.
 */
export function parseUserProfile(value: Record<string, unknown>): UserProfile | null {
  const email = value.email;
  const createdAt = value.createdAt;
  const updatedAt = value.updatedAt;

  if (typeof email !== "string") return null;
  if (typeof createdAt !== "string" || typeof updatedAt !== "string") return null;

  const settings = value.settings;
  const marketingEmail =
    settings && typeof settings === "object"
      ? (settings as Record<string, unknown>).marketingEmail
      : undefined;

  return {
    schema_version:
      typeof value.schema_version === "number" ? value.schema_version : USER_SCHEMA_VERSION,
    email,
    createdAt,
    updatedAt,
    ...(typeof value.displayName === "string" ? { displayName: value.displayName } : {}),
    ...(typeof value.photoURL === "string" ? { photoURL: value.photoURL } : {}),
    ...(typeof marketingEmail === "boolean"
      ? { settings: { marketingEmail } }
      : {}),
  };
}

/**
 * Whether a normalised display name may be stored.
 *
 * An empty string is valid and means "clear it" — distinct from \`undefined\`,
 * which means "leave it alone". Callers rely on that difference to make the
 * name erasable.
 */
export function isValidDisplayName(value: string): boolean {
  return value.length <= DISPLAY_NAME_MAX_LENGTH;
}
`;
//# sourceMappingURL=templates-lib.js.map