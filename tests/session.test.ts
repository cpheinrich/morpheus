import { describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  ABSENT,
  UNREADABLE,
  CANONICAL_INPUTS,
  ContextFreshnessError,
  LEASE_TTL_MS,
  MockSessionAdapter,
  fingerprint,
  leaseAt,
  leasePath,
  notifyAdapter,
  observeLease,
  readInputs,
  requireFresh,
  readLease,
  writeLease,
  type ContextInput,
  type ContextReceipt,
} from "../src/session/index.js";

const CHECKED_AT = "2026-08-05T12:05:00.000Z";
const CHECKED = new Date(CHECKED_AT);

/** Every canonical input read, all fingerprints matching what is on disk. */
const covering: ContextInput[] = CANONICAL_INPUTS.map((id) => ({ id, fingerprint: `fp:${id}` }));

const receipt: ContextReceipt = {
  version: 1,
  id: "ctx-001",
  createdAt: "2026-08-05T12:00:00.000Z",
  remoteSha: "abc123",
  branch: "mo-001-context",
  worktree: "/tmp/morpheus",
  inputs: covering,
  advisoryMemorySources: ["codex-memory:project-hit"],
};

describe("session lease policy", () => {
  it("stays fresh when the checked remote and canonical inputs agree", () => {
    const lease = observeLease(receipt, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs: covering,
    });

    expect(lease.status).toBe("fresh");
    expect(() => requireFresh(lease, CHECKED)).not.toThrow();
  });

  it("requests the smallest known delta when canonical context changes", async () => {
    const lease = observeLease(receipt, {
      checkedAt: CHECKED_AT,
      remoteSha: "def456",
      inputs: covering.map((input) =>
        input.id === ".agent/decisions.md" ? { ...input, fingerprint: "moved" } : input,
      ),
    });
    const adapter = new MockSessionAdapter();

    expect(lease.status).toBe("refresh_required");
    expect(lease.changedInputs).toEqual([".agent/decisions.md"]);
    await notifyAdapter(adapter, lease);
    expect(adapter.refreshRequests).toEqual([lease]);
    expect(() => requireFresh(lease, CHECKED)).toThrow(ContextFreshnessError);
  });

  it("never treats an unavailable remote as unchanged", () => {
    const lease = observeLease(receipt, { checkedAt: CHECKED_AT, remoteSha: null, inputs: covering });

    expect(lease.status).toBe("unknown");
    expect(lease.reason).toContain("Could not verify");
    expect(() => requireFresh(lease, CHECKED)).toThrow("Context is unknown");
  });

  it("does not notify a runner for a clean or featureless-unknown observation", async () => {
    const adapter = new MockSessionAdapter();
    await notifyAdapter(adapter, observeLease(receipt, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs: covering,
    }));
    await notifyAdapter(adapter, observeLease(receipt, {
      checkedAt: "2026-08-05T12:10:00.000Z",
      remoteSha: null,
      inputs: covering,
    }));
    expect(adapter.refreshRequests).toEqual([]);
  });

  it("notifies on an unknown lease that still names something to load", async () => {
    const adapter = new MockSessionAdapter();
    // Offline, and the receipt covered nothing. The remote is unknowable; the
    // three records the agent never read are not, so the runner hears about it.
    const lease = observeLease({ ...receipt, inputs: [] }, {
      checkedAt: CHECKED_AT,
      remoteSha: null,
      inputs: covering,
    });

    await notifyAdapter(adapter, lease);
    expect(lease.status).toBe("unknown");
    expect(adapter.refreshRequests).toEqual([lease]);
  });
});

describe("receipt coverage", () => {
  it("refuses to certify a receipt that recorded nothing", () => {
    const lease = observeLease({ ...receipt, inputs: [] }, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs: covering,
    });

    expect(lease.status).toBe("refresh_required");
    expect(lease.changedInputs).toEqual([...CANONICAL_INPUTS].sort());
    expect(() => requireFresh(lease, CHECKED)).toThrow(ContextFreshnessError);
  });

  it("names the canonical records a partial receipt never loaded", () => {
    const lease = observeLease(
      { ...receipt, inputs: covering.filter((i) => i.id !== ".agent/learned.md") },
      { checkedAt: CHECKED_AT, remoteSha: "abc123", inputs: covering },
    );

    expect(lease.changedInputs).toEqual([".agent/learned.md"]);
  });

  it("reports the locally knowable gap even when the remote is unreachable", () => {
    const lease = observeLease({ ...receipt, inputs: [] }, {
      checkedAt: CHECKED_AT,
      remoteSha: null,
      inputs: covering,
    });

    // Offline is still `unknown` — but not knowing the remote is no reason to
    // withhold the files the agent demonstrably never read.
    expect(lease.status).toBe("unknown");
    expect(lease.changedInputs).toEqual([...CANONICAL_INPUTS].sort());
  });

  it("treats an explicit empty required set as the only way to switch coverage off", () => {
    const observation = { checkedAt: CHECKED_AT, remoteSha: "abc123", inputs: covering };
    const empty = observeLease({ ...receipt, inputs: [] }, observation, { requiredInputs: [] });
    const unset = observeLease({ ...receipt, inputs: [] }, observation, { requiredInputs: undefined });

    // `[]` is a declaration that this project has no canonical records;
    // `undefined` is no declaration at all, and falls back to the default.
    expect(empty.status).toBe("fresh");
    expect(unset.status).toBe("refresh_required");
  });
});

