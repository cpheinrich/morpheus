// Task-owned multi-repository workspaces. One worker conversation may write in several
// repositories, but only in checkouts its task owns: a repository the task already maps keeps
// its checkout, an unowned linked worktree (a claimed task checkout) is adopted, and every
// original checkout, the root's own included, is a read-only source from which an isolated
// worktree is created at its committed HEAD. Directories outside Git are refused. Ownership is recorded in one registry with one writer, and a checkout that is
// nested in, or contains, another task's checkout is refused, so two tasks never share one.
// This is an ownership convention enforced at delegation, not an OS sandbox: a full-access
// worker's shell can still write anywhere its user can.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, realpath, stat } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { home } from "./config.mjs";
import { atomic, key, readJSON } from "./store.mjs";
const exec = promisify(execFile);
export const MAX_TARGETS = 16;

// A git subprocess must act on the directory it is given, never an inherited repository.
function gitEnv() {
  const env = { ...process.env };
  for (const name of Object.keys(env))
    if (/^GIT_(DIR|WORK_TREE|INDEX_FILE|PREFIX|COMMON_DIR|OBJECT_DIRECTORY)$/.test(name))
      delete env[name];
  return env;
}
const git = async (cwd, args) =>
  (await exec("git", ["-C", cwd, ...args], { env: gitEnv(), timeout: 30000 })).stdout.trim();

export const within = (path, directory) => {
  const rel = relative(directory, path);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
};
export const overlaps = (a, b) => within(a, b) || within(b, a);

// Canonical identity of a directory: its realpath, the checkout's top level, the repository
// (the canonical common Git directory, shared by every worktree) and whether it is a linked
// worktree. A directory outside Git is its own repository and checkout.
export async function checkoutInfo(path) {
  const cwd = await realpath(resolve(path));
  try {
    const [top, gitDir, common] = (
      await git(cwd, [
        "rev-parse",
        "--path-format=absolute",
        "--show-toplevel",
        "--git-dir",
        "--git-common-dir",
      ])
    ).split("\n");
    return {
      cwd,
      top: await realpath(top),
      project: await realpath(common),
      linked: (await realpath(gitDir)) !== (await realpath(common)),
      git: true,
    };
  } catch {
    return { cwd, top: cwd, project: cwd, linked: false, git: false };
  }
}

const registryFile = () => join(home(), "workspaces.json");
let writer = Promise.resolve();
// Only a confirmed absence releases a checkout. A permission or I/O error says nothing about
// whether it still exists, so the owner keeps it rather than another task taking it over.
const confirmedMissing = (path) =>
  stat(path).then(
    () => false,
    (error) => error.code === "ENOENT" || error.code === "ENOTDIR",
  );
// The single writer for every task's checkout ownership. A checkout whose directory no longer
// exists (removed with `git worktree remove` or `morpheus pm cleanup`) is released. `check`
// verifies without recording, so a delegation that fails before launch claims nothing.
export function claimCheckouts(taskId, register, { check = false } = {}) {
  const current = writer.catch(() => {}).then(async () => {
    const owners = await readJSON(registryFile(), {});
    for (const path of Object.keys(owners))
      if (await confirmedMissing(path)) delete owners[path];
    for (const { path } of register)
      for (const [owned, owner] of Object.entries(owners))
        if (owner.taskId !== taskId && overlaps(path, owned))
          throw new Error(
            `${path} ${path === owned ? "is" : "overlaps"} a checkout owned by another Factory task (${owned}). Independent tasks never share a checkout; target the original repository to get an isolated worktree, or use another checkout.`,
          );
    if (check) return owners;
    for (const entry of register)
      owners[entry.path] ??= { taskId, project: entry.project, source: entry.source, claimedAt: Date.now() };
    await atomic(registryFile(), owners);
    return owners;
  });
  writer = current;
  return current;
}
export const readOwners = () => readJSON(registryFile(), {});

async function isolatedWorktree(info, destination) {
  if (await stat(destination).then(() => true, () => false)) {
    const existing = await checkoutInfo(destination);
    if (existing.project !== info.project || existing.top !== destination)
      throw new Error(`${destination} exists but is not a worktree of ${info.top}.`);
    return destination;
  }
  await mkdir(join(destination, ".."), { recursive: true, mode: 0o700 });
  // Detached at the committed HEAD: uncommitted edits in the source are never copied, and
  // the worker (or `morpheus pm claim`) chooses its own branch.
  await git(info.cwd, ["worktree", "add", "--detach", destination, "HEAD"]);
  return realpath(destination);
}

