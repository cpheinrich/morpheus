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
  };
}

export interface TrunkFinding { severity: "error" | "warning"; message: string }

/**
 * Only the trunk checkout is judged: a registered path sitting on a task
 * branch is somebody's work in progress, and being behind there is normal.
 */
export function trunkCheckoutFindings(report: TrunkCheckoutReport, now: Date): TrunkFinding[] {
  if (!report.onTrunk) return [];
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
        `wip/trunk-* draft PR and fast-forwards; nothing is discarded.`,
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
