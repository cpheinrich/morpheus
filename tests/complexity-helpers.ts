import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { gitSubprocessEnv } from "../src/git-env.js";

/** A throwaway repository with `main` as its trunk and a commit on it. */
export async function repo(files: Record<string, string | Buffer> = {}): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "complexity-repo-"));
  git(root, "init", "--quiet", "--initial-branch=main");
  git(root, "config", "user.email", "test@example.com");
  git(root, "config", "user.name", "Test");
  git(root, "config", "commit.gpgsign", "false");
  await put(root, { "README.md": "base\n", ...files });
  commit(root, "base");
  git(root, "checkout", "--quiet", "-b", "work");
  return root;
}

export function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", env: gitSubprocessEnv() });
}

export function commit(root: string, message: string): void {
  git(root, "add", "-A");
  git(root, "commit", "--quiet", "--allow-empty", "-m", message);
}

export async function put(root: string, files: Record<string, string | Buffer>): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), content);
  }
}

/** A JavaScript function whose CCN is exactly `ccn`: one path plus `ccn - 1` flat `if`s. */
export function jsFunction(name: string, ccn: number): string {
  const ifs = Array.from({ length: ccn - 1 }, (_, i) => `  if (a === ${i}) return ${i};`);
  return [`function ${name}(a) {`, ...ifs, "  return -1;", "}", ""].join("\n");
}
