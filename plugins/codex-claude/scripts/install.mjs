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
const source = fileURLToPath(new URL("..", import.meta.url));
const codexHome = process.env.CODEX_HOME || join(homedir(), ".codex");
const helper =
  process.env.CODEX_PLUGIN_CREATOR ||
  join(
    codexHome,
    "skills",
    ".system",
    "plugin-creator",
    "scripts",
    "create_basic_plugin.py",
  );
const marketplace = join(homedir(), ".agents", "plugins", "marketplace.json");
const destination = join(homedir(), "plugins", "codex-claude");
const temp = await mkdtemp(join(tmpdir(), "codex-claude-install-"));
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: "inherit", ...options });
try {
  if (process.platform !== "darwin")
    throw new Error("This release is supported on macOS execution hosts only.");
  await stat(helper); // Fail before changing user state if the supported marketplace helper is missing.
  let catalog = null;
  try {
    catalog = JSON.parse(await readFile(marketplace, "utf8"));
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
  if (catalog && !/^[A-Za-z0-9_-]+$/.test(catalog.name))
    throw new Error("Invalid existing personal marketplace name");
  const existing = catalog?.plugins?.find((p) => p.name === "codex-claude");
  if (
    existing &&
    (existing.source?.source !== "local" ||
      existing.source?.path !== "./plugins/codex-claude")
  )
    throw new Error(
      "Existing codex-claude marketplace entry has a different source. Resolve it explicitly before installing.",
    );
  const staged = join(temp, "codex-claude");
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
  const { probe } = await import(
    pathToFileURL(join(staged, "scripts", "probe.mjs")).href
  );
  // Use the official helper to update only the requested personal marketplace entry.
  // It also creates a throwaway scaffold; the reviewed package supplies the installed files.
  run("python3", [
    helper,
    "codex-claude",
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
  try {
    await rename(next, destination);
    const installed = JSON.parse(
      execFileSync(
        "codex",
        [
          "plugin",
          "add",
          `codex-claude@${catalog?.name || "personal"}`,
          "--json",
        ],
        { encoding: "utf8" },
      ),
    );
    await probe(installed.installedPath);
    console.log(`Verified installed MCP tools at ${installed.installedPath}`);
  } catch (e) {
    await rm(destination, { recursive: true, force: true });
    try {
      await rename(previous, destination);
    } catch {}
    throw e;
  }
  await rm(previous, { recursive: true, force: true });
  console.log(
    `Installed a standalone copy at ${destination}. Routing remains at its existing setting (off on first install). Start a new Codex task to load the plugin and review/trust its hooks. Then run doctor and explicitly enable manual or automatic mode.`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  await rm(temp, { recursive: true, force: true });
}
