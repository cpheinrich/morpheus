/**
 * Whether a trunk rescue may publish its edits.
 *
 * A rescue used to push its `wip/trunk-*` branch and open a draft PR
 * everywhere. On a public repository that publishes whatever was lying in the
 * trunk checkout: morpheus #452 put an agent's private working document, a
 * Tailscale hostname and local paths on the public web, and closing the pull
 * request unpublished none of it. Chris's rule (2026-10-28): public
 * repositories keep rescues local.
 *
 * So a rescue publishes only when **every** repository it would reach — the
 * push remote's push and fetch repositories, and the trunk remote's on a fork —
 * reads exactly `PRIVATE`. Public, internal, a remote that is not on GitHub,
 * a missing or failing `gh`, and an answer this cannot parse all keep the
 * branch local. Unknown is treated as public: an unanswerable question must
 * never render as permission to publish (`learned.md`).
 */
export interface CommandResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<CommandResult>;
/**
 * How long an answer is reused. Short on purpose: a repository can be made
 * public at any time, and a cached `PRIVATE` older than this would publish to
 * it. One hour costs at most one `gh` call per hour of dirty-trunk rescues,
 * which are rare.
 */
export declare const VISIBILITY_CACHE_MS: number;
export type GhVisibility = "PUBLIC" | "PRIVATE" | "INTERNAL";
export interface PublishVerdict {
    /** True only when every repository read exactly `PRIVATE`. */
    publish: boolean;
    /** The `owner/repo` repositories consulted. */
    repos: string[];
    /** Why the rescue stays local, in words for the brief. Absent when `publish`. */
    reason?: string;
}
/** gh's `{"visibility": "…"}`, or null for anything else. */
export declare function parseGhVisibility(stdout: string): GhVisibility | null;
/** `owner/repo` from a GitHub remote URL, or null. */
export declare function githubRepo(url: string): string | null;
/**
 * The repositories a rescue would publish to. Both what the remotes are
 * configured as (the repository a PR targets, before any `insteadOf` rewrite
 * of the transport) and where the push actually lands after rewriting
 * (`git remote get-url --push --all`), because a `pushInsteadOf` can send the
 * branch somewhere the configured URL does not name. Every GitHub repository
 * found either way is checked. Any URL that is neither a GitHub repository nor
 * a path on this machine is described in `unidentified`, and decides "local".
 */
export declare function rescueRepositories(root: string, pushRemote: string, trunkRemote: string): Promise<{
    repos: string[];
    unidentified: string[];
}>;
/** Where answers persist between sessions. `read` returns null when there is nothing usable. */
export interface VisibilityCache {
    read(): Promise<string | null>;
    write(data: string): Promise<void>;
}
interface CacheFile {
    version: 1;
    repos: Record<string, {
        visibility: GhVisibility;
        checkedAt: string;
    }>;
}
/**
 * A cached answer younger than `VISIBILITY_CACHE_MS`, or null. A timestamp in
 * the future (a clock moved back) is not fresh: that age cannot be measured.
 */
export declare function cachedVisibility(cache: CacheFile, repo: string, now: Date): GhVisibility | null;
/**
 * Read each repository's visibility (cache first), and decide. Never throws:
 * every failure is a reason to keep the rescue local.
 */
export declare function publishVerdict(root: string, targets: {
    repos: string[];
    unidentified: string[];
}, runner: CommandRunner, now: Date, cache: VisibilityCache | null): Promise<PublishVerdict>;
/**
 * The cache file in the primary checkout's ignored `local/sessions/`. Not the
 * checkout a session is in: `pm cleanup` refuses a task worktree that holds
 * any other ignored file. And only where Git ignores it, so a repository that
 * does not ignore `local/` gets no file one `git add -A` from being committed;
 * there every rescue reads visibility afresh.
 */
export declare function defaultVisibilityCache(root: string): Promise<VisibilityCache | null>;
export {};
