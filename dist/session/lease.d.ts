/**
 * The provider-neutral session freshness model.
 *
 * A receipt says exactly which canonical inputs an agent loaded. A lease is
 * the short-lived assertion that the receipt was checked against the remote.
 * Neither stores agent conversation contents or raw local memories: GitHub is
 * canonical, and local memory is only advisory provenance.
 */
export type LeaseStatus = "fresh" | "refresh_required" | "unknown";
export interface ContextInput {
    id: string;
    fingerprint: string;
}
export interface ContextReceipt {
    version: 1;
    id: string;
    createdAt: string;
    /**
     * The tip of `origin/main` when the receipt was taken — **not** the branch
     * tip. The whole `fresh` verdict turns on this field, so it needs one
     * meaning: the question is whether the canonical trunk moved under this
     * session, which is what another agent merging changes. A branch's own tip
     * moving is a different concern, and the wiring item handles it separately.
     */
    remoteSha: string;
    branch: string;
    worktree: string;
    inputs: ContextInput[];
    /** Safe source labels only; never raw memory or conversation text. */
    advisoryMemorySources?: string[];
}
export interface SessionLease {
    version: 1;
    receipt: ContextReceipt;
    checkedAt: string;
    status: LeaseStatus;
    changedInputs: string[];
    /**
     * The subset of `changedInputs` that re-reading cannot fix — a record with
     * no content now, or a required one the observation never reported. Separate
     * because a refresh loop against these never terminates, and a flat list
     * gives a runner no way to tell repair from refresh.
     */
    unresolvableInputs?: string[];
    /**
     * Present only when the remote SHA moved. Stated rather than inferred: a
     * consumer working it out from `status` and an empty `changedInputs` gets it
     * wrong in the one case where both hold — a record that cannot be read
     * *and* a trunk that advanced.
     */
    remoteAdvanced?: true;
    reason?: string;
}
export interface RemoteObservation {
    checkedAt: string;
    /** Null means the remote could not be checked, never that it is unchanged. */
    remoteSha: string | null;
    /**
     * The canonical inputs as they are *now*, fingerprinted by `readInputs`.
     * Compared against the receipt to derive the delta — an observation never
     * asserts the delta directly, because a caller that can choose what counts
     * as changed can also choose to report nothing.
     *
     * Required, and required for the same reason. Optional, omission *is* that
     * choice under another name: every call site that forgot the argument would
     * silently report no drift. `readInputs` produces it in one line, and it is
     * readable offline, so there is no observation that cannot supply it.
     */
    inputs: ContextInput[];
}
/**
 * The records CLAUDE.md tells every session to load before doing anything. A
 * receipt that does not cover all of them is not a receipt for this project,
 * whatever else it lists.
 */
export declare const CANONICAL_INPUTS: readonly string[];
/**
 * A lease is an observation with a term. Past it the observation is a
 * historical fact rather than a statement about now, which is the whole
 * difference between a lease and a receipt.
 */
export declare const LEASE_TTL_MS: number;
/**
 * Fingerprint sentinels: the two ways a record can have no content.
 *
 * They live here rather than beside `readInputs` because their *meaning* is
 * policy. **Neither is a value, so neither is compared** — `localDelta` treats
 * a sentinel on a required record as the absence of information, never as
 * information that happens to match. Comparing them by equality is what made
 * *I could not read it* match *I could not read it*, and — the wider case —
 * made three missing records in the wrong tree certify `fresh`.
 */
export declare const ABSENT = "absent";
/**
 * The record exists but yields no content: a permission change, a dangling
 * symlink (`CLAUDE.md` is a symlink in this repo), a directory where a file
 * was. Distinguished from `ABSENT` because it is **unclearable** — re-reading
 * is what the lease asks for and re-reading cannot change the answer — so a
 * lease reports it separately rather than as ordinary drift.
 */
export declare const UNREADABLE = "unreadable";
export interface LeasePolicy {
    /**
     * `undefined` means none declared — take `CANONICAL_INPUTS`. An empty array
     * is the *only* way to switch coverage off, and it has to be written on
     * purpose: a project config that yields `[]` by accident, from a blank or
     * unparseable field, would hand every session a check that passes for
     * having read nothing.
     */
    requiredInputs?: readonly string[];
    ttlMs?: number;
}
/**
 * The one message an agent actually reads, so the two instructions in it must
 * not contradict. `unresolvableInputs` is a *subset* of `changedInputs`, and
 * naming the same record in both halves opened by telling the agent to refresh
 * what the next clause said refreshing would not fix.
 */
export declare class ContextFreshnessError extends Error {
    readonly lease: SessionLease;
    constructor(lease: SessionLease);
}
/** Pure policy function, so CI needs neither GitHub nor an AI provider. */
export declare function observeLease(receipt: ContextReceipt, observation: RemoteObservation, policy?: LeasePolicy): SessionLease;
/**
 * Re-read a lease as of `now`. An expired lease — or one whose `checkedAt`
 * cannot be parsed, or sits in the future because a clock moved — degrades to
 * `refresh_required` rather than carrying its old verdict forward.
 */
export declare function leaseAt(lease: SessionLease, now?: Date, policy?: LeasePolicy): SessionLease;
/**
 * Fail closed at a durable or externally governed boundary. `now` defaults to
 * the real clock so a caller cannot skip the term check by omitting it.
 */
export declare function requireFresh(lease: SessionLease, now?: Date, policy?: LeasePolicy): void;
