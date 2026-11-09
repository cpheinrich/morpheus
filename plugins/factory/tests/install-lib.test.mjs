import { test } from "node:test";
import assert from "node:assert/strict";
import {
  LEGACY,
  findHelper,
  helperCandidates,
  legacyPaths,
  legacyStatusLine,
  migrateConfig,
  withoutLegacyMarketplaceEntry,
} from "../scripts/install-lib.mjs";

test("the plugin-creator helper is looked for where Codex has put it, override first", async () => {
  const candidates = helperCandidates("/h/.codex", "/override/create_basic_plugin.py");
  assert.equal(candidates[0], "/override/create_basic_plugin.py");
  assert.ok(candidates.includes("/h/.codex/.tmp/plugins/.agents/skills/plugin-creator/scripts/create_basic_plugin.py"));
  assert.ok(candidates.includes("/h/.codex/skills/.system/plugin-creator/scripts/create_basic_plugin.py"));
  assert.equal(helperCandidates("/h/.codex", undefined).length, 2);
  // The first existing candidate wins.
  const found = await findHelper(candidates, async (p) => p.endsWith("/.tmp/plugins/.agents/skills/plugin-creator/scripts/create_basic_plugin.py"));
  assert.match(found, /\.tmp\/plugins/);
  // None existing: the error names every path tried and the override variable.
  await assert.rejects(findHelper(candidates, async () => false), (e) => {
    for (const c of candidates) assert.ok(e.message.includes(c), c);
    assert.match(e.message, /CODEX_PLUGIN_CREATOR/);
    return true;
  });
});

test("legacy settings carry over except the ones whose meaning changed", () => {
  const { config, dropped } = migrateConfig({
    version: 1,
    mode: "automatic",
    threshold: 50,
    maxConcurrent: 3,
    subscriptionModels: ["opus"],
    modelMap: { "gpt-6-astra": "opus" },
    codexModelMap: { fable: "gpt-6-astra" },
    projects: { "/p/.git": "off" },
    somethingNew: true,
  });
  assert.equal(config.mode, "automatic");
  assert.equal(config.maxConcurrent, 3);
  assert.deepEqual(config.modelMap, { "gpt-6-astra": "opus" });
  assert.deepEqual(config.codexModelMap, { fable: "gpt-6-astra" });
  assert.deepEqual(config.projects, { "/p/.git": "off" });
  // threshold reversed its meaning (remaining -> used); subscriptionModels is deprecated;
  // unknown keys would fail the strict schema. version is neither carried nor reported.
  assert.ok(!("threshold" in config));
  assert.ok(!("subscriptionModels" in config));
  assert.ok(!("somethingNew" in config));
  assert.deepEqual(dropped.sort(), ["somethingNew", "subscriptionModels", "threshold"]);
  assert.deepEqual(migrateConfig(null), { config: {}, dropped: [] });
});

test("the old status-line recorder is replaced by what it chained, or removed", () => {
  const ours = { type: "command", command: 'node "/Users/u/plugins/codex-claude/scripts/claude-statusline.mjs"', padding: 0 };
  assert.equal(legacyStatusLine({ statusLine: { command: "other" } }, null), undefined);
  assert.equal(legacyStatusLine({}, null), undefined);
  assert.deepEqual(legacyStatusLine({ statusLine: ours }, null), { statusLine: null });
  const previous = { type: "command", command: "my-statusline" };
  assert.deepEqual(legacyStatusLine({ statusLine: ours }, { command: "my-statusline", previous }), { statusLine: previous });
});

test("the personal marketplace loses only the codex-claude entry", () => {
  const catalog = {
    name: "personal",
    plugins: [
      { name: LEGACY.name, source: { source: "local", path: "./plugins/codex-claude" } },
      { name: "factory", source: { source: "local", path: "./plugins/factory" } },
    ],
  };
  const next = withoutLegacyMarketplaceEntry(catalog);
  assert.deepEqual(next.plugins.map((p) => p.name), ["factory"]);
  assert.equal(next.name, "personal");
  assert.equal(withoutLegacyMarketplaceEntry({ name: "personal", plugins: [{ name: "factory" }] }), null);
  assert.equal(withoutLegacyMarketplaceEntry(null), null);
  const paths = legacyPaths("/Users/u");
  assert.equal(paths.install, "/Users/u/plugins/codex-claude");
  assert.equal(paths.config, "/Users/u/.local/share/codex-claude/config.json");
});

test("a staged install carries the nested host package but no build output or private config", async (t) => {
  const { mkdtemp, mkdir, writeFile, cp, readdir, rm, stat } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join, relative } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const { installCopyFilter } = await import("../scripts/install-lib.mjs");
  const root = await mkdtemp(join(tmpdir(), "factory-copy-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  // A source tree shaped like a used checkout: built, installed and with stray private files.
  const source = join(root, "factory");
  const host = join(source, "src", "host");
  for (const dir of ["core", "worker/setup", "fleet", "tests", "node_modules/vitest", "dist", "worker/__pycache__", ".git"])
    await mkdir(join(host, dir), { recursive: true });
  for (const file of ["package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "core/cli.ts", "worker/host_config.py",
    "worker/setup.sh", "worker/setup/factory.sh", "fleet/controller.py", "tests/test_host_config.py",
    "node_modules/vitest/index.js", "dist/cli.js", "worker/__pycache__/x.pyc", "hosts.json", "factory.json", ".env", ".env.local"])
    await writeFile(join(host, file), "x");
  const staged = join(root, "staged");
  await cp(source, staged, { recursive: true, filter: installCopyFilter });
  const files = [];
  const walk = async (dir) => {
    for (const entry of await readdir(dir, { withFileTypes: true }))
      entry.isDirectory() ? await walk(join(dir, entry.name)) : files.push(relative(staged, join(dir, entry.name)));
  };
  await walk(staged);
  assert.deepEqual(files.sort(), [
    "src/host/core/cli.ts", "src/host/fleet/controller.py", "src/host/package.json", "src/host/pnpm-lock.yaml",
    "src/host/pnpm-workspace.yaml", "src/host/tests/test_host_config.py", "src/host/worker/host_config.py",
    "src/host/worker/setup.sh", "src/host/worker/setup/factory.sh",
  ]);
  // The real package: every committed host entry point survives the filter.
  const real = fileURLToPath(new URL("../src/host/", import.meta.url));
  for (const path of ["worker/host_config.py", "worker/setup.sh", "worker/install_updates.py", "worker/update_runner.sh",
    "fleet/controller.py", "core/cli.ts", "scripts/setup-sub2api.sh", "package.json", "pnpm-lock.yaml"]) {
    assert.ok(installCopyFilter(join(real, path)), path);
    assert.ok((await stat(join(real, path))).isFile(), path);
  }
});

test("installing the plugin never builds the host package, installs software or loads a service", async () => {
  const { readFile } = await import("node:fs/promises");
  const installer = await readFile(new URL("../scripts/install.mjs", import.meta.url), "utf8");
  const lib = await readFile(new URL("../scripts/install-lib.mjs", import.meta.url), "utf8");
  for (const text of [installer, lib])
    for (const forbidden of [/src\/host/, /setup\.sh/, /install_updates/, /setup-sub2api/, /launchctl/, /\bdocker\b/, /colima/, /\btart\b/, /xcodes/, /brew /])
      assert.doesNotMatch(text, forbidden);
  // The plugin's own test and check scripts stay shallow: the host suite runs only in its own package.
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts.test, "node --test tests/*.test.mjs");
});
