import { spawnSync } from "node:child_process";
import { chmod, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { guardDeps, guardRoot, pollGuardCommand } from "../../src/cli/wait-ci.js";
import { POLL_GUARD_COMMAND, POLL_GUARD_SCRIPT, pollGuardScript } from "../../src/wait-ci/hook.js";
import {
  decide,
  type GuardDeps,
  type GuardState,
  parseState,
  POLL_LIMIT,
  pollTargets,
  refusal,
  runPollGuard,
  shellWord,
  simpleCommands,
  statePath,
} from "../../src/wait-ci/poll-guard.js";

const payload = (command: string, session = "s-1", extra: Record<string, unknown> = {}) =>
  JSON.stringify({ session_id: session, cwd: "/repo", hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, ...extra });

describe("simpleCommands", () => {
  it("splits on shell separators and strips quotes", () => {
    expect(simpleCommands(`sleep 60 && gh run view 1 --jq '.jobs[] | .name'; echo "a b"`)).toEqual([
      ["sleep", "60"],
      ["gh", "run", "view", "1", "--jq", ".jobs[] | .name"],
      ["echo", "a b"],
    ]);
    expect(simpleCommands("s=$(gh pr checks 5) # trailing comment")).toEqual([["s="], ["gh", "pr", "checks", "5"]]);
  });
});

describe("pollTargets", () => {
  const one = (command: string) => {
    const found = pollTargets(command, "/repo");
    expect(found).toHaveLength(1);
    return found[0]!;
  };

  it.each([
    ["gh run view 40769869103 --json status,conclusion,jobs", "morpheus wait-ci --run 40769869103"],
    ["gh run view 123 --repo acme/app --json status", "morpheus wait-ci --run 123 --repo acme/app"],
    ["gh run view -R acme/app 123", "morpheus wait-ci --run 123 --repo acme/app"],
    ["gh run view --repo=acme/app 123 --exit-status", "morpheus wait-ci --run 123 --repo acme/app"],
    ["gh run view https://github.com/acme/app/actions/runs/123", "morpheus wait-ci --run 123 --repo acme/app"],
    ["gh run watch 456 --exit-status", "morpheus wait-ci --run 456"],
    ["timeout 600 gh run watch 456", "morpheus wait-ci --run 456"],
    ["gh pr checks 42", "morpheus wait-ci 42"],
    ["gh pr checks 42 --watch --repo cpheinrich/morpheus", "morpheus wait-ci 42 --repo cpheinrich/morpheus"],
    ["gh pr checks https://github.com/acme/web/pull/9", "morpheus wait-ci 9 --repo acme/web"],
    ['gh pr checks "#9"', "morpheus wait-ci 9"],
    ["gh pr checks my-branch 2>/dev/null", "morpheus wait-ci my-branch"],
    ["gh pr checks 2>&1 | tail -5", "morpheus wait-ci"],
    ["gh pr checks", "morpheus wait-ci"],
    ["sleep 90 && gh run view 1 --json status -q .status", "morpheus wait-ci --run 1"],
    ["s=$(gh run view 1 --json status --jq .status)", "morpheus wait-ci --run 1"],
    ["while true; do gh pr checks 5; sleep 30; done", "morpheus wait-ci 5"],
    ["GH_PAGER= /opt/homebrew/bin/gh run view 1 --json jobs", "morpheus wait-ci --run 1"],
    ["gh pr checks 'feature/it'\"'\"'s'", "morpheus wait-ci 'feature/it'\\''s'"],
  ])("%s → %s", (command, wait) => {
    expect(one(command).waitCommand).toBe(wait);
  });

  it("keys a target by what is watched, not by how", () => {
    expect(one("gh run view 7 --json status").key).toBe(one("gh run watch 7").key);
    expect(one("gh run view 7 -R o/r").key).not.toBe(one("gh run view 7").key);
    expect(one("gh pr checks https://github.com/o/r/pull/9").key).toBe(one("gh pr checks 9 --repo o/r").key);
    // The current branch differs by checkout; so does the target.
    expect(pollTargets("gh pr checks", "/a")[0]!.key).not.toBe(pollTargets("gh pr checks", "/b")[0]!.key);
  });

  it.each([
    "gh run view 123 --log-failed",
    "gh run view 123 --log",
    "gh run view --job 99 --log-failed",
    "gh run view --job 99",
    "gh run view",
    "gh run view 123 --web",
    "gh pr checks 5 --web",
    "gh run view --help",
    "gh run list --branch main",
    "gh pr view 5 --json state",
    'echo "gh run view 1"',
    "git log --oneline | grep 'gh pr checks'",
    "morpheus wait-ci --run 1",
  ])("does not count %s", (command) => {
    expect(pollTargets(command, "/repo")).toEqual([]);
  });

  it("counts each poll in one line", () => {
    expect(pollTargets("gh run view 1 --json status; sleep 30; gh run view 1 --json status", "/repo").map((t) => t.key)).toEqual(["run||1", "run||1"]);
  });

  it("quotes only what the shell would split", () => {
    expect(shellWord("cpheinrich/morpheus")).toBe("cpheinrich/morpheus");
    expect(shellWord("a b")).toBe("'a b'");
    expect(shellWord("$RUN")).toBe("'$RUN'");
  });
});

describe("decide — the third poll is the boundary", () => {
  const empty = (): GuardState => ({ version: 1, sessionId: "s", counts: {} });
  const [view1] = pollTargets("gh run view 1 --json status", "/r");
  const [view2] = pollTargets("gh run view 2 --json status", "/r");

  it("allows the first and second poll of a target, refuses the third, and keeps refusing", () => {
    expect(POLL_LIMIT).toBe(3);
    const first = decide(empty(), [view1!]);
    expect(first).toEqual({ allow: true, state: { version: 1, sessionId: "s", counts: { "run||1": 1 } } });
    const second = decide((first as { state: GuardState }).state, [view1!]);
    expect(second).toEqual({ allow: true, state: { version: 1, sessionId: "s", counts: { "run||1": 2 } } });
    const third = decide((second as { state: GuardState }).state, [view1!]);
    expect(third).toEqual({ allow: false, target: view1, count: 3 });
    // A refused call never ran, so it is not recorded: the next is refused alike.
    expect(decide((second as { state: GuardState }).state, [view1!])).toEqual(third);
  });

  it("counts targets independently", () => {
    const state: GuardState = { version: 1, sessionId: "s", counts: { "run||1": 2 } };
    expect(decide(state, [view2!])).toEqual({ allow: true, state: { version: 1, sessionId: "s", counts: { "run||1": 2, "run||2": 1 } } });
  });

  it("refuses a single line that polls one target to the limit", () => {
    const state: GuardState = { version: 1, sessionId: "s", counts: { "run||1": 1 } };
    expect(decide(state, [view1!, view1!])).toMatchObject({ allow: false, count: 3 });
  });

  it("phrases the refusal with the exact command and ordinal", () => {
    const text = refusal(view1!, 3);
    expect(text.split("\n")[0]).toBe("Morpheus poll guard: refused the 3rd `gh run view 1` in this session.");
    expect(text).toContain("\n  morpheus wait-ci --run 1\n");
    expect(refusal(view1!, 11).split("\n")[0]).toContain("the 11th");
    expect(refusal(view1!, 22).split("\n")[0]).toContain("the 22nd");
  });
});

describe("runPollGuard", () => {
  function memory(root: string | null = "/repo") {
    const files = new Map<string, string>();
    const deps: GuardDeps = {
      root: async () => root,
      read: async (path) => files.get(path) ?? null,
      write: async (path, data) => {
        files.set(path, data);
      },
    };
    return { deps, files };
  }

  it("refuses the third poll in one session and not in another", async () => {
    const { deps } = memory();
    const cmd = "gh run view 40769869103 --json status,conclusion,jobs";
    expect(await runPollGuard(payload(cmd), deps)).toEqual({ exitCode: 0 });
    expect(await runPollGuard(payload(cmd), deps)).toEqual({ exitCode: 0 });
    const third = await runPollGuard(payload(cmd), deps);
    expect(third.exitCode).toBe(2);
    expect(third.message).toContain("morpheus wait-ci --run 40769869103");
    expect((await runPollGuard(payload(cmd, "s-2"), deps)).exitCode).toBe(0);
  });

  it("stores state under local/sessions, one file per session", async () => {
    const { deps, files } = memory();
    await runPollGuard(payload("gh pr checks 5"), deps);
    expect([...files.keys()]).toEqual(["/repo/local/sessions/poll-guard-s-1.json"]);
    expect(JSON.parse(files.get("/repo/local/sessions/poll-guard-s-1.json")!)).toEqual({ version: 1, sessionId: "s-1", counts: { "pr||5": 1 } });
    expect(statePath("/repo", "../../etc/x")).toMatch(/^\/repo\/local\/sessions\/poll-guard-[0-9a-f]{32}\.json$/);
  });

  it.each([
    ["not JSON", "{"],
    ["another tool", payload("gh run view 1", "s-1", { tool_name: "Read" })],
    ["no session id", JSON.stringify({ tool_name: "Bash", tool_input: { command: "gh run view 1" } })],
    ["no command", JSON.stringify({ session_id: "s", tool_name: "Bash", tool_input: {} })],
  ])("allows a payload it cannot use: %s", async (_label, input) => {
    const { deps, files } = memory();
    expect(await runPollGuard(input, deps)).toEqual({ exitCode: 0 });
    expect(files.size).toBe(0);
  });

  it("allows when there is no repository or the state cannot be written", async () => {
    expect(await runPollGuard(payload("gh run view 1"), memory(null).deps)).toEqual({ exitCode: 0 });
    const broken: GuardDeps = { root: async () => "/repo", read: async () => null, write: async () => Promise.reject(new Error("EROFS")) };
    for (let i = 0; i < 4; i++) expect(await runPollGuard(payload("gh run view 1"), broken)).toEqual({ exitCode: 0 });
  });

  it("starts over from a state file it cannot trust", () => {
    expect(parseState("not json", "s")).toEqual({ version: 1, sessionId: "s", counts: {} });
    expect(parseState(JSON.stringify({ version: 1, sessionId: "other", counts: { k: 5 } }), "s").counts).toEqual({});
    expect(parseState(JSON.stringify({ version: 1, sessionId: "s", counts: { k: 2, bad: "x", neg: -1 } }), "s").counts).toEqual({ k: 2 });
  });
});

describe("against real git, sh and the filesystem", () => {
  let dir: string;
  const git = (cwd: string, ...args: string[]) => {
    const r = spawnSync("git", args, { cwd, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr);
    return r.stdout.trim();
  };

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), "poll-guard-")));
    await mkdir(join(dir, "repo"));
    git(join(dir, "repo"), "init", "-q", "-b", "main");
    git(join(dir, "repo"), "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "init");
    git(join(dir, "repo"), "worktree", "add", "-q", "--detach", join(dir, "task"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps state in the primary checkout, never in the task worktree pm cleanup must remove", async () => {
    expect(await guardRoot(join(dir, "task"))).toBe(join(dir, "repo"));
    expect(await guardRoot(join(dir, "repo"))).toBe(join(dir, "repo"));
    expect(await guardRoot(dir)).toBeNull();
  });

  it("refuses the third poll through the CLI entry point with real files", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const input = payload("gh run view 9 --json status", "real-session", { cwd: join(dir, "task") });
    expect(await pollGuardCommand(async () => input, guardDeps)).toBe(0);
    expect(await pollGuardCommand(async () => input, guardDeps)).toBe(0);
    expect(await pollGuardCommand(async () => input, guardDeps)).toBe(2);
    expect(String(errors.mock.calls.at(-1)?.[0])).toContain("morpheus wait-ci --run 9");
    errors.mockRestore();
    const state = JSON.parse(await readFile(join(dir, "repo", "local", "sessions", "poll-guard-real-session.json"), "utf8")) as GuardState;
    expect(state.counts).toEqual({ "run||9": 2 });
    expect(spawnSync("ls", [join(dir, "task", "local")]).status).not.toBe(0);
  });

  /** A fake `morpheus` that records its stdin and answers with the scripted exit. */
  async function fakeMorpheus(exit: number, stderr = "") {
    const bin = join(dir, "bin");
    await mkdir(bin, { recursive: true });
    await writeFile(join(bin, "morpheus"), `#!/bin/sh\ncat > "${dir}/stdin.txt"\nprintf '%s' '${stderr}' >&2\nexit ${exit}\n`);
    await chmod(join(bin, "morpheus"), 0o755);
    // This suite may itself run under Claude Code, which exports the project directory.
    return { ...process.env, PATH: `${bin}:/usr/bin:/bin`, MORPHEUS_POLL_GUARD: "", CLAUDE_PROJECT_DIR: "" };
  }
  const shim = async () => {
    await mkdir(join(dir, "repo", ".morpheus"), { recursive: true });
    await writeFile(join(dir, "repo", POLL_GUARD_SCRIPT), pollGuardScript());
  };
  const runShim = (input: string, env: NodeJS.ProcessEnv) =>
    spawnSync("sh", [join(dir, "repo", POLL_GUARD_SCRIPT)], { input, env, encoding: "utf8" });

  it("turns only the CLI's exit 2 into a refusal, passing the payload through", async () => {
    await shim();
    const input = payload("gh run view 9 --json status");
    const refused = runShim(input, await fakeMorpheus(2, "use wait-ci"));
    expect([refused.status, refused.stderr]).toEqual([2, "use wait-ci\n"]);
    expect(await readFile(join(dir, "stdin.txt"), "utf8")).toBe(`${input}\n`);

    // An older CLI without the command, or any other failure, never blocks.
    const old = runShim(input, await fakeMorpheus(1, 'Unknown command "poll-guard".'));
    expect([old.status, old.stderr]).toEqual([0, ""]);
  });

  it("does not start the CLI for a command that is not a CI poll, or when disabled", async () => {
    await shim();
    const env = await fakeMorpheus(2, "should not run");
    const plain = runShim(payload("pnpm test"), env);
    expect([plain.status, plain.stderr]).toEqual([0, ""]);
    const off = runShim(payload("gh run view 9"), { ...env, MORPHEUS_POLL_GUARD: "off" });
    expect([off.status, off.stderr]).toEqual([0, ""]);
    await expect(readFile(join(dir, "stdin.txt"), "utf8")).rejects.toThrow();
  });

  it("finds the shim from a subdirectory or the project directory, and is silent anywhere else", async () => {
    await shim();
    const env = await fakeMorpheus(2, "refused");
    const input = payload("gh pr checks 5");
    const hook = (cwd: string, extra: NodeJS.ProcessEnv = {}) =>
      spawnSync("sh", ["-c", POLL_GUARD_COMMAND], { cwd, input, env: { ...env, ...extra }, encoding: "utf8" });

    await mkdir(join(dir, "repo", "src", "deep"), { recursive: true });
    expect(hook(join(dir, "repo", "src", "deep")).status).toBe(2);
    expect(hook(dir, { CLAUDE_PROJECT_DIR: join(dir, "repo") }).status).toBe(2);
    // Outside any Morpheus project: no file, no error, no refusal.
    const elsewhere = hook(dir);
    expect([elsewhere.status, elsewhere.stderr]).toEqual([0, ""]);
  });
});
