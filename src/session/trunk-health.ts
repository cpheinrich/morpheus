import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
import {
  STALE_BEHIND_COMMITS,
  STALE_BEHIND_DAYS,
  lagDays,
  lagSeverity,
  measureLag,
  orphanBuildOutputs,
  readDirt,
  shellQuote,
  type Lag,
  type TrunkDirt,
} from "./trunk-rescue.js";
import type { TrunkRef } from "./git.js";

/**
 * The read-only half of the trunk rescue, for `doctor` and `doctor --all`.
 *
 * `context brief` acts, but only in the checkout a session starts in — and
 * the stuck checkout is precisely the one no session starts in. So the fleet
 * view reports every registered project whose trunk checkout is dirty or
 * behind past the thresholds, and never writes. It measures against the
 * remote's tip when the brief's private fetch already brought that commit
 * here, and otherwise against the cached remote-tracking ref, saying so.
 *
 * It also lists rescue branches that exist only in this clone. On a public
 * repository a rescue is never pushed, so no pull request and no GitHub
 * Manager age-out will ever surface it; this report is the only place it
 * shows up until someone recovers or deletes it.
 */

const exec = promisify(execFile);
async function git(root: string, args: string[]): Promise<string | null> {
  try {
    return (await exec("git", args, { cwd: root, timeout: 15_000, maxBuffer: 20 * 1024 * 1024, env: gitSubprocessEnv() })).stdout;
  } catch {
    return null;
  }
}

export interface TrunkCheckoutReport {
  branch: string;
  trunk: string;
  onTrunk: boolean;
  dirt: TrunkDirt;
  orphans: string[];
  /** Null when no trunk commit could be found locally to measure against. */
  lag: Lag | null;
  /** What the lag was measured against. */
  measuredAgainst: "remote-tip" | "cached-ref" | "none";
  /** When the cached ref was last updated, when that is what was used and Git recorded it. */
  cachedAt: string | null;
  /** The remote reported a tip that is not available locally. */
  remoteTipUnfetched: boolean;
  /** `wip/trunk-*` branches with no remote-tracking counterpart on any remote, newest first. */
  localRescues: LocalRescue[];
}

export interface LocalRescue {
  branch: string;
  /** Committer date, `YYYY-MM-DD`. */
  date: string | null;
  /** Files the rescue commit changed, or null when that could not be read. */
  files: number | null;
}

/**
 * Rescue branches with no remote-tracking ref on any remote. Read from refs
 * alone, with no network. In an ordinary clone a push writes that ref, so such
 * a branch was kept local (a public repository), its push failed, or its
 * remote branch was deleted and pruned, and this clone holds the only copy. A
 * clone whose fetch refspec maps only some branches (`clone --single-branch`)
 * gets no tracking ref even for a pushed rescue, so the finding says "likely".
 */
export async function localRescueBranches(root: string): Promise<LocalRescue[]> {
  const local = (await git(root, ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)%09%(committerdate:short)", "refs/heads/wip/trunk-*"])) ?? "";
  const remotes = ((await git(root, ["remote"])) ?? "").split("\n").map((r) => r.trim()).filter(Boolean);
  const tracked = new Set<string>();
  for (const line of ((await git(root, ["for-each-ref", "--format=%(refname)", "refs/remotes/"])) ?? "").split("\n")) {
    const ref = line.trim();
    for (const remote of remotes) {
      const prefix = `refs/remotes/${remote}/`;
      if (ref.startsWith(prefix)) tracked.add(ref.slice(prefix.length));
    }
  }
  const out: LocalRescue[] = [];
  for (const line of local.split("\n")) {
    const [branch, date] = line.trim().split("\t");
    if (!branch || tracked.has(branch)) continue;
    const names = await git(root, ["diff", "--name-only", "--no-renames", `refs/heads/${branch}^`, `refs/heads/${branch}`]);
    out.push({ branch, date: date || null, files: names === null ? null : names.split("\n").filter(Boolean).length });
  }
  return out;
}

export async function inspectTrunkCheckout(
  root: string,
  trunk: TrunkRef,
  remoteSha: string | null,
): Promise<TrunkCheckoutReport | null> {
  const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim();
  if (!branch) return null;
  const label = `${trunk.remote}/${trunk.branch}`;
  const dirt = await readDirt(root).catch(() => null);
  if (!dirt) return null;
  const orphans = await orphanBuildOutputs(root, dirt.untracked);
  const cachedRef = `refs/remotes/${trunk.remote}/${trunk.branch}`;
  let target: string | null = null;
  let measuredAgainst: TrunkCheckoutReport["measuredAgainst"] = "none";
  let cachedAt: string | null = null;
  const remoteTipLocal = remoteSha !== null && (await git(root, ["cat-file", "-e", `${remoteSha}^{commit}`])) !== null;
  if (remoteTipLocal) {
    target = remoteSha;
    measuredAgainst = "remote-tip";
  } else if ((await git(root, ["rev-parse", "--verify", "--quiet", `${cachedRef}^{commit}`])) !== null) {
    target = cachedRef;
    measuredAgainst = "cached-ref";
    const reflog = await git(root, ["reflog", "show", "-n1", "--date=iso-strict", "--format=%gd", cachedRef]);
    cachedAt = reflog?.match(/@\{([^}]+)\}/)?.[1] ?? null;
  }
  const lag = target ? await measureLag(root, target).catch(() => null) : null;
  return {
    branch, trunk: label, onTrunk: branch === trunk.branch, dirt, orphans, lag, measuredAgainst, cachedAt,
    remoteTipUnfetched: remoteSha !== null && !remoteTipLocal,
    localRescues: await localRescueBranches(root).catch(() => []),
  };
}

