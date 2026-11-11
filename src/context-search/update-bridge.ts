import { access, lstat, readFile, realpath } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join } from "node:path";
import { autoUpdateConfigPath, readAutoUpdateConfig, reconcileAutoUpdateContext } from "../self-auto-update.js";
import { morpheusInstallStatus, runMorpheusCommand } from "../self.js";
import { installTantivyRuntime } from "./runtime.js";

function livePid(raw: string): boolean {
  const pid = Number(raw.split("\n", 1)[0]);
  if (!Number.isSafeInteger(pid) || pid < 2) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function hasUpdateLock(path: string): Promise<boolean> {
  const stat = await lstat(path);
  return stat.isFile() && stat.uid === process.getuid?.() && livePid(await readFile(path, "utf8"));
}

async function isUpdateCheckout(root: string): Promise<boolean> {
  const staging = dirname(root);
  if (basename(root) !== "morpheus" || !/^morpheus-update-[a-zA-Z0-9]{6}$/.test(basename(staging))) return false;
  if (dirname(await realpath(staging)) !== await realpath(tmpdir())) return false;
  const stat = await lstat(staging);
  return stat.isDirectory() && stat.uid === process.getuid?.() && (stat.mode & 0o777) === 0o700;
}

/**
 * Older auto-updaters run this reviewed build, but cannot run new code after npm
 * replaces the global CLI. In their private, locked update clone, register the
 * existing global executable before npm replaces its package.
 */
export async function finishLegacyContextUpdate(root = process.cwd()): Promise<void> {
  if (!(await isUpdateCheckout(root))) return;
  const status = await morpheusInstallStatus({ packageRoot: root });
  if (status.kind !== "checkout" || status.relation !== "current") {
    throw new Error("Could not verify the update checkout against current Morpheus main; retry the update.");
  }
  // This runs from the incoming checkout even when the outgoing CLI knows nothing
  // about Tantivy. Do not replace a working CLI with one that cannot search.
  await installTantivyRuntime();
  try {
    const config = autoUpdateConfigPath();
    if ((await readAutoUpdateConfig(config)).preference !== "enabled") return;
    if (!(await hasUpdateLock(join(dirname(config), "auto-update.lock")))) return;
    const prefix = await runMorpheusCommand("npm", ["prefix", "--global"], root);
    if (prefix.code !== 0 || !isAbsolute(prefix.stdout.trim())) return;
    const executable = join(prefix.stdout.trim(), "bin", "morpheus");
    await access(executable, constants.X_OK);
    for (const repair of await reconcileAutoUpdateContext(config, process.env, undefined, executable)) {
      if (repair.outcome === "blocked") console.error(`! Context MCP · ${repair.target} — ${repair.detail}`);
    }
  } catch (error) {
    // Local configuration should not turn a successful CLI build into a failed update.
    console.error(`! Context MCP setup deferred: ${error instanceof Error ? error.message : String(error)}`);
  }
}
