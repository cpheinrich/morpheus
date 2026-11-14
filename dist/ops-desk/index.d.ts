/**
 * Display rules shared by HQ infrastructure desks (Darwin's Operations Desk, Lakina's Infra tab).
 *
 * Pure and project-neutral: each project keeps its own sources, authorization, copy and
 * pipeline topology. What lives here is the part both desks must render the same way —
 * compact browser-local times, exact GitHub links built only from validated identifiers,
 * dated terminal outcomes that survive a stale source, newest-attempt ordering, and
 * shareable URL-fragment views.
 */
/**
 * Every absolute desk time reads like `Nov 12, 9:19pm PST`: the viewer's browser zone with its
 * DST-aware short name, no year or seconds. Anything that is not a parseable time string is
 * `Unknown`, never a guessed date.
 */
export declare function formatStamp(value: unknown, timeZone?: string): string;
/** A recorded result that stays true however old the observation that carried it becomes. */
export declare function isTerminalState(state: string): boolean;
/**
 * What a desk may show for a reported state. A dated terminal outcome is kept when its source
 * goes stale; a live state (`running`, `queued`, …) only means anything while the source is
 * current, so it becomes `unknown` rather than claiming work is still active.
 */
export declare function displayedState(state: string, current: boolean): string;
/**
 * Latest attempt first, by when it started — never by when it was read or by its status, so a
 * historical run read after a newer one cannot become the "latest" attempt. Run id breaks ties.
 */
export declare function newestAttemptFirst(a: {
    startedAt: string;
    runId: number;
}, b: {
    startedAt: string;
    runId: number;
}): number;
/** `owner/name`, in the only shape a link may be built from. */
export declare function validRepository(repository: unknown): repository is string;
/** A workflow run, or one exact attempt of it. Null unless every identifier is valid. */
export declare function githubRunUrl(repository: unknown, runId: unknown, attempt?: unknown): string | null;
/** One exact job. A stage without an observed positive job id gets no link. */
export declare function githubJobUrl(repository: unknown, runId: unknown, jobId: unknown): string | null;
/** A reported job URL is used only when it is exactly the one its identifiers produce. */
export declare function exactJobUrl(job: {
    repository?: unknown;
    runId?: unknown;
    jobId?: unknown;
    url?: unknown;
}): string | null;
/** A full 40-character lowercase commit SHA; an abbreviated or malformed one gets no link. */
export declare function githubCommitUrl(repository: unknown, sha: unknown): string | null;
/**
 * Pull-request links from a bounded list of distinct positive numbers. Anything else — too
 * many, duplicates, a non-number — yields no links at all rather than a partial list.
 */
export declare function githubPullLinks(repository: unknown, numbers: unknown, max?: number): {
    number: number;
    url: string;
}[];
/** `Scheduled Tasks` → `scheduled-tasks`: the form a view label takes in a URL fragment. */
export declare function fragmentSlug(label: string): string;
/**
 * `#work?view=recent&detail=x` → `{ section: "work", params }`. The fragment never reaches the
 * server, so a shareable view adds no identifier to any request.
 */
export declare function parseFragment(hash: string): {
    section: string;
    params: URLSearchParams;
};
/** The inverse of `parseFragment`. An empty section is the default view: no fragment at all. */
export declare function buildFragment(section: string, params?: Record<string, string | null | undefined>): string;
