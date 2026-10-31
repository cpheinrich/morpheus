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
