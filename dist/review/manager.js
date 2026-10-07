import { z } from "zod";
import { visibleProse, visibleText } from "../check/pr.js";
import { GH_MANAGER_LOGIN, GH_MANAGER_POLICY_PATH, humanGatedPaths, MANAGER_REVIEWED_LABEL, parsePolicy } from "../gh-manager/policy.js";
import { changedPaths, git, isAncestor, reviewRequired, verifyUncoveredCommits } from "./local.js";
/**
 * The GitHub Manager's review: one review and its own fixes, in one session.
 *
 * The ordinary contract has an author who launches a reviewer and answers it.
 * That loop stalls when the author's session ends, because nothing else is
 * listening — which is the pile-up this exists to clear. The manager is a
 * fresh session that did not write the change, so it may review it; and it
 * fixes what it finds itself, because handing findings back to an author who
 * is not there is the stall again.
 *
 * That makes its fixes unreviewed by anyone else. The record below is what
 * keeps that honest and bounded rather than hidden: every fix commit must stay
 * inside the paths of a finding the record names, and policy the project is
 * operated by is refused outright.
 *
 * The record itself is a file on the branch, so anyone who can push can write
 * one. Two things only the App can produce make it count. The label that
 * selects this path must have been applied by the App. And the App's own
 * comment names the head it cleared: nothing may follow that head but merges
 * of trunk that Git reproduces exactly. Without the second, an author could
 * wait for the App's label, push more code, and extend the record to cover it.
 */
