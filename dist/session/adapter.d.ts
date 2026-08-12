import { type LeasePolicy, type SessionLease } from "./lease.js";
/**
 * Runner integrations deliver a lease decision; they do not own policy.
 *
 * Two channels, because there are two answers and only one of them is *go and
 * re-read*. A runner given one channel has to guess, and the guess it will
 * make is refresh — which for a record re-reading cannot fix is an infinite
 * loop. `ContextFreshnessError` was fixed for this; the adapter is the module's
 * other output and had the same defect.
 */
export interface SessionAdapter {
    /** There is a delta, and loading it clears the lease. */
    requestRefresh(lease: SessionLease, inputs: string[]): Promise<void>;
    /** Nothing to load: a record is missing or unreadable and needs fixing. */
    requestRepair(lease: SessionLease, inputs: string[]): Promise<void>;
}
/** Test double used by PM/session tests. */
export declare class MockSessionAdapter implements SessionAdapter {
    readonly refreshRequests: {
        lease: SessionLease;
        inputs: string[];
    }[];
    readonly repairRequests: {
        lease: SessionLease;
        inputs: string[];
    }[];
    requestRefresh(lease: SessionLease, inputs: string[]): Promise<void>;
    requestRepair(lease: SessionLease, inputs: string[]): Promise<void>;
}
/**
 * Tell the runner what to do about a lease, when there is anything to say.
 *
 * Applies the lease's term first, the way `requireFresh` does — `readLease`
 * exists to bring a lease back across a resume, so branching on `status`
 * directly let a lease persisted `fresh` six hours ago throw at the guard
 * while the runner heard nothing. (Only a `fresh` lease has a term to apply;
 * a `refresh_required` or `unknown` one is already the latest knowledge there
 * is, with no newer receipt for it to be stale against.)
 *
 * An `unknown` lease qualifies when it names something. Gating on
 * `refresh_required` alone meant the offline case — whose whole point is that
 * records it never read are knowable without the remote — was the one the
 * runner was never told about. A clean `unknown` stays silent: there is
 * nothing to ask for beyond a remote that is not there.
 */
export declare function notifyAdapter(adapter: SessionAdapter, lease: SessionLease, now?: Date, policy?: LeasePolicy): Promise<void>;
