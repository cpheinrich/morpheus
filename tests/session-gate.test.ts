import { afterEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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

  it("names entries it had to drop rather than narrowing coverage in silence", async () => {
    const root = await project({
      name: "x",
      context: { requiredInputs: ["docs/protocol.md", { path: "docs/runbook.md" }] },
    });
    const { requiredInputs, droppedInputs } = await projectPolicy(root);

    expect(requiredInputs).toContain("docs/protocol.md");
    expect(requiredInputs).not.toContain("docs/runbook.md");
    // The project was trying to *add* a record. Narrowing coverage silently is
    // the same shape as switching it off silently, and it lands on exactly the
    // project that cared enough to declare one.
    expect(droppedInputs).toHaveLength(1);
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
    // `pm block` is local *conditionally* — it normally pushes, and offline it
    // writes the records and skips the push, which is what makes the
    // classification true rather than merely asserted. The blunt alternative
    // shut the one escape hatch a stuck session has: block rather than guess.
    expect(GATED["pm block"]).toBe("local");
    // Local unconditionally: its only remote use is a read-only `ls-remote`
    // for id allocation, and it never writes outward.
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

  it("says the trunk check was skipped rather than reporting no drift", async () => {
    const { execFileSync } = await import("node:child_process");
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-skipped-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal", context: { trunk: "origin/main" } }),
      "utf8",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["remote", "add", "origin", "https://example.invalid/r.git"], { cwd: root });

    // Both local checks pass, so without this the empty finding list renders
    // as an unqualified "✓ No drift." for a project whose declared branch may
    // not exist — the state that refuses pm claim forever.
    const findings = await doctor({ root, offline: true });
    const skipped = findings.find((f) => f.check === "context" && f.message.startsWith("Offline:"));
    expect(skipped?.severity).toBe("warning");
  });

  it("keeps reporting the gate-shutting states when the prefix or kind is invalid", async () => {
    // A *missing* prefix was already a finding that lets `doctor` continue; an
    // *invalid* one aborted the whole run — harmless until the
    // governed-command errors sat behind that abort. An operator whose gate is
    // shut should not be told about their prefix and have to come back for the
    // trunk.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-badprefix-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "mo", kind: "corp", context: { handle: "ghost" } }),
      "utf8",
    );

    // With items on the board, which is what the fan-out needs to be visible:
    // `"mo"` is truthy, so an unnarrowed prefix ran the id-prefix loop and
    // called every one of them wrong.
    await mkdir(join(root, "hq", "product", "roadmap"), { recursive: true });
    await writeFile(
      join(root, "hq/product/roadmap/MO-26-08-05-12.00.00-thing.md"),
      `---\nid: MO-26-08-05-12.00.00\ntitle: "A thing"\nstatus: backlog\npriority: P1\nowner: agent\nprs: []\ncreated: 2026-08-05\nupdated: 2026-08-05\n---\n\nBody.\n`,
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    expect(findings.find((f) => f.check === "manifest")).toBeUndefined();
    expect(findings.find((f) => f.check === "prefix")?.severity).toBe("error");
    expect(findings.find((f) => f.check === "kind")?.severity).toBe("error");
    // One true error about the prefix, not one true error and eighty false
    // ones about items that are perfectly fine.
    expect(findings.filter((f) => f.check.startsWith("pm:"))).toEqual([]);
    // …and the one that names a gate refusing every governed command runs.
    expect(
      findings.find((f) => f.check === "context" && f.message.includes("ghost.md"))?.severity,
    ).toBe("error");
  });

  it("keeps reporting when the whole context block is not an object", async () => {
    // `.loose()` widens which *keys* are allowed, not the type — so the rule
    // has to reach the container, not stop at the fields.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-badcontext-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal", context: "cpheinrich" }),
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    expect(findings.find((f) => f.check === "manifest")).toBeUndefined();
    expect(
      findings.find((f) => f.check === "context" && f.message.includes("not an object"))?.severity,
    ).toBe("error");
    // …and the rest of the checks still run.
    expect(findings.some((f) => f.check === "structure")).toBe(true);
  });

  it("keeps reporting the states that lock the gate when a context field is malformed", async () => {
    // A schema strict enough to reject a hand-edit silences `doctor` entirely
    // — including the handle-without-inbox and trunk errors, which name states
    // that refuse every governed command with no override — while
    // `projectPolicy` never throws and carries on with a default.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-malformed-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({
        name: "x",
        prefix: "XX",
        kind: "internal",
        // The singular, which is the same hand-edit population as [{path}].
        context: { handle: "ghost", requiredInputs: "docs/protocol.md" },
      }),
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    expect(findings.find((f) => f.check === "manifest")).toBeUndefined();
    expect(
      findings.find((f) => f.check === "context" && f.message.includes("not an array"))?.severity,
    ).toBe("error");
    // …and the check that names a locked gate still runs.
    expect(
      findings.find((f) => f.check === "context" && f.message.includes("ghost.md"))?.severity,
    ).toBe("error");
  });

  it("reports a required record that is missing, unreadable or declared-and-absent", async () => {
    // The one declared thing `doctor` did not verify — and it is the *default*
    // set, so it reaches every project. A missing required record is ABSENT,
    // therefore unresolvable, therefore refused forever with no offline
    // escape; `.agent/decisions.md` was a cosmetic structure *warning* that
    // predates this branch, and `CLAUDE.md` was reported by nothing at all.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-records-"));
    roots.push(root);
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({
        name: "x",
        prefix: "XX",
        kind: "internal",
        context: { requiredInputs: ["docs/renamed.md"] },
      }),
      "utf8",
    );
    // A dangling symlink, which is the realistic `CLAUDE.md` shape.
    await symlink("AGENTS.md", join(root, "CLAUDE.md"));
    await writeFile(join(root, ".agent/decisions.md"), "settled", "utf8");
    // `.agent/learned.md` absent, `docs/renamed.md` declared and absent.

    const findings = await doctor({ root, offline: true });
    const locked = findings.find(
      (f) => f.check === "context" && f.message.includes("every session must load"),
    );
    expect(locked?.severity).toBe("error");
    expect(locked?.message).toContain("CLAUDE.md");
    expect(locked?.message).toContain(".agent/learned.md");
    expect(locked?.message).toContain("docs/renamed.md");
    expect(locked?.message).not.toContain(".agent/decisions.md");
  });

  it("still names the read-first records when coverage is switched off", async () => {
    // `"requiredInputs": []` is deliberate and supported — acceptance 6's
    // subject — and the lockout error does not reach it. A project that
    // switched freshness off has not stopped needing the files AGENTS.md
    // tells every session to read.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-nocoverage-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal", context: { requiredInputs: [] } }),
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    const told = findings.filter(
      (f) => f.check === "context" && f.message.includes("still tells every session to read"),
    );
    expect(told).toHaveLength(2);
    // Warnings, not errors: nothing is refused in this configuration.
    expect(told.every((f) => f.severity === "warning")).toBe(true);
  });

  it("reports a dropped requiredInputs entry as an error", async () => {
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-dropped-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({
        name: "x",
        prefix: "XX",
        kind: "internal",
        context: { requiredInputs: ["docs/a.md", 42] },
      }),
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    const dropped = findings.find((f) => f.check === "context" && f.message.includes("not strings"));
    expect(dropped?.severity).toBe("error");
  });

  it("does not answer a failed git lookup with a confident 'no remotes'", async () => {
    // Not a git repo, git missing, a timeout, and git's `dubious ownership`
    // refusal all made `git remote` fail — and the old code called all four
    // "this repo has no git remotes", at *error* severity, which `run()`
    // counts into the exit code. A failed lookup rendering as a confident
    // answer, in the check added because a previous one was doing that.
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-notrepo-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal" }),
      "utf8",
    );

    const findings = await doctor({ root, offline: true });
    expect(findings.find((f) => f.message.includes("no git remotes"))).toBeUndefined();
    const asked = findings.find((f) => f.message.includes("Could not ask git"));
    expect(asked?.severity).toBe("warning");
    expect(asked?.message).toContain("git init");
  });

  it("reports a repo with no remote at all, without asking the network", async () => {
    const { execFileSync } = await import("node:child_process");
    const { doctor } = await import("../src/doctor/index.js");
    const root = await mkdtemp(join(tmpdir(), "morpheus-noremote-"));
    roots.push(root);
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", prefix: "XX", kind: "internal" }),
      "utf8",
    );
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });

    // The freshly-scaffolded state, before `git remote add`. `ls-remote origin`
    // exits 128 rather than 2 here, so `trunkSha` says `unreachable` and the
    // `missing` branch never fires — which is why this has to be answered
    // locally. Offline, so no network is consulted at all.
    const findings = await doctor({ root, offline: true });
    const none = findings.find((f) => f.check === "context" && f.message.includes("no git remotes"));
    expect(none?.severity).toBe("error");
  });

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

    const local = await gate(root, "pm block", "local");
    expect(local.ok).toBe(true);
    // `contained` is what a command reads to degrade — the exception was
    // actually applied, not merely declared.
    expect(local.contained).toBe(true);
    // …and still refuses anything that leaves the machine.
    expect((await gate(root, "pm claim", "external")).ok).toBe(false);
  });

  it("does not report containment for a fresh lease, however sticky the declaration", async () => {
    // `MORPHEUS_OFFLINE=1` is set by wrappers and hooks, so it outlives the
    // condition it was set for. Read unconditionally, it made the one command
    // whose purpose is visibility stop being visible in a session where
    // nothing else was degraded — and printed "offline" while `pm claim` in
    // the same session pushed fine.
    process.env["MORPHEUS_OFFLINE"] = "1";
    const root = await mkdtemp(join(tmpdir(), "morpheus-sticky-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await mkdir(join(root, "local", "sessions"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v ${id}`, "utf8");

    const { observeLease } = await import("../src/session/lease.js");
    const { readInputs } = await import("../src/session/inputs.js");
    const { writeLease } = await import("../src/session/store.js");
    const { gate } = await import("../src/session/gate.js");

    const inputs = await readInputs(root, CANONICAL_INPUTS);
    const now = new Date();
    const fresh = observeLease(
      {
        version: 1 as const,
        id: "ctx-1",
        createdAt: now.toISOString(),
        remoteSha: "abc123",
        branch: "b",
        worktree: root,
        inputs,
      },
      { checkedAt: now.toISOString(), remoteSha: "abc123", inputs },
      { requiredInputs: [...CANONICAL_INPUTS] },
    );
    expect(fresh.status).toBe("fresh");
    await writeLease(root, sessionId(root), fresh);

    const result = await gate(root, "pm block", "local", { now });
    expect(result.ok).toBe(true);
    expect(result.contained).toBeUndefined();
    delete process.env["MORPHEUS_OFFLINE"];
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
    const before = "# inbox\n";
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# inbox\n\n## ❗ 1. Blocked\n", "utf8");
    await noteWrite(root, [{ path: "hq/team/cpheinrich.md", before }]);

    // Past the term, so the lease is genuinely re-observed rather than trusted.
    const after = new Date(start.getTime() + 10 * 60_000);
    const { lease } = await check(root, after);
    expect(lease?.changedInputs).not.toContain("hq/team/cpheinrich.md");
  });

  it("leaves the receipt alone when a reply landed inside the term", async () => {
    // The one path in this protocol that can *destroy* evidence rather than
    // merely fail to act on it. `check` returns early for an in-term lease
    // without re-reading anything, so a human replying at 12:01 is invisible
    // — and a `noteWrite` at 12:02 that re-fingerprinted the file including
    // their reply would lose it permanently: the receipt is the only record of
    // what was read.
    const root = await mkdtemp(join(tmpdir(), "morpheus-reply-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(
      join(root, "morpheus.json"),
      JSON.stringify({ name: "x", context: { handle: "cpheinrich" } }),
      "utf8",
    );
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v1 ${id}`, "utf8");
    const inbox = join(root, "hq/team/cpheinrich.md");
    await writeFile(inbox, "# inbox\n", "utf8");

    const { refresh, noteWrite, check } = await import("../src/session/context.js");
    const start = new Date("2026-08-05T12:00:00.000Z");
    await refresh(root, start);

    // 12:01 — Chris replies. 12:02 — the agent blocks. `block()` reads the
    // file immediately before appending, so `before` carries the reply the
    // session never saw — and that is what does not match the receipt.
    await writeFile(inbox, "# inbox\n\n~ use Cloudflare\n", "utf8");
    const readBeforeWriting = "# inbox\n\n~ use Cloudflare\n";
    await writeFile(inbox, `${readBeforeWriting}\n## ❗ 2. Blocked\n`, "utf8");
    await noteWrite(root, [{ path: inbox, before: readBeforeWriting }]);

    const { lease } = await check(root, new Date(start.getTime() + 10 * 60_000));
    expect(lease?.changedInputs).toContain("hq/team/cpheinrich.md");
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
    await noteWrite(root, [{ path: "docs.md", before: null }]);

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
    await noteWrite(root, [{ path: join(root, "hq/team/bob.md"), before: "# bob\n" }]);

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

describe("records of a blocked item that reached nobody", () => {
  const cwd = process.cwd();
  afterEach(() => process.chdir(cwd));

  async function repo(): Promise<string> {
    const { execFileSync } = await import("node:child_process");
    const run = (dir: string, ...args: string[]) =>
      execFileSync("git", args, {
        cwd: dir,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@e",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@e",
        },
      });

    const remote = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    run(remote, "init", "-q", "--bare", "-b", "main");
    const root = await mkdtemp(join(tmpdir(), "morpheus-unsent-"));
    run(root, "init", "-q", "-b", "main");
    await writeFile(join(root, "seed.md"), "s", "utf8");
    run(root, "add", "-A");
    run(root, "commit", "-q", "-m", "seed");
    run(root, "remote", "add", "origin", remote);
    run(root, "push", "-q", "-u", "origin", "main");
    return root;
  }

  it("names tracked modifications, whose porcelain lines start with a space", async () => {
    // Every other test writes records as **new untracked files** (`?? path`),
    // the one porcelain shape with no leading space — so a per-line trim
    // followed by `.slice(3)` parsed them correctly and ate the first two
    // characters of every tracked modification (` M path`). `hq/team/x.md`
    // became `q/team/x.md`, whose dirname is not the inbox directory, so the
    // escalation dropped out of a list that says it includes it.
    const { execFileSync } = await import("node:child_process");
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await repo();
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };

    await mkdir(join(root, "hq", "product", "roadmap"), { recursive: true });
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(join(root, `hq/product/roadmap/${id}-thing.md`), "item", "utf8");
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# inbox\n", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "seed"], { cwd: root, env });
    execFileSync("git", ["push", "-q", "origin", "main"], { cwd: root });

    // Now tracked, and modified in the worktree only — as an offline
    // `pm block` leaves them, since it skips `commitRecords` entirely.
    await writeFile(join(root, `hq/product/roadmap/${id}-thing.md`), "blocked", "utf8");
    await writeFile(
      join(root, "hq/team/cpheinrich.md"),
      `# inbox\n\n## ❗ 1. Blocked · [${id}](../product/roadmap/${id}.md)\n`,
      "utf8",
    );

    const paths = await unsentBlockRecords(root, [id]);
    expect(paths).toContain(`hq/product/roadmap/${id}-thing.md`);
    expect(paths).toContain("hq/team/cpheinrich.md");
  });

  it("names all three records pm block writes, not just the one with the id", async () => {
    // The roadmap file carries no information to the human; the inbox entry
    // *is* the escalation, and its path holds no id at all. Matching on the
    // uppercase id found only the roadmap file — so following the printed
    // instruction left the escalation uncommitted and the next run reported
    // clean, using its own advice as the mechanism.
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const root = await repo();
    const id = "MO-26-08-05-16.27.56";

    await mkdir(join(root, "hq", "product", "roadmap"), { recursive: true });
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await mkdir(join(root, ".agent", "worklog"), { recursive: true });
    await writeFile(join(root, `hq/product/roadmap/${id}-thing.md`), "item", "utf8");
    // Lowercased by `block`, which `String.includes` would not match.
    await writeFile(join(root, `.agent/worklog/2026-08-06-${id.toLowerCase()}-blocked.md`), "w", "utf8");
    // `appendOpenItem` writes the roadmap id into the entry as a link, which
    // is what makes matching by content possible where the path has no id.
    await writeFile(
      join(root, "hq/team/cpheinrich.md"),
      `# inbox\n\n## ❗ 1. Blocked: a thing · \`claude\` [${id}](../product/roadmap/${id}.md)\n`,
      "utf8",
    );

    const paths = await unsentBlockRecords(root, [id]);
    expect(paths).toContain(`hq/product/roadmap/${id}-thing.md`);
    expect(paths).toContain(`.agent/worklog/2026-08-06-${id.toLowerCase()}-blocked.md`);
    expect(paths).toContain("hq/team/cpheinrich.md");
  });

  it("finds the inbox when run from a subdirectory", async () => {
    // Git emits repo-root-relative paths whatever directory it runs in, so
    // joining them onto `process.cwd()` only works from the root. From `src/`
    // the inbox read went ENOENT, `catch(() => "")` turned that into "names no
    // blocked id", and the one record that *is* the escalation dropped out
    // while the two that carry no information survived by path — with the
    // message still saying "including the inbox entry".
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await repo();
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(
      join(root, "hq/team/cpheinrich.md"),
      `# inbox\n\n## ❗ 1. Blocked · [${id}](../product/roadmap/${id}.md)\n`,
      "utf8",
    );

    const paths = await unsentBlockRecords(join(root, "src"), [id]);
    expect(paths).toContain("hq/team/cpheinrich.md");
  });

  it("lists an inbox it cannot read rather than treating it as clean", async () => {
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await repo();
    await mkdir(join(root, "hq", "team"), { recursive: true });
    // A dangling symlink: git reports it as a dirty file, and `readFile`
    // follows it to ENOENT. The check exists for this record, so failing
    // closed on it is the only safe direction — "" would have said it names
    // no blocked id, which is the absence-reads-as-clean shape.
    await symlink("gone.md", join(root, "hq/team/cpheinrich.md"));

    const paths = await unsentBlockRecords(root, [id]);
    expect(paths.some((p) => p.startsWith("hq/team/cpheinrich.md"))).toBe(true);
  });

  it("ignores a routine cycle carrying an escalation that already reached the remote", async () => {
    // `pm block` is what writes the id into the inbox, and the ❗ stays until
    // the cycle archives it — which cannot happen while the item is blocked.
    // So "names a blocked id" is true for the whole lifetime of the block, and
    // reduced to "the inbox is dirty": a false positive on the command
    // AGENTS.md tells you to run *before* every claim.
    const { execFileSync } = await import("node:child_process");
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await repo();
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };
    const entry = `## ❗ 1. Blocked · \`claude\` [${id}](../product/roadmap/${id}.md)`;

    // Monday: blocked, committed and pushed.
    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(join(root, "hq/team/cpheinrich.md"), `# inbox\n\n${entry}\n`, "utf8");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "blocked"], { cwd: root, env });
    execFileSync("git", ["push", "-q", "origin", "main"], { cwd: root });

    // Wednesday: a routine cycle rewrites the inbox, carrying the still-open
    // item forward. Dirty, and it names the id — but the escalation reached
    // whoever answers on Monday.
    await writeFile(join(root, "hq/team/cpheinrich.md"), `# inbox\n\nfresh cycle\n\n${entry}\n`, "utf8");

    expect(await unsentBlockRecords(root, [id])).toEqual([]);
    // And from a subdirectory: `rev-list -- <path>` takes a *pathspec*, read
    // relative to cwd, where `--porcelain` emits root-relative paths. Mixed,
    // the exclusion inverted and the false positive came straight back.
    await mkdir(join(root, "src"), { recursive: true });
    expect(await unsentBlockRecords(join(root, "src"), [id])).toEqual([]);
  });

  it("ignores an inbox cycle, the roster and meeting notes that name no blocked id", async () => {
    // `hq/team/` wholesale fired on every routine inbox cycle for as long as
    // anything was blocked — days — and told you to commit it onto whatever
    // branch you were on, which AGENTS.md forbids for a cycle. The inbox entry
    // is still the escalation, so it is matched by *content*.
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const root = await repo();
    await mkdir(join(root, "hq", "team", "meeting-notes"), { recursive: true });
    await writeFile(join(root, "hq/team/cpheinrich.md"), "# inbox\n\nfresh cycle, nothing blocked\n", "utf8");
    await writeFile(join(root, "hq/team/members.md"), "roster", "utf8");
    await writeFile(join(root, "hq/team/meeting-notes/2026-08-06-standup.md"), "notes", "utf8");

    const paths = await unsentBlockRecords(root, ["MO-26-08-05-16.27.56"]);
    expect(paths).toEqual([]);
  });

  it("does not call an upstream that is merely ahead 'on this machine only'", async () => {
    // Two-dot `git diff @{u}..HEAD` is tree-to-tree, so every file that moved
    // upstream came back as unsent — the inverse of the truth, in the state
    // you are in after any merged PR you have not pulled. `listClaims` fetches
    // immediately before this runs, which makes it the ordinary case.
    const { execFileSync } = await import("node:child_process");
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await repo();
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };
    const run = (dir: string, ...args: string[]) => execFileSync("git", args, { cwd: dir, env });

    // A second clone pushes, so this one is strictly behind with a clean tree.
    const other = await mkdtemp(join(tmpdir(), "morpheus-other-"));
    run(other, "clone", "-q", run(root, "remote", "get-url", "origin").toString().trim(), ".");
    await mkdir(join(other, "hq", "product", "roadmap"), { recursive: true });
    await writeFile(join(other, `hq/product/roadmap/${id}-thing.md`), "item", "utf8");
    run(other, "add", "-A");
    run(other, "commit", "-q", "-m", "someone else");
    run(other, "push", "-q", "origin", "main");
    run(root, "fetch", "-q", "origin");

    expect(run(root, "status", "--porcelain").toString().trim()).toBe("");
    const paths = await unsentBlockRecords(root, [id]);
    expect(paths).toEqual([]);
  });

  it("finds records on a branch with no upstream at all", async () => {
    // An upstream-relative range answers nothing here, which is exactly the
    // state a `git push` that fails for want of an upstream leaves behind.
    // "Reachable from no remote" needs no upstream to ask.
    const { execFileSync } = await import("node:child_process");
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const id = "MO-26-08-05-16.27.56";
    const root = await mkdtemp(join(tmpdir(), "morpheus-noupstream-"));
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    await mkdir(join(root, "hq", "product", "roadmap"), { recursive: true });
    await writeFile(join(root, `hq/product/roadmap/${id}-thing.md`), "item", "utf8");
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "blocked"], { cwd: root, env });

    expect(await unsentBlockRecords(root, [id])).toContain(`hq/product/roadmap/${id}-thing.md`);
  });

  it("sees records that are committed but unpushed", async () => {
    // The commonest route to the same state, and the one a working-tree check
    // is structurally unable to see: the commit succeeds and the push is
    // rejected, leaving a clean tree.
    const { execFileSync } = await import("node:child_process");
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const root = await repo();
    const id = "MO-26-08-05-16.27.56";
    const run = (...args: string[]) =>
      execFileSync("git", args, {
        cwd: root,
        env: {
          ...process.env,
          GIT_AUTHOR_NAME: "t",
          GIT_AUTHOR_EMAIL: "t@e",
          GIT_COMMITTER_NAME: "t",
          GIT_COMMITTER_EMAIL: "t@e",
        },
      });

    await mkdir(join(root, "hq", "team"), { recursive: true });
    await writeFile(
      join(root, "hq/team/cpheinrich.md"),
      `# inbox\n\n## ❗ 1. Blocked: a thing · \`claude\` [${id}](../product/roadmap/${id}.md)\n`,
      "utf8",
    );
    run("add", "-A");
    run("commit", "-q", "-m", `chore(${id}): blocked`);

    expect(run("status", "--porcelain").toString().trim()).toBe("");
    expect(await unsentBlockRecords(root, [id])).toContain("hq/team/cpheinrich.md");
  });

  it("says nothing about an unrelated dirty file", async () => {
    const { unsentBlockRecords } = await import("../src/cli/pm.js");
    const root = await repo();
    await writeFile(join(root, "src-thing.ts"), "work", "utf8");

    expect(await unsentBlockRecords(root, ["MO-26-08-05-16.27.56"])).toEqual([]);
  });
});

