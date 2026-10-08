import { z } from "zod";
import type { Finding } from "../check/pr.js";
declare const FollowUp: z.ZodObject<{
    reviewerSession: z.ZodString;
    commit: z.ZodString;
    base: z.ZodOptional<z.ZodString>;
    scopeReason: z.ZodOptional<z.ZodString>;
    humanAuthorization: z.ZodOptional<z.ZodObject<{
        approvedBy: z.ZodString;
        approvedAt: z.ZodISODateTime;
        reason: z.ZodString;
    }, z.core.$strict>>;
    finalization: z.ZodOptional<z.ZodObject<{
        paths: z.ZodArray<z.ZodString>;
        evidence: z.ZodString;
        attestation: z.ZodString;
    }, z.core.$strict>>;
    outcome: z.ZodEnum<{
        blocked: "blocked";
        incomplete: "incomplete";
        cleared: "cleared";
    }>;
    elapsedMinutes: z.ZodNumber;
    timing: z.ZodOptional<z.ZodObject<{
        source: z.ZodEnum<{
            runner: "runner";
            clock: "clock";
        }>;
        durationMs: z.ZodNumber;
        evidence: z.ZodString;
    }, z.core.$strict>>;
    summary: z.ZodString;
}, z.core.$strict>;
export type ReviewFollowUp = z.infer<typeof FollowUp>;
/**
 * Reviewer turns after the initial review. Three turns in total is the cap that stops an
 * author and a reviewer trading fixes and findings indefinitely: a turn is spent to resolve
 * what the previous one left blocked, or on a late correction after a clearance that names
 * its scope decision, and nothing after the last one is automatic.
 */
export declare const MAX_FOLLOW_UPS = 2;
/**
 * A finalization turn is short by construction: it re-reads a documentation paragraph or the
 * record, not a change. Anything that needs longer than this is a review, and spends a turn.
 */
export declare const FINALIZATION_CEILING_MINUTES = 5;
/**
 * Policy a project is operated by, whatever file carries it. A change here is normative and needs
 * a real turn however it is described: this is the reason there is no blanket documentation
 * exemption. Explanatory prose that restates behaviour already reviewed is a different thing.
 */
export declare const NORMATIVE: RegExp;
export declare const ReviewRecord: z.ZodObject<{
    version: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<2>]>;
    base: z.ZodString;
    reviewed: z.ZodString;
    covered: z.ZodString;
    authorSession: z.ZodString;
    reviewerSession: z.ZodString;
    risk: z.ZodEnum<{
        small: "small";
        normal: "normal";
        high: "high";
    }>;
    elapsedMinutes: z.ZodNumber;
    timing: z.ZodOptional<z.ZodObject<{
        source: z.ZodEnum<{
            runner: "runner";
            clock: "clock";
        }>;
        durationMs: z.ZodNumber;
        evidence: z.ZodString;
    }, z.core.$strict>>;
    extensionReason: z.ZodOptional<z.ZodString>;
    outcome: z.ZodEnum<{
        blocked: "blocked";
        incomplete: "incomplete";
        complete: "complete";
    }>;
    initialOutcome: z.ZodOptional<z.ZodLiteral<"incomplete">>;
    summary: z.ZodString;
    trunkIntegrations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        commit: z.ZodString;
        reason: z.ZodString;
    }, z.core.$strict>>>;
    documentationIntegrations: z.ZodOptional<z.ZodArray<z.ZodObject<{
        base: z.ZodString;
        commit: z.ZodString;
        reason: z.ZodString;
        sources: z.ZodArray<z.ZodObject<{
            commit: z.ZodString;
            reviewRecord: z.ZodString;
        }, z.core.$strict>>;
    }, z.core.$strict>>>;
    findings: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        severity: z.ZodEnum<{
            minor: "minor";
            substantive: "substantive";
            incidental: "incidental";
        }>;
        description: z.ZodString;
        paths: z.ZodArray<z.ZodString>;
        disposition: z.ZodEnum<{
            fixed: "fixed";
            open: "open";
            deferred: "deferred";
            disputed: "disputed";
        }>;
        response: z.ZodString;
        roadmap: z.ZodOptional<z.ZodString>;
        condition: z.ZodOptional<z.ZodObject<{
            paths: z.ZodArray<z.ZodString>;
            evidence: z.ZodString;
        }, z.core.$strict>>;
        conditionMet: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    followUp: z.ZodOptional<z.ZodObject<{
        reviewerSession: z.ZodString;
        commit: z.ZodString;
        base: z.ZodOptional<z.ZodString>;
        scopeReason: z.ZodOptional<z.ZodString>;
        humanAuthorization: z.ZodOptional<z.ZodObject<{
            approvedBy: z.ZodString;
            approvedAt: z.ZodISODateTime;
            reason: z.ZodString;
        }, z.core.$strict>>;
        finalization: z.ZodOptional<z.ZodObject<{
            paths: z.ZodArray<z.ZodString>;
            evidence: z.ZodString;
            attestation: z.ZodString;
        }, z.core.$strict>>;
        outcome: z.ZodEnum<{
            blocked: "blocked";
            incomplete: "incomplete";
            cleared: "cleared";
        }>;
        elapsedMinutes: z.ZodNumber;
        timing: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                runner: "runner";
                clock: "clock";
            }>;
            durationMs: z.ZodNumber;
            evidence: z.ZodString;
        }, z.core.$strict>>;
        summary: z.ZodString;
    }, z.core.$strict>>;
    followUps: z.ZodOptional<z.ZodArray<z.ZodObject<{
        reviewerSession: z.ZodString;
        commit: z.ZodString;
        base: z.ZodOptional<z.ZodString>;
        scopeReason: z.ZodOptional<z.ZodString>;
        humanAuthorization: z.ZodOptional<z.ZodObject<{
            approvedBy: z.ZodString;
            approvedAt: z.ZodISODateTime;
            reason: z.ZodString;
        }, z.core.$strict>>;
        finalization: z.ZodOptional<z.ZodObject<{
            paths: z.ZodArray<z.ZodString>;
            evidence: z.ZodString;
            attestation: z.ZodString;
        }, z.core.$strict>>;
        outcome: z.ZodEnum<{
            blocked: "blocked";
            incomplete: "incomplete";
            cleared: "cleared";
        }>;
        elapsedMinutes: z.ZodNumber;
        timing: z.ZodOptional<z.ZodObject<{
            source: z.ZodEnum<{
                runner: "runner";
                clock: "clock";
            }>;
            durationMs: z.ZodNumber;
            evidence: z.ZodString;
        }, z.core.$strict>>;
        summary: z.ZodString;
    }, z.core.$strict>>>;
}, z.core.$strict>;
export type LocalReviewRecord = z.infer<typeof ReviewRecord>;
/** Follow-up turns in order, whichever field the record used. */
export declare function followUpTurns(record: LocalReviewRecord): ReviewFollowUp[];
/** The trunk base the reviewer's clearance covered: the latest recorded integration, else the original. */
export declare function coveredBase(record: LocalReviewRecord): string;
/** Findings the reviewer pre-cleared and the author fixed under the stated condition. */
export declare function conditionallyCleared(record: LocalReviewRecord): string[];
/**
 * The paths a finalization turn may cover: the review record, paths the reviewer already
 * conditioned, and explanatory Markdown it attests to. Returns the reasons it may not, so the
 * refusal names the offending path rather than the rule.
 */
