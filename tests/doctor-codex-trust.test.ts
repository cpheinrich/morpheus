import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  codexHookHash,
  codexTrustFindings,
  codexTrustReport,
  listCodexHooks,
  readCodexState,
  trustOf,
} from "../src/doctor/codex-trust.js";
import { doctor } from "../src/doctor/index.js";
import { READ_HOOK_COMMAND, SESSION_START_COMMAND, codexHooksFile } from "../src/session/install.js";
import { POLL_GUARD_COMMAND } from "../src/wait-ci/hook.js";

const exec = promisify(execFile);
const git = async (cwd: string, ...args: string[]) => (await exec("git", args, { cwd })).stdout.trim();

/**
 * Every hash below was computed by Codex itself, never by this module: the
 * first three are `trusted_hash` values Codex wrote into a real
 * ~/.codex/config.toml when the user ran /hooks, and the rest are
 * `currentHash` values from `codex app-server` `hooks/list` (Codex 0.165.0).
 * A test that compared this module with a re-derivation of its own formula
 * would pass whatever the formula was.
 */
describe("codexHookHash reproduces Codex's own hashes", () => {
  it.each([
    ["sh .morpheus/session-start.sh", "sha256:9ec0e9356ee79305bee0673d429aa8dec093a57be500b2b46a2ddcd02d75126b"],
    ["morpheus credentials status", "sha256:67e516c12a25c84219393ab1c69d6c2f678af1b6ca74688c6d8eff28ee358a1c"],
    ["morpheus context brief", "sha256:80cd036744085311fcfe2e1cc84e40a17b0fadc527e4d7bf29100d80b435e65e"],
  ])("SessionStart %s (a trusted_hash Codex wrote)", (command, expected) => {
    expect(codexHookHash("SessionStart", undefined, { type: "command", command }, "darwin")).toBe(expected);
  });

  it("matches the hashes Codex reports for the Morpheus templates", () => {
    // The session shim constant is the command above; the other two are what
    // `context install` writes, so a template edit shows up here as a re-trust.
    expect(SESSION_START_COMMAND).toBe("sh .morpheus/session-start.sh");
    expect(
      codexHookHash("PreToolUse", "Bash", { type: "command", command: POLL_GUARD_COMMAND, timeout: 10 }, "darwin"),
    ).toBe("sha256:fec5436c7c9e66e1e4248815b91a45337a3b4d0ad297bdb1809a2c50eaa89a0b");
    expect(codexHookHash("PostToolUse", undefined, { type: "command", command: READ_HOOK_COMMAND }, "darwin")).toBe(
      "sha256:471d21c04603f5ee272ab6ff5ad10ef5be75404c93cbc7b8a72e9ea0051de579",
    );
  });

  // One hooks.json exercising each normalization rule, keyed and hashed by Codex.
  const probe = {
    hooks: {
      SessionStart: [
        { hooks: [{ type: "command", command: "echo repo-level" }] },
        {
          matcher: "startup|resume",
          hooks: [
            { type: "command", command: "echo with-matcher", timeout: 600 },
            { type: "command", command: "echo async-status", async: true, statusMessage: "probing" },
          ],
        },
      ],
      SessionEnd: [
        {
          hooks: [
            { type: "command", command: "echo end-default" },
            { type: "command", command: "echo end-clamped", timeout: 30 },
          ],
        },
      ],
      Stop: [
        { matcher: "ignored", hooks: [{ type: "command", command: "echo stop-matcher", additionalContextLimit: 4096 }] },
      ],
      PostToolUse: [
        {
          hooks: [
            { type: "command", command: "echo limit-default", additionalContextLimit: 2500 },
            { type: "command", command: "echo limit-custom", additionalContextLimit: 4096 },
            { type: "command", command: "printf '%s\\n' \"quote\" \t tab", commandWindows: "echo windows" },
          ],
        },
      ],
      PreToolUse: [{ matcher: "Bash", hooks: [{ type: "command", command: "echo pre", timeout: 10 }] }],
    },
  };
  const fromCodex: Record<string, string> = {
    "pre_tool_use:0:0": "sha256:3ed95051269e5f2e887baf0beb7a8b83a6e5ddb68d6d6d9420d4528e04a65e50",
    "post_tool_use:0:0": "sha256:a7ff18cf2389218d104c18897156e1dc6f0395b3ac612d9034857eba56dc4eeb",
    "post_tool_use:0:1": "sha256:2bfda8f0d0938acb8e65d03b793538fd5ad4b6a5c6313834bb8cf62a4ed648d5",
    "post_tool_use:0:2": "sha256:31d8ddd5c9367711eeabb8f279eb19f17662fd3a46d3e731323e5d9d58d29ca8",
    "session_start:0:0": "sha256:5eeb85d4ed2c2967179ff54747320ea40642b6512f82fb7f8bf253d6a2b7b47c",
    "session_start:1:0": "sha256:51e8e54a2b7a0e8b7c8a71e5cf7f7353860e85ea30d9fe729be230782311d8af",
    "session_start:1:1": "sha256:f2e007002876751444ad71e795f3df7b1d3045580d0eb351169c8132920e7a66",
    "session_end:0:0": "sha256:aeb0217f163da20022a85ee229c615dd10ae2a33b7ff9a8d9e3c3e1087340712",
    "session_end:0:1": "sha256:5cb97896662e689886a7c1cdf7f6fd2053a63158c1e2b4082da65f9ff16f58ec",
    "stop:0:0": "sha256:00c062338f5aea05044f162d178942d4506a0ed638fc735e22bd480579b6d432",
  };

  it("keys and hashes every handler exactly as Codex listed them", () => {
    const { hooks, problem } = listCodexHooks(probe, "/repo/.codex/hooks.json", "darwin");
    expect(problem).toBeUndefined();
    const ours = Object.fromEntries(hooks.map((h) => [h.key.replace("/repo/.codex/hooks.json:", ""), h.hash]));
    expect(ours).toEqual(fromCodex);
    expect(hooks.map((h) => h.key)).toContain("/repo/.codex/hooks.json:session_start:1:1");
  });

  it("applies each normalization at its boundary", () => {
    const hash = (event: string, matcher: unknown, handler: Record<string, unknown>) =>
      codexHookHash(event, matcher, { type: "command", command: "x", ...handler }, "darwin");
    // An explicit default hashes as unset; one past it does not.
    expect(hash("PostToolUse", undefined, { timeout: 600 })).toBe(hash("PostToolUse", undefined, {}));
    expect(hash("PostToolUse", undefined, { timeout: 599 })).not.toBe(hash("PostToolUse", undefined, {}));
    expect(hash("PostToolUse", undefined, { additionalContextLimit: 2500 })).toBe(hash("PostToolUse", undefined, {}));
    expect(hash("PostToolUse", undefined, { additionalContextLimit: 2501 })).not.toBe(hash("PostToolUse", undefined, {}));
    // SessionEnd defaults to 1 s and clamps to [1, 3].
    expect(hash("SessionEnd", undefined, { timeout: 1 })).toBe(hash("SessionEnd", undefined, {}));
    expect(hash("SessionEnd", undefined, { timeout: 0 })).toBe(hash("SessionEnd", undefined, {}));
    expect(hash("SessionEnd", undefined, { timeout: 3 })).toBe(hash("SessionEnd", undefined, { timeout: 4 }));
    expect(hash("SessionEnd", undefined, { timeout: 2 })).not.toBe(hash("SessionEnd", undefined, { timeout: 3 }));
    // Zero is raised to one second everywhere else.
    expect(hash("PreToolUse", undefined, { timeout: 0 })).toBe(hash("PreToolUse", undefined, { timeout: 1 }));
    // Stop and UserPromptSubmit ignore the matcher; PreToolUse does not.
    expect(hash("Stop", "x", {})).toBe(hash("Stop", undefined, {}));
    expect(hash("UserPromptSubmit", "x", {})).toBe(hash("UserPromptSubmit", undefined, {}));
    expect(hash("PreToolUse", "Bash", {})).not.toBe(hash("PreToolUse", undefined, {}));
    // Windows hashes the Windows command.
    expect(codexHookHash("Stop", undefined, { type: "command", command: "a", commandWindows: "b" }, "win32")).toBe(
      codexHookHash("Stop", undefined, { type: "command", command: "b" }, "darwin"),
    );
  });

  it("declines to guess what it does not reproduce", () => {
    expect(codexHookHash("PreModelRequest", undefined, { type: "command", command: "x" })).toBeNull();
    expect(codexHookHash("Stop", undefined, { type: "mcp_tool", server: "s", tool: "t" })).toBeNull();
    expect(codexHookHash("Stop", undefined, { type: "command", command: "   " })).toBeNull();
    expect(codexHookHash("Stop", undefined, { type: "command", command: "x", timeout: "5" })).toBeNull();
  });
});

