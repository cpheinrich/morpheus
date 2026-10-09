import type { LiveState, Operation } from "./decision.js";
import { type EvidenceItem } from "./evidence.js";
import { type GhManagerPolicy } from "./policy.js";
import { type ManagerMarker, type PullRequestFacts } from "./sweep.js";
export declare function assertRepository(repo: string): string;
/**
 * The repository's opt-in policy on its default branch.
 *
 * `null` means the file is absent — the repository has not opted in, and the
 * manager does nothing there. Any other failure throws: an unreadable or
 * invalid policy must not read as "no policy", or a typo would silently turn
 * the manager off and nobody would be told.
 */
export declare function fetchPolicy(repo: string): GhManagerPolicy | null;
interface RestPull {
    number: number;
    title: string;
    body: string | null;
    draft: boolean;
    created_at: string;
    user: {
        login: string;
    };
    author_association: string;
    head: {
        sha: string;
        ref: string;
        repo: {
            full_name: string;
        } | null;
    };
    base: {
        ref: string;
        repo: {
            full_name: string;
        };
    };
    labels: {
        name: string;
    }[];
    auto_merge: unknown;
    mergeable?: boolean | null;
    /** REST's lower-case merge state: `behind`, `dirty`, `clean`, `blocked`, `unstable`, `unknown`. */
    mergeable_state?: string;
    merged?: boolean;
    state: string;
}
/** The latest run of each named check on a commit, plus commit statuses (Vercel and friends). */
export declare function fetchChecks(repo: string, sha: string): PullRequestFacts["checks"];
/** The manager's most recent marker on a pull request, from its own comments only. */
export declare function fetchMarker(repo: string, number: number): ManagerMarker | undefined;
/**
 * The author's permission on the repository, or undefined when it cannot be read. Asked only
 * when the association does not already establish trust, because the association is what the
 * App's token can see, and private organization membership is invisible to it.
 */
export declare function fetchAuthorPermission(repo: string, login: string): string | undefined;
export declare function fetchPullRequest(repo: string, number: number): {
    pull: RestPull;
    facts: PullRequestFacts;
};
export declare function fetchOpenPullRequests(repo: string): PullRequestFacts[];
/**
 * Live state for the apply step, read after the session has ended. What the session pushed and
 * whether its record validates need a real checkout, so the caller fills those in; here they
 * start at the refusing values.
 */
export declare function fetchLiveState(repo: string, number: number, supersededBy?: number): LiveState & {
    open: boolean;
    branch: string;
    base: string;
};
/** Carry out one operation. Text reaches `gh` as a file or an argument, never as shell. */
export declare function execute(repo: string, number: number, op: Operation): void;
/**
 * Publish screenshots as one orphan commit tagged `gh-manager-evidence/<commit>`, and return each
 * file's URL through that tag. A tag rather than a branch: a branch push would start every
 * Git-connected deployment. The commit has no parent, so nothing in it can reach the product.
 */
export declare function publishEvidence(repo: string, pr: number, items: EvidenceItem[]): {
    file: string;
    caption: string;
    url: string;
}[];
/** Append a run digest to the repository's rolling log issue, creating the issue on first use. */
export declare function postDigest(repo: string, markdown: string): number;
export {};
