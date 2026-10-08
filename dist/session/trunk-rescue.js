import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, copyFile, rm } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
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
async function git(root, args, env) {
    const { stdout } = await exec("git", args, {
        cwd: root,
        timeout: 60_000,
        maxBuffer: 20 * 1024 * 1024,
        // Scrubbed first, so a private index passed here is the only override and
        // an inherited hook GIT_DIR/GIT_INDEX_FILE can never aim a reset elsewhere.
        env: { ...gitSubprocessEnv(), ...env },
    });
    return stdout;
}
const gitOk = (root, args) => git(root, args).then(() => true, () => false);
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
/**
 * Parse `git status --porcelain=v1`, with or without `-z`.
 *
 * Every entry is either tracked or untracked: an entry this cannot read is
 * counted as tracked rather than skipped, so a parse failure blocks the
 * fast-forward visibly instead of reading as a clean checkout.
 */
export function parsePorcelain(raw, nul = false) {
    const tracked = [];
    const untracked = [];
    const entries = nul ? raw.split("\0") : raw.split("\n");
    for (let i = 0; i < entries.length; i++) {
        const entry = nul ? entries[i] : entries[i].replace(/\r$/, "");
        if (!entry)
            continue;
        const code = entry.slice(0, 2);
        let path = entry.length > 3 ? entry.slice(3) : entry;
        if (code === "!!")
            continue;
        if (code === "??") {
            untracked.push(unquote(path));
            continue;
        }
        if (code.includes("R") || code.includes("C")) {
            // -z: the original path follows as its own entry. Plain: "old -> new".
            if (nul)
                i++;
            else if (path.includes(" -> "))
                path = path.slice(path.indexOf(" -> ") + 4);
        }
        tracked.push(unquote(path));
    }
    return { tracked, untracked };
}
function unquote(path) {
    if (!(path.startsWith('"') && path.endsWith('"')))
        return path;
    try {
        return JSON.parse(path);
    }
    catch {
        return path.slice(1, -1);
    }
}
const BUILD_SUFFIXES = [".d.ts.map", ".js.map", ".d.ts", ".js"];
const SOURCE_SUFFIXES = [".ts", ".tsx", ".mts", ".cts", ".js"];
/**
 * Where `dist/<path>` would have been compiled from, or `null` when the path
 * is not recognisable build output. `tsc -p tsconfig.build.json` maps
 * `src/x/y.ts` to `dist/x/y.{js,d.ts,js.map,d.ts.map}`.
 */
export function buildSourceCandidates(path) {
    if (!path.startsWith("dist/"))
        return null;
    const rest = path.slice("dist/".length);
    const suffix = BUILD_SUFFIXES.find((s) => rest.endsWith(s));
    if (!suffix)
        return null;
    const stem = rest.slice(0, -suffix.length);
    return SOURCE_SUFFIXES.map((s) => `src/${stem}${s}`);
}
/**
 * Untracked build output whose source no longer exists — the shape that
 * blocked `morpheus self install` on a checkout that had compiled modules
 * later deleted. Safe to delete; reported, never deleted here.
 */
