import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CANONICAL_INPUTS } from "../src/session/lease.js";
import { projectPolicy, sessionId } from "../src/session/policy.js";
import { GATED, offlineDeclared } from "../src/session/gate.js";

async function project(manifest?: unknown): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "morpheus-policy-"));
  if (manifest !== undefined) {
    await writeFile(join(root, "morpheus.json"), JSON.stringify(manifest), "utf8");
  }
  return root;
}

describe("project policy", () => {
  it("takes the default set when a project declares nothing", async () => {
    const root = await project({ name: "x", prefix: "XX" });
    expect((await projectPolicy(root)).requiredInputs).toEqual([...CANONICAL_INPUTS]);
  });

  it("never resolves a missing or unparseable manifest to an empty set", async () => {
    // The one value that switches coverage off must not be reachable by
    // accident — it would hand every generated project a check that passes
    // for a session that read nothing.
    const absent = await project();
    const broken = await project();
    await writeFile(join(broken, "morpheus.json"), "{not json", "utf8");

    for (const root of [absent, broken]) {
      const { requiredInputs } = await projectPolicy(root);
      // `undefined` means none declared, and `observeLease` falls back to
      // `CANONICAL_INPUTS`. `[]` means declared as none, which is the only
      // thing that switches coverage off. Collapsing the two with `?? []` is
      // the same absent-reads-as-empty mistake the policy is built against —
      // it is asserted as the distinction it is.
      expect(requiredInputs).toBeUndefined();
    }
  });

  it("puts the owner's inbox in the required set when a handle is declared", async () => {
    const root = await project({ name: "x", context: { handle: "cpheinrich" } });
    expect((await projectPolicy(root)).requiredInputs).toContain("hq/team/cpheinrich.md");
  });

  it("does not let a malformed declaration collapse into the empty set", async () => {
    // A project trying to *add* records must not end up with coverage off.
    // `[]` is the one value that disables the check, and reaching it by
    // filtering out unusable entries is the absent-reads-as-empty defect —
    // declared-and-nothing-usable is not declared-as-none.
    for (const requiredInputs of [[{ path: "docs/protocol.md" }], [null], [42]]) {
      const root = await project({ name: "x", context: { requiredInputs } });
      expect((await projectPolicy(root)).requiredInputs).toEqual([...CANONICAL_INPUTS]);
    }
  });

  it("keeps an explicitly empty required set empty", async () => {
    const root = await project({ name: "x", context: { requiredInputs: [] } });
    expect((await projectPolicy(root)).requiredInputs).toEqual([]);
  });

  it("merges declared records with the default set without duplicating", async () => {
    const root = await project({
      name: "x",
      context: { handle: "cpheinrich", requiredInputs: ["CLAUDE.md", "docs/protocol.md"] },
    });
    const required = (await projectPolicy(root)).requiredInputs ?? [];

    expect(required).toContain("docs/protocol.md");
    expect(required.filter((id) => id === "CLAUDE.md")).toHaveLength(1);
  });
});

describe("session identity", () => {
  it("is the worktree, so two checkouts never share a lease", () => {
    // CLAUDE.md mandates one worktree per parallel session, which makes the
    // worktree path the one provider-neutral identity available.
    expect(sessionId("/tmp/a")).toBe(sessionId("/tmp/a"));
    expect(sessionId("/tmp/a")).not.toBe(sessionId("/tmp/b"));
    expect(sessionId("/tmp/a")).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe("what is gated", () => {
  it("gates the four commands where stale context does identifiable harm", () => {
    // Deliberately not every command: a gate that fires on `pm index` trains
    // people to route around it, and the routing-around is permanent.
    expect(Object.keys(GATED).sort()).toEqual(["access sync", "pm block", "pm claim", "pm new"]);
  });

  it("treats anything that leaves the machine as external", () => {
    expect(GATED["pm claim"]).toBe("external");
    expect(GATED["access sync"]).toBe("external");
    expect(GATED["pm new"]).toBe("local");
    expect(GATED["pm block"]).toBe("local");
  });
});

describe("the offline declaration", () => {
  const previous = process.env["MORPHEUS_OFFLINE"];
  afterEach(() => {
    if (previous === undefined) delete process.env["MORPHEUS_OFFLINE"];
    else process.env["MORPHEUS_OFFLINE"] = previous;
  });

  it("has to be declared, by flag or environment", () => {
    delete process.env["MORPHEUS_OFFLINE"];
    expect(offlineDeclared()).toBe(false);
    expect(offlineDeclared(true)).toBe(true);

    // Environment as well as flag, because hooks and wrappers set environment
    // rather than argv.
    process.env["MORPHEUS_OFFLINE"] = "1";
    expect(offlineDeclared()).toBe(true);
  });

  it("is not implied by an unreachable remote", () => {
    // An unreachable remote is `unknown` either way. The exception is the
    // operator saying "I know, proceed locally" — inferring it from the
    // symptom would make every network blip an unlocked gate.
    delete process.env["MORPHEUS_OFFLINE"];
    expect(offlineDeclared(false)).toBe(false);
  });
});

describe("scaffolding", () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((r) => rm(r, { recursive: true, force: true })));
  });

  it("scaffolds a project whose canonical records all exist", async () => {
    const { scaffold } = await import("../src/init/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-init-"));
    roots.push(root);
    await mkdir(root, { recursive: true });

    await scaffold(root, { name: "Acme", prefix: "AC", kind: "company", owner: "cpheinrich" });

    // The default required set is only correct because `init` creates exactly
    // these — that fit is load-bearing, not a coincidence to rediscover.
    const required = (await projectPolicy(root)).requiredInputs ?? [];
    for (const id of required) {
      const { access } = await import("node:fs/promises");
      await expect(access(join(root, id))).resolves.toBeUndefined();
    }
    expect(required).toContain("hq/team/cpheinrich.md");
  });
});