export interface TrunkFinding { severity: "error" | "warning"; message: string }

/** How many local rescue branches one finding names before summarising the rest. */
const RESCUES_SHOWN = 10;

/**
 * Local rescue branches are reported from any checkout, because branches
 * belong to the repository. Everything else judges only the trunk checkout: a
 * registered path sitting on a task branch is somebody's work in progress, and
 * being behind there is normal.
 */
export function trunkCheckoutFindings(report: TrunkCheckoutReport, now: Date): TrunkFinding[] {
  const findings = report.onTrunk ? checkoutFindings(report, now) : [];
  if (report.localRescues.length) findings.push(localRescueFinding(report.localRescues));
  return findings;
}

export function localRescueFinding(rescues: LocalRescue[]): TrunkFinding {
  const shown = rescues.slice(0, RESCUES_SHOWN).map((r) =>
    `${r.branch} (${r.files === null ? "files unknown" : `${r.files} file(s)`}${r.date ? `, ${r.date}` : ""})`);
  const more = rescues.length > RESCUES_SHOWN ? ` and ${rescues.length - RESCUES_SHOWN} more` : "";
  return {
    severity: "warning",
    message:
      `${rescues.length} trunk rescue branch(es) have no remote-tracking ref, so they are likely only in this clone and no pull request will surface them: ` +
      `${shown.join(", ")}${more}. Inspect with git show --stat <branch>; recover with git switch <branch> or ` +
      `git cherry-pick <branch>; publish deliberately with git push origin <branch>; once handled, delete with git branch -D <branch>.`,
  };
}

function checkoutFindings(report: TrunkCheckoutReport, now: Date): TrunkFinding[] {
  const findings: TrunkFinding[] = [];
  const caveat =
    report.measuredAgainst === "cached-ref"
      ? ` Measured against the cached ${report.trunk}${report.cachedAt ? ` as of ${report.cachedAt.slice(0, 10)}` : ""}` +
        (report.remoteTipUnfetched ? "; the remote has moved past it, so the real gap is larger." : "; it may be staler than the remote.")
      : "";

  if (report.dirt.tracked.length) {
    const shown = report.dirt.tracked.slice(0, 5).join(", ");
    const more = report.dirt.tracked.length > 5 ? ` and ${report.dirt.tracked.length - 5} more` : "";
    findings.push({
      severity: "warning",
      message:
        `Trunk checkout has ${report.dirt.tracked.length} uncommitted tracked edit(s) (${shown}${more}), ` +
        `so it cannot fast-forward. The next \`morpheus context brief\` here moves them to a ` +
        `wip/trunk-* branch (pushed as a draft PR only on a private repository), or resets them ` +
        `when every one is IDE churn, and fast-forwards.`,
    });
  }

  // With no trunk commit here *and* no answer from the remote, `checkTrunk`
  // has already named the remote or trunk that does not resolve; a second
  // line about the same absence is noise. A remote that answered with a
  // commit this checkout has never fetched is a different state — unmeasured,
  // not current — and says so rather than reporting nothing.
  if (report.measuredAgainst === "none" && report.remoteTipUnfetched) {
    findings.push({
      severity: "warning",
      message: `Could not measure how far behind ${report.trunk} the trunk checkout is: the remote tip has never been fetched here. Run \`morpheus context brief\` in it.`,
    });
  } else if (report.lag && lagSeverity(report.lag, now) === "stale") {
    const days = lagDays(report.lag, now);
    findings.push({
      severity: "warning",
      message:
        `Trunk checkout is ${report.lag.behind} commit(s) behind ${report.trunk}` +
        `${days !== null ? `, missing trunk work since ${report.lag.oldest?.slice(0, 10)} (${days} day(s))` : ""} ` +
        `— past the ${STALE_BEHIND_COMMITS}-commit / ${STALE_BEHIND_DAYS}-day threshold. ` +
        `Sessions started there read stale instructions; run \`morpheus context brief\` in it.${caveat}`,
    });
  }

  if (report.orphans.length) {
    findings.push({
      severity: "warning",
      message:
        `Untracked build output whose source no longer exists — safe to delete: ` +
        report.orphans.slice(0, 10).map((p) => `rm ${shellQuote(p)}`).join("; ") +
        (report.orphans.length > 10 ? ` (and ${report.orphans.length - 10} more)` : ""),
    });
  }
  return findings;
}
