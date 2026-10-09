import { type GhManagerPolicy } from "./policy.js";
/**
 * The GitHub Manager persona: the brief one session works from.
 *
 * It is generated rather than stored per repository because the procedure is
 * the same everywhere — what differs is the repository's own records, which
 * the session reads from the checkout, and an optional overlay the project
 * keeps beside its policy. Pull request text never enters this prompt: the
 * session is given a number and fetches the content itself, so a title or body
 * cannot be mistaken for part of the brief.
 */
export interface SessionBrief {
    repo: string;
    number: number;
    branch: string;
    base: string;
    /** Why the sweep sent this pull request to a session. Derived from check and label facts only. */
    sweepDetail: string;
    attempts: number;
    /** The operations run, recorded as the reviewer identity. */
    runRef: string;
    /** Where the session must write its decision. */
    decisionPath: string;
    /** Where the session saves screenshots for the apply step to publish. */
    evidenceDir: string;
    /** How to invoke the Morpheus CLI in this runner. */
    cli: string;
    policy: GhManagerPolicy;
    /** The project's own additions, from `.github/gh-manager-prompt.md` on its default branch. */
    overlay?: string | undefined;
}
export declare const OVERLAY_PATH = ".github/gh-manager-prompt.md";
export declare function sessionPrompt(brief: SessionBrief): string;
