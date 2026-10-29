import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { access, copyFile, lstat, rm, writeFile } from "node:fs/promises";
import { hostname as osHostname } from "node:os";
import { isAbsolute, join } from "node:path";
import { promisify } from "node:util";
import { gitSubprocessEnv } from "../git-env.js";
import { defaultVisibilityCache, githubRepo, publishVerdict, rescueRepositories, } from "./repo-visibility.js";
import { classifyChanges, describeChurn, parseLsTree, parseRawDiff } from "./trunk-churn.js";
export { githubRepo };
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
 * a `wip/trunk-<date>-<host>` branch, after which trunk is reset and
 * fast-forwarded. Nothing is discarded — the trunk is reset only after the
 * rescue commit is proven to hold exactly the working tree's tracked content,
 * on a local ref. Only on a repository that reads as private is the branch
 * then pushed and opened as a draft pull request; on a public one, or where
 * visibility cannot be read, it stays local (`repo-visibility.ts`), because
 * whatever was lying in the checkout would otherwise be published.
 *
 * Untracked files are deliberately **never** committed: they are where
 * secrets and build junk live. They are listed, and untracked build output
 * whose source no longer exists is named as safe to delete — never deleted.
 *
 * Not every dirty trunk holds work. When every tracked edit is IDE churn —
 * per-user state, a re-serialised Xcode file, or exactly what trunk already
 * has (`trunk-churn.ts`) — the checkout is reset after the same content proof
 * and reported in one line, with no branch, push or pull request. And when an
 * open rescue already holds an equivalent change, no second one is opened.
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
/**
 * Runs `gh` for real. A command that cannot start (`ENOENT`) has an empty
 * `stderr`, so the error's message stands in for it, or the reason a rescue
 * stayed local would read only "exit 1".
 */
export const runCommand = async (command, args, cwd) => {
    try {
        const { stdout, stderr } = await exec(command, args, { cwd, timeout: 60_000, env: gitSubprocessEnv() });
        return { code: 0, stdout, stderr };
    }
    catch (error) {
        const failed = error;
        return { code: typeof failed.code === "number" ? failed.code : 1, stdout: failed.stdout ?? "", stderr: failed.stderr || failed.message };
    }
};
const LIST_CAP = 50;
const list = (paths) => paths.slice(0, LIST_CAP).map((p) => `- \`${p.replace(/`/g, "'")}\``).join("\n") +
    (paths.length > LIST_CAP ? `\n- … and ${paths.length - LIST_CAP} more` : "");
/**
 * The draft's body. It names the trunk branch and a short host label, never
 * the checkout's absolute path or the full hostname: even on a private
 * repository those say more about the machine than a reviewer needs.
 */
