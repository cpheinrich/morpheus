import { mkdir, mkdtemp, realpath, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CODEBASE_MEMORY_PACKAGE,
  CODEBASE_MEMORY_VERSION,
  codebaseMemoryStatus,
  installCodebaseMemory,
  type CodebaseMemoryCommandResult,
  type CodebaseMemoryCommandRunner,
} from "../src/codebase-memory.js";

const ok = (stdout = ""): CodebaseMemoryCommandResult => ({ code: 0, stdout, stderr: "" });
const failed = (stderr: string): CodebaseMemoryCommandResult => ({ code: 1, stdout: "", stderr });
const envelope = (value: unknown): string =>
  JSON.stringify({ content: [], structuredContent: value, isError: false });

interface FakeState {
  nativeAvailable: boolean;
  version?: string;
  autoIndex: boolean;
  autoWatch: boolean;
  indexed: boolean;
  indexedHead: string;
  installerFailure?: string;
}

function fakeRunner(root: string, state: FakeState, calls: string[]): CodebaseMemoryCommandRunner {
  return async (command, args) => {
    calls.push([command, ...args].join(" "));
    const isNative = command === "codebase-memory-mcp";
    const cbmArgs = isNative ? args : args.slice(5);
    if (isNative && !state.nativeAvailable) return failed("not found");

    if (cbmArgs[0] === "--version") {
      return ok(`codebase-memory-mcp ${state.version ?? CODEBASE_MEMORY_VERSION}\n`);
    }
    if (cbmArgs[0] === "install") {
      state.nativeAvailable = true;
      state.version = CODEBASE_MEMORY_VERSION;
      return state.installerFailure ? failed(state.installerFailure) : ok();
    }
    if (cbmArgs[0] === "config" && cbmArgs[1] === "set") {
      if (cbmArgs[2] === "auto_index") state.autoIndex = true;
      if (cbmArgs[2] === "auto_watch") state.autoWatch = true;
      return ok();
    }
    if (cbmArgs[0] === "config" && cbmArgs[1] === "list") {
      return ok(
        `Configuration:\n  auto_index = ${state.autoIndex}\n  auto_watch = ${state.autoWatch}\n`,
      );
    }
    if (cbmArgs.includes("index_repository")) {
      state.indexed = true;
      state.indexedHead = "abc123";
      return ok(envelope({ project: "test-project", status: "ready" }));
    }
    if (cbmArgs.includes("list_projects")) {
      return ok(
        envelope({
          projects: state.indexed
            ? [{ name: "test-project", root_path: resolve(root) }]
            : [],
        }),
      );
    }
    if (cbmArgs.includes("index_status")) {
      return ok(
        envelope({
          project: "test-project",
          root_path: resolve(root),
          status: "ready",
          git: { head_sha: state.indexedHead },
        }),
      );
    }
    if (command === "git" && args.join(" ") === "rev-parse HEAD") return ok("abc123\n");
    if (command === "git" && args.join(" ") === "ls-remote --exit-code origin refs/heads/main") {
      return ok("abc123\trefs/heads/main\n");
    }
    if (command === "git" && args.join(" ") === "merge-base --is-ancestor abc123 abc123") {
      return ok();
    }
    return failed(`unexpected command: ${command} ${args.join(" ")}`);
  };
}

let root: string;
let home: string;

beforeEach(async () => {
  root = await realpath(await mkdtemp(join(tmpdir(), "morpheus-cbm-root-")));
  home = await mkdtemp(join(tmpdir(), "morpheus-cbm-home-"));
  await mkdir(join(home, ".codex"), { recursive: true });
  await writeFile(
    join(home, ".codex", "config.toml"),
    '[mcp_servers.codebase-memory-mcp]\ncommand = "codebase-memory-mcp"\n',
  );
});

