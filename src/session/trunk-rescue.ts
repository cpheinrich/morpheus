import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, copyFile, rm } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";

/**
 * A dirty trunk checkout is a stuck checkout.
 *
 * `context brief` fast-forwards only a clean trunk, which is correct, and for
 * three weeks it was also the whole story: an Xcode-regenerated
 * `project.pbxproj` in ~/code/lakina left its main checkout 188 commits behind
 * while every session read a one-line "behind; existing edits preserved" and
 * carried on. Nothing broke visibly, because agents worked in fresh worktrees;
 * the sessions that did open the main checkout read stale instructions.
 *
 * So the brief now *acts*: tracked edits on the trunk branch are committed to
 * a `wip/trunk-<date>-<host>` branch, pushed, and opened as a draft pull
 * request, after which trunk is reset and fast-forwarded. Nothing is
 * discarded — the trunk is reset only after the rescue commit is proven to
 * hold exactly the working tree's tracked content, on a local ref.
 *
 * Untracked files are deliberately **never** committed: they are where
 * secrets and build junk live. They are listed, and untracked build output
 * whose source no longer exists is named as safe to delete — never deleted.
 */

const exec = promisify(execFile);

async function git(root: string, args: string[], env?: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await exec("git", args, {
    cwd: root,
    timeout: 60_000,
    maxBuffer: 20 * 1024 * 1024,
    ...(env ? { env: { ...process.env, ...env } } : {}),
  });
  return stdout;
}
const gitOk = (root: string, args: string[]): Promise<boolean> =>
  git(root, args).then(() => true, () => false);

/**
 * Over this many missing trunk commits, or this many days since the oldest of
 * them landed, a behind checkout stops being "a session that has not pulled
 * yet" and becomes a stuck one. Twenty commits is a busy day across this
 * fleet; three days is longer than any healthy checkout goes without a
 * session-start fetch. Lakina's incident was 188 commits and 23 days, so
 * either threshold alone would have fired within the first week.
 */
export const STALE_BEHIND_COMMITS = 20;
export const STALE_BEHIND_DAYS = 3;

export interface TrunkDirt {
  /** Staged or unstaged modifications, deletions, renames and additions to the index. */
  tracked: string[];
  /** Untracked, non-ignored files. */
  untracked: string[];
}

/**
 * Parse `git status --porcelain=v1`, with or without `-z`.
 *
 * Every entry is either tracked or untracked: an entry this cannot read is
 * counted as tracked rather than skipped, so a parse failure blocks the
 * fast-forward visibly instead of reading as a clean checkout.
 */
export function parsePorcelain(raw: string, nul = false): TrunkDirt {
  const tracked: string[] = [];
  const untracked: string[] = [];
  const entries = nul ? raw.split("\0") : raw.split("\n");
  for (let i = 0; i < entries.length; i++) {
    const entry = nul ? entries[i]! : entries[i]!.replace(/\r$/, "");
    if (!entry) continue;
    const code = entry.slice(0, 2);
    let path = entry.length > 3 ? entry.slice(3) : entry;
    if (code === "!!") continue;
    if (code === "??") {
      untracked.push(unquote(path));
      continue;
    }
    if (code.includes("R") || code.includes("C")) {
      // -z: the original path follows as its own entry. Plain: "old -> new".
      if (nul) i++;
      else if (path.includes(" -> ")) path = path.slice(path.indexOf(" -> ") + 4);
    }
    tracked.push(unquote(path));
  }
  return { tracked, untracked };
}

function unquote(path: string): string {
  if (!(path.startsWith('"') && path.endsWith('"'))) return path;
  try {
    return JSON.parse(path) as string;
  } catch {
    return path.slice(1, -1);
  }
}

const BUILD_SUFFIXES = [".d.ts.map", ".js.map", ".d.ts", ".js"] as const;
const SOURCE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".js"] as const;

/**
 * Where `dist/<path>` would have been compiled from, or `null` when the path
 * is not recognisable build output. `tsc -p tsconfig.build.json` maps
 * `src/x/y.ts` to `dist/x/y.{js,d.ts,js.map,d.ts.map}`.
 */
