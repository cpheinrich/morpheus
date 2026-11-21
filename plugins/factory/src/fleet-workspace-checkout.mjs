import { execFile } from "node:child_process";
import { access, lstat, mkdir, open, readFile, readlink, realpath, stat, symlink } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { digest, sourceRevision, verifyWorkspace, workspaceId, workspacePolicy } from "./fleet-workspace.mjs";
import { workspaceRepoCheckout } from "./fleet-source.mjs";
import { gitEnv } from "./workspace.mjs";

const absolute = z.string().refine(isAbsolute);
const repository = z.string().regex(/^(?:https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/);
const companionStore = z.strictObject({ path: absolute, repository, revision: sourceRevision });
export const singleProjectCredentials = companionStore.extend({
  project: workspaceId,
  manifestSha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const workspaceHost = z.strictObject({
  policy: workspacePolicy,
  mirrors: z.record(workspaceId, absolute),
  credentials: z.record(workspaceId, companionStore).default({}),
});
const gitBytes = async (cwd, ...args) => (await promisify(execFile)("/usr/bin/git", ["-C", cwd, "-c", "core.fsmonitor=false", ...args],
  { encoding: "buffer", timeout: 5000, maxBuffer: 64 * 1024, env: { ...gitEnv(), GIT_OPTIONAL_LOCKS: "0", GIT_NO_REPLACE_OBJECTS: "1" } })).stdout;
const git = async (cwd, ...args) => (await gitBytes(cwd, ...args)).toString().trim();
const repoId = url => url.replace(/^https:\/\/github.com\//, "").replace(/^git@github.com:/, "").replace(/\.git$/, "").toLowerCase();
const credentialManifest = ".morpheus/credentials.json";

export function credentialEnrollment(config) {
  return config.fleetCredentials && digest(JSON.stringify(config.fleetCredentials));
}

export function enrolledWorkspace(host, binding, sandbox) {
  const config = workspaceHost.parse(host);
  const workspace = verifyWorkspace(config.policy, binding);
  const expectedRepos = workspace.repositories.map(r => r.project).sort();
  const expectedCredentials = [...new Set(workspace.repositories.flatMap(r => r.credential ? [r.credential.reference] : []))].sort();
  if (JSON.stringify(Object.keys(config.mirrors).sort()) !== JSON.stringify(expectedRepos) ||
      JSON.stringify(Object.keys(config.credentials).sort()) !== JSON.stringify(expectedCredentials) ||
      workspace.sandbox !== sandbox || workspace.repositories.some(r => !Object.hasOwn(config.mirrors, r.project) ||
      (r.credential && config.credentials[r.credential.reference]?.revision !== r.credential.revision)))
    throw new Error("Workspace execution profile or references are not enrolled");
  return { config, workspace };
}

// Reuse the project's normal wrapper, with no secret export or inherited
// credential override. Operator provisioning authorizes this account separately.
async function credentialPointer(checkout, expectedDigest) {
  const manifestPath = join(checkout, credentialManifest);
  let raw;
  try {
    const info = await lstat(manifestPath);
    if (!info.isFile() || info.size > 64 * 1024 || await realpath(manifestPath) !== manifestPath) throw new Error();
    raw = await readFile(manifestPath);
  } catch (error) {
    if (!expectedDigest && error.code === "ENOENT") return null;
    throw new Error("Workspace credential manifest is unavailable");
  }
  if (!expectedDigest || digest(raw) !== expectedDigest)
    throw new Error("Workspace credential manifest is not authorized");
  return JSON.parse(raw);
}

function validatePointer(pointer, store) {
  if (!repository.safeParse(pointer.repository).success || repoId(pointer.repository) !== repoId(store.repository) ||
      typeof pointer.path !== "string" || !/^local\/[A-Za-z0-9._-]+$/.test(pointer.path) ||
      ["local/.", "local/.."].includes(pointer.path) ||
      !/^bin\/[A-Za-z0-9_-]+$/.test(pointer.command ?? "bin/credentials") || pointer.legacyEnvironment?.length)
    throw new Error("Workspace credential pointer differs from enrollment");
}

export async function operatorControls(path) {
  for (let target = path; ; target = dirname(target)) {
    const info = await stat(target);
    if (info.uid !== 0 || (info.mode & 0o022)) return false;
    try { await access(target, constants.W_OK); return false; }
    catch (error) { if (!["EACCES", "EPERM", "EROFS"].includes(error.code)) throw error; }
    if (target === dirname(target)) return true;
  }
}

async function protectedWrapper(wrapper) {
  if (await realpath(wrapper) !== wrapper || !(await stat(wrapper)).isFile() || !await operatorControls(wrapper))
    throw new Error("Unprotected credential wrapper");
  await access(wrapper, constants.R_OK | constants.X_OK);
}

async function verifyCompanion(store, pointer) {
  validatePointer(pointer, store);
  const path = await realpath(store.path);
  if (path !== store.path) throw new Error("Workspace credential companion was redirected");
  await protectedWrapper(join(path, pointer.command ?? "bin/credentials"));
  const origin = await git(path, "config", "--get-all", "remote.origin.url");
  if (await git(path, "rev-parse", "--show-toplevel") !== path || await git(path, "rev-parse", "HEAD") !== store.revision ||
      !repository.safeParse(origin).success || repoId(origin) !== repoId(store.repository) ||
      await git(path, "status", "--porcelain", "--untracked-files=no"))
    throw new Error("Workspace credential companion differs from enrollment");
  return path;
}

async function requireIgnoredLink(checkout, path) {
  if (await git(checkout, "ls-files", "--", path)) throw new Error("Credential destination is tracked");
  await git(checkout, "check-ignore", "-q", "--no-index", "--", path);
}

async function attachCompanion(checkout, pointer, path, resume) {
  const link = join(checkout, pointer.path);
  const local = join(checkout, "local");
  if (!resume) await mkdir(local, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  if (!(await lstat(local)).isDirectory() || await realpath(local) !== local) throw new Error("Credential directory redirected");
  if (resume) {
    if (await readlink(link) !== path) throw new Error("Credential link changed");
    await requireIgnoredLink(checkout, pointer.path);
    return;
  }
  const exclude = join(checkout, ".git", "info", "exclude");
  if (await realpath(exclude) !== exclude || !(await lstat(exclude)).isFile()) throw new Error("Git exclude was redirected");
  const file = await open(exclude, constants.O_APPEND | constants.O_WRONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try { await file.writeFile(`\n/${pointer.path}\n`); } finally { await file.close(); }
  await requireIgnoredLink(checkout, pointer.path);
  await symlink(path, link);
}

async function companion(checkout, manifestSha256, store, resume) {
  const pointer = await credentialPointer(checkout, manifestSha256);
  if (!pointer) return;
  const path = await verifyCompanion(store, pointer);
  await attachCompanion(checkout, pointer, path, resume);
}

async function standaloneGitDirectory(checkout) {
  const metadata = join(checkout, ".git");
  if (!(await lstat(metadata)).isDirectory() || await realpath(metadata) !== metadata ||
      await git(checkout, "rev-parse", "--absolute-git-dir") !== metadata)
    throw new Error("Credential Git metadata was redirected");
  return metadata;
}

export async function checkoutSingleProjectCredentials(checkout, source, store, resume) {
  if (source?.checkout !== "git" || source.workspace || source.project !== store.project ||
      !sourceRevision.safeParse(source.revision).success)
    throw new Error("Credential source differs from enrollment");
  await standaloneGitDirectory(checkout);
  if (await git(checkout, "rev-parse", "--show-toplevel", "HEAD") !== `${checkout}\n${source.revision}` ||
      digest(await gitBytes(checkout, "show", `${source.revision}:${credentialManifest}`)) !== store.manifestSha256)
    throw new Error("Committed credential manifest differs from enrollment");
  if (!await operatorControls(await standaloneGitDirectory(store.path)))
    throw new Error("Unprotected credential Git metadata");
  await companion(checkout, store.manifestSha256, store, resume);
}

export async function checkoutWorkspace(root, host, binding, attemptId, sandbox, resume = false) {
  if (!z.uuid().safeParse(attemptId).success) throw new Error("Invalid workspace attempt");
  const { config, workspace } = enrolledWorkspace(host, binding, sandbox);
  const base = join(await realpath(root), attemptId);
  if (resume) {
    if (await realpath(base) !== base) throw new Error("Workspace was redirected");
  } else await mkdir(base, { mode: 0o700 });
  const paths = Object.create(null);
  for (const repo of workspace.repositories) {
    const path = join(base, repo.project);
    const mirror = await realpath(config.mirrors[repo.project]);
    if (mirror !== config.mirrors[repo.project]) throw new Error("Workspace mirror was redirected");
    await workspaceRepoCheckout(path, mirror, repo, resume);
    if (await git(path, "rev-parse", "HEAD") !== repo.revision || (!resume && await git(path, "status", "--porcelain")))
      throw new Error("Workspace revision differs from admission");
    const info = await stat(path);
    if (info.uid !== process.getuid() || (info.mode & 0o077)) throw new Error("Unsafe workspace ownership");
    await access(path, constants.W_OK);
    const credential = repo.credential;
    await companion(path, credential?.manifestSha256, config.credentials[credential?.reference], resume);
    paths[repo.project] = path;
  }
  return { cwd: paths[workspace.primary], paths };
}
