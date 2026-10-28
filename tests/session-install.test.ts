import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  CLAUDE_SETTINGS,
  CODEX_HOOKS,
  MANIFEST,
  READ_HOOK_COMMAND,
  installContext,
  type Repair,
} from "../src/session/install.js";
import {
  MORPHEUS_BOOTSTRAP,
  MORPHEUS_BOOTSTRAP_README,
  MORPHEUS_SESSION_START,
} from "../src/session/bootstrap.js";
import { projectPolicy } from "../src/session/policy.js";
import { POLL_GUARD_COMMAND, POLL_GUARD_SCRIPT, pollGuardScript } from "../src/wait-ci/hook.js";

const HANDLE = "cpheinrich";

describe("morpheus context install", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "install-"));
    await writeFile(join(dir, MANIFEST), JSON.stringify({ name: "Acme", prefix: "AC" }) + "\n");
    await mkdir(join(dir, "hq", "team"), { recursive: true });
    await writeFile(join(dir, "hq", "team", `${HANDLE}.md`), "# Inbox\n");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const run = (handle: string | undefined = HANDLE, write = true) =>
    installContext(dir, { write, handle });
  const read = (rel: string) => readFile(join(dir, rel), "utf8");
  const at = (repairs: Repair[], target: string): Repair =>
    repairs.find((r) => r.target === target)!;
  const json = async (rel: string) => JSON.parse(await read(rel)) as Record<string, unknown>;

  it("wires both providers and the inbox declaration from nothing", async () => {
    const repairs = await run();
    expect(repairs.map((r) => r.outcome)).toEqual([
      "created",
      "created",
      "created",
      "created",
      "created",
      "updated",
      "created",
    ]);

    expect(await read(MORPHEUS_BOOTSTRAP)).toContain("morpheus:bootstrap:v1");
    expect(await read(MORPHEUS_SESSION_START)).toContain("morpheus:session-start:v1");
    expect(await read(MORPHEUS_BOOTSTRAP_README)).toContain("explicit yes");
    expect(await read(POLL_GUARD_SCRIPT)).toBe(pollGuardScript());

    for (const rel of [CLAUDE_SETTINGS, CODEX_HOOKS]) {
      const doc = (await json(rel)) as { hooks: { SessionStart: unknown[]; PreToolUse: unknown[] } };
      expect(doc.hooks.SessionStart).toEqual([
        { hooks: [{ type: "command", command: "sh .morpheus/session-start.sh" }] },
      ]);
      expect(doc.hooks.PreToolUse).toEqual([
        { matcher: "Bash", hooks: [{ type: "command", command: POLL_GUARD_COMMAND, timeout: 10 }] },
      ]);
    }

    // The declaration is only worth writing if the policy then reads it — the
    // whole point is that the inbox joins the required set.
    const { requiredInputs } = await projectPolicy(dir);
    expect(requiredInputs).toContain(`hq/team/${HANDLE}.md`);
  });

  it("is idempotent — a second run reports present and writes nothing new", async () => {
    await run();
    const before = await Promise.all([read(CLAUDE_SETTINGS), read(CODEX_HOOKS), read(MANIFEST)]);

    const repairs = await run();
    expect(repairs.map((r) => r.outcome)).toEqual([
      "present",
      "present",
      "present",
      "present",
      "present",
      "present",
      "present",
    ]);
    expect(await Promise.all([read(CLAUDE_SETTINGS), read(CODEX_HOOKS), read(MANIFEST)])).toEqual(
      before,
    );
  });

  it("merges into an existing settings file rather than replacing it", async () => {
    // The case `init`'s writer cannot reach: the file exists for unrelated
    // reasons, so a scaffold that skips what is present leaves the hook out
    // forever while reporting the project scaffolded.
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, CLAUDE_SETTINGS),
      JSON.stringify({
        permissions: { defaultMode: "auto" },
        hooks: { PostToolUse: [{ matcher: "Bash", hooks: [] }] },
      }),
    );

    const repairs = await run();
    expect(at(repairs, CLAUDE_SETTINGS).outcome).toBe("updated");

    const doc = (await json(CLAUDE_SETTINGS)) as {
      permissions: unknown;
      hooks: { PostToolUse: unknown[]; SessionStart: unknown[] };
    };
    expect(doc.permissions).toEqual({ defaultMode: "auto" });
    // Theirs kept, the read hook appended beside it.
    expect(doc.hooks.PostToolUse).toEqual([
      { matcher: "Bash", hooks: [] },
      { matcher: "Read|Bash", hooks: [{ type: "command", command: READ_HOOK_COMMAND }] },
    ]);
    expect(doc.hooks.SessionStart).toHaveLength(1);
  });

  it("wires the read hook for each provider's own events", async () => {
    await run();
    const claude = (await json(CLAUDE_SETTINGS)) as { hooks: Record<string, unknown> };
    expect(claude.hooks["PostToolUse"]).toEqual([{ matcher: "Read|Bash", hooks: [{ type: "command", command: READ_HOOK_COMMAND }] }]);
    // Claude reports a non-zero Bash exit — how `refresh` prints a refusal — as a failure event.
    expect(claude.hooks["PostToolUseFailure"]).toEqual([{ matcher: "Bash", hooks: [{ type: "command", command: READ_HOOK_COMMAND }] }]);
    const codex = (await json(CODEX_HOOKS)) as { hooks: Record<string, unknown> };
    expect(codex.hooks["PostToolUse"]).toEqual([{ hooks: [{ type: "command", command: READ_HOOK_COMMAND }] }]);
    // An event Codex does not define could invalidate the file and the session hook with it.
    // PreToolUse is one Codex documents (the poll guard, matching its shell tool as `Bash`).
    expect(Object.keys(codex.hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "SessionStart"]);
  });

  it("adds only the missing hooks to a project wired before they existed", async () => {
    const legacy = { hooks: { SessionStart: [{ hooks: [{ type: "command", command: "sh .morpheus/session-start.sh" }] }] } };
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(join(dir, CODEX_HOOKS), JSON.stringify(legacy));
    await run();
    const second = at(await run(), CODEX_HOOKS);
    expect(second.outcome).toBe("present");

    await writeFile(join(dir, CODEX_HOOKS), JSON.stringify(legacy));
    const repair = at(await run(), CODEX_HOOKS);
    expect(repair.outcome).toBe("updated");
    expect(repair.detail).toBe(
      "Added the read hook (PostToolUse) beside any hooks already there. " +
        "Added the CI poll guard (PreToolUse) beside any hooks already there.",
    );
    const doc = (await json(CODEX_HOOKS)) as { hooks: { SessionStart: unknown[] } };
    expect(doc.hooks.SessionStart).toEqual(legacy.hooks.SessionStart);
  });

  it("refuses, leaving the file as it was, when a read-hook event is not an array", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    const before = JSON.stringify({ hooks: { PostToolUseFailure: { matcher: "Bash" } } });
    await writeFile(join(dir, CLAUDE_SETTINGS), before);
    const repair = at(await run(), CLAUDE_SETTINGS);
    expect(repair.outcome).toBe("blocked");
    expect(repair.detail).toContain('"hooks.PostToolUseFailure" is not an array');
    expect(await read(CLAUDE_SETTINGS)).toBe(before);
  });

  it("runs the hook through a shell that cannot fail the tool call", () => {
    expect(READ_HOOK_COMMAND).toContain("morpheus context record-read >/dev/null 2>&1; exit 0");
    expect(READ_HOOK_COMMAND).toContain("command -v morpheus");
  });

  it("appends beside a SessionStart hook that is already there", async () => {
    await mkdir(join(dir, ".codex"), { recursive: true });
    const theirs = { hooks: [{ type: "command", command: "./scripts/greet.sh" }] };
    await writeFile(join(dir, CODEX_HOOKS), JSON.stringify({ hooks: { SessionStart: [theirs] } }));

    expect(at(await run(), CODEX_HOOKS).outcome).toBe("updated");
    const doc = (await json(CODEX_HOOKS)) as { hooks: { SessionStart: unknown[] } };
    expect(doc.hooks.SessionStart).toHaveLength(2);
    expect(doc.hooks.SessionStart[0]).toEqual(theirs);
  });

  it("replaces a differently-spelled legacy brief instead of running both", async () => {
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(
      join(dir, CODEX_HOOKS),
      JSON.stringify({
        hooks: { SessionStart: [{ hooks: [{ type: "command", command: "pnpm morpheus context brief" }] }] },
      }),
    );
    expect(at(await run(), CODEX_HOOKS).outcome).toBe("updated");
    const doc = (await json(CODEX_HOOKS)) as { hooks: { SessionStart: unknown[] } };
    expect(doc.hooks.SessionStart).toEqual([
      { hooks: [{ type: "command", command: "sh .morpheus/session-start.sh" }] },
    ]);
  });

  it("will not wire a hook to an unowned bootstrap file", async () => {
    await mkdir(join(dir, ".morpheus"), { recursive: true });
    await writeFile(join(dir, MORPHEUS_BOOTSTRAP), "#!/bin/sh\necho mine\n");

    const repairs = await run();
    expect(at(repairs, MORPHEUS_BOOTSTRAP).outcome).toBe("blocked");
    expect(at(repairs, CLAUDE_SETTINGS).outcome).toBe("blocked");
    expect(at(repairs, CODEX_HOOKS).outcome).toBe("blocked");
    await expect(read(CLAUDE_SETTINGS)).rejects.toThrow();
  });

  it("refuses to clobber a file it cannot parse", async () => {
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(join(dir, CLAUDE_SETTINGS), '{ "permissions": { ,,, }');

    const repair = at(await run(), CLAUDE_SETTINGS);
    expect(repair.outcome).toBe("blocked");
    // Unparseable is not absent. Treating them alike is how a repair tool
    // destroys a settings file whose only fault was a trailing comma.
    expect(await read(CLAUDE_SETTINGS)).toBe('{ "permissions": { ,,, }');
  });

  it("refuses when hooks.SessionStart is not an array", async () => {
    await mkdir(join(dir, ".codex"), { recursive: true });
    await writeFile(join(dir, CODEX_HOOKS), JSON.stringify({ hooks: { SessionStart: "yes" } }));

    expect(at(await run(), CODEX_HOOKS).outcome).toBe("blocked");
    expect(await read(CODEX_HOOKS)).toBe('{"hooks":{"SessionStart":"yes"}}');
  });

  it("adds the poll guard to a project wired before it existed, keeping its own Bash hooks", async () => {
    // Every consumer was wired with SessionStart only; this is the repair path
    // that reaches them, and a project's own PreToolUse hook must survive it.
    const theirs = { matcher: "Bash", hooks: [{ type: "command", command: "./scripts/lint-bash.sh" }] };
    await mkdir(join(dir, ".claude"), { recursive: true });
    await writeFile(
      join(dir, CLAUDE_SETTINGS),
      JSON.stringify({
        hooks: {
          SessionStart: [{ hooks: [{ type: "command", command: "sh .morpheus/session-start.sh" }] }],
          PreToolUse: [theirs],
        },
      }),
    );

    const repair = at(await run(), CLAUDE_SETTINGS);
    expect(repair).toEqual({
      target: CLAUDE_SETTINGS,
      outcome: "updated",
      detail:
        "Added the read hook (PostToolUse, PostToolUseFailure) beside any hooks already there. " +
        "Added the CI poll guard (PreToolUse) beside any hooks already there.",
    });
    const doc = (await json(CLAUDE_SETTINGS)) as { hooks: { SessionStart: unknown[]; PreToolUse: unknown[] } };
    expect(doc.hooks.SessionStart).toHaveLength(1);
    expect(doc.hooks.PreToolUse).toEqual([
      theirs,
      { matcher: "Bash", hooks: [{ type: "command", command: POLL_GUARD_COMMAND, timeout: 10 }] },
    ]);
    expect(at(await run(), CLAUDE_SETTINGS).outcome).toBe("present");
  });

  it("refuses when hooks.PreToolUse is not an array", async () => {
    await mkdir(join(dir, ".codex"), { recursive: true });
    const original = JSON.stringify({ hooks: { PreToolUse: { Bash: "x" } } });
    await writeFile(join(dir, CODEX_HOOKS), original);

    const repair = at(await run(), CODEX_HOOKS);
    expect(repair.outcome).toBe("blocked");
    expect(repair.detail).toContain('"hooks.PreToolUse" is not an array');
    expect(await read(CODEX_HOOKS)).toBe(original);
  });

  it("does not wire the poll guard to a script it does not own, and still wires session start", async () => {
    await mkdir(join(dir, ".morpheus"), { recursive: true });
    await writeFile(join(dir, POLL_GUARD_SCRIPT), "#!/bin/sh\necho mine\n");

    const repairs = await run();
    expect(at(repairs, POLL_GUARD_SCRIPT).outcome).toBe("blocked");
    expect(at(repairs, CLAUDE_SETTINGS).outcome).toBe("created");
    const doc = (await json(CLAUDE_SETTINGS)) as { hooks: Record<string, unknown> };
    expect(Object.keys(doc.hooks)).toEqual(["SessionStart", "PostToolUse", "PostToolUseFailure"]);
    expect(await read(POLL_GUARD_SCRIPT)).toBe("#!/bin/sh\necho mine\n");
  });

  it("will not declare a handle whose inbox does not exist", async () => {
    // The one way this protocol locks a project out of itself: a declared
    // record that is absent is unresolvable, so every governed command is
    // refused permanently and no flag reaches it.
    const repair = at(await run("ghost"), MANIFEST);
    expect(repair.outcome).toBe("blocked");
    expect(repair.detail).toContain("hq/team/ghost.md");

    const manifest = await json(MANIFEST);
    expect(manifest["context"]).toBeUndefined();
    const { requiredInputs } = await projectPolicy(dir);
    expect(requiredInputs).not.toContain("hq/team/ghost.md");
  });

  it("leaves a handle that is already declared alone", async () => {
    await writeFile(
      join(dir, MANIFEST),
      JSON.stringify({ name: "Acme", context: { handle: "someone-else", trunk: "upstream/main" } }),
    );
    await writeFile(join(dir, "hq", "team", "someone-else.md"), "# Inbox\n");

    const repair = at(await run(), MANIFEST);
    expect(repair.outcome).toBe("present");
    const context = (await json(MANIFEST))["context"] as Record<string, unknown>;
    expect(context["handle"]).toBe("someone-else");
    expect(context["trunk"]).toBe("upstream/main");
  });

  it("blocks on a directory that is not a Morpheus project", async () => {
    await rm(join(dir, MANIFEST));
    const repair = at(await run(), MANIFEST);
    expect(repair.outcome).toBe("blocked");
    expect(repair.detail).toContain("morpheus init");
  });

  it("write: false reports what it would do and touches nothing", async () => {
    const repairs = await run(HANDLE, false);
    expect(repairs.map((r) => r.outcome)).toEqual([
      "created",
      "created",
      "created",
      "created",
      "created",
      "updated",
      "created",
    ]);

    await expect(read(POLL_GUARD_SCRIPT)).rejects.toThrow();
    await expect(read(MORPHEUS_BOOTSTRAP)).rejects.toThrow();
    await expect(read(MORPHEUS_SESSION_START)).rejects.toThrow();
    await expect(read(CLAUDE_SETTINGS)).rejects.toThrow();
    await expect(read(CODEX_HOOKS)).rejects.toThrow();
    expect((await json(MANIFEST))["context"]).toBeUndefined();
  });
});
