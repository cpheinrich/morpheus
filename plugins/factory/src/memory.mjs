import { readFile, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join, relative, isAbsolute, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
export async function codexMemoryEnabled(client, task) {
  try {
    const { config } = await client.call("config/read", {
      includeLayers: false,
      cwd: task.cwd,
    });
    if (
      config.features?.memories !== true ||
      config.memories?.use_memories === false
    )
      return false;
    // Schema-gated read-only adapter: the public read API omits per-chat memory mode.
    // Unknown schemas fail closed instead of tying compatibility to a CLI version.
    const db = join(
      process.env.CODEX_HOME || join(homedir(), ".codex"),
      "state_5.sqlite",
    );
    const { stdout } = await exec(
      "python3",
      [
        "-c",
        "import sqlite3,sys,pathlib; c=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True); cols={r[1] for r in c.execute('pragma table_info(threads)')}; r=c.execute('select memory_mode from threads where id=?',(sys.argv[2],)).fetchone() if 'memory_mode' in cols else None; print(r[0] if r else 'unknown'); c.close()",
        db,
        task.id,
      ],
      { timeout: 3000, maxBuffer: 1024 },
    );
    return stdout.trim() === "enabled";
  } catch {
    return false;
  }
}
function memorySettingsPaths(claudeHome, start) {
  const settings = [
    join(claudeHome, "settings.json"),
    "/Library/Application Support/ClaudeCode/managed-settings.json",
  ];
  let cwd = start;
  while (cwd) {
    settings.push(
      join(cwd, ".claude", "settings.json"),
      join(cwd, ".claude", "settings.local.json"),
    );
    const parent = dirname(cwd);
    if (parent === cwd) break;
    cwd = parent;
  }
  return settings;
}
// A disabled value in any scope suppresses sharing conservatively (null). Custom stores
// require explicit paths; they are never discovered by scanning unrelated projects.
async function customMemoryRoots(settings) {
  const customRoots = [];
  for (const file of settings) {
    let value;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    if (value.autoMemoryEnabled === false) return null;
    if (value.autoMemoryDirectory)
      customRoots.push(
        value.autoMemoryDirectory.replace(/^~\//, homedir() + "/"),
      );
  }
  return customRoots;
}
function insideAnyRoot(roots, path) {
  return roots.some((root) => {
    const rel = relative(root, path);
    return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
  });
}
async function readMemoryFiles(selected, roots, owner) {
  let budget = 16000;
  const result = [];
  for (const file of selected.slice(0, 12)) {
    const path = await realpath(file);
    if (!insideAnyRoot(roots, path) || !path.endsWith(".md"))
      throw new Error(
        "Memory source must be a selected Markdown file inside its owner memory store.",
      );
    const info = await stat(path);
    if (!info.isFile() || info.size > 256000) continue;
    const text = (await readFile(path, "utf8")).slice(0, budget);
    budget -= text.length;
    result.push({ owner, path, modified: info.mtime.toISOString(), text });
    if (budget <= 0) break;
  }
  return result;
}
export async function memoryContext(config, task, owner) {
  if (!["claude", "codex"].includes(owner))
    throw new Error("Invalid memory owner");
  if (
    !config.memorySharing ||
    task.memoryEnabled !== true ||
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY === "1"
  )
    return [];
  const claudeHome =
    process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
  const customRoots = await customMemoryRoots(memorySettingsPaths(claudeHome, task.cwd));
  if (customRoots === null) return [];
  const selected = config.memorySources[task.project]?.[owner] ?? [];
  const rootPaths =
    owner === "codex"
      ? [join(process.env.CODEX_HOME || join(homedir(), ".codex"), "memories")]
      : [join(claudeHome, "projects"), ...customRoots];
  const roots = (
    await Promise.all(rootPaths.map((p) => realpath(p).catch(() => null)))
  ).filter(Boolean);
  return readMemoryFiles(selected, roots, owner);
}
