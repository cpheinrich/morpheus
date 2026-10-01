import type { LiveState, Operation } from "./decision.js";
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
    merged?: boolean;
    state: string;
}
/** The latest run of each named check on a commit, plus commit statuses (Vercel and friends). */
export declare function fetchChecks(repo: string, sha: string): PullRequestFacts["checks"];
/** The manager's most recent marker on a pull request, from its own comments only. */
export declare function fetchMarker(repo: string, number: number): ManagerMarker | undefined;
export declare function fetchPullRequest(repo: string, number: number): {
    pull: RestPull;
    facts: PullRequestFacts;
};
export declare function fetchOpenPullRequests(repo: string): PullRequestFacts[];
/** Live state for the apply step, read after the session has ended. */
export declare function fetchLiveState(repo: string, number: number, supersededBy?: number): LiveState & {
    open: boolean;
    branch: string;
};
/** Carry out one operation. Text reaches `gh` as a file or an argument, never as shell. */
export declare function execute(repo: string, number: number, op: Operation): void;
/** Append a run digest to the repository's rolling log issue, creating the issue on first use. */
export declare function postDigest(repo: string, markdown: string): number;
export {};
