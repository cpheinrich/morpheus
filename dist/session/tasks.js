import { mkdir, mkdtemp, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { basename, dirname, join, relative } from "node:path";
import { randomUUID } from "node:crypto";
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
    const parent = join(dirname(dirname(common)), ".morpheus-worktrees", `${basename(dirname(common))}-${sessionKey(common).slice(0, 12)}`);
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
    const { sha } = await fetchTrunk(root);
    // Reuse an explicitly prepared checkout only if it is exact trunk and
    // has no unrelated tracked edits or commits to accidentally put in a claim.
    const head = await git(root, ["rev-parse", "HEAD"]);
    const trackedChanges = await git(root, ["diff", "HEAD", "--name-only"]);
    if (checkout.linked && branch === "HEAD" && head === sha && !trackedChanges)
        return null;
    const target = await destination(root, id);
    await git(root, ["worktree", "add", "--detach", "--", target, sha]);
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
    const listing = await git(root, ["worktree", "list", "--porcelain", "-z"]);
    for (const entry of listing.split("\0\0")) {
        const fields = entry.split("\0");
        if (fields.includes(`branch refs/heads/${branch}`)) {
            const target = fields.find(line => line.startsWith("worktree "))?.slice(9);
            if (!target)
                throw new Error("Git returned a worktree without its path.");
            await bindTask(target, id, sessionId);
            return target;
        }
    }
    const local = await git(root, ["show-ref", "--verify", `refs/heads/${branch}`]).then(() => true, () => false);
    const target = await destination(root, id);
    if (!local)
        await git(root, ["fetch", "--no-write-fetch-head", "--", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
    await git(root, ["worktree", "add", "--", target, branch]);
    await bindTask(target, id, sessionId);
    return realpath(target);
}
//# sourceMappingURL=tasks.js.map