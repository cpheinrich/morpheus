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

/** Notify only when the agent can resolve a known canonical delta. */
export async function notifyAdapter(adapter: SessionAdapter, lease: SessionLease): Promise<void> {
  if (lease.status === "refresh_required") await adapter.requestRefresh(lease);
}
