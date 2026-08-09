import { type SessionLease } from "./lease.js";
import { type TrunkRef } from "./git.js";
export interface ContextResult {
    /**
     * Null when there is no usable session state. `issue` is what tells absent
     * from corrupt — the distinction the store exists to preserve, and it would
     * be lost by collapsing both to a bare null here.
     */
    lease: SessionLease | null;
    /** Anything the store corrected or refused, surfaced rather than swallowed. */
    issue?: string;
    /** True when the remote was consulted, false when the term was still running. */
    observed: boolean;
    /**
     * Set when the trunk itself is the problem: the configured ref does not
     * exist, rather than the network being down. Both produce an `unknown`
     * lease, and only this tells an operator which — a message blaming the
     * network for a misconfigured ref sends them hunting the wrong thing.
     */
    trunkMissing?: TrunkRef;
    /**
     * Whether the lease reached disk. Separate from `issue` because a
     * filesystem failure and "dropped an advisory label" are not the same
     * answer — folding them into one channel let `refresh` print a ✓ for a
     * receipt that never persisted, and the next governed command then asks for
     * the refresh that just appeared to succeed.
     */
    written: boolean;
}
/**
 * Take a new receipt: *the agent asserting it has loaded current state.*
 *
 * This is the only thing that mints a receipt, and it is deliberately a
 * command a person or agent runs rather than something a guard does on their
 * behalf. A guard that took a receipt automatically would be certifying that
 * the records were read by the act of not reading them.
 */
export declare function refresh(root: string, now?: Date): Promise<ContextResult>;
/**
 * Discard the stored receipt, and return what it was.
 *
 * The session-start hook may not *certify* — that would assert the records
 * were read by the act of not reading them — but it may **discard**, and that
 * asymmetry is what closes the last hole in the protocol's scope. The lease is
 * keyed on the worktree, so a session starting where a previous one refreshed
 * three minutes ago inherited its certification, and `context brief` said
 * *"Context is fresh"* to a session that had read nothing — the failure the
 * item opens with, from the surface added to prevent it.
 *
 * **Discarding, not downgrading.** Flipping the stored `status` does not
 * survive the next `check`, which re-observes from the *receipt* and finds it
 * still valid. The receipt is the claim "I read these files", and it belonged
 * to the other session — so a new session genuinely has none.
 *
 * The previous receipt is returned rather than thrown away so the caller can
 * still say what has moved since it was taken. It also lands correctly on a
 * *resumed* session after a context compaction, which is precisely when an
 * agent has lost what it read.
 */
export declare function endTerm(root: string): Promise<SessionLease | null>;
/**
 * Re-fingerprint records this session just wrote into its own receipt.
 *
 * `pm block` appends to `hq/team/<handle>.md`, which the same project's
 * required set names — so the next gated command past the term is refused for
 * drift *this session authored*, naming a file it wrote a moment ago. The
 * everyday inbox cycle is worse: read the replies, promote to
 * `.agent/decisions.md`, archive, write a fresh inbox, and three of the four
 * canonical records have moved by your own hand.
 *
 * Nothing there is unsafe, and that is exactly the problem. Refusals with no
 * informational content are the highest-frequency source of the gate fatigue
 * this design is otherwise careful about, and they are where "do not refresh
 * without reading" is hardest to hold — there is genuinely nothing to read,
 * so the habit that forms is *refresh to clear the gate*.
 *
 * Re-fingerprinting keeps the assertion **true** rather than re-asserting it
 * blindly — but only where the record was unchanged between the receipt and
 * the write, which is why callers pass the content they read *before* writing.
 *
 * Without that check this is the one path in the protocol that can **destroy**
 * evidence rather than merely fail to act on it. A human replying in the inbox
 * inside the five-minute term is invisible to `check`, which returns early for
 * an in-term lease without re-reading anything; `noteWrite` would then
 * re-fingerprint the file *including their reply* and the drift would never be
 * reported. The receipt is the only record of what was read, so overwriting it
 * loses the reply permanently.
 *
 * Where the pre-write content does not match, the receipt is left alone: the
 * drift is real, the session did not read it, and it should still be reported.
 */
export interface RecordWrite {
    path: string;
    /** Content as it was immediately before writing; null if it did not exist. */
    before: string | null;
}
export declare function noteWrite(root: string, writes: readonly RecordWrite[]): Promise<void>;
/**
 * Read the current verdict, going to the network only when the term has run
 * out.
 *
 * **This is what the five-minute term is for.** Inside it, the last
 * observation stands and the check costs nothing; past it, the stored
 * *receipt* — not the stored verdict — is re-observed against the trunk and
 * the records as they are now. Re-reading the persisted status instead would
 * make a lease that was fresh at 12:05 answer for 18:00, which is the failure
 * the whole item opens with.
 */
export declare function check(root: string, now?: Date, offline?: boolean): Promise<ContextResult>;