export async function orphanBuildOutputs(root, untracked, exists = (p) => access(join(root, p)).then(() => true, () => false)) {
    const orphans = [];
    for (const path of untracked) {
        const candidates = buildSourceCandidates(path);
        if (!candidates)
            continue;
        let found = false;
        for (const candidate of candidates)
            if (await exists(candidate)) {
                found = true;
                break;
            }
        if (!found)
            orphans.push(path);
    }
    return orphans;
}
/** `stale` once either threshold is crossed; `behind` otherwise; `current` at zero. */
export function lagSeverity(lag, now) {
    if (lag.behind <= 0)
        return "current";
    if (lag.behind > STALE_BEHIND_COMMITS)
        return "stale";
    const days = lagDays(lag, now);
    return days !== null && days > STALE_BEHIND_DAYS ? "stale" : "behind";
}
export function lagDays(lag, now) {
    if (!lag.oldest)
        return null;
    const ms = now.getTime() - Date.parse(lag.oldest);
    return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 86_400_000)) : null;
}
export async function measureLag(root, target) {
    const behind = Number((await git(root, ["rev-list", "--count", `HEAD..${target}`])).trim());
    const oldest = behind > 0
        ? (await git(root, ["log", "--reverse", "--format=%cI", `HEAD..${target}`])).split("\n")[0]?.trim() || null
        : null;
    return { behind, oldest };
}
/** A merge, rebase, cherry-pick, revert or bisect in progress — never rescued mid-operation. */
export async function operationInProgress(root) {
    const markers = [
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
        if (await access(path).then(() => true, () => false))
            return name;
    }
    return null;
}
export async function readDirt(root) {
    return parsePorcelain(await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]), true);
}
/** `wip/trunk-YYYY-MM-DD-<host>`, suffixed `-2`, `-3`… past any name already taken. */
export function wipBranchName(date, host, taken) {
    const base = `wip/trunk-${date}-${host}`;
    if (!taken.has(base))
        return base;
    for (let n = 2;; n++)
        if (!taken.has(`${base}-${n}`))
            return `${base}-${n}`;
}
/** Pacific, like roadmap ids, so two machines name the same day the same way. */
export function pacificDate(now) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Los_Angeles",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}
export function shortHost(raw) {
    return raw.split(".")[0].toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "host";
}
const runCommand = async (command, args, cwd) => {
    try {
        const { stdout, stderr } = await exec(command, args, { cwd, timeout: 60_000, env: gitSubprocessEnv() });
        return { code: 0, stdout, stderr };
    }
    catch (error) {
        const failed = error;
        return { code: typeof failed.code === "number" ? failed.code : 1, stdout: failed.stdout ?? "", stderr: failed.stderr ?? failed.message };
    }
};
const LIST_CAP = 50;
const list = (paths) => paths.slice(0, LIST_CAP).map((p) => `- \`${p.replace(/`/g, "'")}\``).join("\n") +
    (paths.length > LIST_CAP ? `\n- … and ${paths.length - LIST_CAP} more` : "");
export function rescuePrBody(input) {
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
/**
 * Names already used, from local branches and the cached remote-tracking
 * refs only. Deliberately no network call: the name is chosen inside the
 * window between proving the commit and resetting, and nothing slow may sit
 * there. Every rescue leaves its local branch, and a push updates the
 * tracking ref, so this host's earlier rescues are all visible locally; a
 * name taken only on the remote makes the push fail, which keeps the edits
 * on the local branch and says so.
 */
async function takenBranches(root, remote, base) {
    const taken = new Set();
    const refs = await git(root, ["for-each-ref", "--format=%(refname)", `refs/heads/${base}*`, `refs/remotes/${remote}/${base}*`]).catch(() => "");
    for (const line of refs.split("\n")) {
        const ref = line.trim();
        if (ref.startsWith("refs/heads/"))
            taken.add(ref.slice("refs/heads/".length));
        else if (ref.startsWith(`refs/remotes/${remote}/`))
            taken.add(ref.slice(`refs/remotes/${remote}/`.length));
    }
    return taken;
}
/**
 * Paths whose staged content differs from both HEAD and the working tree
 * (`MM`, `AM`, `AD`, `RM`…). Committing the working tree would drop the
 * staged version, so these are refused rather than silently flattened.
 */
export function divergentStaged(raw) {
    const out = [];
    const entries = raw.split("\0");
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.length < 4)
            continue;
        const [x, y] = [entry[0], entry[1]];
        if (x === "R" || x === "C")
            i++;
        if (x !== " " && x !== "?" && x !== "!" && y !== " " && y !== "?" && y !== "!")
            out.push(entry.slice(3));
    }
    return out;
}
/**
 * The one file a human edits by hand to reply to agents. A reply typed on a
 * trunk checkout must reach the session that starts there to read it, so its
 * presence stops the rescue instead of moving it to a draft PR.
 */
export const HUMAN_RECORDS = "hq/team/";
/** `owner/repo` from a GitHub remote URL, or null. */
export function githubRepo(url) {
    const m = url.trim().match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/);
    return m ? `${m[1]}/${m[2]}` : null;
}
/**
 * Move tracked edits on the trunk branch to a WIP branch, reset the checkout
 * to its own HEAD, then push and open a draft pull request. Does not
 * fast-forward; the caller does that once this returns.
 *
 * Everything between proving the commit and resetting is local and fast. The
 * network (push, `gh`) comes after the reset, so a write landing during it —
 * an IDE autosave, Xcode regenerating the project file — lands on the reset
 * tree and survives, instead of being reset away unrecorded.
 */
