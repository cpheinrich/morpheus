import { mkdir, mkdtemp, readFile, readdir, realpath, rename, unlink, writeFile } from "node:fs/promises";
import { listWorktrees, assertWorktreePolicy } from "./worktrees.js";
import { basename, dirname, join, relative, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { checkoutIdentity, fetchTrunk, sessionGit as git, sessionKey } from "./start.js";
import { findClaims } from "../pm/claim.js";
import { ROADMAP_ID, roadmapIdFromBranch } from "../pm/id.js";
import { parseArtifact } from "../pm/parse.js";
export async function bindTask(cwd, task, sessionId, pending = false) {
    if (!sessionId)
        return;
    const { root, common } = await checkoutIdentity(cwd);
    const dir = join(common, "morpheus-sessions");
    await mkdir(dir, { recursive: true });
    const path = join(dir, `${sessionKey(sessionId)}.json`);
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify({ root, task, ...(pending ? { pending: true } : {}) }));
    await rename(temp, path);
}
export async function boundTask(cwd, sessionId) {
    if (!sessionId)
        return null;
    const { common } = await checkoutIdentity(cwd);
    let raw;
    try {
        raw = await readFile(join(common, "morpheus-sessions", `${sessionKey(sessionId)}.json`), "utf8");
    }
    catch (error) {
        if (error.code === "ENOENT")
            return null;
        throw error;
    }
    const binding = JSON.parse(raw);
    if (typeof binding.root !== "string" || typeof binding.task !== "string" || !ROADMAP_ID.test(binding.task))
        throw new Error("Invalid session task association.");
    const target = await checkoutIdentity(binding.root);
    const branch = await git(target.root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if (target.common !== common || target.root !== binding.root || (roadmapIdFromBranch(branch) !== binding.task && !(binding.pending === true && target.linked && branch === "HEAD"))) {
        throw new Error(`Saved task ${binding.task} no longer matches ${binding.root}. Resume a task explicitly with morpheus pm resume <ID>.`);
    }
    return binding;
}
async function destination(root, task) {
    const { common } = await checkoutIdentity(root);
    // Keep task checkouts out of the operator's source directory. The common
    // Git directory keys paths so repositories with the same basename cannot
    // collide; Git still owns registration and cleanup.
    const parent = join(tmpdir(), "morpheus-worktrees", `${basename(dirname(common))}-${sessionKey(common).slice(0, 12)}`);
    await mkdir(parent, { recursive: true });
    return mkdtemp(join(parent, `${task.toLowerCase()}-`));
}
/** Prepare only; the destination must be read/certified before claim can push. */
export async function prepareTask(root, productDir, id) {
    if (!ROADMAP_ID.test(id))
        throw new Error(`Invalid roadmap ID: ${id}`);
    const checkout = await checkoutIdentity(root);
    const branch = await git(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
    if ((await findClaims(id, root)).length)
        throw new Error(`${id} is already claimed. Use morpheus pm resume ${id} to continue it explicitly.`);
    const { items } = await parseArtifact(productDir, "roadmap");
    const item = items.find(i => i.data.id === id);
    if (!item)
        throw new Error(`No roadmap item ${id} in ${productDir}.`);
    if (item.data.status === "shipped" || item.data.status === "dropped")
        throw new Error(`${id} is ${item.data.status}; nothing to claim.`);
    const itemRel = relative(checkout.root, await realpath(item.path));
    if (itemRel.startsWith(".."))
        throw new Error("The roadmap must belong to this repository.");
    const { sha, branch: trunkBranch } = await fetchTrunk(root);
    await assertWorktreePolicy(root, trunkBranch);
    // Reuse an explicitly prepared checkout only if it is exact trunk and
    // has no unrelated tracked edits or commits to accidentally put in a claim.
    const head = await git(root, ["rev-parse", "HEAD"]);
    const trackedChanges = await git(root, ["diff", "HEAD", "--name-only"]);
    if (checkout.linked && branch === "HEAD" && head === sha && !trackedChanges)
        return null;
    const target = await destination(root, id);
    await git(root, ["worktree", "add", "--detach", "--", target, sha]);
    await markTemporaryTask(target, id);
    // Only move an uncommitted new item. Existing canonical items come from
    // fetched trunk, never from the old branch's edits or unrelated files.
    // Moving intake also avoids leaving trunk dirty forever after a new claim.
    const tracked = await git(root, ["ls-files", "--", itemRel]);
    if (!tracked) {
        const currentItems = await parseArtifact(join(target, relative(checkout.root, await realpath(productDir))), "roadmap");
        if (currentItems.items.some(i => i.data.id === id))
            throw new Error(`${id} now exists on trunk. Read ${target} before claiming it.`);
        await mkdir(dirname(join(target, itemRel)), { recursive: true });
        await rename(item.path, join(target, itemRel));
    }
    return realpath(target);
}
/** Resume by explicit roadmap identity, never by guessing which branch is meant. */
export async function resumeTask(root, id, sessionId) {
    if (!ROADMAP_ID.test(id))
        throw new Error(`Invalid roadmap ID: ${id}`);
    const branches = await findClaims(id, root);
    if (branches.length !== 1)
        throw new Error(`Expected one remote claim for ${id}; found ${branches.length}. Resolve the task identity before resuming.`);
    const branch = branches[0];
    const matching = (await listWorktrees(root)).filter(w => w.branch === branch);
    if (matching.length > 1)
        throw new Error(`Multiple worktrees for ${branch}; resolve manually.`);
    if (matching[0]) {
        if (!(await checkoutIdentity(matching[0].path)).linked)
            throw new Error("Task occupies the canonical checkout; move it to an isolated worktree explicitly.");
        await bindTask(matching[0].path, id, sessionId);
        return matching[0].path;
    }
    const local = await git(root, ["show-ref", "--verify", `refs/heads/${branch}`]).then(() => true, () => false);
    const target = await destination(root, id);
    if (!local)
        await git(root, ["fetch", "--no-write-fetch-head", "--", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
    await git(root, ["worktree", "add", "--", target, branch]);
    await bindTask(target, id, sessionId);
    return realpath(target);
}
/** Only preparation writes this marker; a detached HEAD by itself is never consent. */
async function markTemporaryTask(root, task) {
    const identity = await checkoutIdentity(root);
    const dir = join(identity.common, "morpheus-temporary-worktrees");
    await mkdir(dir, { recursive: true });
    const gitDir = await realpath(resolve(root, await git(root, ["rev-parse", "--git-dir"])));
    await writeFile(join(dir, `${sessionKey(identity.root)}.json`), JSON.stringify({ root: identity.root, task, gitDir }));
}
export async function temporaryTasks(common) {
    const dir = join(common, "morpheus-temporary-worktrees");
    let files;
    try {
        files = await readdir(dir);
    }
    catch (error) {
        if (error.code === "ENOENT")
            return [];
        throw error;
    }
    return Promise.all(files.filter(f => f.endsWith(".json")).map(async (file) => {
        const value = JSON.parse(await readFile(join(dir, file), "utf8"));
        if (typeof value.root !== "string" || typeof value.gitDir !== "string" || !ROADMAP_ID.test(value.task))
            throw new Error(`Invalid temporary task marker ${file}.`);
        return value;
    }));
}
/** Remove only bindings naming the removed path, including other provider sessions. */
export async function clearTaskBindings(common, root) {
    const dir = join(common, "morpheus-sessions");
    let files;
    try {
        files = await readdir(dir);
    }
    catch (error) {
        if (error.code === "ENOENT")
            files = [];
        else
            throw error;
    }
    for (const file of files.filter(f => f.endsWith(".json"))) {
        const path = join(dir, file);
        const raw = await readFile(path, "utf8");
        let binding;
        try {
            binding = JSON.parse(raw);
        }
        catch {
            continue;
        }
        // Re-read to avoid clearing a session rebound while cleanup was running.
        if (binding.root === root && await readFile(path, "utf8") === raw)
            await unlink(path);
    }
    await unlink(join(common, "morpheus-temporary-worktrees", `${sessionKey(root)}.json`)).catch(error => {
        if (error.code !== "ENOENT")
            throw error;
    });
}
//# sourceMappingURL=tasks.js.map