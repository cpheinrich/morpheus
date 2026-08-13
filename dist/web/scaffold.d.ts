import type { FirebaseFacts } from "./templates.js";
import { type WebSurvey } from "./survey.js";
/**
 * Write the website: a Next.js app, the waitlist, and the `/hq` gate.
 *
 * **Never overwrites**, the same contract as `morpheus init` — every existing
 * file is skipped and reported. That is what makes "create the website" and
 * "add the missing half to a site that has been live for months" the same
 * command: Evo already had a home page, a token pipeline and a Vercel link, and
 * a scaffold that could only run on an empty directory would have been useless
 * to it.
 *
 * Three files are *merged* rather than skipped, because skipping them would
 * leave the generated code unable to resolve: the app's `package.json`
 * dependencies, the shared package's `exports` map, and the Firestore rules.
 * Each merge adds only what is missing and each is reported.
 *
 * **The Firebase-dependent half is written only when a Firebase project is
 * real.** A sign-in page whose `firebaseConfig` holds placeholder strings looks
 * finished and cannot work, which is the failure mode this repository keeps
 * writing rules against — a check that reports an empty thing as correct.
 */
export interface ScaffoldOptions {
    root: string;
    survey: WebSurvey;
    /** Display name, e.g. `Evo`. */
    name: string;
    /** One line for the home page and metadata, when a new app is created. */
    description: string;
    /** Package scope for a new app, e.g. `@evo`. */
    scope: string;
    /** Present once a Firebase project exists and its SDK config was read. */
    firebase?: FirebaseFacts;
    waitlist: boolean;
    hq: boolean;
}
export interface ScaffoldResult {
    written: string[];
    skipped: string[];
    merged: string[];
    notes: string[];
}
export declare function scaffoldWeb(opts: ScaffoldOptions): Promise<ScaffoldResult>;
/**
 * Add missing dependencies to the web app's manifest.
 *
 * Only ever adds. A version already pinned by the project is the project's
 * decision, and an initializer that quietly moved `next` would be changing the
 * thing it was asked to extend.
 */
export declare function mergeDependencies(root: string, webRoot: string, required: Record<string, string>): Promise<string[]>;
/**
 * Pin `jose@5` for `jwks-rsa` in the workspace.
 *
 * This is the difference between `/hq` working and returning 500 in production,
 * and nothing in the repository would tell you why. `firebase-admin@14` pulls
 * `jwks-rsa@4`, which is CommonJS and does a plain `require('jose')`; `jose@6`
 * is ESM-only, so that require needs `require(esm)` — and Vercel's Node runtime
 * launches functions with `--no-experimental-require-module`, so it is off there
 * whatever the Node version. `firebase-admin/auth` then cannot load at all, and
 * the session route fails before it reaches the credential or the role check.
 *
 * `jose@5` ships a real CJS build and `jwks-rsa` only uses `importJWK` and
 * `exportSPKI`, unchanged between 5 and 6. The pin is scoped to `jwks-rsa`, so
 * the app keeps `jose@6` for its own Edge route gate.
 *
 * Darwin found this in production and carried the fix in its own workspace file.
 * It is here because the second project to need it should not have to find it
 * the same way. Appended textually rather than through a YAML round-trip: this
 * file carries comments that explain a lockfile, and a rewrite would drop them.
 */
export declare function addJwksJoseOverride(root: string): Promise<boolean>;
type RulesOutcome = {
    kind: "merged";
    path: string;
} | {
    kind: "note";
    message: string;
} | {
    kind: "none";
};
/**
 * Add the waitlist deny block to the deployed rules.
 *
 * Written out explicitly rather than left to the catch-all: a collection closed
 * by omission looks like an oversight, and the next person wanting a signup
 * form would "fix" it by opening it up.
 *
 * Inserted only above an anchor this function can actually find. Rules are a
 * security boundary, and writing into one at a guessed position is how a
 * `match` block ends up outside the `service` scope it was meant to be inside —
 * the same reason `updateRoleHelpers` refuses a file with no markers.
 */
export declare function addWaitlistRules(root: string, rulesPath: string | null): Promise<RulesOutcome>;
export {};
