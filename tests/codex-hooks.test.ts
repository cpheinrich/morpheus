import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveCodexHooks } from "../src/cli/codex-hooks.js";

let fixture: string;
let repo: string;
let home: string;
let binary: string;
let source: string;
const hash = "sha256:" + "a".repeat(64);

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

function hook(index: number, overrides: Record<string, unknown> = {}) {
  return {
    source: "project", sourcePath: source, key: `${source}:session_start:0:${index}`,
    enabled: true, isManaged: false, trustStatus: "modified", currentHash: hash, ...overrides,
  };
}

function backend(hooks: ReturnType<typeof hook>[], options: { error?: boolean; conflict?: boolean } = {}) {
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
  git(repo, "init");
  source = join(repo, ".codex/hooks.json");
  writeFileSync(source, "{}");
  vi.stubEnv("CODEX_HOME", home);
  binary = join(fixture, "codex-stub");
  writeFileSync(binary, `#!/usr/bin/env node
const fs = require("node:fs");
const readline = require("node:readline");
const path = require("node:path");
const fixture = require("./fixture.json");
let saved = {};
readline.createInterface({ input: process.stdin }).on("line", line => {
  const request = JSON.parse(line);
  if (!request.id) return;
  fs.appendFileSync(path.join(__dirname, "requests.jsonl"), line + "\\n");
  const { id, method, params } = request;
  let result;
  if (method === "initialize") result = { codexHome: fixture.home };
  if (method === "config/read") result = { layers: [
    { name: { type: "user", file: path.join(fixture.home, "config.toml") }, version: "snapshot" },
  ] };
  if (method === "hooks/list") result = { data: [{
    cwd: fixture.repo, errors: fixture.error ? ["broken hook file"] : [],
    hooks: fixture.hooks.map(hook => ({
      ...hook, trustStatus: saved[hook.key] ? "trusted" : hook.trustStatus,
    })),
  }] };
  if (method === "config/batchWrite") {
    if (fixture.conflict) {
      console.log(JSON.stringify({ id, error: { code: -32001 } }));
      return;
    }
    saved = params.edits[0].value;
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
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.test", "commit", "--allow-empty", "-m", "base");
    git(repo, "worktree", "add", "--detach", linked);
    const eligible = hook(0);
    const newHook = hook(1, { trustStatus: "untrusted" });
    backend([
      eligible, newHook, hook(2, { enabled: false }), hook(3, { trustStatus: "trusted" }),
      hook(4, { source: "plugin" }), hook(5, { source: "user" }), hook(6, { isManaged: true }),
      hook(7, { sourcePath: join(fixture, "other/.codex/hooks.json") }),
    ]);

    await expect(approveCodexHooks(linked, binary)).resolves.toBe(2);
    const log = requests();
    expect(log.filter(r => r.method === "hooks/list").map(r => r.params.cwds)).toEqual([[repo], [repo]]);
    expect(log.filter(r => r.method === "config/batchWrite").map(r => r.params)).toEqual([{
      filePath: join(home, "config.toml"), expectedVersion: "snapshot",
      edits: [{ keyPath: "hooks.state", mergeStrategy: "upsert", value: {
        [eligible.key]: { trusted_hash: hash }, [newHook.key]: { trusted_hash: hash },
      } }],
    }]);
  });

  it("leaves the user config alone when no project hooks need approval", async () => {
    backend([hook(0, { trustStatus: "trusted" }), hook(1, { enabled: false })]);
    await expect(approveCodexHooks(repo, binary)).resolves.toBe(0);
    expect(requests().map(r => r.method)).toEqual(["initialize", "config/read", "hooks/list"]);
  });

  it("fails without writing when Codex could not list the project cleanly", async () => {
    backend([hook(0)], { error: true });
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("could not reliably list hooks");
    expect(requests().map(r => r.method)).toEqual(["initialize", "config/read", "hooks/list"]);
  });

  it("surfaces a version conflict without overwriting newer config", async () => {
    backend([hook(0)], { conflict: true });
    await expect(approveCodexHooks(repo, binary)).rejects.toThrow("config/batchWrite failed");
    expect(requests().map(r => r.method)).toEqual(["initialize", "config/read", "hooks/list", "config/batchWrite"]);
  });
});
