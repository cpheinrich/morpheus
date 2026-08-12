/**
 * Assembling the prompt for verifier rung 2 — agent code review.
 *
 * The reviewer is a *second* session. That independence is the entire point:
 * an agent reviewing its own work re-derives the same reasoning and reaches the
 * same wrong conclusion, so "the agent self-reviewed" is not a rung.
 *
 * Deliberately **not** a diff dump. The reviewer already has the repository and
 * the pull request; what it cannot infer is *what the change was supposed to
 * do*. So the prompt carries intent — the roadmap item, its acceptance
 * criteria, and the settled decisions it must not quietly reverse — and leaves
 * reading the code to the reviewer.
 *
 * Pure, so the judgment encoded here is testable without a model.
 */
export interface ReviewContext {
    /** The reviewer persona, from `.github/agent-review-prompt.md`. */
    persona: string;
    /** Roadmap id the branch claims, if any. */
    id?: string;
    /** The item's title. */
    title?: string;
    /** The item's markdown body — its stated intent. */
    intent?: string;
    /** Contents of the item's `acceptance` file, when it declares one. */
    acceptance?: string;
    /** Path that `acceptance` pointed at but which does not exist. */
    missingAcceptance?: string;
}
/**
 * Build the reviewer's prompt.
 *
 * The conformance section is **omitted entirely** rather than rendered empty
 * when an item declares no acceptance criteria. An empty heading reads as "there
 * are no criteria to meet", which is a different and much weaker claim than "no
 * criteria were stated" — and a reviewer told the former will stop looking.
 */
export declare function buildReviewPrompt(ctx: ReviewContext): string;
/**
 * Resolve an item's `acceptance` value to a repo-relative path.
 *
 * The schema documents it as "a path into `qa/acceptance/`", which has been
 * written both ways in practice — bare filename and full path. Accepting both
 * costs one branch; guessing wrong makes a declared criterion silently missing,
 * which is the failure mode this rung exists to catch.
 */
export declare function acceptancePath(value: string): string;