/**
 * Resolves explicit targets into a slot's workspace map,
 * `{ [repository]: { path, source, owned: true } }`; every entry is registered to this task.
 * `avoid` holds checkouts another slot of the same task owns (the primary map, for a fresh
 * conversation): an overlapping target becomes a source for an isolated worktree instead.
 * Returns the updated map and the working directory the first target resolved to.
 */
export async function resolveWorkspace({ taskId, slot, map = {}, targets, avoid = [] }) {
  if (targets.length > MAX_TARGETS)
    throw new Error(`At most ${MAX_TARGETS} repository targets are supported per delegation.`);
  assertOwnedMap(map);
  const next = { ...map };
  let first = null;
  for (const target of targets) {
    const info = await checkoutInfo(target);
    const entry = next[info.project];
    let cwd;
    if (entry) {
      // A repository already mapped keeps its checkout. Naming its original or a path inside
      // the mapped checkout resolves there; another linked worktree is a conflicting claim.
      if (within(info.cwd, entry.path)) cwd = info.cwd;
      else if (!info.linked || info.top === entry.source) cwd = entry.path;
      else
        throw new Error(
          `This conversation already owns ${entry.path} for repository ${info.project}; ${info.top} is a different checkout. Use fresh=true for a separate isolated conversation and checkout.`,
        );
    } else {
      if (!info.git)
        throw new Error(
          `${info.cwd} is not a Git checkout. Factory workers write only in task-owned Git checkouts; name a repository with cwd or repos.`,
        );
      if (info.linked && !avoid.some((path) => overlaps(info.top, path))) {
        // A linked worktree is adopted only if no other task owns it (checked when claimed).
        next[info.project] = { path: info.top, source: null, owned: true };
        cwd = info.cwd;
      } else {
        const path = await isolatedWorktree(
          info,
          join(home(), "worktrees", key(taskId), slot, `${basename(info.top)}-${key(info.project).slice(0, 8)}`),
        );
        next[info.project] = { path, source: info.top, owned: true };
        cwd = path;
      }
    }
    first ??= cwd;
  }
  // Every checkout, including earlier ones, is checked against other tasks now and claimed by
  // the caller once the worker has launched.
  const claims = Object.entries(next).map(([project, entry]) => ({ path: entry.path, project, source: entry.source }));
  await claimCheckouts(taskId, claims, { check: true });
  return { map: next, first, claims };
}

// A conversation bound to an original checkout (or a directory outside Git) cannot move: its
// native session resumes only from that directory, and continuing would keep writing a checkout
// other tasks may share. It is refused with the remedy rather than silently preserved.
function assertOwnedMap(map) {
  for (const entry of Object.values(map))
    if (entry.owned !== true)
      throw new Error(
        `This conversation is bound to ${entry.path}, an original checkout or non-Git directory that Factory no longer lets a task write. Start a new root session: its worker gets task-owned worktrees, and this conversation's history stays in the provider's store.`,
      );
}

// Seeds a map from a pre-workspace record that knew only its primary checkout. A linked
// worktree migrates; an original stays unowned and is then refused by resolveWorkspace.
export async function legacyMap(cwd) {
  const info = await checkoutInfo(cwd);
  return { [info.project]: { path: info.top, source: null, owned: info.git && info.linked } };
}

export const checkouts = (map) => Object.values(map ?? {}).map((entry) => entry.path);

// Directories other than the working directory that a worker may write: Claude's --add-dir and
// Codex's writable roots. A linked worktree's Git metadata lives in the shared common directory,
// which commits need. A read-only sandbox receives none of these.
export function extraRoots(map, cwd) {
  const roots = [];
  for (const [project, entry] of Object.entries(map ?? {})) {
    if (!within(cwd, entry.path)) roots.push(entry.path);
    if (project !== entry.path && !within(project, entry.path) && !within(project, cwd)) roots.push(project);
  }
  return [...new Set(roots)];
}

// What the worker is told about its checkouts. A single adopted checkout says nothing new.
export function workspaceNote(map, cwd) {
  const entries = Object.entries(map ?? {});
  if (entries.length < 2 && entries.every(([, entry]) => !entry.source)) return "";
  const lines = entries.map(
    ([project, entry]) =>
      `- ${entry.path} (repository ${project})${entry.source ? `; an isolated worktree of ${entry.source} at its committed HEAD` : ""}`,
  );
  return `Factory workspace for this conversation. Your working directory is ${cwd}. Write only in these task-owned checkouts:\n${lines.join("\n")}\nAny original source checkout named above is reference only: never edit it.`;
}
