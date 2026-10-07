import {
  BOT_LANES,
  type GhManagerPolicy,
  INCOMPLETE_LABEL,
  MANAGER_REVIEWED_LABEL,
  NEEDS_HUMAN_LABEL,
  STALE_LABEL,
  TRUSTED_ASSOCIATIONS,
  TRUSTED_PERMISSIONS,
} from "./policy.js";

/**
 * The sweep: every open pull request, routed from facts alone.
 *
 * No model runs here. The same reasoning as the heartbeat's ranker — a
 * deterministic first stage is testable, costs a runner minute, and cannot be
 * talked into anything by a pull request's own text. It also does the cheap
 * work outright: a reviewed, green pull request needs auto-merge switched on,
 * not a session.
 */

export type CheckState = "success" | "failure" | "pending" | "skipped" | "neutral" | "cancelled";

/** What the manager wrote on a pull request last time, read back from its own comment. */
export interface ManagerMarker {
  head: string;
  verdict: "merge" | "escalate" | "close" | "warn-stale" | "incomplete" | "wait";
  attempts: number;
  /** ISO timestamp of that run. */
  at: string;
  /**
   * The head the App cleared on its own review. Written only when a merge rests on a manager
   * review, and it is what binds that clearance to a commit: `check pr` accepts nothing after
   * this head but exact trunk merges, so a later push cannot ride on the label.
   */
  cleared?: string | undefined;
  /**
   * The head an update-branch was attempted on. A successful update moves the head, so finding
   * this equal to the current head means GitHub refused it, and the next run escalates once
   * instead of retrying every run.
   */
  updated?: string | undefined;
}

export interface PullRequestFacts {
  number: number;
  title: string;
  author: string;
  authorAssociation: string;
  /**
   * The author's permission on the repository, read only when the association alone does not
   * establish trust. Undefined when it was not read or could not be, which is not trust.
   */
  authorPermission?: string | undefined;
  isDraft: boolean;
  /** Head branch lives in another repository (a fork). */
  isCrossRepository: boolean;
  headRefName: string;
  headSha: string;
  /** ISO commit date of the head commit. */
  headCommittedAt: string;
  /** ISO time the pull request was opened. A commit made hours before it was pushed is not quiet. */
  createdAt: string;
  labels: string[];
  autoMerge: boolean;
  mergeable: "MERGEABLE" | "CONFLICTING" | "UNKNOWN";
  /**
   * The base has moved past the branch and strict protection requires it up to date. GitHub's
   * auto-merge never updates a branch itself, so a queued pull request in this state waits for
   * ever unless something brings it up to date.
   */
  behind?: boolean | undefined;
  /**
   * The head is the update the manager itself made: a two-parent commit authored by the App whose
   * first parent is the head it recorded updating. Only that is exempt from the quiet period. A
   * session's fix commit is not, and neither is a commit merely claiming the App's address.
   */
  headFirstParent?: string | undefined;
  headByManager?: boolean | undefined;
  /** The latest run of each check on the head commit, one entry per name. */
  checks: { name: string; state: CheckState; runId?: number | undefined }[];
  marker?: ManagerMarker | undefined;
}

export type Route =
  /** Deterministic: enable auto-merge. */
  | "merge"
  /** Deterministic: the stale grace period ran out. */
  | "close"
  /** Deterministic: the attempt budget is spent. */
  | "escalate"
  /** One model session. */
  | "session"
  | "skip";

export interface Routed {
  number: number;
  title: string;
  headSha: string;
  route: Route;
  /** Stable slug, for tests and the digest table. */
  reason: string;
  /** One line a human reads. */
  detail: string;
  /** Sessions already spent on this pull request, carried into the next marker. */
  attempts: number;
}

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

const MARKER = /<!-- morpheus-gh-manager (\{[^\n]*\}) -->/g;

/** A branch name the brief can carry verbatim. Git allows `;`, `$`, backticks and more in a ref. */
export const SAFE_REF = /^[A-Za-z0-9._/-]+$/;

