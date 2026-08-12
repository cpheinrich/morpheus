import type { SessionLease } from "./lease.js";
/**
 * Local-only session state. `local/` is deliberately gitignored, so a receipt
 * never becomes a misleading shared claim that another machine has read the
 * same files. Shared evidence remains the worklog/commit/PR.
 */
export declare function leasePath(root: string, sessionId: string): string;
export interface LeaseRead {
    /** The validated lease, or null when there is none to trust. */
    lease: SessionLease | null;
    /**
     * Set when a file existed but could not be trusted. Absent state and
     * unusable state both yield a null lease, and only this tells them apart —
     * a truncated write must not read as "no session was ever established".
     */
    issue?: string;
}
export interface LeaseWrite {
    path: string;
    /**
     * Whether anything reached disk. False for an unusable lease **or a
     * filesystem failure** — and the second is why a caller must check it. A
     * failed write leaves the *previous* lease in place, so a `fresh` one still
     * inside its term reads back clean and passes `requireFresh`: the stale
     * lease does not look stale. This field is the only signal that the state on
     * disk is not the state just observed.
     */
    written: boolean;
    /** What was corrected or refused, in the same shape `readLease` reports. */
    issue?: string;
}
/**
 * Persist a lease, validated on the way out as well as in.
 *
 * A guarantee about what is never written has to be checked where writing
 * happens — an adapter that put a memory *hit* rather than a memory *source*
 * into the receipt would otherwise land conversation text in
 * `local/sessions/`, and a read-side check would only notice afterwards.
 *
 * Reported as data rather than thrown, and the advisory field is dropped
 * rather than taken as grounds to discard the lease. Throwing put the failure
 * on the wrong side of the distinction `LeaseRead.issue` exists to preserve: a
 * hook that computed a correct lease, threw on one malformed label, and caught
 * broadly would leave nothing on disk — and the next `readLease` would report
 * *no session was ever established*. `advisoryMemorySources` is optional and
 * advisory by its own name; the receipt and the verdict are what the protocol
 * runs on.
 */
export declare function writeLease(root: string, sessionId: string, lease: SessionLease): Promise<LeaseWrite>;
/** Remove a session's stored lease. Absent is not an error. */
export declare function clearLease(root: string, sessionId: string): Promise<void>;
/**
 * Read local session state, surfacing a malformed file as data rather than
 * casting it through. Parseable-but-wrong JSON would otherwise reach
 * `requireFresh` and fail with a type error instead of a freshness error.
 */
export declare function readLease(root: string, sessionId: string): Promise<LeaseRead>;
