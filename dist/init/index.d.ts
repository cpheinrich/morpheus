import type { Seed } from "./templates.js";
/**
 * Scaffold a Morpheus project.
 *
 * **Never overwrites.** Anything already present is skipped and reported,
 * which is what makes this safe to run on an established repository — so
 * "initialise a new project" and "bring an old one up to the standard" are the
 * same command rather than two that drift.
 *
 * Deliberately scoped to the repository. Provisioning GCP, DNS and Vercel is
 * not here: those live in someone else's console, they need credentials this
 * command should not hold, and `morpheus init status` already tracks them.
 * Drawing the seam there means `init` cannot be blocked on a token.
 */
export interface InitResult {
    written: string[];
    skipped: string[];
    /** Explanations and follow-up constraints that do not belong in written/skipped. */
    notes: string[];
}
export declare const KIND_DIRS: Record<"company" | "personal" | "internal", string[]>;
export declare function scaffold(root: string, seed: Seed): Promise<InitResult>;