describe("the offline declaration and the receipt", () => {
  const previous = process.env["MORPHEUS_OFFLINE"];
  afterEach(() => {
    if (previous === undefined) delete process.env["MORPHEUS_OFFLINE"];
    else process.env["MORPHEUS_OFFLINE"] = previous;
  });

  it("mints a receipt against the real trunk even when offline is declared", async () => {
    // `gate()` observes unconditionally by design. A refresh that took the
    // declaration's word for it wrote `remoteSha: ""`, the gate then saw a
    // real SHA against an empty one, called it `refresh_required` rather than
    // `unknown` — so the offline branch was never entered — and refused every
    // governed command including the local ones, telling the agent to run the
    // refresh that regenerates the state. A non-terminating loop, on a machine
    // that is online.
    const { execFileSync } = await import("node:child_process");
    const { refresh } = await import("../src/session/context.js");
    const { gate } = await import("../src/session/gate.js");
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };

    const remote = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: remote });
    const root = await mkdtemp(join(tmpdir(), "morpheus-sticky-refresh-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v ${id}`, "utf8");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "root"], { cwd: root, env });
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
    execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd: root });

    // The sticky case the env var exists to describe: exported by a wrapper,
    // outliving the condition, on a machine whose network is fine.
    process.env["MORPHEUS_OFFLINE"] = "1";
    const now = new Date();
    const { lease } = await refresh(root, now);

    expect(lease?.status).toBe("fresh");
    expect(lease?.receipt.remoteSha).not.toBe("");
    // And the gate agrees, rather than refusing work the declaration was
    // supposed to permit.
    expect((await gate(root, "pm new", "local", { now })).ok).toBe(true);
  }, 20_000);
});