describe("readCodexState", () => {
  let home: string;
  beforeEach(async () => {
    home = await mkdtemp(join(tmpdir(), "codex-home-"));
  });
  afterEach(async () => rm(home, { recursive: true, force: true }));

  it("reads hooks.state and project trust", async () => {
    await writeFile(
      join(home, "config.toml"),
      [
        '[projects."/repo"]',
        'trust_level = "trusted"',
        "",
        "[hooks.state]",
        "",
        '[hooks.state."/repo/.codex/hooks.json:session_start:0:0"]',
        'trusted_hash = "sha256:aa"',
        "enabled = false",
        "",
      ].join("\n"),
    );
    const state = await readCodexState(home);
    expect(state.kind).toBe("ok");
    if (state.kind !== "ok") return;
    expect(state.projects.get("/repo")).toBe("trusted");
    expect(state.hookState.get("/repo/.codex/hooks.json:session_start:0:0")).toEqual({
      trustedHash: "sha256:aa",
      enabled: false,
    });
  });

  it("keeps an unparseable file apart from an empty one", async () => {
    await writeFile(join(home, "config.toml"), "[hooks.state\n");
    expect((await readCodexState(home)).kind).toBe("unusable");
    await rm(join(home, "config.toml"));
    // A Codex home with no config.toml has trusted nothing; no home at all is no Codex.
    expect(await readCodexState(home)).toMatchObject({ kind: "ok", hookState: new Map() });
    expect(await readCodexState(join(home, "missing"))).toEqual({ kind: "absent" });
  });
});

