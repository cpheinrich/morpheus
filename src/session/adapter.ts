import type { SessionLease } from "./lease.js";

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
 * That includes an `unknown` lease carrying one. Gating on
 * `refresh_required` alone meant the offline case — the one whose whole point
 * is that files it never read are still knowable without the remote — was the
 * case the runner was never told about. A clean `unknown` stays silent, since
 * there is nothing to ask for beyond a remote that is not there.
 */
export async function notifyAdapter(adapter: SessionAdapter, lease: SessionLease): Promise<void> {
  const actionable = lease.status === "refresh_required" || lease.changedInputs.length > 0;
  if (lease.status !== "fresh" && actionable) await adapter.requestRefresh(lease);
}
