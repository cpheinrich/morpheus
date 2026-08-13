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
    /** Email domain named on the sign-in page, e.g. `darwin.health`. */
    emailDomain?: string;
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