describe("status offline", () => {
  const previous = process.env["MORPHEUS_OFFLINE"];
  afterEach(() => {
    if (previous === undefined) delete process.env["MORPHEUS_OFFLINE"];
    else process.env["MORPHEUS_OFFLINE"] = previous;
  });

  it("does not claim unknown is assumed for a fresh in-term lease", async () => {
    // `check` returns before `offline` is read at all inside the term, so
    // nothing was skipped and the verdict is `fresh`. Printing "unknown is
    // assumed" there contradicts the line above it, and "external actions are
    // not permitted" is wrong about behaviour — `gate` returns ok for a fresh
    // lease before the offline branch is reached.
    const { execFileSync } = await import("node:child_process");
    const { refresh } = await import("../src/session/context.js");
    const { status } = await import("../src/cli/context.js");
    const env = {
      ...process.env,
      GIT_AUTHOR_NAME: "t",
      GIT_AUTHOR_EMAIL: "t@e",
      GIT_COMMITTER_NAME: "t",
      GIT_COMMITTER_EMAIL: "t@e",
    };

    const remote = await mkdtemp(join(tmpdir(), "morpheus-bare-"));
    execFileSync("git", ["init", "-q", "--bare", "-b", "main"], { cwd: remote });
    const root = await mkdtemp(join(tmpdir(), "morpheus-statusoffline-"));
    await mkdir(join(root, ".agent"), { recursive: true });
    await writeFile(join(root, "morpheus.json"), JSON.stringify({ name: "x" }), "utf8");
    for (const id of CANONICAL_INPUTS) await writeFile(join(root, id), `v ${id}`, "utf8");
    execFileSync("git", ["init", "-q", "-b", "main"], { cwd: root });
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-q", "-m", "root"], { cwd: root, env });
    execFileSync("git", ["remote", "add", "origin", remote], { cwd: root });
    execFileSync("git", ["push", "-q", "-u", "origin", "main"], { cwd: root });

    await refresh(root);
    process.env["MORPHEUS_OFFLINE"] = "1";

    const printed: string[] = [];
    const log = console.log;
    console.log = (...args: unknown[]) => void printed.push(args.join(" "));
    try {
      await status(root);
    } finally {
      console.log = log;
    }

    const out = printed.join("\n");
    expect(out).toContain("Context is fresh");
    expect(out).not.toContain("unknown is assumed");
    expect(out).not.toContain("external actions are not");
  }, 20_000);
});
