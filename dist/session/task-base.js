import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import matter from "@11ty/gray-matter";
import { gitSubprocessEnv } from "../git-env.js";
import { roadmapIdFromBranch } from "../pm/id.js";
import { TASK_BASE } from "../pm/schema.js";
import { resolveTrunk } from "./git.js";
import { projectPolicy } from "./policy.js";
/**
 * A task's base: the branch its work integrates into.
 *
 * Normally the project trunk. A release fix is claimed with `pm claim <ID> --base <branch>`
 * and integrates into that protected branch instead (Evo's `release/ios-<A12>`, cut from
 * trunk when staging starts and merged back after delivery). Its checkout must contain that
 * branch and never be asked to contain trunk work that landed after the cut: merging it
 * would put unreleased changes into a frozen release.
 *
 * The base travels with the task. Claiming writes it as `base:` in the item's frontmatter
 * on the task branch, so `pm resume` on any machine finds it. Before the claim, a prepared
 * detached checkout has no task branch, so its preparation marker carries the base.
 *
 * Every lookup that cannot be answered throws. A base that was declared and cannot be read
 * must never quietly become the trunk.
 */
const exec = promisify(execFile);
const git = async (root, args) => (await exec("git", args, { cwd: root, timeout: 30_000, env: gitSubprocessEnv() })).stdout.trim();
/** The project's own trunk, ignoring any task base. */
export async function projectTrunk(root) {
    return resolveTrunk(root, (await projectPolicy(root)).trunk);
}
/** The branch this checkout's task integrates into, on the trunk's remote. */
export async function taskTrunk(root) {
    const trunk = await projectTrunk(root);
    const base = await declaredBase(root);
    return base ? { remote: trunk.remote, branch: base } : trunk;
}
/** The declared base, or null when the task (or checkout) uses the trunk. */
export async function declaredBase(root) {
    let branch;
    try {
        branch = await git(root, ["branch", "--show-current"]);
    }
    catch (error) {
        // Outside any Git work tree there is no task to declare a base, and the trunk lookup
        // already answers for such a directory. Inside one, a failed read is a failure.
        if (await git(root, ["rev-parse", "--is-inside-work-tree"]).then(() => false, () => true))
            return null;
        throw error;
    }
    const id = roadmapIdFromBranch(branch);
    if (id)
        return itemBase(root, id);
    if (branch)
        return null;
    return (await preparedBase(root)) ?? null;
}
/**
 * The base a prepared detached checkout was made for: `undefined` when no preparation
 * marker names this checkout, `null` when it was prepared from the trunk.
 */
export async function preparedBase(root) {
    const top = await realpath(await git(root, ["rev-parse", "--show-toplevel"]));
    const common = await realpath(resolve(top, await git(top, ["rev-parse", "--git-common-dir"])));
    // Same key as `sessionKey` in start.ts, which writes the marker in tasks.ts.
    const key = createHash("sha256").update(top).digest("hex");
    let raw;
    try {
        raw = await readFile(join(common, "morpheus-temporary-worktrees", `${key}.json`), "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return undefined;
        throw error;
    }
    const base = JSON.parse(raw).base;
    if (base === undefined)
        return null;
    if (typeof base !== "string" || !TASK_BASE.test(base))
        throw new Error(`Invalid task base in the preparation marker for ${top}.`);
    return base;
}
/** The `base:` of the task's own item, found by its id among tracked roadmap files. */
async function itemBase(root, id) {
    const top = await git(root, ["rev-parse", "--show-toplevel"]);
    const paths = (await git(top, ["ls-files", "-z", "--", `:(glob)**/roadmap/${id}*.md`])).split("\0")
        .filter(path => path && basename(dirname(path)) === "roadmap" && (basename(path) === `${id}.md` || basename(path).startsWith(`${id}-`)));
    if (paths.length > 1)
        throw new Error(`Several roadmap files are named for ${id} (${paths.join(", ")}); cannot tell which declares the task base.`);
    if (!paths.length)
        return null;
    const base = matter(await readFile(join(top, paths[0]), "utf8")).data.base;
    if (base === undefined || base === null)
        return null;
    if (typeof base !== "string" || !TASK_BASE.test(base))
        throw new Error(`${paths[0]} declares an invalid base; fix it before continuing.`);
    return base;
}
const run = async (command, args, cwd) => (await exec(command, args, { cwd, timeout: 30_000 })).stdout;
/**
 * Check an explicitly requested base before anything is prepared, branched or pushed.
 *
 * Returns null for the trunk itself, which is the default. Any other branch must be named
 * plainly and be protected in the trunk remote's GitHub repository, so fixes reach it only
 * through reviewed pull requests. An unreadable answer refuses; it is never read as "not
 * needed". Existence is proven again by the fetch that follows.
 */
export async function verifyTaskBase(root, base, gh = run) {
    const trunk = await projectTrunk(root);
    if (base === trunk.branch)
        return null;
    const valid = TASK_BASE.test(base) && await git(root, ["check-ref-format", `refs/heads/${base}`]).then(() => true, () => false);
    if (!valid)
        throw new Error(`--base ${JSON.stringify(base)} is not a plain branch name. Nothing was prepared.`);
    let repo;
    let answer;
    try {
        const url = await git(root, ["remote", "get-url", trunk.remote]);
        repo = JSON.parse(await gh("gh", ["repo", "view", url, "--json", "nameWithOwner"], root)).nameWithOwner;
        if (typeof repo !== "string" || !/^[\w.-]+\/[\w.-]+$/.test(repo))
            throw new Error("no repository name in gh's answer");
        const path = `repos/${repo}/branches/${base.split("/").map(encodeURIComponent).join("/")}`;
        answer = (await gh("gh", ["api", path, "--jq", ".protected"], root)).trim();
    }
    catch (error) {
        const reason = error instanceof Error ? error.message.split("\n")[0] : String(error);
        throw new Error(`Cannot verify that ${trunk.remote}/${base} is a protected branch (${reason}). Nothing was prepared; a base is never assumed.`);
    }
    if (answer !== "true") {
        throw new Error(`${base} is not a protected branch of ${repo}. A task base must be protected so its changes arrive only through reviewed pull requests. Nothing was prepared.`);
    }
    return { remote: trunk.remote, branch: base };
}
//# sourceMappingURL=task-base.js.map