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
  changedInputs?: string[];
}

export class ContextFreshnessError extends Error {
  constructor(public readonly lease: SessionLease) {
    const inputs = lease.changedInputs.length
      ? ` Refresh these inputs: ${lease.changedInputs.join(", ")}.`
      : " Refresh context before continuing.";
    super(`Context is ${lease.status}.${inputs}`);
  }
}

/** Pure policy function, so CI needs neither GitHub nor an AI provider. */
export function observeLease(receipt: ContextReceipt, observation: RemoteObservation): SessionLease {
  if (observation.remoteSha === null) {
    return {
      version: 1,
      receipt,
      checkedAt: observation.checkedAt,
      status: "unknown",
      changedInputs: [],
      reason: "Could not verify remote context.",
    };
  }

  const changedInputs = [...new Set(observation.changedInputs ?? [])].sort();
  if (observation.remoteSha !== receipt.remoteSha || changedInputs.length > 0) {
    return {
      version: 1,
      receipt,
      checkedAt: observation.checkedAt,
      status: "refresh_required",
      changedInputs,
      reason:
        changedInputs.length > 0
          ? "Canonical project inputs changed."
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

/** Fail closed at a durable or externally governed boundary. */
export function requireFresh(lease: SessionLease): void {
  if (lease.status !== "fresh") throw new ContextFreshnessError(lease);
}