export function renderMarker(marker: ManagerMarker): string {
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
export function parseMarker(body: string): ManagerMarker | undefined {
  const match = [...body.matchAll(MARKER)].at(-1);
  if (!match) return undefined;
  try {
    const raw = JSON.parse(match[1]!) as Partial<ManagerMarker>;
    if (typeof raw.head !== "string" || typeof raw.verdict !== "string" || typeof raw.attempts !== "number" || typeof raw.at !== "string") return undefined;
    if (!["merge", "escalate", "close", "warn-stale", "incomplete", "wait"].includes(raw.verdict)) return undefined;
    if (raw.cleared !== undefined && typeof raw.cleared !== "string") return undefined;
    if (raw.updated !== undefined && typeof raw.updated !== "string") return undefined;
    return { head: raw.head, verdict: raw.verdict, attempts: raw.attempts, at: raw.at, ...(raw.cleared ? { cleared: raw.cleared } : {}), ...(raw.updated ? { updated: raw.updated } : {}) };
  } catch {
    return undefined;
  }
}

function summarize(checks: PullRequestFacts["checks"]): { failing: string[]; pending: string[]; cancelled: string[] } {
  return {
    failing: checks.filter(c => c.state === "failure").map(c => c.name),
    pending: checks.filter(c => c.state === "pending").map(c => c.name),
    // Neither passed nor failed: nothing about the change was judged. It needs a rerun, not a
    // session, and a required check left cancelled holds auto-merge open forever.
    cancelled: checks.filter(c => c.state === "cancelled").map(c => c.name),
  };
}

/** Route one pull request. Pure: `now` is passed in. */
export function routePullRequest(pr: PullRequestFacts, policy: GhManagerPolicy, now: Date): Routed {
  const marker = pr.marker;
  // A human answering an escalation — by pushing, or by removing the label to say "try again" —
  // is a new situation; the budget starts again.
  const reopened = marker?.verdict === "escalate" && (marker.head !== pr.headSha || !pr.labels.includes(NEEDS_HUMAN_LABEL));
  const attempts = marker && !reopened ? marker.attempts : 0;
  const routed = (route: Route, reason: string, detail: string): Routed => ({ number: pr.number, title: pr.title, headSha: pr.headSha, route, reason, detail, attempts });

  if (BOT_LANES.has(pr.author)) return routed("skip", "bot-lane", `${pr.author} has its own maintainer`);
  const trusted = TRUSTED_ASSOCIATIONS.has(pr.authorAssociation) || TRUSTED_PERMISSIONS.has(pr.authorPermission ?? "");
  if (!trusted || pr.isCrossRepository) {
    const standing = `${pr.authorAssociation}${pr.authorPermission ? ` with ${pr.authorPermission} permission` : ""}`;
    return routed("skip", "untrusted-author", `author ${pr.author} is ${standing}${pr.isCrossRepository ? " on a fork" : ""}; reported, not acted on`);
  }
  // The branch name is the one piece of author-controlled text the brief has to carry.
  if (!SAFE_REF.test(pr.headRefName)) return routed("skip", "unsafe-branch-name", "the branch name has characters the manager will not put in a brief");
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
  const managerUpdate = pr.headByManager === true && pr.headFirstParent !== undefined && marker?.updated === pr.headFirstParent;
  if (!managerUpdate && (!Number.isFinite(age) || age < quiet * HOUR)) {
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
    if (cancelled.length && policy.actions.merge) return routed("merge", "rerun-cancelled", `auto-merge is on but ${cancelled.length} check(s) were cancelled; rerunning them`);
    if (pr.behind && policy.actions.merge) {
      // Tried on this exact head already and the head did not move: GitHub refused the update.
      // Escalate once; retrying would post the same two comments every run for ever.
      if (marker?.updated === pr.headSha) return routed("escalate", "update-refused", "GitHub refused to bring this branch up to date with its base. A likely cause is that the merge from trunk carries a workflow change, which the manager's App is not permitted to push. Merge the base into the branch by hand; auto-merge is still queued");
      return routed("merge", "update-behind", "auto-merge is on but the branch is behind its base; bringing it up to date");
    }
    return routed("skip", "waiting", pending.length ? `auto-merge is on; ${pending.length} check(s) running` : "auto-merge is on and checks are green; GitHub merges it");
  }

  if (reviewed && !pr.isDraft && !failing.length && pr.mergeable !== "CONFLICTING") {
    if (pending.length) return routed("skip", "checks-running", `reviewed; ${pending.length} check(s) still running`);
    if (policy.sessionBeforeMerge && policy.actions.merge && !(marker?.verdict === "merge" && marker.head === pr.headSha)) {
      // Not when a session already decided to merge this exact head: that was the look.
      if (attempts >= policy.maxAttemptsPerPullRequest) return routed("escalate", "attempts-spent", `${attempts} session(s) already spent without landing it`);
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
  if (!policy.actions.review && !policy.actions.repair) return routed("skip", "sessions-disabled", "needs work, but review and repair are disabled by policy");

  const why = [
    pr.isDraft ? "draft" : "",
    pr.mergeable === "CONFLICTING" ? "conflicts with the base" : "",
    failing.length ? `failing: ${failing.slice(0, 3).join(", ")}${failing.length > 3 ? ` (+${failing.length - 3})` : ""}` : "",
    !reviewed ? "no completed review" : "",
  ].filter(Boolean).join("; ");
  return routed("session", "needs-judgment", why || "not mergeable as it stands");
}

/** Closest to merging first: ready before draft, reviewed before not, then the longest-waiting. */
function sessionOrder(a: PullRequestFacts, b: PullRequestFacts): number {
  const rank = (pr: PullRequestFacts) => (pr.isDraft ? 2 : 0) + (pr.labels.includes("agent-reviewed") || pr.labels.includes(MANAGER_REVIEWED_LABEL) ? 0 : 1);
  return rank(a) - rank(b) || Date.parse(a.headCommittedAt) - Date.parse(b.headCommittedAt) || a.number - b.number;
}

/** Route every pull request, then hold sessions to the per-run budget. */
export function sweep(prs: PullRequestFacts[], policy: GhManagerPolicy, now: Date): Routed[] {
  const byNumber = new Map(prs.map(pr => [pr.number, pr]));
  const routed = prs.map(pr => routePullRequest(pr, policy, now));
  const sessions = routed.filter(r => r.route === "session").sort((a, b) => sessionOrder(byNumber.get(a.number)!, byNumber.get(b.number)!));
  const admitted = new Set(sessions.slice(0, policy.maxSessionsPerRun).map(r => r.number));
  return routed
    .map(r => r.route === "session" && !admitted.has(r.number)
      ? { ...r, route: "skip" as const, reason: "session-budget", detail: `${r.detail} — deferred, this run's ${policy.maxSessionsPerRun} sessions are taken` }
      : r)
    .sort((a, b) => a.number - b.number);
}
