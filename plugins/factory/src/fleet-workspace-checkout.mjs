import { execFile } from "node:child_process";
import { access, appendFile, lstat, mkdir, readFile, realpath, stat, symlink } from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { digest, sourceRevision, verifyWorkspace, workspaceId, workspacePolicy } from "./fleet-workspace.mjs";
import { workspaceRepoCheckout } from "./fleet-source.mjs";

const absolute = z.string().refine(isAbsolute);
const repository = z.string().regex(/^(?:https:\/\/github\.com\/|git@github\.com:)[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\.git)?$/);
export const workspaceHost = z.strictObject({
  policy: workspacePolicy,
  mirrors: z.record(workspaceId, absolute),
  credentials: z.record(workspaceId, z.strictObject({ path: absolute, repository, revision: sourceRevision })).default({}),
});
const git = async (cwd, ...args) => (await promisify(execFile)("/usr/bin/git", ["-C", cwd, ...args],
  { timeout: 5000, maxBuffer: 64 * 1024 })).stdout.trim();
const repoId = url => url.replace(/^https:\/\/github.com\//, "").replace(/^git@github.com:/, "").replace(/\.git$/, "").toLowerCase();

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
async function credentialPointer(checkout, repo) {
  const manifestPath = join(checkout, ".morpheus", "credentials.json");
  let raw;
  try {
    if (!(await lstat(manifestPath)).isFile()) throw new Error();
    raw = await readFile(manifestPath);
  } catch (error) {
    if (!repo.credential && error.code === "ENOENT") return null;
    throw new Error("Workspace credential manifest is unavailable");
  }
  if (!repo.credential || digest(raw) !== repo.credential.manifestSha256)
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

async function protectedWrapper(wrapper) {
  if (await realpath(wrapper) !== wrapper || !(await stat(wrapper)).isFile()) throw new Error("Invalid credential wrapper");
  await access(wrapper, constants.X_OK);
  for (let target = wrapper; ; target = dirname(target)) {
    const info = await stat(target);
    if (info.uid !== 0 || (info.mode & 0o022)) throw new Error("Unprotected credential authority");
    try { await access(target, constants.W_OK); throw new Error("Writable credential authority"); }
    catch (error) { if (!["EACCES", "EPERM", "EROFS"].includes(error.code)) throw error; }
    if (target === dirname(target)) break;
  }
}

async function verifyCompanion(store, pointer) {
  validatePointer(pointer, store);
  const path = await realpath(store.path);
  if (path !== store.path || await git(path, "rev-parse", "HEAD") !== store.revision ||
      repoId(await git(path, "config", "--get", "remote.origin.url")) !== repoId(store.repository) ||
      await git(path, "status", "--porcelain", "--untracked-files=no"))
    throw new Error("Workspace credential companion differs from enrollment");
  await protectedWrapper(join(path, pointer.command ?? "bin/credentials"));
  return path;
}

async function attachCompanion(checkout, pointer, path, resume) {
  const link = join(checkout, pointer.path);
  if (resume) {
    if (!(await lstat(link)).isSymbolicLink() || await realpath(link) !== path) throw new Error("Credential link changed");
    return;
  }
  const local = join(checkout, "local");
  await mkdir(local, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  if (await realpath(local) !== local || !(await lstat(local)).isDirectory()) throw new Error("Credential directory redirected");
  await symlink(path, link);
  await appendFile(join(checkout, ".git", "info", "exclude"), `/${pointer.path}\n`);
}

async function companion(checkout, repo, config, resume) {
  const pointer = await credentialPointer(checkout, repo);
  if (!pointer) return;
  const path = await verifyCompanion(config.credentials[repo.credential.reference], pointer);
  await attachCompanion(checkout, pointer, path, resume);
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
    await companion(path, repo, config, resume);
    paths[repo.project] = path;
  }
  return { cwd: paths[workspace.primary], paths };
}