export function rescuePrBody(input) {
    const days = lagDays(input.lag, input.now);
    const lagLine = input.lag.behind
        ? `${input.lag.behind} commit(s) behind ${input.trunk}${days !== null ? `, missing trunk work since ${input.lag.oldest?.slice(0, 10)} (${days} day(s))` : ""}.`
        : `Up to date with ${input.trunk}.`;
    return [
        `Uncommitted tracked edits were found on a \`${input.branch}\` checkout on host \`${input.host}\` by \`morpheus context brief\` on ${input.date}. A dirty trunk cannot fast-forward, so they were moved here and the checkout was reset to trunk. Nothing was discarded.`,
        "",
        `**How far behind the checkout was:** ${lagLine}${input.ahead ? ` It also carried ${input.ahead} local trunk commit(s) not on ${input.trunk}; they are included in this branch's history.` : ""}`,
        "",
        "**This is not a finished change.** `check pr` conventions, review and the roadmap do not apply until someone adopts it: claim or link a roadmap item and move the work onto that item's branch, or close this if the edits were incidental (an IDE rewriting a generated file is the usual cause).",
        // The number is the GitHub Manager's RESCUE_MAX_AGE_DAYS, held equal by a test rather than an
        // import, so session start does not load the manager's policy code.
        ...(input.agesOut
            ? ["", "Nobody needs to triage it: once it has gone 7 days without a push, the GitHub Manager closes it with a note on recovering it. The branch is never deleted."]
            : []),
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
/** Raw bytes: a patch decoded as UTF-8 and written back would corrupt any non-UTF-8 content. */
async function gitBytes(root, args) {
    const { stdout } = await exec("git", args, { cwd: root, timeout: 60_000, maxBuffer: 20 * 1024 * 1024, encoding: "buffer", env: gitSubprocessEnv() });
    return stdout;
}
/**
 * Whether an earlier rescue's change, replayed onto `base`, produces exactly
 * `tree`. That is what "an open rescue already holds these edits" has to
 * mean for the reset to be safe: adopting that pull request gives these files.
 *
 * Comparing the diffs themselves was too strict. Their old blob ids change
 * whenever trunk touches the same file anywhere else, and Evo's project file
 * is touched constantly, so the same Xcode re-sort opened a fresh draft on
 * consecutive days (evo#654, evo#675). Git's `patch-id` is too loose: it
 * ignores whitespace, so a distinct edit could pass for a repeat. Replaying
 * compares outcomes, which is the property the reset depends on.
 */
async function replaysTo(root, base, parent, tip, tree) {
    const indexRel = (await git(root, ["rev-parse", "--git-path", "index"])).trim();
    const stem = `${isAbsolute(indexRel) ? indexRel : join(root, indexRel)}.morpheus-replay-${randomUUID()}`;
    const index = `${stem}.index`;
    const patchFile = `${stem}.patch`;
    try {
        const patch = await gitBytes(root, ["diff", "--binary", "--full-index", "--no-ext-diff", "--no-textconv", "--no-renames", "--no-color", parent, tip, "--"]);
        if (!patch.length)
            return false;
        await writeFile(patchFile, patch);
        await git(root, ["read-tree", base], { GIT_INDEX_FILE: index });
        // Explicit, so a user's `apply.whitespace=fix` cannot rewrite the replay into a match.
        await git(root, ["apply", "--cached", "--binary", "--whitespace=nowarn", patchFile], { GIT_INDEX_FILE: index });
        return (await git(root, ["write-tree"], { GIT_INDEX_FILE: index })).trim() === tree;
    }
    catch {
        return false;
    }
    finally {
        await rm(index, { force: true });
        await rm(patchFile, { force: true });
    }
}
/**
 * Whether trunk's GitHub Manager policy will age this draft out. The manager acts only where
 * `.github/morpheus-gh-manager.json` on the default branch opts in, and most projects have none;
 * there the draft stays open, and its body must not say otherwise. Read from the fetched trunk,
 * as the manager reads it, and loosely: the policy schema lives with the manager.
 */
async function managerClosesRescues(root, trunkSha) {
    try {
        const policy = JSON.parse(await git(root, ["show", `${trunkSha}:.github/morpheus-gh-manager.json`]));
        return policy.enabled !== false && policy.actions?.close !== false;
    }
    catch {
        return false;
    }
}
/**
 * Only the most recent local rescue branches are compared, because each
 * comparison costs several Git calls at startup. Where rescues are published,
 * a draft is closed once it has gone `RESCUE_MAX_AGE_DAYS` untouched (the
 * GitHub Manager's sweep), so an older branch rarely still has the open pull
 * request a duplicate needs there. Where they stay local, a repeat is almost
 * always of a recent rescue: generator churn recurs daily.
 */
const DUPLICATE_CANDIDATES = 20;
/** More changed paths than this are not inspected for churn: a change that wide is not an IDE's. */
const MAX_CLASSIFIED_PATHS = 500;
/**
 * Classify the rescue commit's change against HEAD and the fetched trunk.
 * Null when it cannot be read, which the caller treats as real work.
 */
async function classifyChurn(root, head, commit, trunkSha) {
    const changes = parseRawDiff(await git(root, ["diff", "--raw", "-z", "--no-renames", "--no-abbrev", head, commit]));
    if (!changes.length || changes.length > MAX_CLASSIFIED_PATHS)
        return null;
    // "Already on trunk" is safe only because the fast-forward after the reset brings trunk's
    // version back. A checkout with local trunk commits never fast-forwards, so there it is not
    // offered at all and such an edit is rescued. (A fast-forward Git refuses over an untracked
    // file is reported by the brief; the content is on trunk and in the commit either way.)
    const fastForwards = await gitOk(root, ["merge-base", "--is-ancestor", head, trunkSha]);
    const trunk = fastForwards
        ? parseLsTree(await git(root, ["--literal-pathspecs", "ls-tree", "-r", "-z", trunkSha, "--", ...changes.map((c) => c.path)]))
        : null;
    return classifyChanges(changes, trunk, (blob) => git(root, ["cat-file", "blob", blob]).catch(() => null));
}
/** The remote trunk is fetched from: `upstream` on a fork, else the push remote. */
const trunkRemoteName = (target, remote) => target.trunk.endsWith(`/${target.branch}`) ? target.trunk.slice(0, -target.branch.length - 1) : remote;
async function pullRequestTarget(root, target, remote, branch) {
    const trunkRemote = trunkRemoteName(target, remote);
    const fork = await git(root, ["remote", "get-url", remote]).then(githubRepo, () => null);
    const headOwner = fork?.split("/")[0];
    if (trunkRemote === remote)
        return { repoArgs: [], prHead: branch, ...(headOwner ? { headOwner } : {}) };
    const base = await git(root, ["remote", "get-url", trunkRemote]).then(githubRepo, () => null);
    return base && fork
        ? { repoArgs: ["--repo", base], prHead: `${headOwner}:${branch}`, headOwner }
        : { repoArgs: [], prHead: branch, ...(headOwner ? { headOwner } : {}) };
}
/**
 * An earlier rescue branch that already holds these edits. Where rescues are
 * published (`publish`), a live pushed branch and an open PR must both stand
 * behind a duplicate. Where they stay local, the local branch is the only copy
 * there will ever be, so it stands on its own.
 */
async function duplicateRescueBranch(root, target, remote, head, commit, runner, publish) {
    const tree = (await git(root, ["rev-parse", `${commit}^{tree}`])).trim();
    const refs = (await git(root, ["for-each-ref", "--sort=-committerdate", `--count=${DUPLICATE_CANDIDATES}`, "--format=%(refname:short)", "refs/heads/wip/trunk-*"])).split("\n").filter(Boolean);
    if (!refs.length)
        return null;
    // This network lookup precedes the content proof/reset window. Cached
    // remote-tracking refs survive remote branch deletion and cannot authorize
    // discarding another rescue attempt.
    let live = null;
    if (publish) {
        const pushUrl = (await git(root, ["remote", "get-url", "--push", remote])).trim();
        live = new Map((await git(root, ["ls-remote", "--heads", pushUrl, "refs/heads/wip/trunk-*"]))
            .split("\n").filter(Boolean).map((line) => {
            const [sha, ref] = line.split("\t");
            return [ref?.slice("refs/heads/".length), sha];
        }));
    }
    for (const branch of refs) {
        const local = `refs/heads/${branch}`;
        const localSha = (await git(root, ["rev-parse", local]).catch(() => "")).trim();
        if (!localSha || (live && live.get(branch) !== localSha))
            continue;
        const parent = (await git(root, ["rev-parse", "-q", "--verify", `${local}^`]).catch(() => "")).trim();
        if (!parent || !(await replaysTo(root, head, parent, localSha, tree)))
            continue;
        if (!publish)
            return { branch };
        const { repoArgs, headOwner } = await pullRequestTarget(root, target, remote, branch);
        // Unlike `pr create`, `pr list --head` rejects owner:branch. Filter
        // the owner from the returned JSON after selecting the plain branch.
        const listed = await runner("gh", ["pr", "list", ...repoArgs, "--state", "open", "--head", branch, "--json", "url,headRefName,headRepositoryOwner", "--limit", "100"], root);
        if (listed.code !== 0)
            continue;
        const prs = JSON.parse(listed.stdout);
        const found = prs.find((pr) => pr.headRefName === branch && (!headOwner || pr.headRepositoryOwner?.login === headOwner) && /^https:\/\/github\.com\//.test(pr.url ?? ""));
        if (found?.url)
            return { branch, prUrl: found.url };
    }
    return null;
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
 * Paths removed from the index whose file is still on disk — `git rm --cached`,
 * or the source side of a staged rename that was copied rather than moved.
 * The rescue commit records only the removal, the content proof cannot see an
 * untracked file, and `reset --hard` then writes HEAD's version over it. So
 * these are refused before anything is committed or reset: the file on disk
 * is the one thing no branch would hold.
 */
export async function stagedRemovalsOnDisk(root, raw) {
    const removed = [];
    const entries = raw.split("\0");
    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        if (entry.length < 4)
            continue;
        const [x, y] = [entry[0], entry[1]];
        // An unstaged deletion normally has nothing on disk; something there (a directory where the
        // file was) would equally be in the reset's way, so it is checked the same way.
        if (x === "D" || y === "D")
            removed.push(entry.slice(3));
        if (x === "R") {
            const source = entries[i + 1];
            if (source)
                removed.push(source);
            i++;
        }
        else if (x === "C")
            i++;
    }
    const present = [];
    // lstat, not stat: a symlink left in place is still something a reset would replace.
    for (const path of removed)
        if (await lstat(join(root, path)).then(() => true, () => false))
            present.push(path);
    return present;
}
/**
 * The one file a human edits by hand to reply to agents. A reply typed on a
 * trunk checkout must reach the session that starts there to read it, so its
 * presence stops the rescue instead of moving it to a draft PR.
 */
export const HUMAN_RECORDS = "hq/team/";
/**
 * Move tracked edits on the trunk branch to a WIP branch and reset the
 * checkout to its own HEAD; then, only on a private repository, push the
 * branch and open a draft pull request. Does not fast-forward; the caller
 * does that once this returns.
 *
 * Everything between proving the commit and resetting is local and fast. The
 * network (visibility, duplicate lookup) runs before the proof, and the push
 * and `gh pr create` after the reset, so a write landing during either — an
 * IDE autosave, Xcode regenerating the project file — is caught by the proof
 * or lands on the reset tree and survives, instead of being reset away.
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
    const kept = await stagedRemovalsOnDisk(root, raw);
    if (kept.length)
        return skip(`${kept.slice(0, 5).join(", ")}${kept.length > 5 ? ` and ${kept.length - 5} more` : ""} removed from the index but still on disk (git rm --cached), which a reset would overwrite; commit the removal on a branch, or undo it with git restore --staged`);
    const now = deps.now ?? new Date();
    const host = shortHost(deps.hostname ?? osHostname());
    const date = pacificDate(now);
    const remote = deps.pushRemote ?? "origin";
    const runner = deps.runner ?? runCommand;
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
        // A short host label and the branch, never the absolute checkout path:
        // this message travels wherever the branch is pushed.
        const message = [
            `WIP: uncommitted changes rescued from dirty ${target.branch}`,
            "",
            `Auto-moved by morpheus context brief on ${date} from a ${target.branch}`,
            `checkout on ${host}. The edits blocked fast-forwarding ${target.trunk};`,
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
    // Churn is decided on the commit, not the live files, so what is classified
    // is exactly what the proof below compares and the reset then discards.
    const classified = await classifyChurn(root, head, commit, target.sha).catch(() => null);
    if (classified && classified.churn.length && !classified.real.length) {
        if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
            return skip("the working tree changed while it was being classified; left untouched");
        }
        await git(root, ["reset", "--hard", "--quiet", "HEAD"]);
        return { outcome: "churn", dirt, orphans, churn: classified.churn, commit };
    }
    // Whether this rescue may leave the machine. Decided before the proof/reset
    // window like every other network call; any failure keeps it local.
    const trunkRemote = trunkRemoteName(target, remote);
    const cache = deps.visibilityCache === false ? null : deps.visibilityCache ?? await defaultVisibilityCache(root).catch(() => null);
    const verdict = await publishVerdict(root, await rescueRepositories(root, remote, trunkRemote), runner, now, cache)
        .catch(() => ({ publish: false, repos: [], reason: "the repository's visibility could not be read" }));
    // Lookup runs before the proof/reset window; it never places a network call
    // between a successful proof and the destructive reset.
    const duplicate = await duplicateRescueBranch(root, target, remote, head, commit, runner, verdict.publish).catch(() => null);
    // The proof that makes the reset safe: every tracked path's working-tree
    // content equals the rescue commit. Anything else — a filter, a submodule,
    // a write racing this — stops here with nothing changed.
    if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
        return skip("the working tree did not match the rescue commit; left untouched");
    }
    // Dedupe is opportunistic: a malformed or oversized old branch must never
    // stop the ordinary rescue path.
    if (duplicate) {
        if (!(await gitOk(root, ["diff", "--quiet", commit, "--"]))) {
            return skip("the working tree changed while checking a prior rescue; nothing was reset");
        }
        await git(root, ["reset", "--hard", "--quiet", "HEAD"]);
        return { outcome: "duplicate", dirt, orphans, existingBranch: duplicate.branch, ...(duplicate.prUrl ? { prUrl: duplicate.prUrl } : {}) };
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
    if (!verdict.publish) {
        // Never pushed and never deleted here: this branch is the only copy.
        return { outcome: "rescued", dirt, orphans, wipBranch, commit, pushed: false, lag, remote, diffstat, keptLocal: verdict.reason ?? "the repository is not known to be private" };
    }
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
        const agesOut = await managerClosesRescues(root, target.sha);
        const body = rescuePrBody({ branch: target.branch, host, date, trunk: target.trunk, lag, ahead, diffstat, tracked: dirt.tracked, untracked: dirt.untracked, orphans, now, agesOut });
        const repoName = root.split(/[\\/]/).filter(Boolean).pop() ?? "repository";
        // On a fork the trunk remote (upstream) is not the push remote (origin):
        // name the base repository and qualify the head with the fork's owner, or
        // gh looks for the branch where it was never pushed.
        const { repoArgs, prHead } = await pullRequestTarget(root, target, remote, wipBranch);
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
        outcome: "rescued", dirt, orphans, wipBranch, commit, pushed, lag, remote, diffstat,
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
    if (result.outcome === "rescued" && result.keptLocal !== undefined) {
        const branch = shellQuote(result.wipBranch);
        lines.push(`Moved ${result.dirt.tracked.length} uncommitted tracked file(s) from dirty trunk to local branch ${result.wipBranch}; trunk reset to its last commit.`);
        lines.push(`  Not pushed, and no PR opened: ${result.keptLocal}. The edits exist only in this clone.`);
        lines.push(...diffstatLines(result.diffstat).map((l) => `    ${l}`));
        lines.push(`  Recover them with git switch ${branch}, or git cherry-pick ${branch} onto another branch.`);
        lines.push(`  To publish deliberately: git push ${shellQuote(result.remote)} ${branch}, then gh pr create --draft --head ${branch}.`);
    }
    else if (result.outcome === "rescued") {
        const n = result.dirt.tracked.length;
        const where = result.prUrl ? `draft PR ${result.prUrl}` : `branch ${result.wipBranch}`;
        lines.push(`Moved ${n} uncommitted tracked file(s) from dirty trunk to ${where}; trunk reset to its last commit.`);
        if (!result.pushed)
            lines.push(`  ! Push failed (${result.pushError ?? "unknown"}). The edits are safe on local branch ${result.wipBranch}; push it with: git push ${result.remote} ${result.wipBranch}`);
        else if (!result.prUrl)
            lines.push(`  ! Pushed ${result.wipBranch}, but the draft PR was not opened (${result.prError ?? "unknown"}). Open it with: gh pr create --draft --head ${result.wipBranch}`);
    }
    else if (result.outcome === "churn") {
        lines.push(`Reset ${result.churn.length} tracked file(s) of IDE churn on trunk instead of opening a rescue PR (${describeChurn(result.churn)}); recoverable with git checkout ${result.commit.slice(0, 12)} -- <path> until Git prunes it.`);
    }
    else if (result.outcome === "duplicate") {
        lines.push(result.prUrl
            ? `Same tracked edits were already rescued in open PR ${result.prUrl} (${result.existingBranch}); trunk reset without another PR.`
            : `Same tracked edits are already on local branch ${result.existingBranch}; trunk reset without another branch.`);
        lines.push("  ! Repeated generator edits: commit the form the tool writes, or stop opening this trunk checkout in that tool.");
    }
    else if (result.outcome === "skipped") {
        lines.push(`!!! TRUNK CHECKOUT IS DIRTY AND WAS NOT RESCUED: ${result.reason}.`);
        lines.push(`    ${result.dirt.tracked.length} tracked edit(s) block fast-forwarding ${trunk}:`);
        for (const p of result.dirt.tracked.slice(0, 10))
            lines.push(`      ${p}`);
        if (result.dirt.tracked.length > 10)
            lines.push(`      … and ${result.dirt.tracked.length - 10} more`);
        lines.push("    Resolve it, then rerun morpheus context brief; it moves tracked trunk edits to a wip/trunk-* branch. Never discard them.");
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
/** A `git diff --stat`, capped: the first ten file lines and the summary. */
function diffstatLines(diffstat) {
    const all = diffstat.split("\n").map((l) => l.trim()).filter(Boolean);
    if (all.length <= 11)
        return all;
    return [...all.slice(0, 10), `… and ${all.length - 11} more file(s)`, all.at(-1)];
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