export declare function finalizationProblems(record: LocalReviewRecord, turn: ReviewFollowUp, worklog: string): string[];
/** Initial-review ceilings in minutes; a follow-up gets half. Small was 5 until the data showed only creative accounting. */
export declare const REVIEW_BUDGET_MINUTES: {
    readonly small: 10;
    readonly normal: 15;
    readonly high: 30;
};
export declare function reviewRequired(config: unknown): boolean;
export declare function git(root: string, args: string[]): string;
export declare function isAncestor(root: string, older: string, newer: string): boolean;
export declare function parseReviewRecord(markdown: string): LocalReviewRecord;
export declare function validateReviewRecord(record: LocalReviewRecord): void;
export declare function changedPaths(root: string, older: string, newer: string): string[];
/**
 * Walk the first-parent commits in a range that the reviewer did not clear. Merging trunk never
 * invalidates coverage, as on a human team: a merge Git reproduces exactly passes on its own, and a
 * hand-resolved one passes when the record names it, so the unreviewed resolution is visible rather
 * than hidden. Any other commit may touch only the allowed paths. Returns the merges it accepted.
 */
export declare function verifyUncoveredCommits(root: string, record: {
    trunkIntegrations?: {
        commit: string;
    }[] | undefined;
}, from: string, to: string, trunk: string, allowed: Set<string>, refusal: string): Set<string>;
/**
 * The project manifest as committed at `commit`, for the review gate.
 *
 * Two different absences, answered differently. A commit this checkout does not hold is a fact
 * about the checkout (shallow, single-branch, or a head pushed after the event was sent), not about
 * the pull request, so it is named as such instead of surfacing as a raw `git show` failure. A
 * manifest absent at a commit that is present means the project has no configuration there, and
 * the defaults apply: review stays required, which is the safe direction.
 */
export declare function committedConfig(root: string, commit: string): unknown;
/**
 * A PR without the label is never passed here, draft or not. Keeping a draft from going red is the
 * caller's job: its `pr` job skips an unlabelled draft, which leaves the required check unreported,
 * and an unreported required check blocks merge where a passing or skipped one would not.
 */
export declare const MISSING_LABEL = "agent-reviewed label is not applied, so the PR is not marked merge-ready. Review record validation was not run. Apply the label once independent review covers the current head; leave it absent while a correction or follow-up is pending. While review is under way, keep the PR a draft (gh pr ready --undo): conventions then wait, unreported, until it is labelled or marked ready.";
/** Read only committed evidence; paths and refs are data, never shell text. */
export declare function checkLocalReview(opts: {
    root: string;
    body: string;
    labels: string[];
    head: string;
    base: string;
}): Finding[];
/** The worklog path a PR body's single visible `review-record:` line names; throws CI's message otherwise. */
export declare function reviewRecordLine(body: string): string;
/**
 * Everything the gate checks once it knows which worklog holds the record: the same function
 * `check pr` runs in CI and `review validate` runs before a push, so the two cannot disagree.
 * Throws the first problem found.
 */
export declare function verifyReviewRecord(opts: {
    root: string;
    path: string;
    head: string;
    base: string;
}): LocalReviewRecord;
export {};
