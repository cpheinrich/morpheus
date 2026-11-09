import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveCodexHooks } from "../src/cli/codex-hooks.js";
import { runCodexHookEnrollment } from "../src/cli/codex-hooks-auto.js";

let fixture: string;
let repo: string;
let home: string;
let binary: string;
let source: string;
const hash = "sha256:5bcf5439a4b245c57c9e7f3910368077fa8b85b8231cd151f801f58f1414d57e";

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function hook(index: number, overrides: Record<string, unknown> = {}) {
  return {
    source: "project", sourcePath: source, key: `${source}:session_start:0:${index}`,
    enabled: true, isManaged: false, trustStatus: "modified", currentHash: hash, ...overrides,
  };
}

function backend(hooks: ReturnType<typeof hook>[], options: { error?: boolean; corrupt?: boolean; conflict?: boolean; hold?: boolean } = {}) {
  writeFileSync(join(fixture, "fixture.json"), JSON.stringify({ repo, home, hooks, ...options }));
}

function requests() {
  return readFileSync(join(fixture, "requests.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
}

beforeEach(() => {
  fixture = realpathSync(mkdtempSync(join(tmpdir(), "morpheus-codex-hooks-")));
  repo = join(fixture, "project");
  home = join(fixture, "codex");
  mkdirSync(join(repo, ".codex"), { recursive: true });
  mkdirSync(home);
  writeFileSync(join(home, "config.toml"), 'model = "original"\n', { mode: 0o640 });
  git(repo, "init");
  source = join(repo, ".codex/hooks.json");
  writeFileSync(source, JSON.stringify({ hooks: { SessionStart: [{ hooks: Array.from(
    { length: 9 }, () => ({ type: "command", command: "/usr/bin/true" }),
  ) }] } }));
  writeFileSync(join(repo, "morpheus.json"), JSON.stringify({ name: "fixture", morpheusVersion: "0.1.0" }));
  git(repo, "add", ".");
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "base");
  vi.stubEnv("CODEX_HOME", home);
  binary = join(fixture, "codex-stub");
  writeFileSync(binary, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");
const fixture = require("./fixture.json");
const live = path.join(fixture.home, "config.toml");
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (!request.id) return;
  fs.appendFileSync(path.join(__dirname, "requests.jsonl"), line + "\\n");
  const { id, method, params } = request;
  let result;
  if (method === "initialize") result = { codexHome: process.env.CODEX_HOME };
  if (method === "hooks/list") result = { data: [{
    cwd: fixture.repo, errors: fixture.error ? ["broken hook file"] : [],
    hooks: fixture.hooks.map(hook => ({
      ...hook, trustStatus: fs.readFileSync(live, "utf8").includes(JSON.stringify(hook.key)) ? "trusted" : hook.trustStatus,
    })),
  }] };
  if (method === "config/batchWrite") {
    if (fixture.conflict) fs.writeFileSync(live, 'model = "external"\\n');
    for (const [key, approval] of Object.entries(params.edits[0].value)) {
      fs.appendFileSync(params.filePath, '[hooks.state.' + JSON.stringify(key) + ']\\ntrusted_hash = ' + JSON.stringify(approval.trusted_hash) + '\\n');
    }
    if (fixture.corrupt) fs.appendFileSync(params.filePath, '[broken');
    if (fixture.hold) {
      const timer = setInterval(() => {
        if (!fs.existsSync(path.join(__dirname, "release"))) return;
        clearInterval(timer);
        console.log(JSON.stringify({ id, result: { status: "ok" } }));
      }, 10);
      return;
    }
    result = { status: "ok" };
  }
  console.log(JSON.stringify({ id, result }));
});
`, { mode: 0o755 });
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(fixture, { recursive: true, force: true });
});

describe("Codex project hook approval", () => {
  it("writes only pending enabled hooks owned by the main checkout", async () => {
    const linked = join(fixture, "linked");
    git(repo, "worktree", "add", "--detach", linked);
    const eligible = hook(0);
    const newHook = hook(1, { trustStatus: "untrusted" });
    backend([
      eligible, newHook, hook(2, { enabled: false }), hook(3, { trustStatus: "trusted" }),
      hook(4, { source: "plugin" }), hook(5, { source: "user" }), hook(6, { isManaged: true }),
      hook(7, { sourcePath: join(fixture, "other/.codex/hooks.json") }),
      hook(8, { sourcePath: join(repo, "node_modules/package/.codex/hooks.json") }),
    ]);

    await expect(approveCodexHooks(linked, binary)).resolves.toBe(2);
    const log = requests();
    expect(log.filter(r => r.method === "hooks/list").map(r => r.params.cwds)).toEqual([[repo], [repo]]);
    const writes = log.filter(r => r.method === "config/batchWrite").map(r => r.params);
    expect(writes).toEqual([{
      filePath: expect.stringMatching(/\.morpheus-hook-approval-.*[\\/]config\.toml$/),
      edits: [{ keyPath: "hooks.state", mergeStrategy: "upsert", value: {
        [eligible.key]: { trusted_hash: hash }, [newHook.key]: { trusted_hash: hash },
      } }],
    }]);
  });

  it("leaves the user config alone when no project hooks need approval", async () => {
    backend([hook(0, { trustStatus: "trusted" }), hook(1, { enabled: false })]);
    await expect(approveCodexHooks(repo, binary)).resolves.toBe(0);
    expect(requests().map(r => r.method)).toEqual(["initialize", "hooks/list"]);
  });

  it("fails without writing when Codex could not list the project cleanly", async () => {
    backend([hook(0)], { error: true });
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("could not reliably list hooks");
    expect(requests().map(r => r.method)).toEqual(["initialize", "hooks/list"]);
  });

  it("refuses an unrelated Git checkout before asking Codex to list hooks", async () => {
    const unrelated = join(fixture, "unrelated");
    mkdirSync(unrelated);
    git(unrelated, "init");
    await expect(approveCodexHooks(unrelated, binary)).rejects.toThrow("in a Morpheus project");
  });

  it("refuses a project hook config that was changed locally", async () => {
    backend([hook(0)]);
    writeFileSync(source, '{"hooks":{}}');
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("match the committed project file");
    expect(requests().map(r => r.method)).toEqual(["initialize", "hooks/list"]);
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe('model = "original"\n');
  });

  it("refuses a reported hash that differs from the committed handler", async () => {
    backend([hook(0, { currentHash: "sha256:" + "a".repeat(64) })]);
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("verify a Codex hook hash against committed");
    expect(requests().map(r => r.method)).toEqual(["initialize", "hooks/list"]);
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe('model = "original"\n');
  });

  it("preserves an external edit made during staging", async () => {
    backend([hook(0)], { conflict: true });
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("config changed during approval");
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe('model = "external"\n');
  });

  it("leaves live config untouched if Codex produces invalid TOML", async () => {
    backend([hook(0)], { corrupt: true });
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("invalid or unexpected config edit");
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe('model = "original"\n');
  });

  it("refuses a simultaneous approval against the same user config", async () => {
    backend([hook(0)], { hold: true });
    const first = approveCodexHooks(repo, binary);
    try {
      await vi.waitFor(() => expect(requests().some(r => r.method === "config/batchWrite")).toBe(true));
      await expect(approveCodexHooks(repo, binary)).rejects.toThrow("Another Morpheus hook approval");
    } finally {
      writeFileSync(join(fixture, "release"), "");
      await expect(first).resolves.toBe(1);
    }
    expect(requests().filter(r => r.method === "config/batchWrite")).toHaveLength(1);
    await expect(approveCodexHooks(repo, binary)).resolves.toBe(0);
  });
});

describe("automatic Codex project hook approval", () => {
  it("checks future committed hooks only until the project is disabled", async () => {
    const setAgent = vi.fn().mockResolvedValue(undefined);
    const options = { cwd: repo, binary, setAgent };
    const config = join(home, "config.toml");
    backend([hook(0)]);
    await expect(runCodexHookEnrollment("scan", options)).resolves.toBe(0);
    expect(readFileSync(config, "utf8")).toBe('model = "original"\n');

    await expect(runCodexHookEnrollment("enable", options)).resolves.toBe(0);
    expect(readFileSync(config, "utf8")).toContain(JSON.stringify(hook(0).key));

    const definitions = JSON.parse(readFileSync(source, "utf8"));
    definitions.hooks.SessionStart[0].hooks.push({ type: "command", command: "/usr/bin/true" });
    writeFileSync(source, JSON.stringify(definitions));
    git(repo, "add", ".");
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "-m", "new hook");
    backend([hook(0), hook(9), hook(10, { source: "plugin" })]);
    await expect(runCodexHookEnrollment("scan", { ...options, cwd: fixture })).resolves.toBe(0);
    const approved = readFileSync(config, "utf8");
    expect(approved).toContain(JSON.stringify(hook(9).key));
    expect(approved).not.toContain(JSON.stringify(hook(10).key));

    await expect(runCodexHookEnrollment("disable", options)).resolves.toBe(0);
    backend([hook(1)]);
    await expect(runCodexHookEnrollment("scan", options)).resolves.toBe(0);
    expect(readFileSync(config, "utf8")).toBe(approved);
    expect(setAgent.mock.calls).toEqual([[home, true], [home, false]]);
  });

  it("does not carry approval to a different checkout at the same path", async () => {
    const options = { cwd: repo, binary, setAgent: vi.fn().mockResolvedValue(undefined) };
    backend([hook(0)]);
    await expect(runCodexHookEnrollment("enable", options)).resolves.toBe(0);
    const before = requests().length;
    renameSync(repo, join(fixture, "previous"));
    mkdirSync(repo);
    git(repo, "init");

    await expect(runCodexHookEnrollment("scan", options)).resolves.toBe(1);
    expect(requests()).toHaveLength(before);
  });

  it("does not record enrollment or approve a hook if the background job cannot start", async () => {
    backend([hook(0)]);
    const setAgent = vi.fn().mockRejectedValue(new Error("launch session unavailable"));
    const options = { cwd: repo, binary, setAgent };
    await expect(runCodexHookEnrollment("enable", options)).rejects.toThrow("launch session unavailable");
    await expect(runCodexHookEnrollment("scan", options)).resolves.toBe(0);
    expect(readFileSync(join(home, "config.toml"), "utf8")).toBe('model = "original"\n');
  });
});
