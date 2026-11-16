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
  const head = await git(["-C", mirror, "ls-remote", "--symref", "--exit-code", "origin", "HEAD"]);
  const symbolic = /^ref: refs\/heads\/(.+)\tHEAD$/m.exec(head);
  const comparison = /^([0-9a-f]{40})\tHEAD$/m.exec(head);
  if (!symbolic || !comparison) throw new Error("Studio origin has no Git default branch");
  await git(["check-ref-format", `refs/heads/${symbolic[1]}`]);
  const snapshot = { comparisonRef: `refs/remotes/origin/${symbolic[1]}`, comparisonRevision: comparison[1] };
  await fetchWorkspaceRevision(mirror, { revision, ...snapshot });
  return snapshot;
}

export async function studioCheckout(root, { mirror, attemptId, comparisonRef, comparisonRevision } = {}, revision, resume) {
  if (!uuid.test(attemptId) || !isAbsolute(mirror ?? "") || !sha.test(revision))
    throw new Error("Invalid Studio checkout binding");
  const path = join(await realpath(root), attemptId);
  if (resume) {
    if (await realpath(path) !== path) throw new Error("Studio checkout was redirected");
    return path;
  }
  if (!comparisonRef?.startsWith("refs/remotes/origin/") || !sha.test(comparisonRevision))
    throw new Error("Invalid Studio comparison source");
  await git(["check-ref-format", comparisonRef]);
  return workspaceRepoCheckout(path, mirror, { revision, comparisonRef, comparisonRevision });
}

// Fetch both exact commits with full ancestry. No moving remote branch decides
// the comparison base, including when an old mirror was shallow.
export async function fetchWorkspaceRevision(mirror, repo) {
  if (!isAbsolute(mirror) || !sha.test(repo.revision) || !sha.test(repo.comparisonRevision))
    throw new Error("Invalid workspace source");
  const shallow = await git(["-C", mirror, "rev-parse", "--is-shallow-repository"]);
  await git(["-C", mirror, "fetch", ...(shallow === "true" ? ["--unshallow"] : []), "--no-tags", "origin", repo.revision, repo.comparisonRevision]);
  await git(["-C", mirror, "merge-base", repo.revision, repo.comparisonRevision]);
}

export async function workspaceRepoCheckout(path, mirror, repo, resume) {
  if (resume) {
    if (await realpath(path) !== path || await realpath(join(path, ".git")) !== join(path, ".git"))
      throw new Error("Workspace checkout was redirected");
    await verifyComparison(path, repo);
    return path;
  }
  await mkdir(path, { mode: 0o700 });
  await git(["-C", path, "init", "--template="]);
  await git(["-c", `safe.directory=${mirror}`, "-C", path, "fetch", "--no-tags", mirror, repo.revision, repo.comparisonRevision]);
  const branch = repo.comparisonRef.slice("refs/remotes/origin/".length);
  await git(["-C", path, "update-ref", `refs/heads/${branch}`, repo.comparisonRevision]);
  await git(["-C", path, "remote", "add", "origin", join(path, ".git")]);
  await git(["-C", path, "config", "remote.origin.fetch", `refs/heads/${branch}:${repo.comparisonRef}`]);
  await git(["-C", path, "update-ref", repo.comparisonRef, repo.comparisonRevision]);
  await git(["-C", path, "symbolic-ref", "refs/remotes/origin/HEAD", repo.comparisonRef]);
  await git(["-C", path, "checkout", "--detach", repo.revision]);
  await git(["-C", path, "merge-base", "HEAD", repo.comparisonRef]);
  await mkdir(join(path, ".git", "info"), { recursive: true });
  await writeFile(join(path, ".git", "info", "exclude"), ".factory-artifacts-*/\n", { flag: "wx" });
  return path;
}

async function verifyComparison(path, repo) {
  const branch = repo.comparisonRef.slice("refs/remotes/origin/".length);
  for (const ref of [repo.comparisonRef, `refs/heads/${branch}`]) {
    if (await git(["-C", path, "rev-parse", ref]) !== repo.comparisonRevision)
      throw new Error("Workspace comparison ref changed");
  }
  if (await git(["-C", path, "config", "--get", "remote.origin.url"]) !== join(path, ".git") ||
      await git(["-C", path, "config", "--get", "remote.origin.fetch"]) !== `refs/heads/${branch}:${repo.comparisonRef}` ||
      await git(["-C", path, "symbolic-ref", "refs/remotes/origin/HEAD"]) !== repo.comparisonRef)
    throw new Error("Workspace comparison remote changed");
}
