import type { BrandAnswers } from "./questions.js";
/**
 * Who owns a file once it exists.
 *
 * The original rule — never overwrite anything — was right about not
 * destroying work and wrong about treating every file the same. `refresh`
 * rewrote the answers and skipped the rest, so a changed mission could sit
 * in the answers while the old one stayed in `messaging.json`, which the
 * web app imports. The refresh reported success and shipped the stale value.
 *
 * - `derived` — a pure function of the answers. Nothing hand-written survives
 *   in it legitimately, so refresh regenerates it without asking.
 * - `seeded` — generated once as a starting point, then human-owned. Refresh
 *   reports that it disagrees with the answers; it does not resolve it.
 * - `authored` — the design session's output. Refresh never touches it.
 */
export type Ownership = "derived" | "seeded" | "authored";
export interface GenerateResult {
    files: string[];
    /** Files left untouched because they already existed. */
    skipped: string[];
    /**
     * `seeded` files whose content no longer follows from the answers. Named
     * rather than rewritten — the whole point of `seeded` is that a human may
     * have improved the prose, and silently reverting that is the same class of
     * bug as silently keeping a stale mission.
     */
    stale: string[];
}
export interface GenerateOptions {
    /**
     * Regenerate `derived` files rather than skipping them. Off for `init`,
     * where nothing should exist yet and a surprise overwrite has no upside.
     */
    refresh?: boolean;
}
/**
 * Write the brand package.
 *
 * **Never overwrites an authored or seeded file.** On `init` nothing existing
 * is touched at all.
 *
 * That matters most for `tokens.json`. Writing an empty scaffold beside a real
 * token system creates a second canonical source — the worst failure this
 * command can cause, and the one least likely to be noticed, since both files
 * look plausible.
 */
export declare function generateBrand(brandDir: string, name: string, prefix: string, answers: BrandAnswers, opts?: GenerateOptions): Promise<GenerateResult>;
/**
 * Report which files disagree with `answers.md`, writing nothing.
 *
 * Reads `answers.md` rather than asking, so this is safe in CI and
 * safe to run on a package someone else refreshed.
 */
export declare function checkDrift(brandDir: string, name: string, prefix: string, answers: BrandAnswers): Promise<{
    derived: string[];
    seeded: string[];
    missing: string[];
}>;
