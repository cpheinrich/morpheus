import { execFile } from "node:child_process";
import { mkdir, realpath, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);
const sha = /^[0-9a-f]{40}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const git = async (args) => (await exec("/usr/bin/git", args, {
  env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  timeout: 120_000, maxBuffer: 64 * 1024,
})).stdout.trim();

// The supervisor owns this bare repository and its credential. The executor
// can read Git objects via the shared directory, with no access to that credential.
export async function fetchStudioRevision(mirror, revision) {
  if (!isAbsolute(mirror) || !sha.test(revision)) throw new Error("Invalid Studio source");
  await git(["-C", mirror, "fetch", "--depth=1", "--no-tags", "origin", revision]);
  if (await git(["-C", mirror, "rev-parse", "FETCH_HEAD"]) !== revision)
    throw new Error("Studio fetched an unexpected commit");
}

export async function studioCheckout(root, { mirror, attemptId } = {}, revision, resume) {
  if (!uuid.test(attemptId) || !isAbsolute(mirror ?? "") || !sha.test(revision))
    throw new Error("Invalid Studio checkout binding");
  const path = join(await realpath(root), attemptId);
  if (resume) {
    if (await realpath(path) !== path) throw new Error("Studio checkout was redirected");
    return path;
  }
  await mkdir(path, { mode: 0o700 });
  await git(["-C", path, "init", "--template="]);
  await git(["-c", `safe.directory=${mirror}`, "-C", path, "fetch", "--depth=1", "--no-tags", mirror, revision]);
  await git(["-C", path, "checkout", "--detach", revision]);
  await mkdir(join(path, ".git", "info"), { recursive: true });
  await writeFile(join(path, ".git", "info", "exclude"), ".factory-artifacts-*/\n", { flag: "wx" });
  return path;
}
