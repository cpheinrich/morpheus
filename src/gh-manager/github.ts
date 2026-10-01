import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LiveState, Operation } from "./decision.js";
import { GH_MANAGER_LOGIN, GH_MANAGER_POLICY_PATH, type GhManagerPolicy, LOG_LABEL, parsePolicy } from "./policy.js";
import { type CheckState, type ManagerMarker, parseMarker, type PullRequestFacts } from "./sweep.js";

/**
 * Everything that talks to GitHub, through `gh` and its ambient `GH_TOKEN`.
 *
 * REST rather than GraphQL throughout: REST reports an App as
 * `morpheus-gh-manager[bot]` everywhere, where GraphQL drops the suffix in some
 * fields and not others, and every identity comparison in this module is
 * against that login.
 */

const REPOSITORY = /^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9._-]+$/;

export function assertRepository(repo: string): string {
  if (!REPOSITORY.test(repo)) throw new Error(`"${repo}" is not an owner/name repository`);
  return repo;
}

function gh(args: string[], input?: string): string {
  return execFileSync("gh", args, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...(input !== undefined ? { input } : {}) }).trim();
}

function api<T>(path: string, ...args: string[]): T {
  return JSON.parse(gh(["api", path, ...args])) as T;
}

/** Every page of a list endpoint, concatenated. `--slurp` wraps the pages in an outer array. */
function pages<T>(path: string): T[] {
  return (JSON.parse(gh(["api", "--paginate", "--slurp", path])) as T[][]).flat();
}

function status(error: unknown): string {
  const stderr = (error as { stderr?: string | Buffer }).stderr;
  return typeof stderr === "string" ? stderr : stderr ? stderr.toString("utf8") : String(error);
}

/**
 * The repository's opt-in policy on its default branch.
 *
 * `null` means the file is absent — the repository has not opted in, and the
 * manager does nothing there. Any other failure throws: an unreadable or
 * invalid policy must not read as "no policy", or a typo would silently turn
 * the manager off and nobody would be told.
 */
export function fetchPolicy(repo: string): GhManagerPolicy | null {
  let raw: string;
  try {
    raw = gh(["api", `repos/${repo}/contents/${GH_MANAGER_POLICY_PATH}`, "-H", "Accept: application/vnd.github.raw+json"]);
  } catch (error) {
    if (/HTTP 404/.test(status(error))) return null;
    throw new Error(`could not read ${GH_MANAGER_POLICY_PATH} from ${repo}: ${status(error)}`);
  }
  return parsePolicy(raw);
}

interface RestPull {
  number: number;
  title: string;
  body: string | null;
  draft: boolean;
  user: { login: string };
  author_association: string;
  head: { sha: string; ref: string; repo: { full_name: string } | null };
  base: { ref: string; repo: { full_name: string } };
  labels: { name: string }[];
  auto_merge: unknown;
  mergeable?: boolean | null;
  merged?: boolean;
  state: string;
}

interface CheckRun { name: string; status: string; conclusion: string | null; started_at: string | null; html_url: string | null }

function checkState(run: CheckRun): CheckState {
  if (run.status !== "completed") return "pending";
  switch (run.conclusion) {
    case "success": return "success";
    case "skipped": return "skipped";
    case "neutral": return "neutral";
    case "cancelled": return "cancelled";
    // failure, timed_out, action_required, stale, startup_failure: none of them passed.
    default: return "failure";
  }
}

/** The latest run of each named check on a commit, plus commit statuses (Vercel and friends). */
export function fetchChecks(repo: string, sha: string): PullRequestFacts["checks"] {
  const runs = pages<{ check_runs: CheckRun[] }>(`repos/${repo}/commits/${sha}/check-runs?per_page=100`).flatMap(page => page.check_runs);
  const latest = new Map<string, CheckRun>();
  for (const run of runs) {
    const seen = latest.get(run.name);
    // A re-run and a superseded run share a name; only the newest speaks for the check.
    if (!seen || (run.started_at ?? "") > (seen.started_at ?? "")) latest.set(run.name, run);
  }
  const checks: PullRequestFacts["checks"] = [...latest.values()].map(run => {
    const runId = /\/actions\/runs\/(\d+)/.exec(run.html_url ?? "")?.[1];
    return { name: run.name, state: checkState(run), ...(runId ? { runId: Number(runId) } : {}) };
  });
  const combined = api<{ statuses: { context: string; state: string }[] }>(`repos/${repo}/commits/${sha}/status`);
  for (const s of combined.statuses) {
    checks.push({ name: s.context, state: s.state === "success" ? "success" : s.state === "pending" ? "pending" : "failure" });
  }
  return checks;
}

/** The manager's most recent marker on a pull request, from its own comments only. */
export function fetchMarker(repo: string, number: number): ManagerMarker | undefined {
  const comments = pages<{ user: { login: string } | null; body: string | null }>(`repos/${repo}/issues/${number}/comments?per_page=100`);
  // Only the App's comments count. Anyone can type the marker; nobody else can post as the App.
  return comments.filter(c => c.user?.login === GH_MANAGER_LOGIN).map(c => parseMarker(c.body ?? "")).filter((m): m is ManagerMarker => m !== undefined).at(-1);
}

function mergeableState(pull: RestPull): PullRequestFacts["mergeable"] {
  return pull.mergeable === true ? "MERGEABLE" : pull.mergeable === false ? "CONFLICTING" : "UNKNOWN";
}

