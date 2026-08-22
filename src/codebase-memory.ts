import { execFile } from "node:child_process";
import { readFile, realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const exec = promisify(execFile);

/**
 * Pin the bootstrap package rather than piping a moving shell script into a
 * trusted device. The npm wrapper verifies and caches the matching native
 * runtime; updating this value is an ordinary reviewed Morpheus change.
 */
export const CODEBASE_MEMORY_PACKAGE = "codebase-memory-mcp@0.10.8";
export const CODEBASE_MEMORY_VERSION = CODEBASE_MEMORY_PACKAGE.slice(
  CODEBASE_MEMORY_PACKAGE.lastIndexOf("@") + 1,
);

export interface CodebaseMemoryCommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

export type CodebaseMemoryCommandRunner = (
  command: string,
  args: string[],
  cwd: string,
) => Promise<CodebaseMemoryCommandResult>;

export const runCommand: CodebaseMemoryCommandRunner = async (command, args, cwd) => {
  try {
    const { stdout, stderr } = await exec(command, args, {
      cwd,
      // Full indexes and a first native-runtime download can legitimately
      // exceed two minutes on a large repository or a new device. This is a
      // bounded device bootstrap, not an interactive doctor subprocess.
      timeout: 15 * 60_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as Error & {
      code?: number | string;
      stdout?: string;
      stderr?: string;
    };
    return {
      code: typeof failed.code === "number" ? failed.code : 1,
      stdout: failed.stdout ?? "",
      stderr: failed.stderr ?? failed.message,
    };
  }
};

export interface Invocation {
  command: string;
  prefix: string[];
}

const nativeInvocation: Invocation = { command: "codebase-memory-mcp", prefix: [] };
const npmInvocation: Invocation = {
  command: "npm",
  prefix: [
    "exec",
    "--yes",
    `--package=${CODEBASE_MEMORY_PACKAGE}`,
    "--",
    "codebase-memory-mcp",
  ],
};

const packageRoot = fileURLToPath(new URL("../", import.meta.url));

async function invoke(
  runner: CodebaseMemoryCommandRunner,
  invocation: Invocation,
  args: string[],
  cwd: string,
): Promise<CodebaseMemoryCommandResult> {
  return runner(invocation.command, [...invocation.prefix, ...args], cwd);
}

function structured<T>(stdout: string): T | null {
  try {
    const envelope = JSON.parse(stdout.trim()) as {
      structuredContent?: T;
      content?: Array<{ type?: string; text?: string }>;
    };
    if (envelope.structuredContent) return envelope.structuredContent;
    const text = envelope.content?.find((part) => part.type === "text")?.text;
    return text ? (JSON.parse(text) as T) : null;
  } catch {
    return null;
  }
}

function enabled(config: string, key: string): boolean | null {
  const match = new RegExp(`^\\s*${key}\\s*=\\s*(true|false)\\s*$`, "m").exec(config);
  return match ? match[1] === "true" : null;
}

async function configuredClients(home: string): Promise<string[]> {
  const codexHome = process.env["CODEX_HOME"] || join(home, ".codex");
  const candidates = [
    ["Codex", join(codexHome, "config.toml")],
    ["Claude", join(home, ".claude.json")],
    ["Cursor", join(home, ".cursor", "mcp.json")],
  ] as const;
  const found: string[] = [];
  for (const [name, path] of candidates) {
    const content = await readFile(path, "utf8").catch(() => null);
    if (content?.includes("codebase-memory-mcp")) found.push(name);
  }
  return found;
}

interface ProjectRow {
  name: string;
  root_path: string;
}

interface Projects {
  projects: ProjectRow[];
}

interface IndexStatus {
  status?: string;
  root_path?: string;
  git?: { head_sha?: string };
}

export interface CodebaseMemoryStatus {
  available: boolean;
  version?: string;
  autoIndex: boolean | null;
  autoWatch: boolean | null;
  configuredClients: string[];
  projectName?: string;
  projectIndexed: boolean;
  projectFresh: boolean | null;
  morpheusSource: string;
  morpheusFresh: boolean | null;
  codebaseMemoryReady: boolean;
  ready: boolean;
  issues: string[];
}

export interface CodebaseMemoryOptions {
  runner?: CodebaseMemoryCommandRunner;
  home?: string;
  invocation?: Invocation;
  packageRoot?: string;
  checkMorpheusRemote?: boolean;
}

interface MorpheusFreshness {
  source: string;
  fresh: boolean | null;
}

let defaultFreshness: Promise<MorpheusFreshness> | undefined;

async function readMorpheusFreshness(
  runner: CodebaseMemoryCommandRunner,
  source: string,
): Promise<MorpheusFreshness> {
  const [head, remote] = await Promise.all([
    runner("git", ["rev-parse", "HEAD"], source),
    runner("git", ["ls-remote", "--exit-code", "origin", "refs/heads/main"], source),
  ]);
  if (head.code !== 0 || remote.code !== 0) return { source, fresh: null };
  const remoteHead = remote.stdout.trim().split(/\s+/)[0];
  if (!remoteHead) return { source, fresh: null };
  const contains = await runner(
    "git",
    ["merge-base", "--is-ancestor", remoteHead, head.stdout.trim()],
    source,
  );
  return { source, fresh: contains.code === 0 };
}

function morpheusFreshness(
  runner: CodebaseMemoryCommandRunner,
  source: string,
  cache: boolean,
): Promise<MorpheusFreshness> {
  if (!cache) return readMorpheusFreshness(runner, source);
  defaultFreshness ??= readMorpheusFreshness(runner, source);
  return defaultFreshness;
}

/**
 * Read operational state without changing it. Morpheus source freshness asks
 * origin unless `checkMorpheusRemote` is false; every codebase-memory check is
 * local.
 *
 * A project is operational only when the executable runs, at least one local
 * agent client names it, automatic indexing and watching are enabled, and the
 * exact checkout (worktrees included) has a ready index at its current HEAD.
 */
export async function codebaseMemoryStatus(
  root: string,
  opts: CodebaseMemoryOptions = {},
): Promise<CodebaseMemoryStatus> {
  const runner = opts.runner ?? runCommand;
  const invocation = opts.invocation ?? nativeInvocation;
  const cwd = resolve(root);
  const source = resolve(opts.packageRoot ?? packageRoot);
  const morpheus = opts.checkMorpheusRemote === false
    ? { source, fresh: null }
    : await morpheusFreshness(runner, source, !opts.runner && !opts.packageRoot);
  const versionResult = await invoke(runner, invocation, ["--version"], cwd);
  if (versionResult.code !== 0) {
    return {
      available: false,
      autoIndex: null,
      autoWatch: null,
      configuredClients: [],
      projectIndexed: false,
      projectFresh: null,
      morpheusSource: morpheus.source,
      morpheusFresh: morpheus.fresh,
      codebaseMemoryReady: false,
      ready: false,
      issues: [
        `${invocation.command === "codebase-memory-mcp" ? "codebase-memory-mcp is not installed or not on PATH" : "the pinned npm bootstrap could not run"}`,
      ],
    };
  }

  const issues: string[] = [];
  const codebaseIssues: string[] = [];
  if (morpheus.fresh === false) {
    issues.push(`the linked Morpheus CLI is behind origin/main (${morpheus.source})`);
  }
  const version = versionResult.stdout.trim().replace(/^codebase-memory-mcp\s+/, "");
  if (version !== CODEBASE_MEMORY_VERSION) {
    codebaseIssues.push(
      `codebase-memory-mcp ${version || "unknown"} does not match Morpheus's reviewed ${CODEBASE_MEMORY_VERSION} pin`,
    );
  }
  const configResult = await invoke(runner, invocation, ["config", "list"], cwd);
  const autoIndex = configResult.code === 0 ? enabled(configResult.stdout, "auto_index") : null;
  const autoWatch = configResult.code === 0 ? enabled(configResult.stdout, "auto_watch") : null;
  if (autoIndex !== true) codebaseIssues.push("automatic indexing is not enabled");
  if (autoWatch !== true) codebaseIssues.push("background index watching is not enabled");

  const clients = await configuredClients(opts.home ?? homedir());
  if (!clients.length) {
    codebaseIssues.push("no supported local agent client is configured for the MCP server");
  }

  const canonicalRoot = await realpath(cwd).catch(() => cwd);
  const projectsResult = await invoke(
    runner,
    invocation,
    ["cli", "--json", "list_projects", "--limit", "50000"],
    cwd,
  );
  const projects = projectsResult.code === 0
    ? structured<Projects>(projectsResult.stdout)?.projects ?? []
    : [];
  const project = projects.find((candidate) => candidate.root_path === canonicalRoot);
  if (!project) codebaseIssues.push("this exact checkout has no codebase-memory index");

  let projectFresh: boolean | null = null;
  if (project) {
    const [statusResult, headResult] = await Promise.all([
      invoke(
        runner,
        invocation,
        ["cli", "--json", "index_status", "--project", project.name, "--verbose"],
        cwd,
      ),
      runner("git", ["rev-parse", "HEAD"], cwd),
    ]);
    const status = statusResult.code === 0
      ? structured<IndexStatus>(statusResult.stdout)
      : null;
    if (!status || status.status !== "ready") {
      codebaseIssues.push(`the index for ${project.name} is not ready`);
    } else if (headResult.code !== 0 || !status.git?.head_sha) {
      projectFresh = null;
      codebaseIssues.push("the index exists, but its git freshness could not be verified");
    } else {
      projectFresh = status.git.head_sha === headResult.stdout.trim();
      if (!projectFresh) {
        codebaseIssues.push("the index does not match this checkout's current HEAD");
      }
    }
  }

  return {
    available: true,
    version,
    autoIndex,
    autoWatch,
    configuredClients: clients,
    projectName: project?.name,
    projectIndexed: Boolean(project),
    projectFresh,
    morpheusSource: morpheus.source,
    morpheusFresh: morpheus.fresh,
    codebaseMemoryReady: codebaseIssues.length === 0,
    ready: issues.length === 0 && codebaseIssues.length === 0,
    issues: [...issues, ...codebaseIssues],
  };
}

export interface InstallResult {
  status: CodebaseMemoryStatus;
  changed: boolean;
  installerWarning?: string;
}

/**
 * Bring this device and this exact checkout to operational mode.
 *
 * The upstream installer owns client-specific files. Morpheus owns the
 * operational policy layered on top: auto-index, auto-watch, a full index for
 * the checkout, and a functional verification. Installer ownership conflicts
 * are surfaced but do not erase a successful functional verification.
 */
export async function installCodebaseMemory(
  root: string,
  opts: CodebaseMemoryOptions = {},
): Promise<InstallResult> {
  const runner = opts.runner ?? runCommand;
  const cwd = resolve(root);
  const before = await codebaseMemoryStatus(cwd, { ...opts, runner });
  if (before.codebaseMemoryReady) return { status: before, changed: false };

  const invocation = before.available && before.version === CODEBASE_MEMORY_VERSION
    ? nativeInvocation
    : npmInvocation;
  const install = await invoke(runner, invocation, ["install", "-y"], cwd);
  const installerWarning =
    install.code === 0
      ? undefined
      : (install.stderr || install.stdout).trim().split("\n").slice(-4).join("\n");

  await invoke(runner, invocation, ["config", "set", "auto_index", "true"], cwd);
  await invoke(runner, invocation, ["config", "set", "auto_watch", "true"], cwd);
  await invoke(
    runner,
    invocation,
    ["cli", "--json", "index_repository", "--repo-path", cwd, "--mode", "full"],
    cwd,
  );

  const status = await codebaseMemoryStatus(cwd, {
    ...opts,
    runner,
    invocation: opts.invocation ?? nativeInvocation,
  });
  return { status, changed: true, installerWarning };
}

export function formatCodebaseMemoryStatus(
  status: CodebaseMemoryStatus,
  installerWarning?: string,
): string {
  const yes = "\x1b[32m✓\x1b[0m";
  const no = "\x1b[31m✗\x1b[0m";
  const lines: string[] = [];
  lines.push(
    status.available
      ? `${yes} codebase-memory-mcp ${status.version ?? ""}`.trimEnd()
      : `${no} codebase-memory-mcp unavailable`,
  );
  lines.push(
    status.morpheusFresh === true
      ? `${yes} Linked Morpheus source contains current origin/main`
      : status.morpheusFresh === false
        ? `${no} Linked Morpheus source is behind origin/main (${status.morpheusSource})`
        : `\x1b[33m?\x1b[0m Morpheus source freshness could not be verified (${status.morpheusSource})`,
  );
  lines.push(
    status.configuredClients.length
      ? `${yes} Agent clients: ${status.configuredClients.join(", ")}`
      : `${no} No supported agent client configuration found`,
  );
  lines.push(
    status.autoIndex === true && status.autoWatch === true
      ? `${yes} Automatic indexing and watching enabled`
      : `${no} Automatic indexing or watching is not enabled`,
  );
  lines.push(
    status.projectIndexed && status.projectFresh === true
      ? `${yes} Exact checkout indexed at HEAD (${status.projectName})`
      : `${no} Exact checkout index is missing, stale, or unverifiable`,
  );
  if (installerWarning) {
    lines.push(
      "",
      "\x1b[33mUpstream installer reported a configuration ownership warning.\x1b[0m",
      installerWarning,
    );
  }
  if (!status.ready) {
    lines.push("", ...status.issues.map((issue) => `  - ${issue}`));
  }
  return lines.join("\n");
}
