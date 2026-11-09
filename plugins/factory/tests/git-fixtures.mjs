// A task-owned checkout as delegation now requires one: a linked worktree of a committed
// repository. Original checkouts are reference only and would resolve to an isolated copy.
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, realpath } from "node:fs/promises";
import { join } from "node:path";

const git = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }).trim();
export async function sourceRepository(root, name) {
  const dir = join(root, name);
  await mkdir(dir, { recursive: true });
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "Test");
  await writeFile(join(dir, "README.md"), `${name}\n`);
  git(dir, "add", "README.md");
  git(dir, "commit", "-qm", "fixture");
  return realpath(dir);
}
export async function linkedCheckout(root, name, source) {
  source ??= await sourceRepository(root, `${name}-source`);
  git(source, "worktree", "add", "-q", "--detach", join(root, name));
  return realpath(join(root, name));
}
