import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { hasNoSubstantiveChange } from "../paths.js";
import { isRealReason, visibleProse, waiverReason } from "../check/pr.js";
import { addressesPriorFindings, pathsMentioned } from "../review/findings.js";
import { assessReviewDelivery } from "../review/delivery.js";
import { loadReviewContext, ReviewError } from "../review/context.js";
import { buildReviewPrompt } from "../review/prompt.js";
/**
 * `morpheus review prompt` — assemble the rung 2 reviewer prompt and print it.
 * `morpheus review needed` — decide whether it is worth spending a review.
 *
 * Commands rather than logic inside the workflow, for the reason the rest of
 * the kit is: YAML is the one part with no type checker and no tests behind it,
 * so the judgment belongs in a module that has both.
 */
function currentBranch() {
    if (process.env["GITHUB_HEAD_REF"])
        return process.env["GITHUB_HEAD_REF"];
    if (process.env["MORPHEUS_BRANCH"])
        return process.env["MORPHEUS_BRANCH"];
    try {
        return execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
            encoding: "utf8",
        }).trim();
    }
    catch {
        return "";
    }
}
export async function prompt(productDir, root) {
    try {
        const ctx = await loadReviewContext({ root, productDir, branch: currentBranch() });
        console.log(buildReviewPrompt(ctx));
        return 0;
    }
    catch (err) {
        if (err instanceof ReviewError) {
            console.error(err.message);
            return 1;
        }
        throw err;
    }
}
export function needed(changedFiles, opts = {}) {
    if (changedFiles === null) {
        // An unreadable diff is not an empty one. Review rather than skip: the cost
        // of a wasted run is a dollar, the cost of silently skipping every review
        // the day `git diff` changes shape is the rung.
        return { review: true, why: "could not read the changed files — reviewing rather than assuming" };
    }
    if (changedFiles.length === 0) {
        return { review: false, why: "nothing changed since the last review" };
    }
    // A re-review has a second reason to run, and it is the one the code test
    // misses. When the last review named a file and this push touches it, the
    // push is answering the review — even if the file is a roadmap item, which
    // `hasNoSubstantiveChange` would otherwise skip. That case is not
    // hypothetical: the most useful re-review this rung has done confirmed a fix
    // to an item's prose that it had asked for one pass earlier.
    const mentioned = opts.priorReview ? pathsMentioned(opts.priorReview) : [];
    if (addressesPriorFindings(changedFiles, mentioned)) {
        return {
            review: true,
            why: "touches a file the last review named — checking whether it was addressed",
        };
    }
    if (hasNoSubstantiveChange(changedFiles)) {
        return {
            review: false,
            why: mentioned.length
                ? `${changedFiles.length} file(s) changed, all records or board bookkeeping, and none the last review named`
                : `${changedFiles.length} file(s) changed, all records or board bookkeeping — nothing for a code reviewer`,
        };
    }
    return { review: true, why: `${changedFiles.length} file(s) changed` };
}
function changedFiles(base) {
    try {
        const out = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], {
            encoding: "utf8",
        }).trim();
        return out ? out.split("\n").filter(Boolean) : [];
    }
    catch {
        return null;
    }
}
function readIfGiven(path) {
    if (!path)
        return undefined;
    try {
        return readFileSync(path, "utf8");
    }
    catch {
        // A missing prior review means this is the first pass, or the fetch failed.
        // Either way the code test still applies; losing the second signal costs a
        // skipped confirmation, not a wrong answer.
        return undefined;
    }
}
/**
 * Prints `true` or `false` for the workflow to gate on. Always exits 0.
 *
 * `base` is the *previously reviewed* commit on a re-review, not the merge
 * base — so the question asked is "what has changed since anyone looked", which
 * is the one that decides whether looking again is worth it.
 */
export function reviewNeeded(base, priorReviewPath, json = false) {
    const prior = readIfGiven(priorReviewPath);
    const { review, why } = needed(changedFiles(base), ...(prior ? [{ priorReview: prior }] : []));
    if (json) {
        console.log(JSON.stringify({ review, why }));
    }
    else {
        console.log(String(review));
        console.error(review ? `Reviewing: ${why}` : `Skipping: ${why}`);
    }
    return 0;
}
/**
 * Verify that a reviewer run delivered a new, substantive tracking comment.
 *
 * A non-delivery can be waived from the PR body with `review-waived: <reason>`,
 * because delivery is a *required* check downstream: without an escape hatch a
 * broken reviewer blocks every merge, and the six-day credit outage is exactly
 * that event. The same validation as `skip-tests:` applies — the reason has to
 * say something a human can weigh, and the waiver is reported, never silent.
 * A waiver never upgrades the outcome to "delivered": the caller can tell the
 * two apart, and must, because one is evidence and the other is a say-so.
 */
export function reviewDelivery(beforeCommentId, commentId, bodyPath, prBodyPath) {
    let body;
    if (bodyPath) {
        try {
            body = readFileSync(bodyPath, "utf8");
        }
        catch {
            console.log(`could not read the tracking comment body at ${bodyPath}`);
            return 1;
        }
    }
    const result = assessReviewDelivery({ beforeCommentId, commentId, body });
    if (result.delivered) {
        console.log(result.why);
        return 0;
    }
    // An unreadable PR body is treated as carrying no waiver. Fail closed: a
    // waiver that cannot be verified must not be honoured.
    let prBody = "";
    if (prBodyPath) {
        try {
            prBody = readFileSync(prBodyPath, "utf8");
        }
        catch {
            prBody = "";
        }
    }
    // Visible prose only: a fenced or backticked example documents the waiver
    // and must not exercise it.
    const reason = waiverReason(visibleProse(prBody), "review-waived");
    if (reason !== null && isRealReason(reason)) {
        console.log(`waived: "${reason}" — the review was not delivered (${result.why})`);
        return 0;
    }
    if (reason !== null) {
        console.log(`${result.why}; "review-waived: ${reason}" is refused — ` +
            `say why merging without the review is right`);
        return 1;
    }
    console.log(result.why);
    return 1;
}
//# sourceMappingURL=review.js.map