import type { FirebaseFacts } from "./templates.js";
/**
 * Provision what a website needs to exist: a GCP project, Firebase, Firestore,
 * a registered web app, and the identity a Vercel deployment authenticates as.
 *
 * This is the half `morpheus init` deliberately does not do (§12.11) — it lives
 * in someone else's console and needs credentials the repository scaffold
 * should not hold. Splitting it into its own command keeps that property: `init`
 * still cannot be blocked on a token, and this one is allowed to be.
 *
 * **Every step is detect, then act, then report what is true.** A step that
 * cannot determine its own outcome reports `blocked` with the reason; nothing
 * here returns `done` on the strength of a command having exited zero, because
 * an unconfigured verifier reporting success is the failure this repository has
 * written down four times.
 *
 * **Nothing is destructive.** Every step either finds what it needs or creates
 * something that was absent. No step deletes, disables, or rewrites a resource
 * someone else made.
 */
export interface CommandResult {
    stdout: string;
    stderr: string;
}
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<CommandResult>;
export type StepState = "already" | "created" | "skipped" | "blocked";
export interface StepResult {
    id: string;
    title: string;
    state: StepState;
    detail: string;
}
export interface ProvisionOptions {
    root: string;
    /** Firebase / GCP project id, e.g. `dh-evo`. */
    project: string;
    /** Display name for a project this run creates. At least four characters. */
    displayName: string;
    /** GCP organisation id, when one should own a newly created project. */
    organization?: string;
    /** Vercel team slug, for the OIDC issuer. Without it, federation is skipped. */
    vercelTeam?: string;
    /** Google account to act as. Passed explicitly rather than left ambient. */
    account?: string;
    runner?: CommandRunner;
}
export interface ProvisionResult {
    steps: StepResult[];
    /** Present once the web app is registered and its SDK config was read. */
    firebase?: FirebaseFacts;
}
export declare function provisionWeb(opts: ProvisionOptions): Promise<ProvisionResult>;
/** Everything that is not `already` or `created` — what still stands between here and working. */
export declare function outstanding(steps: StepResult[]): StepResult[];
