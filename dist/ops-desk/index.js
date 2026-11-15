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
export function formatStamp(value, timeZone) {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        return "Unknown";
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
        hourCycle: "h12", timeZoneName: "short",
    }).formatToParts(new Date(value));
    const { month, day, hour, minute, dayPeriod, timeZoneName } = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
    return `${month} ${day}, ${hour}:${minute}${dayPeriod?.toLowerCase() ?? ""} ${timeZoneName}`;
}
const TERMINAL = new Set(["succeeded", "failed", "cancelled", "skipped"]);
/** A recorded result that stays true however old the observation that carried it becomes. */
export function isTerminalState(state) {
    return TERMINAL.has(state);
}
/**
 * What a desk may show for a reported state. A dated terminal outcome is kept when its source
 * goes stale; a live state (`running`, `queued`, …) only means anything while the source is
 * current, so it becomes `unknown` rather than claiming work is still active.
 */
export function displayedState(state, current) {
    return current || isTerminalState(state) ? state : "unknown";
}
/**
 * Latest attempt first, by when it started — never by when it was read or by its status, so a
 * historical run read after a newer one cannot become the "latest" attempt. Run id breaks ties.
 */
export function newestAttemptFirst(a, b) {
    return (Date.parse(b.startedAt) || 0) - (Date.parse(a.startedAt) || 0) || b.runId - a.runId;
}
// `owner/name`, where neither segment may be `.` or `..` (a browser would resolve them away).
const REPOSITORY = /^(?!\.{1,2}\/)[-\w.]+\/(?!\.{1,2}$)[-\w.]+$/;
const SHA = /^[0-9a-f]{40}$/;
const positive = (value) => typeof value === "number" && Number.isSafeInteger(value) && value > 0;
/** `owner/name`, in the only shape a link may be built from. */
export function validRepository(repository) {
    return typeof repository === "string" && REPOSITORY.test(repository);
}
/** A workflow run, or one exact attempt of it. Null unless every identifier is valid. */
export function githubRunUrl(repository, runId, attempt) {
    if (!validRepository(repository) || !positive(runId))
        return null;
    const run = `https://github.com/${repository}/actions/runs/${runId}`;
    if (attempt === undefined)
        return run;
    return positive(attempt) ? `${run}/attempts/${attempt}` : null;
}
/** One exact job. A stage without an observed positive job id gets no link. */
export function githubJobUrl(repository, runId, jobId) {
    const run = githubRunUrl(repository, runId);
    return run && positive(jobId) ? `${run}/job/${jobId}` : null;
}
/** A reported job URL is used only when it is exactly the one its identifiers produce. */
export function exactJobUrl(job) {
    const expected = githubJobUrl(job.repository, job.runId, job.jobId);
    return expected !== null && job.url === expected ? expected : null;
}
/** A full 40-character lowercase commit SHA; an abbreviated or malformed one gets no link. */
export function githubCommitUrl(repository, sha) {
    return validRepository(repository) && typeof sha === "string" && SHA.test(sha)
        ? `https://github.com/${repository}/commit/${sha}`
        : null;
}
/**
 * Pull-request links from a bounded list of distinct positive numbers. Anything else — too
 * many, duplicates, a non-number — yields no links at all rather than a partial list.
 */
export function githubPullLinks(repository, numbers, max = 3) {
    return validRepository(repository)
        ? pullRequestNumbers(numbers, max).map(number => ({ number, url: `https://github.com/${repository}/pull/${number}` }))
        : [];
}
function pullRequestNumbers(numbers, max = 3) {
    if (!Array.isArray(numbers) || numbers.length > max)
        return [];
    return new Set(numbers).size === numbers.length && numbers.every(positive) ? numbers : [];
}
/** `Scheduled Tasks` → `scheduled-tasks`: the form a view label takes in a URL fragment. */
export function fragmentSlug(label) {
    return label.toLowerCase().replaceAll(" ", "-");
}
/**
 * `#work?view=recent&detail=x` → `{ section: "work", params }`. The fragment never reaches the
 * server, so a shareable view adds no identifier to any request.
 */
export function parseFragment(hash) {
    const body = hash.replace(/^#/, "");
    const mark = body.indexOf("?");
    // Everything after the first `?` is the query, including any later `?` typed by hand.
    return mark < 0
        ? { section: body, params: new URLSearchParams() }
        : { section: body.slice(0, mark), params: new URLSearchParams(body.slice(mark + 1)) };
}
/** The inverse of `parseFragment`. An empty section is the default view: no fragment at all. */
export function buildFragment(section, params = {}) {
    if (!section)
        return "";
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params))
        if (value)
            query.set(key, value);
    return `#${section}${query.size ? `?${query}` : ""}`;
}
function displayText(value, limit) {
    if (typeof value !== "string" || /[\p{Cc}\p{Cf}]/u.test(value))
        return null;
    const clean = value.trim();
    return clean && clean.length <= limit ? clean : null;
}
export function factoryWorkMetadata(value) {
    if (!value || typeof value !== "object")
        return null;
    const { title, summary, pullRequests } = value;
    const name = displayText(title, 80);
    const description = displayText(summary, 320);
    if (!name || !description)
        return null;
    const prs = pullRequestNumbers(pullRequests);
    return { title: name, summary: description, ...(prs.length > 0 && { pullRequests: prs }) };
}
/** Display rules only. The desk supplies the canonical, authorized repository. */
export function factoryWorkPresentation(task) {
    const { id, repository, revision, display, reportedPullRequests } = task;
    const metadata = factoryWorkMetadata(display);
    // Never promote a task identifier (including the old eight-character prefix) into the title.
    const title = metadata?.title;
    const includesId = id.length >= 8 && title?.toLowerCase().includes(id.slice(0, 8).toLowerCase());
    const repositoryName = validRepository(repository) ? repository.split("/")[1] : null;
    const pullRequests = [
        ...new Set([
            ...pullRequestNumbers(metadata?.pullRequests),
            ...pullRequestNumbers(reportedPullRequests),
        ]),
    ].slice(0, 3);
    return {
        title: title && !includesId ? title : repositoryName ? `Factory work in ${repositoryName}` : "Factory task",
        summary: metadata?.summary ?? null,
        sourceUrl: githubCommitUrl(repository, revision),
        pullRequests: githubPullLinks(repository, pullRequests),
    };
}
//# sourceMappingURL=index.js.map