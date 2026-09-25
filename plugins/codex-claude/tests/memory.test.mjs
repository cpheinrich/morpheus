import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { memoryContext } from "../src/memory.mjs";
import { defaults } from "../src/config.mjs";
test("selected memories are bounded, disabled means no reads, stores remain unchanged", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "memory-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  process.env.CODEX_HOME = join(root, "codex");
  process.env.CLAUDE_CONFIG_DIR = join(root, "claude");
  await mkdir(join(root, "codex", "memories"), { recursive: true });
  await mkdir(join(root, "claude", "projects"), { recursive: true });
  const file = join(root, "codex", "memories", "project.md");
  const original = "project fact ".repeat(2000);
  await writeFile(file, original);
  const task = { cwd: root, project: root, memoryEnabled: true };
  const c = {
    ...defaults(),
    memorySharing: true,
    memorySources: { [root]: { codex: [file], claude: [] } },
  };
  const result = await memoryContext(c, task, "codex");
  assert.equal(result[0].text.length, 16000);
  assert.equal(await readFile(file, "utf8"), original);
  assert.deepEqual(
    await memoryContext(c, { ...task, memoryEnabled: false }, "codex"),
    [],
  );
  await writeFile(
    join(root, "claude", "settings.json"),
    '{"autoMemoryEnabled":false}',
  );
  assert.deepEqual(await memoryContext(c, task, "codex"), []);
  await rm(join(root, "claude", "settings.json"));
  const outside = join(root, "other.md");
  await writeFile(outside, "unrelated");
  const link = join(root, "codex", "memories", "link.md");
  await symlink(outside, link);
  c.memorySources[root].codex = [link];
  await assert.rejects(memoryContext(c, task, "codex"), /owner memory store/);
});