export function fetchPullRequest(repo: string, number: number): { pull: RestPull; facts: PullRequestFacts } {
  const pull = api<RestPull>(`repos/${repo}/pulls/${number}`);
  const commit = api<{ commit: { committer: { date: string } } }>(`repos/${repo}/commits/${pull.head.sha}`);
  return {
    pull,
    facts: {
      number: pull.number,
      title: pull.title,
      author: pull.user.login,
      authorAssociation: pull.author_association,
      isDraft: pull.draft,
      isCrossRepository: pull.head.repo?.full_name !== pull.base.repo.full_name,
      headRefName: pull.head.ref,
      headSha: pull.head.sha,
      headCommittedAt: commit.commit.committer.date,
      labels: pull.labels.map(l => l.name),
      autoMerge: pull.auto_merge !== null && pull.auto_merge !== undefined,
      mergeable: mergeableState(pull),
      checks: fetchChecks(repo, pull.head.sha),
      marker: fetchMarker(repo, pull.number),
    },
  };
}

export function fetchOpenPullRequests(repo: string): PullRequestFacts[] {
  return pages<{ number: number }>(`repos/${repo}/pulls?state=open&per_page=100`).map(pull => fetchPullRequest(repo, pull.number).facts);
}

/** Live state for the apply step, read after the session has ended. */
export function fetchLiveState(repo: string, number: number, supersededBy?: number): LiveState & { open: boolean; branch: string } {
  const { pull, facts } = fetchPullRequest(repo, number);
  let supersededMerged: boolean | undefined;
  if (supersededBy !== undefined) {
    // A failed read stays undefined, which the plan treats as "not proven merged".
    try { supersededMerged = api<{ merged: boolean }>(`repos/${repo}/pulls/${supersededBy}`).merged === true; } catch { supersededMerged = undefined; }
  }
  return {
    open: pull.state === "open",
    branch: pull.head.ref,
    headSha: facts.headSha,
    isDraft: facts.isDraft,
    labels: facts.labels,
    autoMerge: facts.autoMerge,
    body: pull.body ?? "",
    changedFiles: pages<{ filename: string }>(`repos/${repo}/pulls/${number}/files?per_page=100`).map(f => f.filename),
    supersededMerged,
    cancelledRunIds: [...new Set(facts.checks.filter(c => c.state === "cancelled" && c.runId !== undefined).map(c => c.runId!))],
  };
}

const LABEL_COLORS: Record<string, string> = { "manager-reviewed": "0e8a16", "manager:needs-human": "d93f0b", "manager:stale": "c5def5", "manager:incomplete": "fbca04", [LOG_LABEL]: "ededed" };

function withBodyFile<T>(body: string, run: (path: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), "gh-manager-"));
  try {
    const path = join(dir, "body.md");
    writeFileSync(path, body);
    return run(path);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Carry out one operation. Text reaches `gh` as a file or an argument, never as shell. */
export function execute(repo: string, number: number, op: Operation): void {
  const pr = String(number);
  switch (op.kind) {
    case "set-body":
      withBodyFile(op.body, path => gh(["api", "--method", "PATCH", `repos/${repo}/pulls/${pr}`, "-F", `body=@${path}`]));
      return;
    case "ready":
      gh(["pr", "ready", pr, "--repo", repo]);
      return;
    case "add-label":
      gh(["label", "create", op.label, "--repo", repo, "--force", "--color", LABEL_COLORS[op.label] ?? "ededed"]);
      gh(["api", "--method", "POST", `repos/${repo}/issues/${pr}/labels`, "-f", `labels[]=${op.label}`]);
      return;
    case "remove-label":
      gh(["api", "--method", "DELETE", `repos/${repo}/issues/${pr}/labels/${encodeURIComponent(op.label)}`]);
      return;
    case "auto-merge":
      gh(["pr", "merge", pr, "--repo", repo, "--auto", "--squash"]);
      return;
    case "disable-auto-merge":
      gh(["pr", "merge", pr, "--repo", repo, "--disable-auto"]);
      return;
    case "rerun":
      for (const id of op.runIds) gh(["run", "rerun", String(id), "--repo", repo, "--failed"]);
      return;
    case "close":
      gh(["pr", "close", pr, "--repo", repo]);
      return;
    case "comment":
      withBodyFile(op.body, path => gh(["pr", "comment", pr, "--repo", repo, "--body-file", path]));
      return;
  }
}

/** Append a run digest to the repository's rolling log issue, creating the issue on first use. */
export function postDigest(repo: string, markdown: string): number {
  gh(["label", "create", LOG_LABEL, "--repo", repo, "--force", "--color", LABEL_COLORS[LOG_LABEL]!]);
  const existing = api<{ number: number; user: { login: string } }[]>(`repos/${repo}/issues?state=open&labels=${LOG_LABEL}&per_page=20`)
    .filter(issue => issue.user.login === GH_MANAGER_LOGIN);
  let number = existing[0]?.number;
  if (number === undefined) {
    const intro = "Every run of the GitHub Manager on this repository leaves one comment here: what it looked at, what it did, and why. Per-pull-request reasoning is in a comment on that pull request.\n\nPolicy: `.github/morpheus-gh-manager.json`. Runbook: https://github.com/cpheinrich/morpheus/blob/main/docs/runbooks/gh-manager.md";
    number = withBodyFile(intro, path => api<{ number: number }>(`repos/${repo}/issues`, "--method", "POST", "-f", "title=GitHub Manager log", "-F", `body=@${path}`, "-f", `labels[]=${LOG_LABEL}`).number);
  }
  withBodyFile(markdown, path => gh(["issue", "comment", String(number), "--repo", repo, "--body-file", path]));
  return number;
}
