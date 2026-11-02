import { GH_MANAGER_LOGIN, MANAGER_REVIEWED_LABEL } from "./policy.js";
import { checkLocalReview, git, isAncestor, REVIEW_FLOOR_RULE, verifyUncoveredCommits } from "../review/local.js";
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
/** Validate an author's committed review independently of the label that may have been missed. */
export function authorRecordProblem(root, body, head, trunk) {
    if (!isCommit(root, head) || !isCommit(root, trunk))
        return "the pull request head or base could not be read in the apply checkout";
    const findings = checkLocalReview({ root, body, labels: ["agent-reviewed"], head, base: trunk });
    // An opt-out returns `waived` without reading a record. That cannot authorize recovery of a
    // label which explicitly asserts a completed independent review. A review-floor waiver is
    // different: the record was read and validated, with only the 30-second floor relaxed.
    if (findings.some(f => f.level === "waived" && f.rule !== REVIEW_FLOOR_RULE))
        return "independent review is waived, so no author record was validated";
    return findings.find(f => f.level === "error")?.message;
}
//# sourceMappingURL=verify.js.map