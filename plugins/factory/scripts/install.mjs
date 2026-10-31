#!/usr/bin/env node
// Explicit, user-run installation only. Never called by Morpheus init or npm hooks.
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, basename, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import {
  LEGACY,
  findHelper,
  helperCandidates,
  legacyPaths,
  legacyStatusLine,
  migrateConfig,
  withoutLegacyMarketplaceEntry,
} from "./install-lib.mjs";
const source = fileURLToPath(new URL("..", import.meta.url));
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const marketplace = join(homedir(), ".agents", "plugins", "marketplace.json");
const destination = join(homedir(), "plugins", "factory");
const factoryHome =
  process.env.FACTORY_HOME || join(homedir(), ".local", "share", "factory");
const claudeSettings = join(
  process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude"),
  "settings.json",
);
const temp = await mkdtemp(join(tmpdir(), "factory-install-"));
// The Claude Code half is registered too unless explicitly skipped; routing stays at the
// saved mode either way, so registration alone never starts delegating.
const withClaude = !process.argv.includes("--codex-only");
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: "inherit", ...options });
const quiet = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", stdio: "pipe" });
const exists = async (path) => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};
const readJSON = async (path, fallback) => {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
};
const writeJSON = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
function installClaudePlugin(path) {
  const markets = JSON.parse(quiet("claude", ["plugin", "marketplace", "list", "--json"]));
  if (markets.some?.((m) => m.name === "factory-local"))
    quiet("claude", ["plugin", "marketplace", "update", "factory-local"]);
  else quiet("claude", ["plugin", "marketplace", "add", path]);
  const installed = JSON.parse(quiet("claude", ["plugin", "list", "--json"]));
  const id = "factory@factory-local";
  if (installed.some?.((p) => p.id === id || p.name === id))
    quiet("claude", ["plugin", "update", id]);
  else quiet("claude", ["plugin", "install", id]);
}
// An install of this package under its old name is migrated, step by step, and each
// step is reported in `report`. A step that fails is reported too and never fails the
// install. Migration is two phases: `migrateLegacySettings` runs before the Claude half
// (so our status line never chains the dead recorder) and only writes state the old
// plugin can live without; `removeLegacy` runs once the new install has committed, so a
// failed install never leaves the user with neither plugin.
const legacy = legacyPaths(homedir());
const report = [];
const step = async (label, action) => {
  try {
    const detail = await action();
    report.push(`${label}: ${detail ?? "done"}`);
  } catch (e) {
    report.push(`${label}: FAILED (${e.message}); finish it by hand`);
  }
};
async function legacyPresent(catalog) {
  return (
    (await exists(legacy.install)) ||
    (await exists(legacy.config)) ||
    Boolean(catalog?.plugins?.some((p) => p?.name === LEGACY.name))
  );
}
async function migrateLegacySettings() {
  await step("settings", async () => {
    const old = await readJSON(legacy.config, null);
    if (!old) return "no old config.json";
    if (await exists(join(factoryHome, "config.json")))
      return "factory already has a config.json; the old one was left alone";
    const { config, dropped } = migrateConfig(old);
    const { configWrite } = await import(
      pathToFileURL(join(destination, "src", "store.mjs")).href
    );
    await configWrite(config);
    return (
      `carried mode "${config.mode ?? "off"}" and the model/effort maps` +
      (dropped.length
        ? `; dropped ${dropped.join(", ")} (threshold now means percent used; it is back at its default)`
        : "")
    );
  });
  if (withClaude) {
    await step("Claude status line", async () => {
      const settings = await readJSON(claudeSettings, {});
      const next = legacyStatusLine(settings, await readJSON(legacy.statusLineChain, null));
      if (next === undefined) return "the old recorder was not installed";
      if (next.statusLine) settings.statusLine = next.statusLine;
      else delete settings.statusLine;
      await writeJSON(claudeSettings, settings);
      return next.statusLine ? "restored the status line it had chained" : "removed the old recorder";
    });
  }
}
async function removeLegacy(catalogName) {
  if (withClaude) {
    await step("Claude plugin", () => {
      quiet("claude", ["plugin", "uninstall", LEGACY.claudePlugin]);
      quiet("claude", ["plugin", "marketplace", "remove", LEGACY.claudeMarketplace]);
      return `uninstalled ${LEGACY.claudePlugin} and its marketplace`;
    });
  }
  await step("Codex plugin", () => {
    try {
      quiet("codex", ["plugin", "remove", `${LEGACY.name}@${catalogName}`]);
    } catch (e) {
      if (!/not installed|not found|unknown/i.test(String(e.stderr ?? e.message))) throw e;
    }
    return `removed ${LEGACY.name}@${catalogName}`;
  });
  await step("personal marketplace", async () => {
    const current = await readJSON(marketplace, null);
    const next = withoutLegacyMarketplaceEntry(current);
    if (!next) return "had no old entry";
    await writeJSON(marketplace, next);
    return `dropped the ${LEGACY.name} entry`;
  });
  await step("old install copy", async () => {
    await rm(legacy.install, { recursive: true, force: true });
    return `removed ${legacy.install}`;
  });
  report.push(
    `left ${legacy.store} (old run records; delete it once no session that used the old plugin is open) and any hooks.state entries for ${LEGACY.name} in ${join(codexHome, "config.toml")} (inert; Codex owns that file while it runs)`,
  );
}
let migrating = false;
try {
  if (process.platform !== "darwin")
    throw new Error("This release is supported on macOS execution hosts only.");
  // Fail before changing user state if the supported marketplace helper is missing.
  const helper = await findHelper(
    helperCandidates(codexHome, process.env.CODEX_PLUGIN_CREATOR),
  );
  let catalog = null;
  try {
    catalog = JSON.parse(await readFile(marketplace, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (catalog && !/^[A-Za-z0-9_-]+$/.test(catalog.name))
    throw new Error("Invalid existing personal marketplace name");
  const existing = catalog?.plugins?.find((p) => p.name === "factory");
  if (
    existing &&
    (existing.source?.source !== "local" ||
      existing.source?.path !== "./plugins/factory")
  )
    throw new Error(
      "Existing factory marketplace entry has a different source. Resolve it explicitly before installing.",
    );
  const staged = join(temp, "factory");
  await cp(source, staged, {
    recursive: true,
    filter: (path) =>
      !["node_modules", ".git", "__pycache__"].includes(basename(path)),
  });
  run(
    "pnpm",
    [
      "install",
      "--ignore-workspace",
      "--frozen-lockfile",
      "--config.node-linker=hoisted",
    ],
    {
      cwd: staged,
    },
  );
  run(process.execPath, ["scripts/check.mjs"], { cwd: staged });
  run("pnpm", ["test"], { cwd: staged });
  const { probe, probeClaude } = await import(
    pathToFileURL(join(staged, "scripts", "probe.mjs")).href
  );
  // Use the official helper to update only the requested personal marketplace entry.
  // It also creates a throwaway scaffold; the reviewed package supplies the installed files.
  run("python3", [
    helper,
    "factory",
    "--path",
    join(temp, "scaffold"),
    "--with-marketplace",
    "--force",
  ]);
  const manifestPath = join(staged, ".codex-plugin", "plugin.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const installationId = `codex.${Date.now()}`;
  manifest.version = manifest.version.split("+")[0] + "+" + installationId;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
  await writeFile(
    join(staged, "src", "installation.mjs"),
    `export const installationId = ${JSON.stringify(installationId)};\n`,
  );
  await mkdir(dirname(destination), { recursive: true });
  const next = destination + ".next-" + process.pid;
  await cp(staged, next, { recursive: true, dereference: true });
  const previous = destination + ".previous";
  await rm(previous, { recursive: true, force: true });
  try {
    await rename(destination, previous);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  const catalogName = catalog?.name || "personal";
  migrating = await legacyPresent(catalog);
  try {
    await rename(next, destination);
    const installed = JSON.parse(
      execFileSync(
        "codex",
        ["plugin", "add", `factory@${catalogName}`, "--json"],
        { encoding: "utf8" },
      ),
    );
    await probe(installed.installedPath);
    console.log(`Verified installed MCP tools at ${installed.installedPath}`);
    // The old name's status line must be gone before ours installs, or ours would chain
    // the dead recorder; so its settings migrate between the Codex and Claude halves.
    if (migrating) await migrateLegacySettings();
    if (withClaude) {
      await probeClaude(destination);
      installClaudePlugin(join(destination, "claude-plugin"));
      run(process.execPath, [
        join(destination, "scripts", "bridge.mjs"),
        "statusline",
        "install",
      ]);
      console.log("Registered the Claude Code plugin and status-line recorder.");
    }
  } catch (e) {
    await rm(destination, { recursive: true, force: true });
    try {
      await rename(previous, destination);
    } catch {}
    throw e;
  }
  await rm(previous, { recursive: true, force: true });
  // Only now, with factory committed, is the old plugin removed.
  if (migrating) await removeLegacy(catalogName);
  console.log(
    `Installed a standalone copy at ${destination}. Routing remains at its existing setting (off on first install). Start a new Codex task (and Claude session) to load the plugin and review/trust its hooks. Then run doctor and explicitly enable manual or automatic mode.`,
  );
} catch (e) {
  console.error(e.message);
  if (migrating)
    report.push(
      `the install failed, so ${LEGACY.name} was left installed; rerun after fixing the error above`,
    );
  process.exitCode = 1;
} finally {
  if (report.length)
    console.log(
      `Migration from ${LEGACY.name}:\n` + report.map((line) => `  - ${line}`).join("\n"),
    );
  await rm(temp, { recursive: true, force: true });
}
