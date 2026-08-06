import { leaseAt, type LeasePolicy, type SessionLease } from "./lease.js";

/** Runner integrations deliver a lease decision; they do not own policy. */
export interface SessionAdapter {
  requestRefresh(lease: SessionLease): Promise<void>;
  interrupt?(lease: SessionLease): Promise<void>;
}

/** Test double used by PM/session tests. */
export class MockSessionAdapter implements SessionAdapter {
  readonly refreshRequests: SessionLease[] = [];
  readonly interruptions: SessionLease[] = [];

  async requestRefresh(lease: SessionLease): Promise<void> {
    this.refreshRequests.push(lease);
  }

  async interrupt(lease: SessionLease): Promise<void> {
    this.interruptions.push(lease);
  }
}

/**
 * Notify whenever the agent can resolve a known canonical delta.
 *
 * Reads the lease **through its term**, exactly as `requireFresh` does, with
 * `now` defaulting to the real clock. Branching on `lease.status` directly
 * made the two consumers of a lease disagree: `readLease` exists to bring one
 * back across a resume, so a lease persisted `fresh` six hours ago would
 * throw at the guard while the runner heard nothing.
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
  const actionable =
    current.status === "refresh_required" ||
    (current.status === "unknown" && current.changedInputs.length > 0);
  if (actionable) await adapter.requestRefresh(current);
}