export async function rescueDirtyTrunk(root, target, deps = {}) {
    const raw = await git(root, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]);
    const dirt = parsePorcelain(raw, true);
    const orphans = await orphanBuildOutputs(root, dirt.untracked);
    if (!dirt.tracked.length)
        return { outcome: "clean", dirt, orphans };
    const skip = (reason) => ({ outcome: "skipped", reason, dirt, orphans });
    const branch = (await git(root, ["rev-parse", "--abbrev-ref", "HEAD"])).trim();
    if (branch !== target.branch)
        return skip(`HEAD is ${branch}, not the trunk branch ${target.branch}`);
    const operation = await operationInProgress(root);
    if (operation)
        return skip(`a ${operation} is in progress`);
    const replies = dirt.tracked.filter((p) => p.startsWith(HUMAN_RECORDS));
    if (replies.length)
        return skip(`${replies.join(", ")} has uncommitted edits, likely inbox replies; commit them on an inbox-<date> branch`);
    const divergent = divergentStaged(raw);
    if (divergent.length)
        return skip(`${divergent.join(", ")} has staged content that differs from the working tree; commit or unstage it`);
    const now = deps.now ?? new Date();
    const host = shortHost(deps.hostname ?? osHostname());
    const date = pacificDate(now);
    const remote = deps.pushRemote ?? "origin";
    const head = (await git(root, ["rev-parse", "HEAD"])).trim();
    const lag = await measureLag(root, target.sha).catch(() => ({ behind: 0, oldest: null }));
    const ahead = Number((await git(root, ["rev-list", "--count", `${target.sha}..HEAD`]).catch(() => "0")).trim()) || 0;
    const wipBranch = wipBranchName(date, host, await takenBranches(root, remote, `wip/trunk-${date}-${host}`));
    // A private index seeded from the real one keeps staged additions and
    // renames; `add -u` then records the working tree's tracked content over
    // it. The user's own index is never written.
    const indexRel = (await git(root, ["rev-parse", "--git-path", "index"])).trim();
    const realIndex = isAbsolute(indexRel) ? indexRel : join(root, indexRel);
    const tempIndex = `${realIndex}.morpheus-rescue-${randomUUID()}`;
    let commit;
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
    }
    catch (error) {
        return skip(`could not record the edits in a commit (${firstLine(error)})`);
    }
    finally {
        await rm(tempIndex, { force: true });
    }
    // The proof that makes the reset safe: every tracked path's working-tree
    // content equals the rescue commit. Anything else — a filter, a submodule,
    // a write racing this — stops here with nothing changed.
    if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
        return skip("the working tree did not match the rescue commit; left untouched");
    }
    try {
        // Empty old-value: create only, never move an existing branch.
        await git(root, ["update-ref", `refs/heads/${wipBranch}`, commit, ""]);
    }
    catch (error) {
        return skip(`could not create ${wipBranch} (${firstLine(error)})`);
    }
    // Proven again immediately before the reset, so the window a write could
    // slip through is two local Git calls wide, not a network round trip.
    if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
        return skip(`the working tree changed while rescuing; nothing was reset (the earlier state is on ${wipBranch})`);
    }
    await git(root, ["reset", "--hard", "--quiet", "HEAD"]);
    const diffstat = await git(root, ["diff", "--stat", head, commit]).catch(() => "");
    let pushed = false;
    let pushError;
    try {
        await git(root, ["push", "--quiet", remote, `refs/heads/${wipBranch}:refs/heads/${wipBranch}`]);
        pushed = true;
    }
    catch (error) {
        pushError = firstLine(error);
    }
    let prUrl;
    let prError;
    if (pushed) {
        const runner = deps.runner ?? runCommand;
        const body = rescuePrBody({ root, host, date, trunk: target.trunk, lag, ahead, diffstat, tracked: dirt.tracked, untracked: dirt.untracked, orphans, now });
        const repoName = root.split(/[\\/]/).filter(Boolean).pop() ?? "repository";
        // On a fork the trunk remote (upstream) is not the push remote (origin):
        // name the base repository and qualify the head with the fork's owner, or
        // gh looks for the branch where it was never pushed.
        const trunkRemote = target.trunk.endsWith(`/${target.branch}`) ? target.trunk.slice(0, -target.branch.length - 1) : remote;
        let repoArgs = [];
        let prHead = wipBranch;
        if (trunkRemote !== remote) {
            const [base, fork] = await Promise.all([
                git(root, ["remote", "get-url", trunkRemote]).then(githubRepo, () => null),
                git(root, ["remote", "get-url", remote]).then(githubRepo, () => null),
            ]);
            if (base && fork) {
                repoArgs = ["--repo", base];
                prHead = `${fork.split("/")[0]}:${wipBranch}`;
            }
        }
        const created = await runner("gh", [
            "pr", "create", "--draft", ...repoArgs, "--base", target.branch, "--head", prHead,
            "--title", `WIP: uncommitted changes rescued from ${repoName} ${target.branch} (${date})`,
            "--body", body,
        ], root);
        if (created.code === 0)
            prUrl = created.stdout.trim().split("\n").pop()?.trim() || undefined;
        else
            prError = (created.stderr || created.stdout || `exit ${created.code}`).trim().split("\n")[0];
    }
    return {
        outcome: "rescued", dirt, orphans, wipBranch, commit, pushed, lag, remote,
        ...(pushError ? { pushError } : {}),
        ...(prUrl ? { prUrl } : {}),
        ...(prError ? { prError } : {}),
    };
}
function firstLine(error) {
    const failed = error;
    return (failed.stderr || failed.message || String(error)).trim().split("\n")[0] ?? "unknown error";
}
/** The one-line-plus-detail report `context brief` prints after a rescue attempt. */
export function formatRescue(result, trunk) {
    const lines = [];
    if (result.outcome === "rescued") {
        const n = result.dirt.tracked.length;
        const where = result.prUrl ? `draft PR ${result.prUrl}` : `branch ${result.wipBranch}`;
        lines.push(`Moved ${n} uncommitted tracked file(s) from dirty trunk to ${where}; trunk reset to its last commit.`);
        if (!result.pushed)
            lines.push(`  ! Push failed (${result.pushError ?? "unknown"}). The edits are safe on local branch ${result.wipBranch}; push it with: git push ${result.remote} ${result.wipBranch}`);
        else if (!result.prUrl)
            lines.push(`  ! Pushed ${result.wipBranch}, but the draft PR was not opened (${result.prError ?? "unknown"}). Open it with: gh pr create --draft --head ${result.wipBranch}`);
    }
    else if (result.outcome === "skipped") {
        lines.push(`!!! TRUNK CHECKOUT IS DIRTY AND WAS NOT RESCUED: ${result.reason}.`);
        lines.push(`    ${result.dirt.tracked.length} tracked edit(s) block fast-forwarding ${trunk}:`);
        for (const p of result.dirt.tracked.slice(0, 10))
            lines.push(`      ${p}`);
        if (result.dirt.tracked.length > 10)
            lines.push(`      … and ${result.dirt.tracked.length - 10} more`);
        lines.push("    Resolve it, then rerun morpheus context brief; it moves tracked trunk edits to a wip/trunk-* draft PR. Never discard them.");
    }
    if (result.dirt.untracked.length) {
        lines.push(`Untracked files left in place (never committed automatically): ${result.dirt.untracked.length}.`);
        if (result.orphans.length) {
            lines.push("  Build output whose source no longer exists — safe to delete:");
            for (const p of result.orphans.slice(0, 10))
                lines.push(`    rm ${shellQuote(p)}`);
            if (result.orphans.length > 10)
                lines.push(`    … and ${result.orphans.length - 10} more`);
        }
    }
    return lines;
}
/** Prominent lag warning for a checkout still behind after startup. */
export function formatLag(lag, trunk, now) {
    const severity = lagSeverity(lag, now);
    if (severity === "current")
        return [];
    const days = lagDays(lag, now);
    const since = days !== null ? `; the oldest missing commit landed ${days} day(s) ago (${lag.oldest?.slice(0, 10)})` : "";
    const head = severity === "stale"
        ? `!!! STALE CHECKOUT: ${lag.behind} commit(s) behind ${trunk}${since}. Instructions and records read here are out of date.`
        : `This checkout is ${lag.behind} commit(s) behind ${trunk}${since}.`;
    return [head];
}
export const shellQuote = (s) => (/^[\w./@+-]+$/.test(s) ? s : `'${s.replace(/'/g, "'\\''")}'`);
//# sourceMappingURL=trunk-rescue.js.map