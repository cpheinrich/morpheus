import { leaseAt, type LeasePolicy, type SessionLease } from "./lease.js";

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
  requestRefresh(lease: SessionLease): Promise<void>;
  /** Nothing to load: a record is missing or unreadable and needs fixing. */
  requestRepair(lease: SessionLease): Promise<void>;
}

/** Test double used by PM/session tests. */
export class MockSessionAdapter implements SessionAdapter {
  readonly refreshRequests: SessionLease[] = [];
  readonly repairRequests: SessionLease[] = [];

  async requestRefresh(lease: SessionLease): Promise<void> {
    this.refreshRequests.push(lease);
  }

  async requestRepair(lease: SessionLease): Promise<void> {
    this.repairRequests.push(lease);
  }
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
export async function notifyAdapter(
  adapter: SessionAdapter,
  lease: SessionLease,
  now: Date = new Date(),
  policy: LeasePolicy = {},
): Promise<void> {
  const current = leaseAt(lease, now, policy);
  if (current.status === "fresh") return;

  const stuck = current.unresolvableInputs ?? [];
  const refreshable = current.changedInputs.filter((id) => !stuck.includes(id));

  // Repair is reported alongside refresh rather than instead of it: a lease can
  // carry both, and suppressing either leaves the runner acting on half a
  // picture.
  if (stuck.length) await adapter.requestRepair(current);

  // Refresh fires by default, because most reasons a lease is not fresh — a
  // moved trunk, an expired term — leave nothing in `changedInputs` to point
  // at. Two cases have genuinely nothing to ask for: an `unknown` lease whose
  // only problem is a remote that is not there, and one whose entire delta is
  // unresolvable. `remoteAdvanced` is read rather than inferred from an empty
  // local delta, which got it wrong for a lease carrying both an unreadable
  // record and a moved trunk.
  const nothingToRefresh =
    refreshable.length === 0 &&
    !current.remoteAdvanced &&
    (current.status === "unknown" || stuck.length > 0);
  if (!nothingToRefresh) await adapter.requestRefresh(current);
}
