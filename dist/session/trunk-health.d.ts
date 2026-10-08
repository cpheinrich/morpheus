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
}
export declare function inspectTrunkCheckout(root: string, trunk: TrunkRef, remoteSha: string | null): Promise<TrunkCheckoutReport | null>;
export interface TrunkFinding {
    severity: "error" | "warning";
    message: string;
}
/**
 * Only the trunk checkout is judged: a registered path sitting on a task
 * branch is somebody's work in progress, and being behind there is normal.
 */
export declare function trunkCheckoutFindings(report: TrunkCheckoutReport, now: Date): TrunkFinding[];
