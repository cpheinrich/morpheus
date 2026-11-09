import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { constants, existsSync } from "node:fs";
import { chmod, lstat, mkdir, mkdtemp, open, readFile, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, relative } from "node:path";
import { createInterface } from "node:readline";
import { isDeepStrictEqual } from "node:util";
import { parse, type TomlTable, type TomlValue } from "smol-toml";
import { z } from "zod";
import { codexHome, listCodexHooks } from "../doctor/codex-trust.js";
import { checkoutIdentity, sessionGit } from "../session/start.js";

const desktopCli = "/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex";

type Rpc = (method: string, params: object) => Promise<unknown>;

async function withCodex<T>(binary: string, home: string, operation: (rpc: Rpc) => Promise<T>): Promise<T> {
  const child = spawn(binary, ["app-server", "--listen", "stdio://"], {
    cwd: homedir(), env: { ...process.env, CODEX_HOME: home }, stdio: ["pipe", "pipe", "ignore"],
  });
  // A server that exits while a request is being written closes stdout too.
  child.stdin.on("error", () => child.kill());
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const messages = lines[Symbol.asyncIterator]();
  const timer = setTimeout(() => child.kill("SIGKILL"), 30_000);
  let sequence = 0;
  const send = (message: object) => child.stdin.write(JSON.stringify(message) + "\n");
  const rpc: Rpc = async (method, params) => {
    const id = ++sequence;
    send({ id, method, params });
    for (;;) {
      const line = await messages.next();
      if (line.done) throw new Error(`Codex stopped responding to ${method}.`);
      const reply = JSON.parse(line.value);
      if (reply.id !== id) continue;
      if (reply.error) throw new Error(`Codex ${method} failed (code ${reply.error.code}).`);
      return reply.result;
    }
  };

  try {
    await once(child, "spawn");
    const ready = z.object({ codexHome: z.string() }).parse(await rpc("initialize", {
      clientInfo: { name: "morpheus_hook_approval", version: "1" },
      capabilities: { experimentalApi: true },
    }));
    if (await realpath(ready.codexHome) !== home) throw new Error("Codex reported a different user config directory.");
    send({ method: "initialized" });
    return await operation(rpc);
  } finally {
    clearTimeout(timer);
    lines.close();
    child.kill("SIGKILL");
  }
}

const listResponse = z.object({ data: z.array(z.object({
  cwd: z.string(),
  errors: z.array(z.unknown()),
  hooks: z.array(z.object({
    source: z.string(), sourcePath: z.string(), key: z.string(),
    enabled: z.boolean(), isManaged: z.boolean(), trustStatus: z.string(),
    currentHash: z.string(),
  })),
})) });

async function projectHooks(rpc: Rpc, root: string) {
  const { data } = listResponse.parse(await rpc("hooks/list", { cwds: [root] }));
  const [project] = data;
  if (data.length !== 1 || !project || project.cwd !== root || project.errors.length) {
    throw new Error("Codex could not reliably list hooks for this project.");
  }
  return project.hooks;
}

type Hook = Awaited<ReturnType<typeof projectHooks>>[number];

async function committedFile(root: string, source: string): Promise<string | undefined> {
  const path = relative(root, source).split("\\").join("/");
  return sessionGit(root, ["show", `HEAD:${path}`], false).catch(() => undefined);
}

export async function requireMorpheusProject(root: string): Promise<void> {
  const committed = await committedFile(root, join(root, "morpheus.json"));
  const identity = z.object({ name: z.string().min(1), morpheusVersion: z.string().min(1) });
  if (committed) {
    try {
      if (identity.safeParse(JSON.parse(committed)).success) return;
    } catch {
      // Invalid JSON is treated the same as a missing project manifest.
    }
  }
  throw new Error("Run this command in a Morpheus project with a committed morpheus.json.");
}

