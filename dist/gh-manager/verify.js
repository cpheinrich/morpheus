import { GH_MANAGER_LOGIN, MANAGER_REVIEWED_LABEL } from "./policy.js";
import { git, isAncestor, verifyUncoveredCommits } from "../review/local.js";
import { checkManagerReview } from "../review/manager.js";
/**
 * Checks the apply step makes with real Git, in a checkout of the target.
 *
 * A session holds push access to the branch, so what it reports about its own
 * commits is a claim. These read the commits themselves, with the same
 * functions `check pr` uses, before anything is labelled or merged.
 */
function isCommit(root, sha) {
    try {
        git(root, ["cat-file", "-e", `${sha}^{commit}`]);
        return true;
    }
    catch {
        return false;
    }
}
/**
 * What lies between the head the sweep saw and the head the session finished on.
 * `trunk-merges` means every commit is a merge of trunk that Git reproduces exactly: nothing
 * was authored. A commit that cannot be read is `unverified`, never `nothing`.
 */
export function sessionPushed(root, before, after, trunk) {
    if (!isCommit(root, before) || !isCommit(root, after) || !isCommit(root, trunk))
        return "unverified";
    if (before === after)
        return "nothing";
    if (!isAncestor(root, before, after))
        return "other";
    try {
        verifyUncoveredCommits(root, {}, before, after, trunk, new Set(), "authored commit");
        return "trunk-merges";
    }
    catch {
        return "other";
    }
}
/**
 * Why `check pr` would refuse the manager's review record at this head, or undefined when it
 * would accept it. Run as though the App had already labelled and cleared this exact head, so
 * what is tested is the record and the diff, which is everything the session controls.
 */
export function managerRecordProblem(root, body, head, trunk) {
    if (!isCommit(root, head) || !isCommit(root, trunk))
        return "the pull request head could not be read in the apply checkout";
    const finding = checkManagerReview({ root, body, labels: [MANAGER_REVIEWED_LABEL], labelActor: GH_MANAGER_LOGIN, clearedHead: head, head, base: trunk })
        .find(f => f.level === "error");
    return finding?.message;
}
//# sourceMappingURL=verify.js.map