describe("trustOf", () => {
  const hook = { event: "Stop", group: 0, handler: 0, key: "k", hash: "sha256:new", command: "x" };
  it.each([
    [new Map([["k", { trustedHash: "sha256:new" }]]), "trusted"],
    [new Map([["k", { trustedHash: "sha256:old" }]]), "modified"],
    [new Map(), "untrusted"],
    [new Map([["k", { enabled: true }]]), "untrusted"],
    [new Map([["k", { trustedHash: "sha256:new", enabled: false }]]), "disabled"],
  ] as const)("%o is %s", (state, expected) => {
    expect(trustOf(hook, state as never)).toBe(expected);
  });
  it("never calls an unreproduced hook untrusted", () => {
    expect(trustOf({ ...hook, hash: null }, new Map())).toBe("unverified");
  });
});

describe("codexTrustReport and its findings", () => {
  let base: string;
  let main: string;
  let home: string;
  const hooksPath = () => join(main, ".codex", "hooks.json");
  const trust = (entries: string[], projects: Record<string, string> = { [main]: "trusted" }) =>
    writeFile(
      join(home, "config.toml"),
      [
        ...Object.entries(projects).map(([p, level]) => `[projects."${p}"]\ntrust_level = "${level}"\n`),
        ...entries,
      ].join("\n"),
    );
  const entry = (key: string, hash: string) => `[hooks.state."${key}"]\ntrusted_hash = "${hash}"\n`;

  beforeEach(async () => {
    base = await realpath(await mkdtemp(join(tmpdir(), "codex-trust-")));
    main = join(base, "main");
    home = join(base, "codex-home");
    await mkdir(join(main, ".codex"), { recursive: true });
    await mkdir(home);
    await writeFile(hooksPath(), codexHooksFile());
    await git(main, "init", "-q", "-b", "main");
    await git(main, "-c", "user.email=t@example.com", "-c", "user.name=t", "add", ".");
    await git(main, "-c", "user.email=t@example.com", "-c", "user.name=t", "commit", "-qm", "hooks");
  });
  afterEach(async () => rm(base, { recursive: true, force: true }));

  it("names each untrusted or stale hook and where to trust it", async () => {
    const session = `${hooksPath()}:session_start:0:0`;
    await trust([entry(session, "sha256:stale")]);
    const report = await codexTrustReport(main, home);
    expect(report.kind).toBe("checked");
    expect(report.hooks!.map((h) => [h.event, h.trust])).toEqual([
      ["SessionStart", "modified"],
      ["PostToolUse", "untrusted"],
      ["PreToolUse", "untrusted"],
    ]);
    const [finding, ...rest] = codexTrustFindings(report);
    expect(rest).toEqual([]);
    expect(finding!.message).toBe(
      `Codex will not run 3 of 3 hooks in ${hooksPath()}. Open Codex in ${main} and run /hooks; trust: ` +
        "SessionStart session shim (.morpheus/session-start.sh) (changed since it was trusted); " +
        "PostToolUse read hook (context record-read); PreToolUse CI poll guard.",
    );
  });

  it("is silent once every hook is trusted at its current content", async () => {
    const { hooks } = listCodexHooks(JSON.parse(codexHooksFile()), hooksPath());
    await trust(hooks.map((h) => entry(h.key, h.hash!)));
    expect(codexTrustFindings(await codexTrustReport(main, home))).toEqual([]);
    // The doctor check is wired to the same report.
    const findings = await doctor({ root: main, offline: true, codexHome: home });
    expect(findings.filter((f) => f.check === "codex-trust")).toEqual([]);
  });

  it("reads a linked worktree's hooks from the main checkout, and says when they differ", async () => {
    const { hooks } = listCodexHooks(JSON.parse(codexHooksFile()), hooksPath());
    await trust(hooks.map((h) => entry(h.key, h.hash!)));
    const worktree = join(base, "task");
    await git(main, "worktree", "add", "-q", "--detach", worktree);

    const same = await codexTrustReport(worktree, home);
    expect(same.location).toEqual({ checkout: worktree, main, linkedWorktree: true });
    expect(same.hooksPath).toBe(hooksPath());
    expect(same.worktreeDiffers).toBe(false);
    expect(codexTrustFindings(same)).toEqual([]);

    // A branch that changes its hooks: Codex still runs, and trusts, main's.
    await writeFile(join(worktree, ".codex", "hooks.json"), codexHooksFile(false));
    const differs = codexTrustFindings(await codexTrustReport(worktree, home));
    expect(differs).toHaveLength(1);
    expect(differs[0]!.message).toContain(`differs from the main checkout's ${hooksPath()}`);
  });

  it("points a linked worktree's trust at the main checkout", async () => {
    await trust([]);
    const worktree = join(base, "task");
    await git(main, "worktree", "add", "-q", "--detach", worktree);
    const [finding] = codexTrustFindings(await codexTrustReport(worktree, home));
    expect(finding!.message).toContain(`Open Codex in ${main} and run /hooks`);
    expect(finding!.message).toContain("This is a linked worktree");
    expect(finding!.message).not.toContain(worktree);
  });

  it("reports an untrusted project, whose hooks Codex never loads", async () => {
    const { hooks } = listCodexHooks(JSON.parse(codexHooksFile()), hooksPath());
    await trust(hooks.map((h) => entry(h.key, h.hash!)), {});
    const findings = codexTrustFindings(await codexTrustReport(main, home));
    expect(findings.map((f) => f.message)).toEqual([
      `Codex does not trust ${main} as a project, so it loads none of ${hooksPath()}. Open Codex in ${main} ` +
        "and accept the trust prompt, then run /hooks.",
    ]);
    // The checkout's own entry decides before the main checkout's, as in Codex.
    const worktree = join(base, "task");
    await git(main, "worktree", "add", "-q", "--detach", worktree);
    await trust(hooks.map((h) => entry(h.key, h.hash!)), { [worktree]: "untrusted", [main]: "trusted" });
    expect((await codexTrustReport(worktree, home)).projectTrusted).toBe(false);
  });

  it("says trust is unknown rather than untrusted when config.toml cannot be read", async () => {
    await writeFile(join(home, "config.toml"), "[hooks.state\n");
    const findings = codexTrustFindings(await codexTrustReport(main, home));
    expect(findings).toHaveLength(1);
    expect(findings[0]!.message).toMatch(/^Codex hook trust is unknown: could not read .*config\.toml — it is not valid TOML/);
  });

  it("says nothing on a machine without Codex, or for a checkout without .codex/", async () => {
    expect(codexTrustFindings(await codexTrustReport(main, join(base, "no-codex")))).toEqual([]);
    await rm(join(main, ".codex"), { recursive: true });
    expect((await codexTrustReport(main, home)).kind).toBe("no-hooks");
  });

  it("reports a disabled hook separately from an untrusted one", async () => {
    const { hooks } = listCodexHooks(JSON.parse(codexHooksFile()), hooksPath());
    await trust([
      ...hooks.slice(0, 2).map((h) => entry(h.key, h.hash!)),
      `[hooks.state."${hooks[2]!.key}"]\ntrusted_hash = "${hooks[2]!.hash}"\nenabled = false\n`,
    ]);
    const findings = codexTrustFindings(await codexTrustReport(main, home));
    expect(findings.map((f) => f.message)).toEqual([
      `Codex has 1 hook in ${hooksPath()} switched off in /hooks: PreToolUse CI poll guard. ` +
        "Re-enable it in /hooks if that was not deliberate.",
    ]);
  });
});