const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
export const ManagerReviewRecord = z.object({
    version: z.literal(1),
    /** The operations run that conducted the review, as the runner reports it. */
    managerSession: Text,
    /** The head the manager reviewed, after integrating trunk if it had to. */
    reviewed: Sha,
    /** The last commit of the manager's own fixes; equals `reviewed` when it changed nothing. */
    covered: Sha,
    /** What the manager found when it read the reviews already on record. */
    priorReview: z.object({
        state: z.enum(["none", "complete", "stalled", "exhausted", "invalid"]),
        note: Text,
    }).strict(),
    findings: z.array(z.object({
        id: z.string().trim().min(3),
        severity: z.enum(["minor", "substantive", "incidental"]),
        description: Text,
        paths: z.array(Path).min(1),
        /** `noted` is for an incidental finding only: a pre-existing problem this change did not cause. */
        disposition: z.enum(["fixed", "noted"]),
        response: Text,
    }).strict()).max(50),
    /** Hand-resolved trunk merges after `reviewed`; an exact merge needs no entry. */
    trunkIntegrations: z.array(z.object({ commit: Sha, reason: Text }).strict()).min(1).max(20).optional(),
    outcome: z.enum(["cleared", "escalated"]),
    summary: Text,
}).strict();
const FENCE = /^```morpheus-manager-review\r?\n([\s\S]*?)^```[ \t]*$/gm;
export function parseManagerReviewRecord(markdown) {
    const blocks = [...markdown.matchAll(FENCE)];
    if (blocks.length !== 1)
        throw new Error("worklog needs exactly one morpheus-manager-review JSON block");
    const record = ManagerReviewRecord.parse(JSON.parse(blocks[0][1]));
    // Same rule as the ordinary record: the audit must be readable without parsing JSON.
    if (!visibleText(markdown.replace(blocks[0][0], "")).includes(record.summary)) {
        throw new Error("repeat the manager review summary as a visible paragraph outside the JSON block");
    }
    return record;
}
export function validateManagerReviewRecord(record) {
    if (record.outcome !== "cleared")
        throw new Error(`manager review is ${record.outcome}; the pull request stays open for a human`);
    if (new Set(record.findings.map(f => f.id)).size !== record.findings.length)
        throw new Error("finding IDs must be unique");
    for (const finding of record.findings) {
        // There is no author to defer to and no later turn: a finding this change caused is fixed
        // here or the review is not cleared.
        if (finding.severity !== "incidental" && finding.disposition !== "fixed")
            throw new Error(`finding ${finding.id} is ${finding.severity} and not fixed; the manager fixes what it finds or escalates`);
    }
}
/** True when the pull request asks to be judged on the manager's review rather than the author's. */
export function usesManagerReview(labels) {
    return labels.includes(MANAGER_REVIEWED_LABEL);
}
/** Read only committed evidence; paths and refs are data, never shell text. */
export function checkManagerReview(opts) {
    try {
        const config = JSON.parse(git(opts.root, ["show", `${opts.head}:morpheus.json`]));
        if (!reviewRequired(config))
            return [{ level: "waived", rule: "agent-review", message: "independent review disabled by project review.required=false" }];
        // An unreadable actor is not the App. Refusing here is what stops an author
        // applying the label to their own record.
        if (opts.labelActor !== GH_MANAGER_LOGIN) {
            throw new Error(`${MANAGER_REVIEWED_LABEL} must be applied by ${GH_MANAGER_LOGIN}; it was applied by ${opts.labelActor ?? "an actor that could not be determined"}. Remove it and use the ordinary independent review.`);
        }
        if (!opts.clearedHead || !/^[a-f0-9]{40}$/.test(opts.clearedHead)) {
            throw new Error(`no clearance from ${GH_MANAGER_LOGIN} could be read for this pull request; the label alone does not clear it`);
        }
        // The clearance is for one commit. Trunk may be merged in afterwards, exactly as after an
        // ordinary review, but only by a merge Git reproduces: a hand-resolved merge or any other
        // commit after the cleared head is work the App never saw, whatever the record now says.
        if (!isAncestor(opts.root, opts.clearedHead, opts.head))
            throw new Error("the head the GitHub Manager cleared is not an ancestor of this pull request's head; the branch was rewritten after clearance");
        verifyUncoveredCommits(opts.root, {}, opts.clearedHead, opts.head, opts.base, new Set(), "commits were pushed after the GitHub Manager cleared this pull request; its clearance covers the head it reviewed and exact trunk merges only");
        const lines = [...visibleProse(opts.body).matchAll(/^manager-review-record:[ \t]*(\S+)[ \t]*$/gm)];
        if (lines.length !== 1)
            throw new Error("PR body needs one visible manager-review-record: .agent/worklog/<task>.md line");
        const path = lines[0][1];
        if (!/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(path))
            throw new Error("manager-review-record must name a worklog Markdown file");
        const mode = git(opts.root, ["ls-tree", opts.head, "--", path]).split(" ")[0];
        if (mode !== "100644")
            throw new Error("manager review worklog must be a regular committed file");
        const record = parseManagerReviewRecord(git(opts.root, ["show", `${opts.head}:${path}`]));
        validateManagerReviewRecord(record);
        const fork = git(opts.root, ["merge-base", opts.base, opts.head]);
        for (const [older, newer] of [[record.reviewed, record.covered], [record.covered, opts.clearedHead], [opts.clearedHead, opts.head]]) {
            if (!isAncestor(opts.root, older, newer))
                throw new Error("reviewed, covered and the pull request head must form an ancestor chain");
        }
        // `reviewed` must be this pull request's own work, not a trunk commit behind it.
        if (isAncestor(opts.root, record.reviewed, fork))
            throw new Error("the reviewed commit is trunk history, not this pull request's work");
        const gated = humanGatedPaths(changedPaths(opts.root, fork, opts.head), managerPolicy(opts.root, opts.head));
        if (gated.length) {
            throw new Error(`the manager cannot clear a change to policy a project is operated by, or to a protected path: ${gated.slice(0, 5).join(", ")}${gated.length > 5 ? ` (+${gated.length - 5} more)` : ""}. This needs the ordinary independent review or a human.`);
        }
        const merges = new Set();
        const fixPaths = new Set([path, ...record.findings.filter(f => f.disposition === "fixed").flatMap(f => f.paths)]);
        for (const commit of verifyUncoveredCommits(opts.root, record, record.reviewed, record.covered, opts.base, fixPaths, "the manager's fix commits touch paths no fixed finding names; every change it makes must be recorded as a finding"))
            merges.add(commit);
        for (const commit of verifyUncoveredCommits(opts.root, record, record.covered, opts.head, opts.base, new Set([path]), "changes after the covered commit invalidate the manager review (only its worklog and trunk merges may follow)"))
            merges.add(commit);
        const stray = (record.trunkIntegrations ?? []).find(entry => !merges.has(entry.commit));
        if (stray)
            throw new Error("trunkIntegrations names a commit that is not a trunk merge on this branch after review");
        // Reported, never silent: this path is an exception to author-managed review, so whoever
        // reads the check sees that it was used and by which run.
        const fixed = record.findings.filter(f => f.disposition === "fixed").length;
        return [{
                level: "waived",
                rule: "agent-review",
                message: `cleared by the GitHub Manager (${record.managerSession}): one review, ${fixed} finding${fixed === 1 ? "" : "s"} fixed in the same session; prior review was ${record.priorReview.state}`,
            }];
    }
    catch (error) {
        return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
    }
}
/** The repository's manager policy at this head; absent means defaults, unreadable means refuse. */
function managerPolicy(root, head) {
    let raw = "";
    // An absent file is an answer (no extra protected paths). `ls-tree` distinguishes it from a
    // file that exists and cannot be parsed, which must not silently read as "nothing protected".
    if (!git(root, ["ls-tree", head, "--", GH_MANAGER_POLICY_PATH]))
        return { protectedPaths: [] };
    raw = git(root, ["show", `${head}:${GH_MANAGER_POLICY_PATH}`]);
    try {
        return parsePolicy(raw);
    }
    catch (error) {
        throw new Error(`${GH_MANAGER_POLICY_PATH} is invalid, so protected paths cannot be determined: ${error instanceof Error ? error.message : String(error)}`);
    }
}
//# sourceMappingURL=manager.js.map