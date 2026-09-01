import { roadmapIdFromBranch } from "../pm/id.js";
import { type VisualEvidencePolicy } from "./visual-evidence.js";
/**
 * PR conventions, enforced rather than requested.
 *
 * AGENTS.md asks for tests, docs, a test plan, and a roadmap status update.
 * Instructions get ignored eventually; a failing check does not. This module
 * is the enforcement half of that pair.
 */
export interface PrContext {
    /** PR body markdown. */
    body: string;
    /**
     * Files that changed **on the base branch** since this branch left it — not
     * files this PR changed. CI cannot see a context receipt (`local/` is
     * gitignored, and a receipt is one machine's observation anyway), so this is
     * the freshness question CI *can* answer: did the canonical records move
     * under this branch while it was being written?
     */
    trunkChanges?: string[];
    /** Branch name, e.g. rm-014-calorie-pipeline. */
    branch: string;
    /** Paths changed in the PR, repo-relative. */
    changedFiles: string[];
    /** Repo-owned declaration of which changed paths require visual evidence. */
    visualEvidence?: VisualEvidencePolicy;
    /** Product directory to resolve roadmap items from. */
    productDir: string;
}
export interface Finding {
    /**
     * `waived` is a third level, not a flavour of warning.
     *
     * A verifier answers *is this correct?* without trusting the doer's own
     * say-so (architecture §9). `skip-tests:` and `records-only:` are written by
     * the author of the PR being checked, and until now they passed silently — so
     * a PR that excused itself from its tests was indistinguishable, in the check
     * output, from one that has them. The waivers are legitimate and stay; what
     * changes is that the rung above can see them.
     */
    level: "error" | "warning" | "waived";
    rule: string;
    message: string;
}
/**
 * A waiver line and the reason it gives.
 *
 * The reason must be more than a token. The original pattern was `\S+`, which
 * accepts `skip-tests: yes` — an opt-out with extra steps. Requiring words means
 * the author has to state something a human can weigh.
 */
export declare function waiverReason(body: string, key: string): string | null;
/** Exported for every waiver consumer — `check pr` and `review delivery` must agree. */
export declare function isRealReason(reason: string): boolean;
/**
 * The prose a reader actually sees — HTML comments and code spans removed.
 *
 * Waivers must be read from this, never from the raw body: a fenced or
 * backticked `review-waived: <reason>` is documentation *about* the waiver,
 * and matching it raw lets an example self-waive a required check.
 */
export declare function visibleProse(body: string): string;
/** Whether the PR body uses one of GitHub's same-repository closing keywords. */
export declare function closesIssue(body: string, issue: number): boolean;
export { roadmapIdFromBranch };
/**
 * True when the PR body has a heading matching `heading` with non-empty
 * content beneath it, up to the next heading of any level.
 *
 * Done as a line scan rather than a regex: the "content until the next
 * heading or end of input" shape needs an end-of-string assertion, which
 * JavaScript spells awkwardly, and the scan reads better than the result.
 */
export declare function hasSection(body: string, heading: string): boolean;
export declare function checkPr(ctx: PrContext): Promise<Finding[]>;
/**
 * Render findings, never reporting a clean run when something was waived.
 *
 * The success line is the whole point of the change: a PR that excused itself
 * from its tests used to print exactly what a PR with tests printed, so the
 * waiver was only discoverable by reading the body it was hidden in.
 */
export declare function formatFindings(findings: Finding[]): string;