async function pendingApproval(hook: Hook, root: string): Promise<boolean> {
  if (hook.source !== "project" || hook.isManaged || !hook.enabled) return false;
  if (hook.trustStatus !== "untrusted" && hook.trustStatus !== "modified") return false;
  const source = hook.sourcePath;
  if (source !== join(root, ".codex", "hooks.json") && source !== join(root, ".codex", "config.toml")) return false;
  if (await realpath(source) !== source) throw new Error("Project hook config resolves outside its declared path.");
  if (!hook.key.startsWith(`${source}:`) || !/^sha256:[a-f0-9]{64}$/.test(hook.currentHash)) {
    throw new Error("Codex returned an unexpected project hook identity.");
  }
  return true;
}

type Approvals = Map<string, { trusted_hash: string }>;

async function assertCommittedHashes(root: string, source: string, approvals: Approvals): Promise<void> {
  const committed = await committedFile(root, source);
  const path = relative(root, source);
  if (committed === undefined || committed !== await readFile(source, "utf8")) {
    throw new Error(`Hook config must match the committed project file: ${path}. Review local changes in Codex Settings → Hooks.`);
  }
  const doc: unknown = source.endsWith(".toml") ? parse(committed) : JSON.parse(committed);
  const hashes = new Map(listCodexHooks(doc, source).hooks.map(({ key, hash }) => [key, hash]));
  for (const [key, { trusted_hash }] of approvals) {
    if (key.startsWith(`${source}:`) && hashes.get(key) !== trusted_hash) {
      throw new Error(`Could not verify a Codex hook hash against committed ${path}. Review it in Codex Settings → Hooks.`);
    }
  }
}

function table(value: TomlValue | undefined): TomlTable {
  if (value === undefined) return Object.create(null) as TomlTable;
  if (typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
    return value as TomlTable;
  }
  throw new Error("Unexpected shape in Codex hooks.state.");
}

function assertApprovalDelta(before: Buffer, after: Buffer, approvals: Approvals): void {
  try {
    const expected = parse(before.toString("utf8"), { integersAsBigInt: true });
    const hooks = table(expected.hooks);
    const state = table(hooks.state);
    for (const [key, approval] of approvals) {
      const entry = table(state[key]);
      entry.trusted_hash = approval.trusted_hash;
      state[key] = entry;
    }
    hooks.state = state;
    expected.hooks = hooks;
    if (isDeepStrictEqual(expected, parse(after.toString("utf8"), { integersAsBigInt: true }))) return;
  } catch {
    // Do not print config content in diagnostics.
  }
  throw new Error("Codex produced an invalid or unexpected config edit. Your config was not changed.");
}

