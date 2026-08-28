import { execFile } from "node:child_process";
import { constants } from "node:fs";
import {
  access,
  chmod,
  mkdir,
  open,
  readFile,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, dirname, isAbsolute, join, resolve } from "node:path";
import { promisify } from "node:util";
import { readRegistry } from "./registry/index.js";
import {
  morpheusInstallStatus,
  updateMorpheus,
  type MorpheusInstallResult,
  type MorpheusInstallStatus,
} from "./self.js";

const exec = promisify(execFile);

export const AUTO_UPDATE_START = "# morpheus:auto-update:start";
export const AUTO_UPDATE_END = "# morpheus:auto-update:end";
export const AUTO_UPDATE_SCHEMA = 1;
export const AUTO_UPDATE_LOCK_STALE_MS = 30 * 60 * 1_000;
const HOOKS = ["post-merge", "post-rewrite"] as const;

export type AutoUpdatePreference = "unconfigured" | "enabled" | "disabled" | "invalid";

export interface AutoUpdateConfigState {
  path: string;
  preference: AutoUpdatePreference;
  detail?: string;
}

interface AutoUpdateConfig {
  schema: 1;
  enabled: boolean;
  changedAt: string;
}

export function autoUpdateConfigPath(): string {
  return (
    process.env["MORPHEUS_AUTO_UPDATE_CONFIG"] ??
    join(homedir(), ".morpheus", "auto-update.json")
  );
}

export async function readAutoUpdateConfig(
  path = autoUpdateConfigPath(),
): Promise<AutoUpdateConfigState> {
  let raw: string;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { path, preference: "unconfigured" };
    }
    return {
      path,
      preference: "invalid",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AutoUpdateConfig>;
    if (
      parsed.schema !== AUTO_UPDATE_SCHEMA ||
      typeof parsed.enabled !== "boolean" ||
      typeof parsed.changedAt !== "string"
    ) {
      return { path, preference: "invalid", detail: "the file does not match schema 1" };
    }
    return { path, preference: parsed.enabled ? "enabled" : "disabled" };
  } catch (error) {
    return {
      path,
      preference: "invalid",
      detail: `invalid JSON (${error instanceof Error ? error.message : String(error)})`,
    };
  }
}

async function writeAutoUpdateConfig(
  enabled: boolean,
  path: string,
  now: Date,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const config: AutoUpdateConfig = {
    schema: AUTO_UPDATE_SCHEMA,
    enabled,
    changedAt: now.toISOString(),
  };
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

export async function findMorpheusBinary(pathValue = process.env["PATH"] ?? ""): Promise<string | null> {
  for (const directory of pathValue.split(delimiter).filter(Boolean)) {
    const candidate = join(directory, "morpheus");
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Keep looking. A stale PATH entry is not a reason to hide a later one.
    }
  }
  return null;
}

