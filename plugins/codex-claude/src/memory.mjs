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
    // Version-pinned read-only adapter: the public read API omits per-chat memory mode.
    const { thread } = await client.call("thread/read", { threadId: task.id });
    if (!["0.154.0", "0.154.0-alpha.6.1"].includes(thread.cliVersion))
      return false;
    const db = join(
      process.env.CODEX_HOME || join(homedir(), ".codex"),
      "state_5.sqlite",
    );
    const { stdout } = await exec(
      "python3",
      [
        "-c",
        "import sqlite3,sys,pathlib; c=sqlite3.connect(pathlib.Path(sys.argv[1]).as_uri()+'?mode=ro',uri=True); r=c.execute('select memory_mode from threads where id=?',(sys.argv[2],)).fetchone(); print(r[0] if r else 'unknown'); c.close()",
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
  const settings = [
    join(claudeHome, "settings.json"),
    "/Library/Application Support/ClaudeCode/managed-settings.json",
  ];
  let cwd = task.cwd;
  while (cwd) {
    settings.push(
      join(cwd, ".claude", "settings.json"),
      join(cwd, ".claude", "settings.local.json"),
    );
    const parent = dirname(cwd);
    if (parent === cwd) break;
    cwd = parent;
  }
  // A disabled value in any scope suppresses sharing conservatively. Custom stores
  // require explicit paths; they are never discovered by scanning unrelated projects.
  const customRoots = [];
  for (const file of settings) {
    let value;
    try {
      value = JSON.parse(await readFile(file, "utf8"));
    } catch (e) {
      if (e.code === "ENOENT") continue;
      throw e;
    }
    if (value.autoMemoryEnabled === false) return [];
    if (value.autoMemoryDirectory)
      customRoots.push(
        value.autoMemoryDirectory.replace(/^~\//, homedir() + "/"),
      );
  }
  const selected = config.memorySources[task.project]?.[owner] ?? [];
  const rootPaths =
    owner === "codex"
      ? [join(process.env.CODEX_HOME || join(homedir(), ".codex"), "memories")]
      : [join(claudeHome, "projects"), ...customRoots];
  const roots = (
    await Promise.all(rootPaths.map((p) => realpath(p).catch(() => null)))
  ).filter(Boolean);
  let budget = 16000;
  const result = [];
  for (const file of selected.slice(0, 12)) {
    const path = await realpath(file);
    if (
      !roots.some((root) => {
        const rel = relative(root, path);
        return rel !== ".." && !rel.startsWith("../") && !isAbsolute(rel);
      }) ||
      !path.endsWith(".md")
    )
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