export function buildSourceCandidates(path: string): string[] | null {
  if (!path.startsWith("dist/")) return null;
  const rest = path.slice("dist/".length);
  const suffix = BUILD_SUFFIXES.find((s) => rest.endsWith(s));
  if (!suffix) return null;
  const stem = rest.slice(0, -suffix.length);
  return SOURCE_SUFFIXES.map((s) => `src/${stem}${s}`);
}

/**
 * Untracked build output whose source no longer exists — the shape that
 * blocked `morpheus self install` on a checkout that had compiled modules
 * later deleted. Safe to delete; reported, never deleted here.
 */
export async function orphanBuildOutputs(
  root: string,
  untracked: string[],
  exists: (path: string) => Promise<boolean> = (p) => access(join(root, p)).then(() => true, () => false),
): Promise<string[]> {
  const orphans: string[] = [];
  for (const path of untracked) {
    const candidates = buildSourceCandidates(path);
    if (!candidates) continue;
    let found = false;
    for (const candidate of candidates) if (await exists(candidate)) { found = true; break; }
    if (!found) orphans.push(path);
  }
  return orphans;
}

export interface Lag {
  behind: number;
  /** ISO commit date of the oldest trunk commit this checkout lacks. */
  oldest: string | null;
}

export type LagSeverity = "current" | "behind" | "stale";

/** `stale` once either threshold is crossed; `behind` otherwise; `current` at zero. */
export function lagSeverity(lag: Lag, now: Date): LagSeverity {
  if (lag.behind <= 0) return "current";
  if (lag.behind > STALE_BEHIND_COMMITS) return "stale";
  const days = lagDays(lag, now);
  return days !== null && days > STALE_BEHIND_DAYS ? "stale" : "behind";
}

export function lagDays(lag: Lag, now: Date): number | null {
  if (!lag.oldest) return null;
  const ms = now.getTime() - Date.parse(lag.oldest);
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}

export async function measureLag(root: string, target: string): Promise<Lag> {
  const behind = Number((await git(root, ["rev-list", "--count", `HEAD..${target}`])).trim());
  const oldest = behind > 0
    ? (await git(root, ["log", "--reverse", "--format=%cI", `HEAD..${target}`])).split("\n")[0]?.trim() || null
    : null;
  return { behind, oldest };
}

/** A merge, rebase, cherry-pick, revert or bisect in progress — never rescued mid-operation. */
export async function operationInProgress(root: string): Promise<string | null> {
  const markers: Array<[string, string]> = [
    ["MERGE_HEAD", "merge"],
    ["rebase-merge", "rebase"],
    ["rebase-apply", "rebase"],
    ["CHERRY_PICK_HEAD", "cherry-pick"],
    ["REVERT_HEAD", "revert"],
    ["BISECT_LOG", "bisect"],
  ];
  for (const [marker, name] of markers) {
    const rel = (await git(root, ["rev-parse", "--git-path", marker])).trim();
    const path = isAbsolute(rel) ? rel : join(root, rel);
    if (await access(path).then(() => true, () => false)) return name;
  }
  return null;
}

export async function readDirt(root: string): Promise<TrunkDirt> {
  return parsePorcelain(await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), true);
}

/** `wip/trunk-YYYY-MM-DD-<host>`, suffixed `-2`, `-3`… past any name already taken. */
export function wipBranchName(date: string, host: string, taken: ReadonlySet<string>): string {
  const base = `wip/trunk-${date}-${host}`;
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
}

