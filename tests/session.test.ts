import { describe, expect, it } from "vitest";
import {
  ContextFreshnessError,
  MockSessionAdapter,
  notifyAdapter,
  observeLease,
  requireFresh,
  type ContextReceipt,
} from "../src/session/index.js";

const receipt: ContextReceipt = {
  version: 1,
  id: "ctx-001",
  createdAt: "2026-08-05T12:00:00.000Z",
  remoteSha: "abc123",
  branch: "mo-001-context",
  worktree: "/tmp/morpheus",
  inputs: [{ id: ".agent/decisions.md", fingerprint: "a" }],
  advisoryMemorySources: ["codex-memory:project-hit"],
};

describe("session lease policy", () => {
  it("stays fresh when the checked remote and canonical inputs agree", () => {
    const lease = observeLease(receipt, {
      checkedAt: "2026-08-05T12:05:00.000Z",
      remoteSha: "abc123",
      changedInputs: [],
    });

    expect(lease.status).toBe("fresh");
    expect(() => requireFresh(lease)).not.toThrow();
  });

  it("requests the smallest known delta when canonical context changes", async () => {
    const lease = observeLease(receipt, {
      checkedAt: "2026-08-05T12:05:00.000Z",
      remoteSha: "def456",
      changedInputs: ["hq/team/cpheinrich.md", ".agent/decisions.md", "hq/team/cpheinrich.md"],
    });
    const adapter = new MockSessionAdapter();

    expect(lease.status).toBe("refresh_required");
    expect(lease.changedInputs).toEqual([".agent/decisions.md", "hq/team/cpheinrich.md"]);
    await notifyAdapter(adapter, lease);
    expect(adapter.refreshRequests).toEqual([lease]);
    expect(() => requireFresh(lease)).toThrow(ContextFreshnessError);
  });

  it("never treats an unavailable remote as unchanged", () => {
    const lease = observeLease(receipt, {
      checkedAt: "2026-08-05T12:05:00.000Z",
      remoteSha: null,
    });

    expect(lease.status).toBe("unknown");
    expect(lease.reason).toContain("Could not verify");
    expect(() => requireFresh(lease)).toThrow("Context is unknown");
  });

  it("does not notify a runner for a clean or unknown observation", async () => {
    const adapter = new MockSessionAdapter();
    await notifyAdapter(adapter, observeLease(receipt, {
      checkedAt: "2026-08-05T12:05:00.000Z",
      remoteSha: "abc123",
    }));
    await notifyAdapter(adapter, observeLease(receipt, {
      checkedAt: "2026-08-05T12:10:00.000Z",
      remoteSha: null,
    }));
    expect(adapter.refreshRequests).toEqual([]);
  });
});
