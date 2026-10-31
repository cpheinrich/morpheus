// Pure helpers for scripts/install.mjs. This module must stay free of dependencies: the
// installer runs it before the package's node_modules exist.
import { stat } from "node:fs/promises";
import { join } from "node:path";

// Codex has moved its bundled plugin-creator helper between releases. These are the
// locations seen so far, newest first; CODEX_PLUGIN_CREATOR overrides them all.
export function helperCandidates(codexHome, override) {
  const tail = ["plugin-creator", "scripts", "create_basic_plugin.py"];
  return [
    override,
    join(codexHome, ".tmp", "plugins", ".agents", "skills", ...tail),
    join(codexHome, "skills", ".system", ...tail),
  ].filter(Boolean);
}

export async function findHelper(candidates, exists = isFile) {
  for (const candidate of candidates) if (await exists(candidate)) return candidate;
  throw new Error(
    "Codex's plugin-creator helper (create_basic_plugin.py) was not found. Looked in:\n" +
      candidates.map((c) => `  ${c}`).join("\n") +
      "\nSet CODEX_PLUGIN_CREATOR to its path.",
  );
}

async function isFile(path) {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

// The package was called codex-claude until 2026-10-31. An earlier install leaves these
// behind; migrating them is part of installing factory, and each step is reported.
export const LEGACY = Object.freeze({
  name: "codex-claude",
  claudePlugin: "codex-claude@codex-claude-local",
  claudeMarketplace: "codex-claude-local",
  statusLinePattern: /plugins\/codex-claude\/scripts\/claude-statusline\.mjs/,
});

export function legacyPaths(home) {
  return {
    install: join(home, "plugins", LEGACY.name),
    store: join(home, ".local", "share", LEGACY.name),
    config: join(home, ".local", "share", LEGACY.name, "config.json"),
    statusLineChain: join(home, ".local", "share", LEGACY.name, "statusline-chain.json"),
  };
}

// Settings that keep their meaning across the rename. `threshold` is deliberately
// dropped: it used to be "percent remaining" and now means "percent used", so an old
// value would route in reverse. `subscriptionModels` was deprecated by factory and is
// dropped rather than carried as noise. Unknown keys are left out so the strict schema
// still parses the result.
const CARRIED = [
  "mode",
  "maxConcurrent",
  "disconnectGraceSeconds",
  "maxRunSeconds",
  "maxSupervisionReplies",
  "memorySharing",
  "modelFallback",
  "modelMap",
  "effortMap",
  "codexModels",
  "codexModelMap",
  "codexEffortMap",
  "projects",
  "memorySources",
];
export function migrateConfig(legacy) {
  const next = {};
  const dropped = [];
  for (const [key, value] of Object.entries(legacy ?? {})) {
    if (CARRIED.includes(key)) next[key] = value;
    else if (key !== "version") dropped.push(key);
  }
  return { config: next, dropped };
}

// What the Claude status line should be once the old recorder is gone: whatever it
// had chained, or nothing. Returns undefined when the old recorder is not installed.
export function legacyStatusLine(settings, chain) {
  const command = settings?.statusLine?.command;
  if (!command || !LEGACY.statusLinePattern.test(command)) return undefined;
  return { statusLine: chain?.previous ?? null };
}

// The personal Codex marketplace without the old entry; null when nothing changes.
export function withoutLegacyMarketplaceEntry(catalog) {
  const plugins = catalog?.plugins;
  if (!Array.isArray(plugins)) return null;
  const kept = plugins.filter((p) => p?.name !== LEGACY.name);
  if (kept.length === plugins.length) return null;
  return { ...catalog, plugins: kept };
}