describe("lease term", () => {
  const fresh = observeLease(receipt, { checkedAt: CHECKED_AT, remoteSha: "abc123", inputs: covering });

  it("holds inside the five-minute term", () => {
    const inside = new Date(CHECKED.getTime() + LEASE_TTL_MS - 1000);
    expect(leaseAt(fresh, inside).status).toBe("fresh");
    expect(() => requireFresh(fresh, inside)).not.toThrow();
  });

  it("expires a fresh lease once the term elapses", () => {
    const after = new Date(CHECKED.getTime() + LEASE_TTL_MS);
    expect(leaseAt(fresh, after).status).toBe("refresh_required");
    expect(() => requireFresh(fresh, after)).toThrow(ContextFreshnessError);
    expect(() => requireFresh(fresh, new Date(CHECKED.getTime() + 6 * 60 * 60 * 1000))).toThrow(
      /Lease was checked/,
    );
  });

  it("survives a resume only if the persisted lease is still inside its term", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-session-"));
    await writeLease(root, "session-001", fresh);
    const { lease } = await readLease(root, "session-001");

    expect(lease).toEqual(fresh);
    expect(() => requireFresh(lease!, new Date(CHECKED.getTime() + 60_000))).not.toThrow();
    expect(() => requireFresh(lease!, new Date(CHECKED.getTime() + 60 * 60_000))).toThrow(
      ContextFreshnessError,
    );
  });

  it("treats an unreadable or future check time as expired", () => {
    expect(leaseAt({ ...fresh, checkedAt: "whenever" }, CHECKED).status).toBe("refresh_required");
    // A clock that moved backwards must not buy a lease extra life.
    expect(leaseAt(fresh, new Date(CHECKED.getTime() - 60_000)).status).toBe("refresh_required");
  });

  it("leaves a non-fresh lease's reason intact", () => {
    const unknown = observeLease(receipt, { checkedAt: CHECKED_AT, remoteSha: null, inputs: covering });
    expect(leaseAt(unknown, new Date(CHECKED.getTime() + 60 * 60_000))).toEqual(unknown);
  });
});

describe("lease store", () => {
  it("keeps receipts local while preserving the complete lease across a resume", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-session-"));
    const lease = observeLease(receipt, {
      checkedAt: CHECKED_AT,
      remoteSha: "def456",
      inputs: covering,
    });

    const path = await writeLease(root, "session-001", lease);
    expect(path).toBe(join(root, "local", "sessions", "session-001.json"));
    expect(await readLease(root, "session-001")).toEqual({ lease });
    expect(await readLease(root, "absent")).toEqual({ lease: null });
  });

  it("distinguishes corrupt state from no state", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-session-"));
    const path = leasePath(root, "session-002");
    await mkdir(dirname(path), { recursive: true });

    for (const body of ["null", "{}", '{"version":1}', "{not json"]) {
      await writeFile(path, body, "utf8");
      const read = await readLease(root, "session-002");
      expect(read.lease).toBeNull();
      // Absent state carries no issue; unusable state always does.
      expect(read.issue).toBeTruthy();
    }
  });
});

describe("canonical input fingerprints", () => {
  it("fingerprints what is on disk and marks what is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-inputs-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "CLAUDE.md"), "read this first", "utf8");
    await writeFile(join(root, ".agent", "decisions.md"), "settled choices", "utf8");

    const inputs = await readInputs(root);
    const byId = new Map(inputs.map((i) => [i.id, i.fingerprint]));

    expect(inputs.map((i) => i.id)).toEqual([...CANONICAL_INPUTS]);
    expect(byId.get("CLAUDE.md")).toBe(fingerprint("read this first"));
    expect(byId.get(".agent/learned.md")).toBe(ABSENT);
  });

  it("reports an unreadable record as drift rather than aborting the check", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-inputs-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    // A directory where a file should be: readable path, unreadable content.
    // One bad record must not take the whole freshness check down with it.
    await mkdir(join(root, "CLAUDE.md"));
    await writeFile(join(root, ".agent", "decisions.md"), "settled choices", "utf8");

    const inputs = await readInputs(root);
    const byId = new Map(inputs.map((i) => [i.id, i.fingerprint]));

    expect(byId.get("CLAUDE.md")).toBe(UNREADABLE);
    expect(byId.get(".agent/decisions.md")).toBe(fingerprint("settled choices"));

    const lease = observeLease({ ...receipt, inputs: covering }, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs,
    });
    expect(lease.status).toBe("refresh_required");
    expect(lease.changedInputs).toContain("CLAUDE.md");
  });

  it("closes the loop: an edited record drifts against the receipt that read it", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-inputs-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    for (const id of CANONICAL_INPUTS) {
      await writeFile(join(root, id), `original ${id}`, "utf8");
    }

    const taken = await readInputs(root);
    const now = observeLease({ ...receipt, inputs: taken }, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs: taken,
    });
    expect(now.status).toBe("fresh");

    await writeFile(join(root, ".agent", "decisions.md"), "another agent decided otherwise", "utf8");
    const later = observeLease({ ...receipt, inputs: taken }, {
      checkedAt: CHECKED_AT,
      remoteSha: "abc123",
      inputs: await readInputs(root),
    });

    expect(later.status).toBe("refresh_required");
    expect(later.changedInputs).toEqual([".agent/decisions.md"]);
  });
});
