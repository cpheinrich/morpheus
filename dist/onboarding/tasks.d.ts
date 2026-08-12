/**
 * Everything a project needs before it is really set up.
 *
 * Two rules shape this list.
 *
 * **Anything Morpheus can see, Morpheus checks.** A checklist you tick by hand
 * drifts from reality the first time someone forgets, and a checklist that can
 * be wrong about things it could have verified stops being read. Manual state
 * exists only for work that happens outside the repo — a Cloudflare token, a
 * billing account — where there is nothing to look at.
 *
 * **Nothing is sequential and nothing is lost.** State lives in
 * `hq/onboarding.md`, so being interrupted halfway costs nothing. The single
 * most common failure of setup wizards is that they are a transaction: quit at
 * step nine and you begin again at step one.
 */
export type Detection = boolean | null;
/**
 * Which kinds of project a task applies to.
 *
 * Morpheus itself is `internal` — a tool, not a company. Showing it nine
 * infrastructure steps it will never take makes the checklist wrong for it,
 * and a checklist that is wrong for you is one you stop opening.
 */
export type Kind = "company" | "personal" | "internal";
export interface Task {
    id: string;
    title: string;
    /** Defaults to every kind. */
    kinds?: Kind[];
    /** Why it matters. One line — a reason nobody reads is a reason nobody has. */
    why: string;
    /** How to do it: a command, a URL, or a sentence. */
    how: string;
    group: string;
    optional?: boolean;
    /** Needs the network. Skipped under `--offline`. */
    network?: boolean;
    /**
     * True when done, false when not, **null when it cannot be determined** —
     * a missing tool or an unreachable API must never render as "not done".
     */
    detect?: (root: string) => Promise<Detection>;
}
/**
 * Firebase Auth has two surfaces that can drift: `firebase.json` describes
 * the provider, while the remote project owns the provider and authorized
 * domain state. The reusable CLI checks both. A missing gcloud login or an
 * unreachable API is deliberately `null`, never a false "not configured".
 */
export declare function firebaseGoogleAuthReady(root: string): Promise<Detection>;
export declare const TASKS: Task[];
export declare const appliesTo: (t: Task, kind: Kind) => boolean;
export declare const tasksFor: (kind: Kind) => Task[];
export declare const groupsFor: (kind: Kind) => string[];
/** The project's declared kind, defaulting the way `doctor` does. */
export declare function projectKind(root: string): Promise<Kind>;
/**
 * What to call this project in generated output.
 *
 * The manifest is authoritative and travels with the repo; the directory name
 * is incidental and differs per checkout — a worktree for MO-044 sits in
 * `morpheus-mo-044`. Falling back to the basename let a stray `--name` write
 * `# T — setup` into a committed file, where it survived two more commits
 * because nothing regenerated it.
 */
export declare function projectLabel(root: string): Promise<string>;
