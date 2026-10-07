import { BOT_LANES, INCOMPLETE_LABEL, MANAGER_REVIEWED_LABEL, NEEDS_HUMAN_LABEL, STALE_LABEL, TRUSTED_ASSOCIATIONS, TRUSTED_PERMISSIONS, } from "./policy.js";
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const MARKER = /<!-- morpheus-gh-manager (\{[^\n]*\}) -->/g;
/** A branch name the brief can carry verbatim. Git allows `;`, `$`, backticks and more in a ref. */
export const SAFE_REF = /^[A-Za-z0-9._/-]+$/;
export function renderMarker(marker) {
    return `<!-- morpheus-gh-manager ${JSON.stringify(marker)} -->`;
}
/**
 * The marker in a comment body, or undefined.
 *
 * Only the **last** marker in the body is read. The comment also carries text a model wrote, and
 * the deterministic step appends the real marker after all of it; reading the first match let a
 * marker-shaped string in a summary forge the attempt count or the stale warning's date. A
 * malformed last marker is absent, not an error, and never falls back to an earlier one.
 */
export function parseMarker(body) {
    const match = [...body.matchAll(MARKER)].at(-1);
    if (!match)
        return undefined;
    try {
        const raw = JSON.parse(match[1]);
        if (typeof raw.head !== "string" || typeof raw.verdict !== "string" || typeof raw.attempts !== "number" || typeof raw.at !== "string")
            return undefined;
        if (!["merge", "escalate", "close", "warn-stale", "incomplete", "wait"].includes(raw.verdict))
            return undefined;
        if (raw.cleared !== undefined && typeof raw.cleared !== "string")
            return undefined;
        return { head: raw.head, verdict: raw.verdict, attempts: raw.attempts, at: raw.at, ...(raw.cleared ? { cleared: raw.cleared } : {}) };
    }
    catch {
        return undefined;
    }
}
function summarize(checks) {
    return {
        failing: checks.filter(c => c.state === "failure").map(c => c.name),
        pending: checks.filter(c => c.state === "pending").map(c => c.name),
        // Neither passed nor failed: nothing about the change was judged. It needs a rerun, not a
        // session, and a required check left cancelled holds auto-merge open forever.
        cancelled: checks.filter(c => c.state === "cancelled").map(c => c.name),
    };
}
/** Route one pull request. Pure: `now` is passed in. */
export function routePullRequest(pr, policy, now) {
    const marker = pr.marker;
    // A human answering an escalation — by pushing, or by removing the label to say "try again" —
    // is a new situation; the budget starts again.
    const reopened = marker?.verdict === "escalate" && (marker.head !== pr.headSha || !pr.labels.includes(NEEDS_HUMAN_LABEL));
    const attempts = marker && !reopened ? marker.attempts : 0;
    const routed = (route, reason, detail) => ({ number: pr.number, title: pr.title, headSha: pr.headSha, route, reason, detail, attempts });
    if (BOT_LANES.has(pr.author))
        return routed("skip", "bot-lane", `${pr.author} has its own maintainer`);
    const trusted = TRUSTED_ASSOCIATIONS.has(pr.authorAssociation) || TRUSTED_PERMISSIONS.has(pr.authorPermission ?? "");
    if (!trusted || pr.isCrossRepository) {
        const standing = `${pr.authorAssociation}${pr.authorPermission ? ` with ${pr.authorPermission} permission` : ""}`;
        return routed("skip", "untrusted-author", `author ${pr.author} is ${standing}${pr.isCrossRepository ? " on a fork" : ""}; reported, not acted on`);
    }
    // The branch name is the one piece of author-controlled text the brief has to carry.
    if (!SAFE_REF.test(pr.headRefName))
        return routed("skip", "unsafe-branch-name", "the branch name has characters the manager will not put in a brief");
    if (pr.labels.includes(NEEDS_HUMAN_LABEL) && marker?.head === pr.headSha) {
        return routed("skip", "escalated", "waiting on a human since the last run; a new push reopens it");
    }
    if (pr.labels.includes(INCOMPLETE_LABEL) && marker?.head === pr.headSha) {
        return routed("skip", "incomplete", "marked incomplete against its roadmap item; a new push reopens it");
    }
    // The later of the commit date and the day the pull request opened: a commit can be made long
    // before it is pushed, and its date alone would call a branch quiet minutes after it appeared.
    const age = now.getTime() - Math.max(Date.parse(pr.headCommittedAt), Date.parse(pr.createdAt));
    const quiet = pr.isDraft ? policy.draftQuietHours : policy.quietHours;
    // An unparseable date is not "old". Treat it as active rather than acting on a branch whose
    // age is unknown.
    if (!Number.isFinite(age) || age < quiet * HOUR) {
        return routed("skip", "active", pr.isDraft
            ? `draft, and its head commit is under ${quiet}h old; not yet presumed abandoned`
            : `head commit is under ${quiet}h old; an author may still be driving it`);
    }
    if (pr.labels.includes(STALE_LABEL) && marker?.verdict === "warn-stale" && marker.head === pr.headSha) {
        const warned = now.getTime() - Date.parse(marker.at);
        if (Number.isFinite(warned) && warned >= policy.closeGraceDays * DAY) {
            return policy.actions.close
                ? routed("close", "stale-grace-expired", `no activity for ${policy.closeGraceDays} days after the stale warning`)
                : routed("skip", "close-disabled", "stale, but closing is disabled by policy");
        }
        return routed("skip", "stale-grace", "stale warning posted; inside the grace period");
    }
    const { failing, pending, cancelled } = summarize(pr.checks);
    const reviewed = pr.labels.includes("agent-reviewed") || pr.labels.includes(MANAGER_REVIEWED_LABEL);
    if (pr.autoMerge && !failing.length && pr.mergeable !== "CONFLICTING") {
        if (cancelled.length && policy.actions.merge)
            return routed("merge", "rerun-cancelled", `auto-merge is on but ${cancelled.length} check(s) were cancelled; rerunning them`);
        return routed("skip", "waiting", pending.length ? `auto-merge is on; ${pending.length} check(s) running` : "auto-merge is on and checks are green; GitHub merges it");
    }
    if (reviewed && !pr.isDraft && !failing.length && pr.mergeable !== "CONFLICTING") {
        if (pending.length)
            return routed("skip", "checks-running", `reviewed; ${pending.length} check(s) still running`);
        if (policy.sessionBeforeMerge && policy.actions.merge && !(marker?.verdict === "merge" && marker.head === pr.headSha)) {
            // Not when a session already decided to merge this exact head: that was the look.
            if (attempts >= policy.maxAttemptsPerPullRequest)
                return routed("escalate", "attempts-spent", `${attempts} session(s) already spent without landing it`);
            return routed("session", "confirm-before-merge", "reviewed and green; checking it was not left open on purpose before merging");
        }
        // UNKNOWN is GitHub not having computed it yet. Auto-merge is safe to enable either way: it
        // merges only once every requirement holds.
        return policy.actions.merge
            ? routed("merge", "reviewed-and-green", cancelled.length ? `reviewed; rerunning ${cancelled.length} cancelled check(s) and enabling auto-merge` : "reviewed, checks green, auto-merge was never enabled")
            : routed("skip", "merge-disabled", "ready to merge, but merging is disabled by policy");
    }
    if (attempts >= policy.maxAttemptsPerPullRequest) {
        return routed("escalate", "attempts-spent", `${attempts} session(s) already spent without landing it`);
    }
    if (!policy.actions.review && !policy.actions.repair)
        return routed("skip", "sessions-disabled", "needs work, but review and repair are disabled by policy");
    const why = [
        pr.isDraft ? "draft" : "",
        pr.mergeable === "CONFLICTING" ? "conflicts with the base" : "",
        failing.length ? `failing: ${failing.slice(0, 3).join(", ")}${failing.length > 3 ? ` (+${failing.length - 3})` : ""}` : "",
        !reviewed ? "no completed review" : "",
    ].filter(Boolean).join("; ");
    return routed("session", "needs-judgment", why || "not mergeable as it stands");
}
/** Closest to merging first: ready before draft, reviewed before not, then the longest-waiting. */
function sessionOrder(a, b) {
    const rank = (pr) => (pr.isDraft ? 2 : 0) + (pr.labels.includes("agent-reviewed") || pr.labels.includes(MANAGER_REVIEWED_LABEL) ? 0 : 1);
    return rank(a) - rank(b) || Date.parse(a.headCommittedAt) - Date.parse(b.headCommittedAt) || a.number - b.number;
}
/** Route every pull request, then hold sessions to the per-run budget. */
export function sweep(prs, policy, now) {
    const byNumber = new Map(prs.map(pr => [pr.number, pr]));
    const routed = prs.map(pr => routePullRequest(pr, policy, now));
    const sessions = routed.filter(r => r.route === "session").sort((a, b) => sessionOrder(byNumber.get(a.number), byNumber.get(b.number)));
    const admitted = new Set(sessions.slice(0, policy.maxSessionsPerRun).map(r => r.number));
    return routed
        .map(r => r.route === "session" && !admitted.has(r.number)
        ? { ...r, route: "skip", reason: "session-budget", detail: `${r.detail} — deferred, this run's ${policy.maxSessionsPerRun} sessions are taken` }
        : r)
        .sort((a, b) => a.number - b.number);
}
//# sourceMappingURL=sweep.js.map