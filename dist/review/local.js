import { execFileSync } from "node:child_process";
import { z } from "zod";
import { visibleProse } from "../check/pr.js";
const Sha = z.string().regex(/^[a-f0-9]{40}$/);
const Text = z.string().trim().min(8);
const Session = z.string().trim().min(3);
const Path = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]+$/);
export const ReviewRecord = z.object({
    version: z.literal(1),
    base: Sha,
    reviewed: Sha,
    covered: Sha,
    authorSession: Session,
    reviewerSession: Session,
    risk: z.enum(["small", "normal", "high"]),
    elapsedMinutes: z.number().nonnegative(),
    extensionReason: Text.optional(),
    outcome: z.enum(["complete", "incomplete", "blocked"]),
    summary: Text,
    documentationIntegrations: z.array(z.object({
        base: Sha,
        commit: Sha,
        reason: Text,
        sources: z.array(z.object({
            commit: Sha,
            reviewRecord: z.string().regex(/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/),
        }).strict()).min(1).max(20),
    }).strict()).min(1).max(20).optional(),
    findings: z.array(z.object({
        id: Session,
        severity: z.enum(["minor", "substantive", "incidental"]),
        description: Text,
        paths: z.array(Path).min(1),
        disposition: z.enum(["fixed", "disputed", "deferred", "open"]),
        response: Text,
    }).strict()),
    followUp: z.object({
        reviewerSession: Session,
        commit: Sha,
        base: Sha.optional(),
        scopeReason: Text.optional(),
        outcome: z.enum(["cleared", "incomplete", "blocked"]),
        elapsedMinutes: z.number().nonnegative(),
        summary: Text,
    }).strict().optional(),
}).strict();
export function reviewRequired(config) {
    const parsed = z.object({ review: z.object({ required: z.boolean().optional() }).passthrough().optional() }).passthrough().parse(config);
    return parsed.review?.required ?? true;
}
export function git(root, args) {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 8 * 1024 * 1024 }).trim();
}
export function parseReviewRecord(markdown) {
    const blocks = [...markdown.matchAll(/^```morpheus-review\r?\n([\s\S]*?)^```[ \t]*$/gm)];
    if (blocks.length !== 1)
        throw new Error("worklog needs exactly one morpheus-review JSON block");
    const record = ReviewRecord.parse(JSON.parse(blocks[0][1]));
    // The human audit must remain visible without reading JSON.
    if (!visibleProse(markdown.replace(blocks[0][0], "")).includes(record.summary)) {
        throw new Error("repeat the review summary as a visible paragraph outside the JSON block");
    }
    return record;
}
export function validateReviewRecord(record) {
    if (record.authorSession === record.reviewerSession)
        throw new Error("reviewer must be a fresh independent session");
    if (record.outcome !== "complete")
        throw new Error(`review is ${record.outcome}; leave the PR open and disable auto-merge`);
    if (new Set(record.findings.map(f => f.id)).size !== record.findings.length)
        throw new Error("finding IDs must be unique");
    if (record.findings.some(f => f.severity !== "incidental" && f.disposition === "open"))
        throw new Error("unresolved finding");
    const substantive = record.findings.some(f => f.severity === "substantive");
    if (substantive && !record.followUp)
        throw new Error("substantive findings require one follow-up from the original reviewer");
    if (record.findings.some(f => f.severity === "substantive" && f.disposition !== "fixed" && f.disposition !== "disputed"))
        throw new Error("substantive findings cannot be deferred");
    if (record.followUp && (record.followUp.reviewerSession !== record.reviewerSession || record.followUp.outcome !== "cleared" || record.followUp.commit !== record.covered)) {
        throw new Error("follow-up must clear the covered commit using the original reviewer session");
    }
    const budget = { small: 5, normal: 15, high: 30 }[record.risk];
    const multiplier = record.extensionReason ? 1.5 : 1;
    if (record.elapsedMinutes > budget * multiplier || (record.followUp?.elapsedMinutes ?? 0) > budget / 2)
        throw new Error("review exceeded its budget; record incomplete and escalate instead of claiming completion");
}
function changedPaths(root, older, newer) {
    return git(root, ["diff", "--name-only", "-z", "--no-renames", older, newer, "--"]).split("\0").filter(Boolean);
}
function onlyWorklogChanges(root, older, newer, worklog) {
    if (changedPaths(root, older, newer).some(p => p !== worklog)) {
        throw new Error("changes after covered commit invalidate review (only its worklog may change)");
    }
}
/** Narrow data-only allowlist: Markdown elsewhere may be executable input or agent instructions. */
function documentationPath(path) {
    if (/(?:^|\/)(?:AGENTS|CLAUDE|SKILL)\.md$/i.test(path))
        return false;
    return /^(?:README\.md|docs\/.+\.md|\.agent\/(?:worklog\/.+|inbox-archive\/.+|decisions|learned)\.md|hq\/(?:product|team)\/.+\.md)$/.test(path);
}
function regularDocumentation(root, older, newer) {
    const paths = changedPaths(root, older, newer);
    if (!paths.length || paths.some(p => !documentationPath(p)))
        throw new Error("documentation integration contains non-documentation paths");
    for (const ref of [older, newer]) {
        for (const path of paths) {
            const entry = git(root, ["ls-tree", ref, "--", path]);
            if (entry && !entry.startsWith("100644 blob "))
                throw new Error("documentation integration requires regular non-executable files");
        }
    }
}
/** Verify Git's merge result, not an author's assertion that the integration was harmless. */
function checkDocumentationIntegrations(root, record, worklog, head, coveredBase) {
    let anchor = record.covered;
    let base = coveredBase;
    for (const integration of record.documentationIntegrations ?? []) {
        git(root, ["merge-base", "--is-ancestor", base, integration.base]);
        git(root, ["merge-base", "--is-ancestor", integration.commit, head]);
        const parents = git(root, ["show", "-s", "--format=%P", integration.commit]).split(" ");
        if (parents.length !== 2 || parents[1] !== integration.base)
            throw new Error("documentation integration must be an explicit two-parent trunk merge");
        git(root, ["merge-base", "--is-ancestor", anchor, parents[0]]);
        onlyWorklogChanges(root, anchor, parents[0], worklog);
        const incoming = git(root, ["rev-list", `${base}..${integration.base}`]).split("\n").filter(Boolean);
        const sources = new Map(integration.sources.map(source => [source.commit, source.reviewRecord]));
        if (sources.size !== integration.sources.length || incoming.length !== sources.size || incoming.some(commit => !sources.has(commit))) {
            throw new Error("documentation integration needs review evidence for every incoming trunk commit");
        }
        for (const commit of incoming) {
            const sourceParents = git(root, ["show", "-s", "--format=%P", commit]).split(" ");
            if (sourceParents.length !== 1)
                throw new Error("documentation integration requires linear reviewed trunk commits");
            const parent = sourceParents[0];
            regularDocumentation(root, parent, commit);
            const sourcePath = sources.get(commit);
            if (!changedPaths(root, parent, commit).includes(sourcePath))
                throw new Error("documentation source must carry its own review record");
            const source = parseReviewRecord(git(root, ["show", `${commit}:${sourcePath}`]));
            validateReviewRecord(source);
            // Squash merges retain the original review SHAs in their worklog. The completed
            // evidence must still describe this trunk parent, not an unrelated old review.
            if ((source.followUp?.base ?? source.base) !== parent || source.documentationIntegrations) {
                throw new Error("documentation source review must cover its trunk parent without nested integration evidence");
            }
        }
        const expected = git(root, ["-c", "merge.renames=false", "merge-tree", "--write-tree", parents[0], integration.base]);
        if (!/^[a-f0-9]{40}$/.test(expected) || git(root, ["rev-parse", `${integration.commit}^{tree}`]) !== expected) {
            throw new Error("documentation integration must exactly match Git's conflict-free merge tree");
        }
        anchor = integration.commit;
        base = integration.base;
    }
    onlyWorklogChanges(root, anchor, head, worklog);
    return base;
}
/** Read only committed evidence; paths and refs are data, never shell text. */
export function checkLocalReview(opts) {
    try {
        const config = JSON.parse(git(opts.root, ["show", `${opts.head}:morpheus.json`]));
        if (!reviewRequired(config))
            return [{ level: "waived", rule: "agent-review", message: "independent review disabled by project review.required=false" }];
        if (!opts.labels.includes("agent-reviewed"))
            throw new Error("add agent-reviewed only after completing the independent review");
        const lines = [...visibleProse(opts.body).matchAll(/^review-record:[ \t]*(\S+)[ \t]*$/gm)];
        if (lines.length !== 1)
            throw new Error("PR body needs one visible review-record: .agent/worklog/<task>.md line");
        const path = lines[0][1];
        if (!/^\.agent\/worklog\/[A-Za-z0-9][A-Za-z0-9._-]*\.md$/.test(path))
            throw new Error("review-record must name a worklog Markdown file");
        const mode = git(opts.root, ["ls-tree", opts.head, "--", path]).split(" ")[0];
        if (mode !== "100644")
            throw new Error("review worklog must be a regular committed file");
        const record = parseReviewRecord(git(opts.root, ["show", `${opts.head}:${path}`]));
        validateReviewRecord(record);
        for (const [older, newer] of [[record.base, record.reviewed], [record.reviewed, record.covered], [record.covered, opts.head]]) {
            git(opts.root, ["merge-base", "--is-ancestor", older, newer]);
        }
        const coveredBase = record.followUp?.base ?? record.base;
        if (coveredBase !== record.base) {
            if (!record.followUp?.scopeReason)
                throw new Error("base integration requires an explicit follow-up scope reason");
            git(opts.root, ["merge-base", "--is-ancestor", record.base, coveredBase]);
            git(opts.root, ["merge-base", "--is-ancestor", coveredBase, record.covered]);
        }
        const integratedBase = checkDocumentationIntegrations(opts.root, record, path, opts.head, coveredBase);
        if (git(opts.root, ["merge-base", opts.base, opts.head]) !== integratedBase)
            throw new Error("review base is stale; reconcile the base and review coverage explicitly");
        if (!record.followUp && record.reviewed !== record.covered) {
            const allowed = new Set(record.findings.filter(f => f.severity === "minor" && f.disposition === "fixed").flatMap(f => f.paths));
            const fixes = git(opts.root, ["diff", "--name-only", "--no-renames", record.reviewed, record.covered, "--"]).split("\n").filter(Boolean);
            if (fixes.some(p => p !== path && !allowed.has(p)))
                throw new Error("author-only fixes exceed the minor finding paths; review coverage must be renewed explicitly");
        }
        return [];
    }
    catch (error) {
        return [{ level: "error", rule: "agent-review", message: error instanceof Error ? error.message : String(error) }];
    }
}
//# sourceMappingURL=local.js.map