function shellQuote(value: string): string {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

export function autoUpdateHookBlock(binaryPath: string): string {
  return `${AUTO_UPDATE_START}
MORPHEUS_AUTO_UPDATE_BIN=${shellQuote(binaryPath)}
if [ -x "$MORPHEUS_AUTO_UPDATE_BIN" ]; then
  "$MORPHEUS_AUTO_UPDATE_BIN" self ensure || :
else
  printf '%s\\n' "Morpheus auto-update is enabled, but $MORPHEUS_AUTO_UPDATE_BIN is missing." >&2
fi
${AUTO_UPDATE_END}`;
}

export type HookOutcome = "created" | "updated" | "present" | "removed" | "absent" | "blocked";

export interface HookRepair {
  root: string;
  hook: (typeof HOOKS)[number];
  path: string;
  outcome: HookOutcome;
  detail: string;
}

async function gitHookPath(root: string, hook: (typeof HOOKS)[number]): Promise<string> {
  const { stdout } = await exec("git", ["rev-parse", "--git-path", `hooks/${hook}`], {
    cwd: root,
    timeout: 10_000,
  });
  const path = stdout.trim();
  if (!path) throw new Error(`Git did not report a path for ${hook}.`);
  return isAbsolute(path) ? path : resolve(root, path);
}

async function readOptional(path: string): Promise<string | null> {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

function managedRange(content: string): { start: number; end: number } | null | "broken" {
  const start = content.indexOf(AUTO_UPDATE_START);
  const endMarker = content.indexOf(AUTO_UPDATE_END);
  if (start === -1 && endMarker === -1) return null;
  if (start === -1 || endMarker === -1 || endMarker < start) return "broken";
  const duplicateStart = content.indexOf(AUTO_UPDATE_START, start + AUTO_UPDATE_START.length);
  const duplicateEnd = content.indexOf(AUTO_UPDATE_END, endMarker + AUTO_UPDATE_END.length);
  if (duplicateStart !== -1 || duplicateEnd !== -1) return "broken";
  return { start, end: endMarker + AUTO_UPDATE_END.length };
}

function isShellHook(content: string): boolean {
  const first = content.split("\n", 1)[0] ?? "";
  return /^#![^\n]*\b(?:sh|bash|zsh|dash|ksh)\b/.test(first);
}

async function installHook(
  root: string,
  hook: (typeof HOOKS)[number],
  binaryPath: string,
): Promise<HookRepair> {
  let path: string;
  try {
    path = await gitHookPath(root, hook);
  } catch (error) {
    return {
      root,
      hook,
      path: "",
      outcome: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }

  const block = autoUpdateHookBlock(binaryPath);
  let existing: string | null;
  try {
    existing = await readOptional(path);
  } catch (error) {
    return {
      root,
      hook,
      path,
      outcome: "blocked",
      detail: `Could not read the existing hook: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  let next: string;
  let outcome: HookOutcome;
  if (existing === null) {
    next = `#!/bin/sh\n\n${block}\n`;
    outcome = "created";
  } else {
    const range = managedRange(existing);
    if (range === "broken") {
      return {
        root,
        hook,
        path,
        outcome: "blocked",
        detail: "The existing Morpheus marker block is malformed; left it untouched.",
      };
    }
    if (range) {
      next = existing.slice(0, range.start) + block + existing.slice(range.end);
      outcome = next === existing ? "present" : "updated";
    } else if (!isShellHook(existing)) {
      return {
        root,
        hook,
        path,
        outcome: "blocked",
        detail: "The existing hook is not a recognised shell script; left it untouched.",
      };
    } else {
      // The extra newline belongs to Morpheus. Removal can therefore take it
      // back and leave every byte of the pre-existing hook intact.
      next = `${existing}\n${block}\n`;
      outcome = "updated";
    }
  }

  try {
    if (outcome !== "present") {
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, next, "utf8");
    }
    const mode = (await stat(path)).mode;
    if ((mode & 0o111) === 0) await chmod(path, (mode & 0o777) | 0o755);
  } catch (error) {
    return {
      root,
      hook,
      path,
      outcome: "blocked",
      detail: `Could not install the managed hook: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return {
    root,
    hook,
    path,
    outcome,
    detail:
      outcome === "created"
        ? "Created the managed hook."
        : outcome === "updated"
          ? "Added or refreshed Morpheus beside the existing hook."
          : "Managed hook is current.",
  };
}

async function removeHook(
  root: string,
  hook: (typeof HOOKS)[number],
): Promise<HookRepair> {
  let path: string;
  try {
    path = await gitHookPath(root, hook);
  } catch (error) {
    return {
      root,
      hook,
      path: "",
      outcome: "blocked",
      detail: error instanceof Error ? error.message : String(error),
    };
  }
  let existing: string | null;
  try {
    existing = await readOptional(path);
  } catch (error) {
    return {
      root,
      hook,
      path,
      outcome: "blocked",
      detail: `Could not read the existing hook: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  if (existing === null) {
    return { root, hook, path, outcome: "absent", detail: "No hook to remove." };
  }
  const range = managedRange(existing);
  if (range === "broken") {
    return {
      root,
      hook,
      path,
      outcome: "blocked",
      detail: "The existing Morpheus marker block is malformed; left it untouched.",
    };
  }
  if (!range) {
    return { root, hook, path, outcome: "absent", detail: "No Morpheus block to remove." };
  }

  let before = existing.slice(0, range.start);
  let after = existing.slice(range.end);
  if (before.endsWith("\n")) before = before.slice(0, -1);
  if (after.startsWith("\n")) after = after.slice(1);
  try {
    if (before === "#!/bin/sh\n" && after === "") {
      await unlink(path);
    } else {
      await writeFile(path, `${before}${after}`, "utf8");
    }
  } catch (error) {
    return {
      root,
      hook,
      path,
      outcome: "blocked",
      detail: `Could not remove the managed hook: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
  return { root, hook, path, outcome: "removed", detail: "Removed only the Morpheus block." };
}

export async function installProjectAutoUpdate(
  root: string,
  binaryPath: string,
): Promise<HookRepair[]> {
  return Promise.all(HOOKS.map((hook) => installHook(root, hook, binaryPath)));
}

export async function removeProjectAutoUpdate(root: string): Promise<HookRepair[]> {
  return Promise.all(HOOKS.map((hook) => removeHook(root, hook)));
}

export async function inspectProjectAutoUpdate(root: string): Promise<HookRepair[]> {
  return Promise.all(
    HOOKS.map(async (hook): Promise<HookRepair> => {
      let path: string;
      try {
        path = await gitHookPath(root, hook);
        const content = await readOptional(path);
        if (content === null || managedRange(content) === null) {
          return { root, hook, path, outcome: "absent", detail: "Managed hook is not installed." };
        }
        if (managedRange(content) === "broken") {
          return { root, hook, path, outcome: "blocked", detail: "Marker block is malformed." };
        }
        return { root, hook, path, outcome: "present", detail: "Managed hook is installed." };
      } catch (error) {
        return {
          root,
          hook,
          path: "",
          outcome: "blocked",
          detail: error instanceof Error ? error.message : String(error),
        };
      }
    }),
  );
}

export interface EnsureOptions {
  configPath?: string;
  now?: Date;
  status?: () => Promise<MorpheusInstallStatus>;
  update?: () => Promise<MorpheusInstallResult>;
}

export type EnsureOutcome = "disabled" | "current" | "updated" | "deferred" | "busy" | "failed";

export interface EnsureResult {
  outcome: EnsureOutcome;
  detail: string;
  commit?: string;
}

async function acquireUpdateLock(path: string, now: Date) {
  await mkdir(dirname(path), { recursive: true });
  try {
    const handle = await open(path, "wx");
    await handle.writeFile(`${process.pid}\n${now.toISOString()}\n`, "utf8");
    return handle;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    const info = await stat(path).catch(() => null);
    if (info && now.getTime() - info.mtimeMs > AUTO_UPDATE_LOCK_STALE_MS) {
      await rm(path, { force: true });
      const handle = await open(path, "wx");
      await handle.writeFile(`${process.pid}\n${now.toISOString()}\n`, "utf8");
      return handle;
    }
    return null;
  }
}

export async function ensureAutoUpdate(opts: EnsureOptions = {}): Promise<EnsureResult> {
  const configPath = opts.configPath ?? autoUpdateConfigPath();
  const config = await readAutoUpdateConfig(configPath);
  if (config.preference !== "enabled") {
    return {
      outcome: "disabled",
      detail:
        config.preference === "invalid"
          ? `Auto-update configuration is invalid: ${config.detail ?? config.path}`
          : "Automatic updates are not enabled on this device.",
    };
  }

  const status = await (opts.status ?? (() => morpheusInstallStatus()))();
  if (status.fresh === true) {
    return { outcome: "current", detail: "Morpheus already contains current main." };
  }
  if (status.relation === "offline" || (status.relation === "unknown" && status.installedSha)) {
    return {
      outcome: "deferred",
      detail: status.detail ?? "Current Morpheus main could not be verified; leaving the install unchanged.",
    };
  }

  const now = opts.now ?? new Date();
  const lockPath = join(dirname(configPath), "auto-update.lock");
  const lock = await acquireUpdateLock(lockPath, now);
  if (!lock) {
    return { outcome: "busy", detail: "Another Morpheus update is already running." };
  }
  try {
    const result = await (opts.update ?? (() => updateMorpheus()))();
    return {
      outcome: "updated",
      detail: `Installed current Morpheus main ${result.commit.slice(0, 7)}.`,
      commit: result.commit,
    };
  } catch (error) {
    return {
      outcome: "failed",
      detail: `Could not update Morpheus: ${error instanceof Error ? error.message : String(error)}`,
    };
  } finally {
    await lock.close();
    await rm(lockPath, { force: true });
  }
}

export interface AutoUpdateOptions extends EnsureOptions {
  registryPath?: string;
  binaryPath?: string;
}

export interface AutoUpdateChange {
  config: AutoUpdateConfigState;
  hooks: HookRepair[];
  ensure?: EnsureResult;
}

async function projectRoots(currentRoot: string, registryPath?: string): Promise<string[]> {
  const roots = new Set((await readRegistry(registryPath)).projects.map((project) => resolve(project.path)));
  try {
    await access(join(currentRoot, "morpheus.json"));
    roots.add(resolve(currentRoot));
  } catch {
    // Enabling from outside a project still covers every registered one.
  }
  return [...roots].sort();
}

export async function enableAutoUpdate(
  currentRoot: string,
  opts: AutoUpdateOptions = {},
): Promise<AutoUpdateChange> {
  const configPath = opts.configPath ?? autoUpdateConfigPath();
  const now = opts.now ?? new Date();
  const binaryPath = opts.binaryPath ?? (await findMorpheusBinary());
  if (!binaryPath) throw new Error("Could not find the installed `morpheus` executable on PATH.");
  await writeAutoUpdateConfig(true, configPath, now);
  const roots = await projectRoots(currentRoot, opts.registryPath);
  const hooks = (
    await Promise.all(roots.map((root) => installProjectAutoUpdate(root, binaryPath)))
  ).flat();
  const ensured = await ensureAutoUpdate({
    configPath,
    now,
    ...(opts.status ? { status: opts.status } : {}),
    ...(opts.update ? { update: opts.update } : {}),
  });
  return { config: await readAutoUpdateConfig(configPath), hooks, ensure: ensured };
}

export async function disableAutoUpdate(
  currentRoot: string,
  opts: AutoUpdateOptions = {},
): Promise<AutoUpdateChange> {
  const configPath = opts.configPath ?? autoUpdateConfigPath();
  await writeAutoUpdateConfig(false, configPath, opts.now ?? new Date());
  const roots = await projectRoots(currentRoot, opts.registryPath);
  const hooks = (await Promise.all(roots.map(removeProjectAutoUpdate))).flat();
  return { config: await readAutoUpdateConfig(configPath), hooks };
}

export async function autoUpdateStatus(
  currentRoot: string,
  opts: AutoUpdateOptions = {},
): Promise<AutoUpdateChange> {
  const configPath = opts.configPath ?? autoUpdateConfigPath();
  const roots = await projectRoots(currentRoot, opts.registryPath);
  const hooks = (await Promise.all(roots.map(inspectProjectAutoUpdate))).flat();
  return { config: await readAutoUpdateConfig(configPath), hooks };
}
