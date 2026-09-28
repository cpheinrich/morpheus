import {
  mkdir,
  readFile,
  writeFile,
  rename,
  chmod,
  realpath,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { configSchema, defaults, home } from "./config.mjs";
export const key = (value) =>
  createHash("sha256").update(value).digest("hex").slice(0, 32);
export async function atomic(file, value) {
  const tmp = `${file}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + "\n", { mode: 0o600 });
  await rename(tmp, file);
}
export async function readJSON(file, fallback) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
export async function initStore() {
  await mkdir(home(), { recursive: true, mode: 0o700 });
  await chmod(home(), 0o700);
  await mkdir(join(home(), "runs"), { recursive: true, mode: 0o700 });
}
export async function configRead() {
  return configSchema.parse(
    await readJSON(join(home(), "config.json"), defaults()),
  );
}
export async function configWrite(value) {
  const config = configSchema.parse(value);
  await initStore();
  await atomic(join(home(), "config.json"), config);
  return config;
}
export async function projectIdentity(cwd) {
  const directory = await realpath(resolve(cwd));
  try {
    const common = execFileSync(
      "git",
      [
        "-C",
        directory,
        "rev-parse",
        "--path-format=absolute",
        "--git-common-dir",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return { cwd: directory, project: await realpath(common) };
  } catch {
    return { cwd: directory, project: directory };
  }
}
export async function taskRead(id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id))
    throw new Error("Invalid Codex task id");
  return readJSON(join(home(), `task-${key(id)}.json`), {
    id,
    override: "auto",
    disabled: false,
    runId: null,
    claudeSession: null,
    supervisionReplies: 0,
  });
}
export async function taskWrite(task) {
  await atomic(join(home(), `task-${key(task.id)}.json`), task);
}
export const runDir = (id) => {
  if (!/^[0-9a-f-]{36}$/.test(id)) throw new Error("Invalid run id");
  return join(home(), "runs", id);
};