async function snapshotConfig(home: string) {
  const target = join(home, "config.toml");
  const original = await lstat(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (!original) return undefined;
  if (!original.isFile() || original.nlink !== 1) throw new Error("Codex config must be a regular, unlinked file.");
  return { target, original, before: await readFile(target) };
}

async function saveApprovals(
  binary: string, home: string, snapshot: Awaited<ReturnType<typeof snapshotConfig>>, approvals: Approvals,
): Promise<void> {
  if (!snapshot) throw new Error("Codex user config is missing.");
  const { target, original, before } = snapshot;
  // Codex can corrupt some inline TOML tables while preserving comments. Let it
  // edit a private copy and check the whole semantic delta before replacing live config.
  const staging = await mkdtemp(join(home, ".morpheus-hook-approval-"));
  const staged = join(staging, "config.toml");
  try {
    await writeFile(staged, before, { mode: 0o600 });
    await withCodex(binary, staging, async (rpc) => {
      z.object({ status: z.literal("ok") }).parse(await rpc("config/batchWrite", {
        filePath: staged,
        edits: [{ keyPath: "hooks.state", value: Object.fromEntries(approvals), mergeStrategy: "upsert" }],
      }));
    });
    assertApprovalDelta(before, await readFile(staged), approvals);
    await chmod(staged, original.mode & 0o777);
    const current = await lstat(target);
    if (current.ino !== original.ino || current.mode !== original.mode || current.nlink !== 1
        || !(await readFile(target)).equals(before)) {
      throw new Error("Codex config changed during approval. Retry once the other edit is complete.");
    }
    await rename(staged, target);
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function withMacApprovalLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  const path = join(home, ".morpheus-hook-approval.flock");
  const file = await open(path, constants.O_CREAT | constants.O_RDWR | constants.O_NOFOLLOW, 0o600);
  try {
    // lockf's fd mode locks the shared open file description. We keep the fd
    // open across the operation, and macOS releases it even if we are killed.
    const result = spawnSync("/usr/bin/lockf", ["-t", "0", "3"], {
      stdio: ["ignore", "ignore", "ignore", file.fd], timeout: 5_000,
    });
    if (result.error) throw result.error;
    if (result.status === 75) throw new Error("Another Morpheus hook approval is running. Retry when it finishes.");
    if (result.status !== 0) throw new Error("Could not acquire the macOS hook approval lock.");
    return await action();
  } finally {
    // Keep the file itself so every process locks the same inode.
    await file.close();
  }
}

async function withApprovalLock<T>(home: string, action: () => Promise<T>): Promise<T> {
  if (process.platform === "darwin") return withMacApprovalLock(home, action);
  const lock = join(home, ".morpheus-hook-approval.lock");
  try {
    await mkdir(lock, { mode: 0o700 });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    throw new Error(`Another Morpheus hook approval holds ${lock}. Retry when it finishes. If interrupted, remove the lock only after confirming no approval is running.`);
  }
  try {
    return await action();
  } finally {
    await rmdir(lock);
  }
}

async function approve(rpc: Rpc, root: string, save: (approvals: Approvals) => Promise<void>): Promise<number> {
  const approvals: Approvals = new Map();
  const sources = new Set<string>();
  for (const hook of await projectHooks(rpc, root)) {
    if (await pendingApproval(hook, root)) {
      approvals.set(hook.key, { trusted_hash: hook.currentHash });
      sources.add(hook.sourcePath);
    }
  }
  // Checking the file alone cannot tie a hash to HEAD: the file may have
  // changed during hooks/list and then been restored before we read it.
  for (const source of sources) await assertCommittedHashes(root, source, approvals);
  if (!approvals.size) return 0;
  await save(approvals);
  const saved = new Map((await projectHooks(rpc, root)).map((hook) => [hook.key, hook]));
  for (const [key, { trusted_hash }] of approvals) {
    const hook = saved.get(key);
    if (hook?.trustStatus !== "trusted" || hook.currentHash !== trusted_hash) {
      throw new Error("Could not verify the saved hook approvals. Check Codex Settings → Hooks before retrying.");
    }
  }
  return approvals.size;
}

export async function codexHookProject(cwd: string): Promise<{ root: string; gitDir: string }> {
  const checkout = await checkoutIdentity(cwd);
  if (checkout.linked && basename(checkout.common) !== ".git") {
    throw new Error("Run hook approval from the main checkout of this project.");
  }
  return { root: checkout.linked ? dirname(checkout.common) : checkout.root, gitDir: checkout.common };
}

export async function withCodexHookApproval<T>(
  home: string, action: (approveProject: (root: string) => Promise<number>) => Promise<T>,
  binary = existsSync(desktopCli) ? desktopCli : "codex",
): Promise<T> {
  return withApprovalLock(home, () => action(async (root) => {
    await requireMorpheusProject(root);
    const snapshot = await snapshotConfig(home);
    return withCodex(binary, home, (rpc) => approve(rpc, root, (approvals) =>
      saveApprovals(binary, home, snapshot, approvals)));
  }));
}

export async function approveCodexHooks(cwd = process.cwd(), binary?: string): Promise<number> {
  const { root } = await codexHookProject(cwd);
  const home = await realpath(codexHome());
  return withCodexHookApproval(home, (approveProject) => approveProject(root), binary);
}

export async function runCodexHooks(args: string[]): Promise<number> {
  const command = args[1];
  if (args[0] !== "hooks" || !command || (args.length !== 2 && !(command === "disable" && args.length === 3))) {
    throw new Error("Usage: morpheus codex hooks <approve|enable|disable [checkout]|status>");
  }
  if (command !== "approve") {
    return (await import("./codex-hooks-auto.js")).runCodexHookEnrollment(command, { checkout: args[2] });
  }
  const count = await approveCodexHooks();
  console.log(count
    ? `Approved ${count} Codex project hook(s) in this repository.`
    : "Codex listed no enabled project hooks awaiting approval. It only lists hooks from projects it trusts.");
  return 0;
}
