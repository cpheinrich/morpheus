import { type Lag, type TrunkDirt } from "./trunk-rescue.js";
import type { TrunkRef } from "./git.js";
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
 * Rescue branches with no remote copy. Read from refs alone, with no network:
 * a push updates the remote-tracking ref, so a branch with none on any remote
 * was kept local (a public repository), its push failed, or its remote branch
 * was deleted and pruned. Either way this clone holds the only copy.
 */
export declare function localRescueBranches(root: string): Promise<LocalRescue[]>;
export declare function inspectTrunkCheckout(root: string, trunk: TrunkRef, remoteSha: string | null): Promise<TrunkCheckoutReport | null>;
export interface TrunkFinding {
    severity: "error" | "warning";
    message: string;
}
/**
 * Local rescue branches are reported from any checkout, because branches
 * belong to the repository. Everything else judges only the trunk checkout: a
 * registered path sitting on a task branch is somebody's work in progress, and
 * being behind there is normal.
 */
export declare function trunkCheckoutFindings(report: TrunkCheckoutReport, now: Date): TrunkFinding[];
export declare function localRescueFinding(rescues: LocalRescue[]): TrunkFinding;
