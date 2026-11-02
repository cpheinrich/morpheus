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
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { codexMemoryEnabled, memoryContext } from "../src/memory.mjs";
import { defaults } from "../src/config.mjs";
const exec = promisify(execFile);

test("Codex memory mode is detected by schema across future versions", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "memory-mode-"));
  const previousHome = process.env.CODEX_HOME;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  });
  process.env.CODEX_HOME = root;
  const db = join(root, "state_5.sqlite");
  await exec("python3", [
    "-c",
    "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table threads (id text primary key, memory_mode text)'); c.execute('insert into threads values (?,?)',('task','enabled')); c.commit(); c.close()",
    db,
  ]);
  const client = {
    call: async (method) => {
      assert.equal(method, "config/read");
      return { config: { features: { memories: true } } };
    },
  };
  assert.equal(
    await codexMemoryEnabled(client, {
      id: "task",
      cwd: root,
      cliVersion: "9.0.0",
    }),
    true,
  );
  assert.equal(
    await codexMemoryEnabled(client, { id: "missing", cwd: root }),
    false,
  );
});

test("Codex memory mode fails closed when the database contract is absent", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "memory-schema-"));
  const previousHome = process.env.CODEX_HOME;
  t.after(async () => {
    if (previousHome === undefined) delete process.env.CODEX_HOME;
    else process.env.CODEX_HOME = previousHome;
    await rm(root, { recursive: true, force: true });
  });
  process.env.CODEX_HOME = root;
  await exec("python3", [
    "-c",
    "import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); c.execute('create table threads (id text primary key)'); c.commit(); c.close()",
    join(root, "state_5.sqlite"),
  ]);
  const client = {
    call: async () => ({ config: { features: { memories: true } } }),
  };
  assert.equal(
    await codexMemoryEnabled(client, { id: "task", cwd: root }),
    false,
  );
});
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
