import { z } from "zod";
/**
 * The GitHub Manager's identity and the policy a repository opts in with.
 *
 * Same shape as Morpheus Security: the App acts only where a reviewed policy
 * file exists on the target's default branch, so an installation alone is
 * inert. Everything a repository may tune lives here; everything it may not —
 * who is trusted, which paths stay with a human — is code, below.
 */
export declare const GH_MANAGER_LOGIN = "morpheus-gh-manager[bot]";
export declare const GH_MANAGER_POLICY_PATH = ".github/morpheus-gh-manager.json";
/** Applied by the App once its own review covers the head. `check pr` verifies who applied it. */
export declare const MANAGER_REVIEWED_LABEL = "manager-reviewed";
/** The manager could not finish; a human has to look. Cleared by a new push. */
export declare const NEEDS_HUMAN_LABEL = "manager:needs-human";
/** A draft that has not finished the work its roadmap item defines. Cleared by a new push. */
export declare const INCOMPLETE_LABEL = "manager:incomplete";
/** The manager believes the pull request is obsolete and will close it after the grace period. */
export declare const STALE_LABEL = "manager:stale";
/** The rolling per-repository audit issue. */
export declare const LOG_LABEL = "gh-manager-log";
/**
 * Only these may have their work acted on. An issue body, a PR title and a
 * branch name are attacker-controlled on a public repository (decisions.md,
 * 2026-08-03): the manager may *report* anything and *act* only for these.
 */
export declare const TRUSTED_ASSOCIATIONS: Set<string>;
/** Lanes with their own deterministic maintainer. The manager reports on them and never touches them. */
export declare const BOT_LANES: Set<string>;
export declare const GhManagerPolicy: z.ZodObject<{
    version: z.ZodLiteral<1>;
    enabled: z.ZodDefault<z.ZodBoolean>;
    quietHours: z.ZodDefault<z.ZodNumber>;
    draftQuietHours: z.ZodDefault<z.ZodNumber>;
    maxSessionsPerRun: z.ZodDefault<z.ZodNumber>;
    maxAttemptsPerPullRequest: z.ZodDefault<z.ZodNumber>;
    closeGraceDays: z.ZodDefault<z.ZodNumber>;
    protectedPaths: z.ZodDefault<z.ZodArray<z.ZodString>>;
    model: z.ZodDefault<z.ZodString>;
    actions: z.ZodDefault<z.ZodObject<{
        merge: z.ZodDefault<z.ZodBoolean>;
        repair: z.ZodDefault<z.ZodBoolean>;
        review: z.ZodDefault<z.ZodBoolean>;
        undraft: z.ZodDefault<z.ZodBoolean>;
        close: z.ZodDefault<z.ZodBoolean>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type GhManagerPolicy = z.infer<typeof GhManagerPolicy>;
export declare function parsePolicy(raw: string): GhManagerPolicy;
/**
 * Paths in a change the manager must leave to a human. The normative set is
 * always included: clearing a change to `AGENTS.md` or `.github/` would be an
 * agent approving a change to the rules that agent runs under. One pattern,
 * shared with the finalization turn in `review/local.ts`, so the two cannot drift.
 */
export declare function humanGatedPaths(paths: string[], policy: Pick<GhManagerPolicy, "protectedPaths">): string[];