describe("the offline exception", () => {
  const previous = process.env["MORPHEUS_OFFLINE"];
  afterEach(() => {
    if (previous === undefined) delete process.env["MORPHEUS_OFFLINE"];
    else process.env["MORPHEUS_OFFLINE"] = previous;
  });

  /**
   * A worktree with the canonical records really on disk and a lease already
   * stored. Grounded rather than synthetic because `gate` re-observes: a
   * fixture that only writes the lease measures nothing, since `check` reads
   * the files again and finds them absent.
   */
  async function withLease(unread: string[]): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "morpheus-offline-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) {
      await writeFile(join(root, id), `contents of ${id}`, "utf8");
    }

    const { observeLease } = await import("../src/session/lease.js");
    const { readInputs } = await import("../src/session/inputs.js");
    const { writeLease } = await import("../src/session/store.js");

    const inputs = await readInputs(root, CANONICAL_INPUTS);
    const lease = observeLease(
      {
        version: 1 as const,
        id: "ctx-1",
        createdAt: "2026-08-05T12:00:00.000Z",
        remoteSha: "abc123",
        branch: "b",
        worktree: root,
        // Drop coverage of the named records, so the local delta is non-empty
        // without needing the files themselves to differ.
        inputs: inputs.filter((i) => !unread.includes(i.id)),
      },
      { checkedAt: "2026-08-05T12:00:00.000Z", remoteSha: null, inputs },
      { requiredInputs: [...CANONICAL_INPUTS] },
    );

    expect(lease.status).toBe("unknown");
    await writeLease(root, sessionId(root), lease);
    return root;
  }

  it("refuses local work when records the session could have read have moved", async () => {
    // `observeLease` returns `unknown` for an unreachable remote but still
    // fills in the local delta, because that half needs no network. Waving it
    // through would permit the exact harm `pm block` is gated for.
    process.env["MORPHEUS_OFFLINE"] = "1";
    const root = await withLease([".agent/decisions.md"]);
    const { gate } = await import("../src/session/gate.js");

    const result = await gate(root, "pm block", "local");
    expect(result.ok).toBe(false);
    expect(result.message).toContain(".agent/decisions.md");
    expect(result.message).toContain("not records you can");
  });

  it("permits local work when the trunk is the only thing unverified", async () => {
    process.env["MORPHEUS_OFFLINE"] = "1";
    const root = await withLease([]);
    const { gate } = await import("../src/session/gate.js");

    expect((await gate(root, "pm block", "local")).ok).toBe(true);
    // …and still refuses anything that leaves the machine.
    expect((await gate(root, "pm claim", "external")).ok).toBe(false);
  });

  it("refuses everything when offline was never declared", async () => {
    delete process.env["MORPHEUS_OFFLINE"];
    const root = await withLease([]);
    const { gate } = await import("../src/session/gate.js");

    expect((await gate(root, "pm block", "local")).ok).toBe(false);
  });
});

describe("a receipt that does not reach disk", () => {
  it("is reported as unwritten rather than folded into the advisory channel", async () => {
    // `local/sessions` as a file: the lease is computed correctly and cannot
    // be stored. Printing a success here sends the agent into a loop — the
    // next governed command finds no lease and asks for the refresh that
    // just appeared to work.
    const root = await mkdtemp(join(tmpdir(), "morpheus-unwritable-"));
    await mkdir(join(root, "local"), { recursive: true });
    await writeFile(join(root, "local", "sessions"), "not a directory", "utf8");
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");

    const { refresh } = await import("../src/session/context.js");
    const result = await refresh(root);

    expect(result.lease).not.toBeNull();
    expect(result.written).toBe(false);
    expect(result.issue).toBeTruthy();
  });
});
