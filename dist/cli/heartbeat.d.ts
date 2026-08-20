import { type Claim } from "../pm/claim.js";
import { type Item } from "../pm/parse.js";
import type { RoadmapItem } from "../pm/schema.js";
import { type MergedPr } from "../pm/ship.js";
/**
 * One beat.
 *
 * Read, assess, propose, stop. It is a **dispatcher, not a doer** — doing the
 * work inside a beat puts an unattended agent on a timer, which is a much
 * larger decision than scheduling one, and one Chris has explicitly deferred.
 */
/** Dispatch was asked for and refused. Distinct from "nothing to do". */
export declare const EXIT_REFUSED = 2;
export interface HeartbeatOptions {
    productDir: string;
    cwd: string;
    ceiling?: number;
    json?: boolean;
    dispatch?: boolean;
}
/**
 * Claims whose branch has merged while the board still says `review`.
 *
 * This is deliberately a pure join over one `gh pr list` result and the claims
 * already fetched by the heartbeat. Calling `reconcile(..., { write: false })`
 * would preserve the same semantics, but it also performs one remote branch
 * lookup per roadmap item — too much network work for an hourly beat.
 */
export declare function mergedReviewClaimIds(items: Item<RoadmapItem>[], claims: Claim[], prs: MergedPr[]): string[];
export declare function heartbeat(opts: HeartbeatOptions): Promise<number>;
