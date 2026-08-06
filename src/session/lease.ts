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
export const CANONICAL_INPUTS: readonly string[] = [
  "CLAUDE.md",
  ".agent/decisions.md",
  ".agent/learned.md",
];

/**
 * A lease is an observation with a term. Past it the observation is a
 * historical fact rather than a statement about now, which is the whole
 * difference between a lease and a receipt.
 */
export const LEASE_TTL_MS = 5 * 60 * 1000;

/**
 * Fingerprint sentinels. They live here rather than beside `readInputs`
 * because their *meaning* is policy: `localDelta` below is what decides that
 * one of them can never satisfy coverage.
 */
export const ABSENT = "absent";

/**
 * A record that exists but could not be read — a permission change, a broken
 * symlink (`CLAUDE.md` is one in this repo), a directory where a file was.
 *
 * **Never satisfies coverage**, which is the whole difference from `ABSENT`.
 * Absent-then-still-absent genuinely is nothing to read. Unreadable means the
 * agent does not know what the record says, and comparing sentinel to
 * sentinel would make *I could not read it* match *I could not read it* and
 * certify `fresh` — the failure being guarded against, one level up.
 */
export const UNREADABLE = "unreadable";

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

export class ContextFreshnessError extends Error {
  constructor(public readonly lease: SessionLease) {
    const changed = lease.changedInputs ?? [];
    const inputs = changed.length
      ? ` Refresh these inputs: ${changed.join(", ")}.`
      : " Refresh context before continuing.";
    super(`Context is ${lease.status}.${inputs}${lease.reason ? ` ${lease.reason}` : ""}`);
  }
}

/**
 * Everything the receipt alone can settle. Knowable offline, so it is
 * reported even when the remote could not be reached — an agent that cannot
 * verify GitHub can still be told which records it never read.
 *
 * Driven by `required`, not by what the observation happened to report. The
 * two lists are supplied independently by the caller, so iterating the
 * observation would let a project declare a fourth canonical record, build
 * its receipt with it, observe without it, and get `fresh` while that record
 * changed underneath. Completeness has to be the policy's property, not a
 * convention at the call site.
 */
function localDelta(
  receipt: ContextReceipt,
  observation: RemoteObservation,
  required: readonly string[],
): string[] {
  const covered = new Map(receipt.inputs.map((input) => [input.id, input.fingerprint]));
  const observed = new Map(observation.inputs.map((input) => [input.id, input.fingerprint]));

  const unresolved = required.filter((id) => {
    const read = covered.get(id);
    // Never loaded it, or loaded it and could not read it — the same thing.
    if (read === undefined || read === UNREADABLE) return true;
    const now = observed.get(id);
    // Unreported is not unchanged: the observation cannot vouch for it either.
    return now === undefined || now === UNREADABLE || now !== read;
  });

  // Drift in whatever else the receipt covered still counts.
  const drifted = observation.inputs
    .filter((input) => covered.has(input.id) && covered.get(input.id) !== input.fingerprint)
    .map((input) => input.id);

  return [...new Set([...unresolved, ...drifted])].sort();
}

/** Pure policy function, so CI needs neither GitHub nor an AI provider. */
export function observeLease(
  receipt: ContextReceipt,
  observation: RemoteObservation,
  policy: LeasePolicy = {},
): SessionLease {
  const changedInputs = localDelta(receipt, observation, policy.requiredInputs ?? CANONICAL_INPUTS);

  if (observation.remoteSha === null) {
    return {
      version: 1,
      receipt,
      checkedAt: observation.checkedAt,
      status: "unknown",
      changedInputs,
      reason: "Could not verify remote context.",
    };
  }

  if (changedInputs.length > 0 || observation.remoteSha !== receipt.remoteSha) {
    return {
      version: 1,
      receipt,
      checkedAt: observation.checkedAt,
      status: "refresh_required",
      changedInputs,
      reason:
        changedInputs.length > 0
          ? "Canonical project inputs are unread or changed."
          : "Remote state advanced; determine the canonical delta before continuing.",
    };
  }

  return {
    version: 1,
    receipt,
    checkedAt: observation.checkedAt,
    status: "fresh",
    changedInputs: [],
  };
}

/**
 * Re-read a lease as of `now`. An expired lease — or one whose `checkedAt`
 * cannot be parsed, or sits in the future because a clock moved — degrades to
 * `refresh_required` rather than carrying its old verdict forward.
 */
export function leaseAt(
  lease: SessionLease,
  now: Date = new Date(),
  policy: LeasePolicy = {},
): SessionLease {
  if (lease.status !== "fresh") return lease;

  const ttlMs = policy.ttlMs ?? LEASE_TTL_MS;
  const age = now.getTime() - Date.parse(lease.checkedAt);
  if (Number.isFinite(age) && age >= 0 && age < ttlMs) return lease;

  let reason: string;
  if (!Number.isFinite(age)) reason = "Lease has no readable check time.";
  else if (age < 0) reason = "Lease was checked in the future; the clock moved.";
  else reason = `Lease was checked ${Math.round(age / 1000)}s ago; the term is ${ttlMs / 1000}s.`;

  return { ...lease, status: "refresh_required", reason };
}

/**
 * Fail closed at a durable or externally governed boundary. `now` defaults to
 * the real clock so a caller cannot skip the term check by omitting it.
 */
export function requireFresh(lease: SessionLease, now: Date = new Date(), policy: LeasePolicy = {}): void {
  const current = leaseAt(lease, now, policy);
  if (current.status !== "fresh") throw new ContextFreshnessError(current);
}