describe("codebase-memory operational mode", () => {
  it("accepts only an exact ready checkout with automatic maintenance", async () => {
    const calls: string[] = [];
    const state: FakeState = {
      nativeAvailable: true,
      autoIndex: true,
      autoWatch: true,
      indexed: true,
      indexedHead: "abc123",
    };

    const status = await codebaseMemoryStatus(root, {
      home,
      runner: fakeRunner(root, state, calls),
    });

    expect(status).toMatchObject({
      ready: true,
      configuredClients: ["Codex"],
      projectIndexed: true,
      projectFresh: true,
    });
    expect(calls.some((call) => call.includes("index_repository"))).toBe(false);
  });

  it("reports an index whose recorded HEAD is stale", async () => {
    const state: FakeState = {
      nativeAvailable: true,
      autoIndex: true,
      autoWatch: true,
      indexed: true,
      indexedHead: "older",
    };
    const status = await codebaseMemoryStatus(root, {
      home,
      runner: fakeRunner(root, state, []),
    });

    expect(status.ready).toBe(false);
    expect(status.projectFresh).toBe(false);
    expect(status.issues).toContain("the index does not match this checkout's current HEAD");
  });

  it("rejects a linked Morpheus checkout that does not contain current main", async () => {
    const state: FakeState = {
      nativeAvailable: true,
      autoIndex: true,
      autoWatch: true,
      indexed: true,
      indexedHead: "abc123",
    };
    const base = fakeRunner(root, state, []);
    const runner: CodebaseMemoryCommandRunner = async (command, args, cwd) => {
      if (command === "git" && args[0] === "merge-base") return failed("not an ancestor");
      return base(command, args, cwd);
    };
    const result = await installCodebaseMemory(root, { home, runner });
    const status = result.status;

    expect(status.morpheusFresh).toBe(false);
    expect(status.codebaseMemoryReady).toBe(true);
    expect(status.ready).toBe(false);
    expect(
      status.issues.some((issue) => issue.includes("the linked Morpheus CLI is behind origin/main")),
    ).toBe(true);
    expect(result.changed).toBe(false);
  });

  it("bootstraps the pinned package and reaches operational mode", async () => {
    const calls: string[] = [];
    const state: FakeState = {
      nativeAvailable: false,
      autoIndex: false,
      autoWatch: false,
      indexed: false,
      indexedHead: "",
    };
    const result = await installCodebaseMemory(root, {
      home,
      runner: fakeRunner(root, state, calls),
    });

    expect(result.status.ready).toBe(true);
    expect(result.changed).toBe(true);
    expect(calls).toContain(
      `npm exec --yes --package=${CODEBASE_MEMORY_PACKAGE} -- codebase-memory-mcp install -y`,
    );
    expect(calls.some((call) => call.includes("config set auto_index true"))).toBe(true);
    expect(calls.some((call) => call.includes("config set auto_watch true"))).toBe(true);
    expect(calls.some((call) => call.includes("index_repository") && call.includes("--mode full")))
      .toBe(true);
  });

  it("replaces an installed version that is behind the reviewed pin", async () => {
    const calls: string[] = [];
    const state: FakeState = {
      nativeAvailable: true,
      version: "0.9.0",
      autoIndex: true,
      autoWatch: true,
      indexed: true,
      indexedHead: "abc123",
    };
    const result = await installCodebaseMemory(root, {
      home,
      runner: fakeRunner(root, state, calls),
    });

    expect(result.status.ready).toBe(true);
    expect(result.status.version).toBe(CODEBASE_MEMORY_VERSION);
    expect(calls).toContain(
      `npm exec --yes --package=${CODEBASE_MEMORY_PACKAGE} -- codebase-memory-mcp install -y`,
    );
  });

  it("surfaces an installer ownership warning without hiding functional success", async () => {
    const state: FakeState = {
      nativeAvailable: true,
      autoIndex: false,
      autoWatch: false,
      indexed: false,
      indexedHead: "",
      installerFailure: "client file is owned by a local customization",
    };
    const result = await installCodebaseMemory(root, {
      home,
      runner: fakeRunner(root, state, []),
    });

    expect(result.status.ready).toBe(true);
    expect(result.installerWarning).toContain("owned by a local customization");
  });
});
