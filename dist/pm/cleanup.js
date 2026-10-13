import { realpath } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import { checkoutIdentity, fetchTrunk, sessionGit as git } from "../session/start.js";
import { listWorktrees, missingDirectory } from "../session/worktrees.js";
import { clearTaskBindings, temporaryTasks } from "../session/tasks.js";
import { projectPolicy } from "../session/policy.js";
import { resolveTrunk } from "../session/git.js";
import { FETCH_PRUNE, findClaims } from "./claim.js";
import { ROADMAP_ID, roadmapIdFromBranch } from "./id.js";
import { parseArtifact } from "./parse.js";
import { ARTIFACTS } from "./schema.js";
import { cleanupPr } from "./ship.js";
const oid = /^[a-f0-9]{40,64}$/;
async function contained(root, ancestor, descendant, message) {
    if (!oid.test(ancestor) || !oid.test(descendant))
        throw new Error("Incomplete commit evidence.");
    try {
        await git(root, ["merge-base", "--is-ancestor", ancestor, descendant]);
    }
    catch {
        throw new Error(message);
    }
}
async function clean(target, common) {
    if (await missingDirectory(target.path))
        throw new Error(`Stale registration: ${target.path} is missing. Use pm worktrees prune; its branch will be preserved.`);
    const identity = await checkoutIdentity(target.path);
    if (!identity.linked)
        throw new Error(`Never remove canonical checkout ${target.path}.`);
    if (identity.root !== target.path || identity.common !== common)
        throw new Error("Worktree identity changed; retain and inspect manually.");
    if (target.locked !== undefined)
        throw new Error(`Locked worktree ${target.path}: ${target.locked}`);
    // Do not trim porcelain: the first column identifies staged changes.
    const unsafe = await localData(target.path);
    if (unsafe.length)
        throw new Error(`Dirty worktree ${target.path}; preserve all files:\n${unsafe.join("\n")}`);
}
async function localData(path) {
    // `git worktree remove` deletes ignored files even without --force. The
    // package install cache is reproducible; everything else is preserved.
    const status = await git(path, ["status", "--porcelain=v1", "--untracked-files=all", "--ignored=matching", "--ignore-submodules=none", "-z"], false);
    return status.split("\0").filter(Boolean).filter(entry => !/^!! (?:.*\/)?node_modules\/?$/.test(entry));
}
async function assertItem(root, productRel, id, trunkSha, detached) {
    const parsed = await parseArtifact(join(root, productRel), "roadmap");
    const items = parsed.items.filter(item => item.data.id === id);
    if (parsed.issues.length || items.length !== 1)
        throw new Error(`Cannot resolve exactly one valid roadmap item ${id} in the worktree.`);
    const allowed = detached ? ["backlog", "in-progress", "review", "shipped", "dropped"] : ["review", "shipped"];
    if (!allowed.includes(items[0].data.status))
        throw new Error(`${id} is ${items[0].data.status}; retain the worktree.`);
    // Observe canonical status too: a clean old task checkout cannot hide a newer blocker/reopen.
    const paths = (await git(root, ["ls-tree", "-r", "--name-only", "-z", trunkSha, "--", `${productRel}/roadmap/`])).split("\0")
        .filter(path => basename(path) === `${id}.md` || basename(path).startsWith(`${id}-`));
    if (!paths.length && detached)
        return; // unclaimed intake may never have reached trunk
    if (paths.length !== 1)
        throw new Error(`Cannot resolve exactly one ${id} on observed trunk.`);
    const canonical = ARTIFACTS.roadmap.schema.parse(matter(await git(root, ["show", `${trunkSha}:${paths[0]}`])).data);
    if (canonical.id !== id || !allowed.includes(canonical.status))
        throw new Error(`${id} is ${canonical.status} on observed trunk; retain the worktree.`);
}
async function remoteHead(root, branch) {
    const ref = `refs/heads/${branch}`;
    const output = await git(root, ["ls-remote", "--heads", "origin", ref]);
    if (!output)
        return null;
    const lines = output.split("\n");
    const [sha, name] = lines[0].split(/\s+/);
    if (lines.length !== 1 || name !== ref || !sha || !oid.test(sha))
        throw new Error(`Ambiguous remote branch ${branch}.`);
    return sha;
}
/** All irreversible operations follow fresh, exact PR evidence; ancestry to trunk alone is insufficient. */
export async function cleanupTask(cwd, productDir, id, dryRun = false) {
    if (!ROADMAP_ID.test(id))
        throw new Error(`Invalid roadmap ID: ${id}`);
    const identity = await checkoutIdentity(cwd);
    // checkoutIdentity canonicalizes macOS /var -> /private/var. Compare two
    // real paths so a valid product directory under tmpdir is not rejected.
    const productRel = relative(identity.root, await realpath(resolve(productDir)));
    if (!productRel || productRel.startsWith("..") || isAbsolute(productRel))
        throw new Error("Product directory must be inside this repository.");
    const trunk = await resolveTrunk(cwd, (await projectPolicy(cwd)).trunk);
    await git(cwd, [...FETCH_PRUNE]); // unlike reconciliation, failures here must never be swallowed
    if (trunk.remote !== "origin")
        await git(cwd, ["fetch", "--prune", "--no-tags", "--", trunk.remote]);
    const fetched = await fetchTrunk(cwd);
    const worktrees = await listWorktrees(cwd);
    const markers = await temporaryTasks(identity.common);
    const locals = (await git(cwd, ["for-each-ref", "--format=%(refname:strip=2)", "refs/heads/"])).split("\n").filter(b => roadmapIdFromBranch(b) === id);
    const branches = [...new Set([...locals, ...await findClaims(id, cwd), ...worktrees.filter(w => w.branch && roadmapIdFromBranch(w.branch) === id).map(w => w.branch)])];
    const targets = worktrees.filter(w => (w.branch && branches.includes(w.branch)) || (w.detached && markers.some(m => m.root === w.path && m.task === id)));
    if (branches.length > 1 || targets.length !== 1 || (targets[0].detached && branches.length)) {
        throw new Error(`Ambiguous or missing task ${id}: ${branches.length} branches, ${targets.length} worktrees. Retain and resolve explicitly.`);
    }
    const target = targets[0];
    await clean(target, identity.common);
    if (target.branch === fetched.branch)
        throw new Error(`Policy violation: secondary worktree on trunk ${fetched.branch}.`);
    await assertItem(target.path, productRel, id, fetched.sha, target.detached);
    let pr;
    let remote = null;
    if (target.detached) {
        const marker = markers.find(m => m.root === target.path && m.task === id);
        const own = await realpath(resolve(target.path, await git(target.path, ["rev-parse", "--git-dir"])));
        if (own !== marker.gitDir)
            throw new Error("Temporary marker does not match this checkout; manual action required.");
        await contained(cwd, target.head, fetched.sha, "Temporary detached HEAD is not reachable from observed trunk; retain it.");
    }
    else {
        if (!target.branch)
            throw new Error("Unmarked detached worktree requires explicit human action.");
        pr = await cleanupPr(cwd, target.branch, trunk.remote);
        if (pr.state !== "MERGED" || pr.baseRefName !== fetched.branch)
            throw new Error(`PR #${pr.number} is ${pr.state} into ${pr.baseRefName}; require MERGED into ${fetched.branch}.`);
        // Fetch objects missing after squash/auto-delete, then compare the immutable recorded OID.
        for (const sha of [pr.headRefOid, pr.mergeCommit.oid]) {
            if (!oid.test(sha))
                throw new Error("Incomplete PR commit evidence.");
            await git(cwd, ["cat-file", "-e", `${sha}^{commit}`]).catch(() => git(cwd, ["fetch", "--no-tags", "--no-write-fetch-head", "--", trunk.remote, sha]));
        }
        await contained(cwd, target.head, pr.headRefOid, "Local HEAD is not contained in the merged PR head; local commits or unavailable ancestry require manual action.");
        await contained(cwd, pr.mergeCommit.oid, fetched.sha, "PR merge commit is not reachable from observed remote trunk.");
        remote = await remoteHead(cwd, target.branch);
        if (remote)
            await contained(cwd, remote, pr.headRefOid, "Remote branch contains unmerged work or unavailable ancestry; retain it.");
    }
    const result = { path: target.path, branch: target.branch, pr: pr?.number, dryRun };
    if (dryRun)
        return result;
    if (identity.root === target.path)
        throw new Error("Run cleanup from another checkout, so it cannot remove the caller's working directory.");
    // Revalidate immediately before mutation. Git also refuses dirty/locked worktrees, without --force.
    const current = (await listWorktrees(cwd)).find(w => w.path === target.path);
    if (!current || current.head !== target.head || current.branch !== target.branch)
        throw new Error("Task changed during cleanup; retry after work stops.");
    await clean(current, identity.common);
    if (target.branch && await remoteHead(cwd, target.branch) !== remote)
        throw new Error("Remote branch changed during cleanup; retain and retry.");
    // Conditional remote deletion protects commits pushed after the proof. Do this before local
    // removal so a network/refusal failure leaves the local worktree available for recovery.
    if (target.branch && remote)
        await git(cwd, ["push", `--force-with-lease=refs/heads/${target.branch}:${remote}`, "origin", `:refs/heads/${target.branch}`]);
    if (target.branch && await remoteHead(cwd, target.branch) !== null)
        throw new Error("Remote branch still exists; retain local worktree.");
    await git(cwd, ["worktree", "remove", "--", target.path]);
    await clearTaskBindings(identity.common, target.path);
    if (target.branch) {
        // Removal releases Git's checkout guard. Check the branch has not moved before forced deletion.
        const head = await git(cwd, ["rev-parse", `refs/heads/${target.branch}`]);
        if (head !== target.head)
            throw new Error("Worktree removed, but local branch moved; branch retained for manual inspection.");
        await git(cwd, ["branch", "-D", "--", target.branch]);
    }
    return result;
}
/** Local inventory: no fetch, no deletion. Missing directories are registrations, not completed tasks. */
export async function worktreeStatus(cwd) {
    const trunk = await resolveTrunk(cwd, (await projectPolicy(cwd)).trunk);
    const identity = await checkoutIdentity(cwd);
    const markers = await temporaryTasks(identity.common);
    const lines = [];
    for (const w of await listWorktrees(cwd)) {
        let status;
        if (await missingDirectory(w.path))
            status = "stale registration (directory missing; branch retained)";
        else if (!(await checkoutIdentity(w.path)).linked)
            status = "canonical (never removed)";
        else if (w.branch === trunk.branch)
            status = `POLICY VIOLATION: secondary checkout on trunk ${trunk.branch}`;
        else {
            const dirty = await localData(w.path);
            status = dirty.length ? `dirty: ${dirty.join(", ")}` : w.detached
                ? markers.some(m => m.root === w.path) ? "temporary detached (requires trunk proof)" : "unmarked detached (manual action required)"
                : roadmapIdFromBranch(w.branch ?? "") ? "task (completion unverified; use cleanup <ID> --dry-run)" : "POLICY VIOLATION: secondary checkout has no task claim";
        }
        lines.push(`${w.path} [${w.branch ?? "detached"}] ${status}${w.locked !== undefined ? `; locked: ${w.locked}` : ""}`);
    }
    return lines;
}
/** Git alone prunes missing registrations; never delete branches or live directories. */
export async function pruneStaleWorktrees(cwd, dryRun = false) {
    return git(cwd, ["worktree", "prune", "--verbose", "--expire", "now", ...(dryRun ? ["--dry-run"] : [])]);
}
//# sourceMappingURL=cleanup.js.map