import { z } from "zod";
import { NORMATIVE } from "../review/local.js";
/**
 * The GitHub Manager's identity and the policy a repository opts in with.
 *
 * Same shape as Morpheus Security: the App acts only where a reviewed policy
 * file exists on the target's default branch, so an installation alone is
 * inert. Everything a repository may tune lives here; everything it may not —
 * who is trusted, which paths stay with a human — is code, below.
 */
export const GH_MANAGER_LOGIN = "morpheus-gh-manager[bot]";
export const GH_MANAGER_POLICY_PATH = ".github/morpheus-gh-manager.json";
/** Applied by the App once its own review covers the head. `check pr` verifies who applied it. */
export const MANAGER_REVIEWED_LABEL = "manager-reviewed";
/** The manager could not finish; a human has to look. Cleared by a new push. */
export const NEEDS_HUMAN_LABEL = "manager:needs-human";
/** A draft that has not finished the work its roadmap item defines. Cleared by a new push. */
export const INCOMPLETE_LABEL = "manager:incomplete";
/** The manager believes the pull request is obsolete and will close it after the grace period. */
export const STALE_LABEL = "manager:stale";
/** The rolling per-repository audit issue. */
export const LOG_LABEL = "gh-manager-log";
/**
 * Only these may have their work acted on. An issue body, a PR title and a
 * branch name are attacker-controlled on a public repository (decisions.md,
 * 2026-08-03): the manager may *report* anything and *act* only for these.
 */
export const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);
/** Lanes with their own deterministic maintainer. The manager reports on them and never touches them. */
export const BOT_LANES = new Set(["morpheus-security[bot]", "dependabot[bot]", GH_MANAGER_LOGIN]);
const Actions = z.object({
    /** Enable auto-merge on a reviewed, green pull request. */
    merge: z.boolean().default(true),
    /** Resolve conflicts and fix failing checks. */
    repair: z.boolean().default(true),
    /** Conduct the manager review and fix its findings in the same session. */
    review: z.boolean().default(true),
    /** Mark a draft ready when the work reads as complete. */
    undraft: z.boolean().default(true),
    /** Close a pull request other work made obsolete. */
    close: z.boolean().default(true),
}).strict();
export const GhManagerPolicy = z.object({
    version: z.literal(1),
    enabled: z.boolean().default(true),
    /**
     * Hours a head commit must have sat untouched before the manager acts. An
     * authoring session may still be driving the branch, and two authors on one
     * branch is the collision the worktree rule exists to prevent.
     */
    quietHours: z.number().min(0).max(24 * 14).default(8),
    /**
     * The same wait for a draft, and much longer: a draft says its author is not
     * finished. Only after this long untouched is it presumed abandoned — the
     * author forgot to mark it ready or to merge it — and checked for completeness.
     */
    draftQuietHours: z.number().min(0).max(24 * 30).default(48),
    /** Model sessions per run. Each one spends subscription usage and runner minutes. */
    maxSessionsPerRun: z.number().int().min(0).max(20).default(4),
    /** Sessions the manager may spend on one pull request before it stops and asks a human. */
    maxAttemptsPerPullRequest: z.number().int().min(1).max(5).default(2),
    /** Days after a stale warning before an unanswered pull request is closed. */
    closeGraceDays: z.number().int().min(1).max(90).default(7),
    /** Extra path prefixes, beyond the normative set, that the manager must leave to a human. */
    protectedPaths: z.array(z.string().trim().min(1)).max(50).default([]),
    model: z.string().trim().regex(/^claude-[a-z0-9.-]+$/).default("claude-opus-5-5"),
    actions: Actions.default(() => Actions.parse({})),
}).strict();
export function parsePolicy(raw) {
    return GhManagerPolicy.parse(JSON.parse(raw));
}
/**
 * Paths in a change the manager must leave to a human. The normative set is
 * always included: clearing a change to `AGENTS.md` or `.github/` would be an
 * agent approving a change to the rules that agent runs under. One pattern,
 * shared with the finalization turn in `review/local.ts`, so the two cannot drift.
 */
export function humanGatedPaths(paths, policy) {
    return paths.filter(path => NORMATIVE.test(path) || policy.protectedPaths.some(prefix => path === prefix || path.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`)));
}
//# sourceMappingURL=policy.js.map