/** Pacific, like roadmap ids, so two machines name the same day the same way. */
export function pacificDate(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shortHost(raw: string): string {
  return raw.split(".")[0]!.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "host";
}

export interface CommandResult { code: number; stdout: string; stderr: string }
export type CommandRunner = (command: string, args: string[], cwd: string) => Promise<CommandResult>;

const runCommand: CommandRunner = async (command, args, cwd) => {
  try {
    const { stdout, stderr } = await exec(command, args, { cwd, timeout: 60_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    const failed = error as Error & { code?: number | string; stdout?: string; stderr?: string };
    return { code: typeof failed.code === "number" ? failed.code : 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? failed.message };
  }
};

export interface RescueDeps {
  /** Runs `gh`; injectable so tests never reach GitHub. */
  runner?: CommandRunner;
  hostname?: string;
  now?: Date;
  /** The remote the WIP branch is pushed to. Defaults to `origin`. */
  pushRemote?: string;
}

export interface TrunkTarget {
  /** e.g. `origin/main`, for messages. */
  trunk: string;
  /** e.g. `main`. */
  branch: string;
  /** The fetched trunk commit. */
  sha: string;
}

export type RescueResult =
  | { outcome: "clean"; dirt: TrunkDirt; orphans: string[] }
  | { outcome: "skipped"; reason: string; dirt: TrunkDirt; orphans: string[] }
  | {
      outcome: "rescued";
      dirt: TrunkDirt;
      orphans: string[];
      wipBranch: string;
      commit: string;
      pushed: boolean;
      pushError?: string;
      prUrl?: string;
      prError?: string;
      lag: Lag;
    };

const LIST_CAP = 50;
const list = (paths: string[]): string =>
  paths.slice(0, LIST_CAP).map((p) => `- \`${p.replace(/`/g, "'")}\``).join("\n") +
  (paths.length > LIST_CAP ? `\n- … and ${paths.length - LIST_CAP} more` : "");

export function rescuePrBody(input: {
  root: string; host: string; date: string; trunk: string; lag: Lag; ahead: number;
  diffstat: string; tracked: string[]; untracked: string[]; orphans: string[]; now: Date;
}): string {
  const days = lagDays(input.lag, input.now);
  const lagLine = input.lag.behind
    ? `${input.lag.behind} commit(s) behind ${input.trunk}${days !== null ? `, missing trunk work since ${input.lag.oldest?.slice(0, 10)} (${days} day(s))` : ""}.`
    : `Up to date with ${input.trunk}.`;
  return [
    `Uncommitted tracked edits were found on the trunk checkout \`${input.root}\` on \`${input.host}\` by \`morpheus context brief\` on ${input.date}. A dirty trunk cannot fast-forward, so they were moved here and the checkout was reset to trunk. Nothing was discarded.`,
    "",
    `**How far behind the checkout was:** ${lagLine}${input.ahead ? ` It also carried ${input.ahead} local trunk commit(s) not on ${input.trunk}; they are included in this branch's history.` : ""}`,
    "",
    "**This is not a finished change.** `check pr` conventions, review and the roadmap do not apply until someone adopts it: claim or link a roadmap item and move the work onto that item's branch, or close this if the edits were incidental (an IDE rewriting a generated file is the usual cause).",
    "",
    "## Moved files",
    "",
    list(input.tracked),
    "",
    "```",
    input.diffstat.trim() || "(no diffstat)",
    "```",
    ...(input.untracked.length
      ? ["", "## Untracked files left in place", "", "Never committed automatically — that is where secrets and build output live.", "", list(input.untracked)]
      : []),
    ...(input.orphans.length
      ? ["", "Of those, this is build output whose source no longer exists and is safe to delete:", "", list(input.orphans)]
      : []),
  ].join("\n");
}

async function takenBranches(root: string, remote: string, base: string): Promise<Set<string>> {
  const taken = new Set<string>();
  const local = await git(root, ["for-each-ref", "--format=%(refname:short)", `refs/heads/${base}*`]).catch(() => "");
  for (const line of local.split("\n")) if (line.trim()) taken.add(line.trim());
  const remoteHeads = await git(root, ["ls-remote", "--heads", remote, `${base}*`]).catch(() => "");
  for (const line of remoteHeads.split("\n")) {
    const ref = line.split(/\s+/)[1];
    if (ref?.startsWith("refs/heads/")) taken.add(ref.slice("refs/heads/".length));
  }
  return taken;
}

/**
 * Move tracked edits on the trunk branch to a pushed WIP branch and a draft
 * pull request, then reset the checkout to its own HEAD. Does not fast-forward;
 * the caller does that once this returns.
 */
export async function rescueDirtyTrunk(root: string, target: TrunkTarget, deps: RescueDeps = {}): Promise<RescueResult> {
  const dirt = await readDirt(root);
  const orphans = await orphanBuildOutputs(root, dirt.untracked);
  if (!dirt.tracked.length) return { outcome: "clean", dirt, orphans };

  const skip = (reason: string): RescueResult => ({ outcome: "skipped", reason, dirt, orphans });
  const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
  if (branch !== target.branch) return skip(`HEAD is ${branch}, not the trunk branch ${target.branch}`);
  const operation = await operationInProgress(root);
  if (operation) return skip(`a ${operation} is in progress`);

  const now = deps.now ?? new Date();
  const host = shortHost(deps.hostname ?? osHostname());
  const date = pacificDate(now);
  const remote = deps.pushRemote ?? "origin";
  const head = (await git(root, ["rev-parse", "HEAD"])).trim();

  // A private index seeded from the real one keeps staged additions and
  // renames; `add -u` then records the working tree's tracked content over
  // it. The user's own index is never written.
  const indexRel = (await git(root, ["rev-parse", "--git-path", "index"])).trim();
  const realIndex = isAbsolute(indexRel) ? indexRel : join(root, indexRel);
  const tempIndex = `${realIndex}.morpheus-rescue-${randomUUID()}`;
  let commit: string;
  try {
    await copyFile(realIndex, tempIndex).catch(async () => { await git(root, ["read-tree", "HEAD"], { GIT_INDEX_FILE: tempIndex }); });
    await git(root, ["add", "-u"], { GIT_INDEX_FILE: tempIndex });
    const tree = (await git(root, ["write-tree"], { GIT_INDEX_FILE: tempIndex })).trim();
    const message = [
      `WIP: uncommitted changes rescued from dirty ${target.branch}`,
      "",
      `Auto-moved by morpheus context brief on ${date} from the trunk checkout`,
      `${root} on ${host}. The edits blocked fast-forwarding ${target.trunk};`,
      "the checkout was reset to trunk only after this commit held them.",
    ].join("\n");
    commit = (await git(root, ["commit-tree", tree, "-p", head, "-m", message])).trim();
  } catch (error) {
    return skip(`could not record the edits in a commit (${firstLine(error)})`);
  } finally {
    await rm(tempIndex, { force: true });
  }

  // The proof that makes the reset safe: every tracked path's working-tree
  // content equals the rescue commit. Anything else — a filter, a submodule,
  // a write racing this — stops here with nothing changed.
  if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
    return skip("the working tree did not match the rescue commit; left untouched");
  }

  const wipBranch = wipBranchName(date, host, await takenBranches(root, remote, `wip/trunk-${date}-${host}`));
  try {
    // Empty old-value: create only, never move an existing branch.
    await git(root, ["update-ref", `refs/heads/${wipBranch}`, commit, ""]);
  } catch (error) {
    return skip(`could not create ${wipBranch} (${firstLine(error)})`);
  }

  const lag = await measureLag(root, target.sha).catch((): Lag => ({ behind: 0, oldest: null }));
  const ahead = Number((await git(root, ["rev-list", "--count", `${target.sha}..HEAD`]).catch(() => "0")).trim()) || 0;
  const diffstat = await git(root, ["diff", "--stat", head, commit]).catch(() => "");

  let pushed = false;
  let pushError: string | undefined;
  try {
    await git(root, ["push", "--quiet", remote, `refs/heads/${wipBranch}:refs/heads/${wipBranch}`]);
    pushed = true;
  } catch (error) {
    pushError = firstLine(error);
  }

  let prUrl: string | undefined;
  let prError: string | undefined;
  if (pushed) {
    const runner = deps.runner ?? runCommand;
    const body = rescuePrBody({ root, host, date, trunk: target.trunk, lag, ahead, diffstat, tracked: dirt.tracked, untracked: dirt.untracked, orphans, now });
    const repoName = root.split(/[\\/]/).filter(Boolean).pop() ?? "repository";
    const created = await runner("gh", [
      "pr", "create", "--draft", "--base", target.branch, "--head", wipBranch,
      "--title", `WIP: uncommitted changes rescued from ${repoName} ${target.branch} (${date})`,
      "--body", body,
    ], root);
    if (created.code === 0) prUrl = created.stdout.trim().split("\n").pop()?.trim() || undefined;
    else prError = (created.stderr || created.stdout || `exit ${created.code}`).trim().split("\n")[0];
  }

  // Safe now: the content is on a local ref (and pushed when the push worked).
  await git(root, ["reset", "--hard", "--quiet", "HEAD"]);
  return {
    outcome: "rescued", dirt, orphans, wipBranch, commit, pushed, lag,
    ...(pushError ? { pushError } : {}),
    ...(prUrl ? { prUrl } : {}),
    ...(prError ? { prError } : {}),
  };
}

