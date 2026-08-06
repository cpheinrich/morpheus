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
    // `pm block` ends in `commitRecords` — add, commit, **push**. Classified
    // `local`, the offline branch printed "stays on this machine" and then
    // pushed to the shared inbox.
    expect(GATED["pm block"]).toBe("external");
    // The only local one: its remote use is a read-only `ls-remote` for id
    // allocation, and it writes nothing outward.
    expect(GATED["pm new"]).toBe("local");
  });

  it("refuses every external command offline, whatever the reason for being offline", async () => {
    process.env["MORPHEUS_OFFLINE"] = "1";
    const root = await mkdtemp(join(tmpdir(), "morpheus-reach-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v ${id}`, "utf8");

    const { refresh } = await import("../src/session/context.js");
    const { gate } = await import("../src/session/gate.js");
    // No remote at all, so the observation is `unknown` with a clean local delta.
    await refresh(root);

    for (const [action, reach] of Object.entries(GATED)) {
      const result = await gate(root, action, reach);
      expect(result.ok, `${action} (${reach})`).toBe(reach === "local");
      if (!result.ok) expect(result.message).not.toContain("stays on this machine");
    }
    delete process.env["MORPHEUS_OFFLINE"];
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

  // Every kind, not one. `manifest()` declares `context.handle` for all of
  // them, and a kind whose directory list omits `hq/team` would scaffold a
  // project declaring a record it never creates — ABSENT, therefore
  // unresolvable, therefore never fresh, with no offline escape and no
  // `requiredInputs` override that reaches it. Testing one kind is how that
  // ships.
  for (const kind of ["company", "personal", "internal"] as const) {
    it(`scaffolds a ${kind} project whose canonical records all exist`, async () => {
      const { scaffold } = await import("../src/init/index.js");
      const { access } = await import("node:fs/promises");
      const root = await mkdtemp(join(tmpdir(), "morpheus-init-"));
      roots.push(root);

      await scaffold(root, { name: "Acme", prefix: "AC", kind, owner: "cpheinrich" });

      // The default required set is only correct because `init` creates
      // exactly these — load-bearing, not a coincidence to rediscover.
      const required = (await projectPolicy(root)).requiredInputs ?? [];
      expect(required).toContain("hq/team/cpheinrich.md");
      for (const id of required) {
        await expect(access(join(root, id))).resolves.toBeUndefined();
      }
    });
  }

  it("reports a declared trunk whose branch does not exist on a reachable remote", async () => {
    const { execFileSync } = await import("node:child_process");
    const { doctor } = await import("../src/doctor/index.js");
    const run = (cwd: string, ...args: string[]) =>
      execFileSync("git", args, {
        cwd,
        env: { ...process.env, GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@e" },
      });

    // A real remote that really lacks the branch — the distinction that
    // matters. Outside a repo the answer is `unreachable`, which is honest
    // and is not this finding.
    const remote = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    roots.push(remote);
    run(remote, "init", "-q", "--bare", "-b", "main");

    const root = await mkdtemp(join(tmpdir(), "morpheus-trunk-doctor-"));
    roots.push(root);
    run(root, "init", "-q", "-b", "main");
    await writeFile(join(root, "a.md"), "a", "utf8");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "root");
    run(root, "remote", "add", "origin", remote);
    run(root, "push", "-q", "origin", "main");
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal", context: { trunk: "origin/trunk" } }),
      "utf8",
    );

    const findings = await doctor({ root });
    const bad = findings.find((f) => f.check === "context" && f.message.includes("origin/trunk"));
    // An error: every observation is `unknown`, so the external commands are
    // refused with a message blaming a network that is fine.
    expect(bad?.severity).toBe("error");
  });

  it("warns when an undeclared trunk might be a fork's", async () => {
    const { execFileSync } = await import("node:child_process");
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-fork-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal" }),
      "utf8",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["remote", "add", "origin", "https://example.invalid/fork.git"], { cwd: root });
    execFileSync("git", ["remote", "add", "upstream", "https://example.invalid/real.git"], { cwd: root });

    // Offline, so the resolve check is skipped and only the fork signal fires.
    const findings = await doctor({ root, offline: true });
    const fork = findings.find((f) => f.check === "context" && f.message.includes("upstream"));
    expect(fork?.severity).toBe("warning");
  });

  it("reports a declared handle whose inbox does not exist as an error", async () => {
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-doctor-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal", context: { handle: "ghost" } }),
      "utf8",
    );

    const findings = await doctor({ root });
    const locked = findings.find((f) => f.check === "context" && f.message.includes("ghost.md"));
    // An error, not a warning: every governed command is already refused, and
    // no flag reaches it.
    expect(locked?.severity).toBe("error");
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

describe("a command that writes a record it required", () => {
  it("keeps the receipt true rather than making the session re-assert it", async () => {
    // `pm block` appends to the owner's inbox, which is in the required set —
    // so without this the next gated command past the term is refused for
    // drift the session authored, naming a file it just wrote. Refusals with
    // no informational content are where "do not refresh without reading"
    // stops being holdable.
    const root = await mkdtemp(join(tmpdir(), "morpheus-notewrite-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", context: { handle: "cpheinrich" } }),
      "utf8",
    );
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v1 ${id}`, "utf8");
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# inbox\n", "utf8");

    const { refresh, noteWrite, check } = await import("../src/session/context.js");
    const start = new Date("2026-08-05T12:00:00.000Z");
    await refresh(root, start);

    // The session writes the inbox, as `pm block` does, and says so.
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# inbox\n\n## ❗ 1. Blocked\n", "utf8");
    await noteWrite(root, ["hq/team/cpheinrich.md"]);

    // Past the term, so the lease is genuinely re-observed rather than trusted.
    const after = new Date(start.getTime() + 10 * 60_000);
    const { lease } = await check(root, after);
    expect(lease?.changedInputs).not.toContain("hq/team/cpheinrich.md");
  });

  it("does not make an unread record read by writing over it", async () => {
    const root = await mkdtemp(join(tmpdir(), "morpheus-notewrite-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v1 ${id}`, "utf8");

    const { refresh, noteWrite, check } = await import("../src/session/context.js");
    const start = new Date("2026-08-05T12:00:00.000Z");
    await refresh(root, start);

    // A record the receipt never covered stays uncovered — `noteWrite` only
    // updates ids already in the receipt.
    await writeFile(join(root, "docs.md"), "new", "utf8");
    await noteWrite(root, ["docs.md"]);

    const { lease } = await check(root, new Date(start.getTime() + 10 * 60_000));
    expect(lease?.receipt.inputs.map((i) => i.id)).not.toContain("docs.md");
  });
});

describe("noteWrite is narrow on purpose", () => {
  /** A project with two required inboxes and a receipt already taken. */
  async function twoInboxes(): Promise<{ root: string; start: Date }> {
    const root = await mkdtemp(join(tmpdir(), "morpheus-narrow-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({
        name: "x",
        context: { handle: "alice", requiredInputs: ["hq/team/bob.md"] },
      }),
      "utf8",
    );
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v1 ${id}`, "utf8");
    await writeFile(join(root, "hq/team/alice.md"), "# alice\n", "utf8");
    await writeFile(join(root, "hq/team/bob.md"), "# bob\n", "utf8");

    const { refresh } = await import("../src/session/context.js");
    const start = new Date("2026-08-05T12:00:00.000Z");
    await refresh(root, start);
    return { root, start };
  }

  it("re-fingerprints only the inbox that was written", async () => {
    const { root, start } = await twoInboxes();
    const { noteWrite, check } = await import("../src/session/context.js");

    // Both move; only one is reported as written, as `pm block --owner bob`
    // would.
    await writeFile(join(root, "hq/team/bob.md"), "# bob\n\n## ❗ 1. Blocked\n", "utf8");
    await writeFile(join(root, "hq/team/alice.md"), "# alice\n\nsomeone else replied\n", "utf8");
    await noteWrite(root, [join(root, "hq/team/bob.md")]);

    const { lease } = await check(root, new Date(start.getTime() + 10 * 60_000));
    expect(lease?.changedInputs).not.toContain("hq/team/bob.md");
    // The other inbox was never read and never written by this session, so it
    // still has to be re-read. A receipt asserting otherwise is the one claim
    // the whole protocol rests on.
    expect(lease?.changedInputs).toContain("hq/team/alice.md");
  });

  it("does nothing when a command wrote nothing", async () => {
    const { root, start } = await twoInboxes();
    const { noteWrite, check } = await import("../src/session/context.js");

    // A reply arrives that this session has not read, then a `pm block` fails
    // for a missing --needs and writes nothing. Re-fingerprinting there would
    // silently clear drift the session never saw.
    await writeFile(join(root, "hq/team/alice.md"), "# alice\n\nunread reply\n", "utf8");
    await noteWrite(root, []);

    const { lease } = await check(root, new Date(start.getTime() + 10 * 60_000));
    expect(lease?.changedInputs).toContain("hq/team/alice.md");
  });
});
