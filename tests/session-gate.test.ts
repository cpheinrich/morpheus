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