function firstLine(error: unknown): string {
  const failed = error as { stderr?: string; message?: string };
  return (failed.stderr || failed.message || String(error)).trim().split("\n")[0] ?? "unknown error";
}

/** The one-line-plus-detail report `context brief` prints after a rescue attempt. */
export function formatRescue(result: RescueResult, trunk: string): string[] {
  const lines: string[] = [];
  if (result.outcome === "rescued") {
    const n = result.dirt.tracked.length;
    const where = result.prUrl ? `draft PR ${result.prUrl}` : `branch ${result.wipBranch}`;
    lines.push(`Moved ${n} uncommitted tracked file(s) from dirty trunk to ${where}; trunk reset to its last commit.`);
    if (!result.pushed) lines.push(`  ! Push failed (${result.pushError ?? "unknown"}). The edits are safe on local branch ${result.wipBranch}; push it with: git push origin ${result.wipBranch}`);
    else if (!result.prUrl) lines.push(`  ! Pushed ${result.wipBranch}, but the draft PR was not opened (${result.prError ?? "unknown"}). Open it with: gh pr create --draft --head ${result.wipBranch}`);
  } else if (result.outcome === "skipped") {
    lines.push(`!!! TRUNK CHECKOUT IS DIRTY AND WAS NOT RESCUED: ${result.reason}.`);
    lines.push(`    ${result.dirt.tracked.length} tracked edit(s) block fast-forwarding ${trunk}:`);
    for (const p of result.dirt.tracked.slice(0, 10)) lines.push(`      ${p}`);
    if (result.dirt.tracked.length > 10) lines.push(`      … and ${result.dirt.tracked.length - 10} more`);
    lines.push("    Resolve it, then rerun morpheus context brief; it moves tracked trunk edits to a wip/trunk-* draft PR. Never discard them.");
  }
  if (result.dirt.untracked.length) {
    lines.push(`Untracked files left in place (never committed automatically): ${result.dirt.untracked.length}.`);
    if (result.orphans.length) {
      lines.push("  Build output whose source no longer exists — safe to delete:");
      for (const p of result.orphans.slice(0, 10)) lines.push(`    rm ${shellQuote(p)}`);
      if (result.orphans.length > 10) lines.push(`    … and ${result.orphans.length - 10} more`);
    }
  }
  return lines;
}

/** Prominent lag warning for a checkout still behind after startup. */
export function formatLag(lag: Lag, trunk: string, now: Date): string[] {
  const severity = lagSeverity(lag, now);
  if (severity === "current") return [];
  const days = lagDays(lag, now);
  const since = days !== null ? `; the oldest missing commit landed ${days} day(s) ago (${lag.oldest?.slice(0, 10)})` : "";
  const head = severity === "stale"
    ? `!!! STALE CHECKOUT: ${lag.behind} commit(s) behind ${trunk}${since}. Instructions and records read here are out of date.`
    : `This checkout is ${lag.behind} commit(s) behind ${trunk}${since}.`;
  return [head];
}

export const shellQuote = (s: string): string => (/^[\w./@+-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
