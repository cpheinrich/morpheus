import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
/**
 * Screenshots a session captured, published where a reviewer can see them.
 *
 * A session can render a pull request's web preview but holds no credential to upload anything,
 * and its token must not grow one. So it writes image files and leaves placeholders in the pull
 * request body; the deterministic apply step validates the files, writes them as one orphan commit
 * in the same repository, tags it, and swaps each placeholder for a link through that tag.
 *
 * A repository opts in by approving `evidencePrefix(repo)` in its `review.visualEvidence`
 * allowlist; until then `check pr` refuses these links and the session is told to escalate.
 */
/**
 * Evidence is published as **tags**, not a branch. A branch push starts every Git-connected
 * deployment (Vercel builds each pushed branch), and an evidence-only tree would fail to build on
 * every screenshot. A tag starts nothing. Each publish is one orphan commit holding the files and a
 * tag `gh-manager-evidence/<commit>`. Files are named by their SHA-256, so a swapped image is
 * detectable, but a tag is a ref anyone with contents write can move: a repository that wants the
 * links immutable restricts updates and deletion of `gh-manager-evidence/*` tags to the App.
 */
export const EVIDENCE_TAG_PREFIX = "gh-manager-evidence";
export const MAX_EVIDENCE_FILES = 10;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g)$/i;
const PLACEHOLDER = /\{\{gh-manager-evidence:([^}\s]+)\}\}/g;
/** The URL prefix a repository approves to accept the manager's screenshots. */
export function evidencePrefix(repo) {
    return `https://github.com/${repo}/raw/${EVIDENCE_TAG_PREFIX}/`;
}
/** Where one file sits inside a publish commit: per pull request, named by its content hash. */
export function evidencePath(pr, item) {
    return `pr-${pr}/${item.sha256}.${item.ext}`;
}
/** The link to one file through the publish commit's tag. */
export function evidenceUrl(repo, commit, pr, item) {
    return `${evidencePrefix(repo)}${commit}/${evidencePath(pr, item)}`;
}
function imageKind(bytes) {
    if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return "png";
    if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
        return "jpg";
    return undefined;
}
/**
 * Read and check every file a decision names. Returns the items, or the first reason they cannot
 * be published. The file content decides the type, not the extension: a session's output is not
 * trusted to be what it says.
 */
export function prepareEvidence(dir, requests) {
    if (requests.length > MAX_EVIDENCE_FILES)
        return { problem: `${requests.length} screenshots, more than the ${MAX_EVIDENCE_FILES} allowed` };
    const seen = new Set();
    const items = [];
    for (const request of requests) {
        if (!NAME.test(request.file))
            return { problem: `"${request.file}" is not a plain .png or .jpg file name` };
        if (seen.has(request.file))
            return { problem: `"${request.file}" is listed twice` };
        seen.add(request.file);
        const path = join(dir, request.file);
        if (!existsSync(path))
            return { problem: `"${request.file}" was listed but not captured` };
        const size = statSync(path).size;
        if (size === 0 || size > MAX_EVIDENCE_BYTES)
            return { problem: `"${request.file}" is ${size} bytes; it must be between 1 byte and ${MAX_EVIDENCE_BYTES}` };
        const bytes = readFileSync(path);
        const kind = imageKind(bytes);
        if (!kind)
            return { problem: `"${request.file}" is not a PNG or JPEG image` };
        items.push({ ...request, bytes, ext: kind, sha256: createHash("sha256").update(bytes).digest("hex") });
    }
    return { items };
}
/**
 * Replace each `{{gh-manager-evidence:<file>}}` in a body with the published image. Every
 * placeholder must name a published file, and every published file must be placed: an orphan
 * either way means the body and the evidence disagree, which is exactly what a reviewer of the
 * evidence would be misled by.
 */
export function substituteEvidence(body, published) {
    const byName = new Map(published.map(item => [item.file, item]));
    const used = new Set();
    let unknown;
    const result = body.replace(PLACEHOLDER, (_match, name) => {
        const item = byName.get(name);
        if (!item) {
            unknown ??= name;
            return _match;
        }
        used.add(name);
        // The caption is model-written. Brackets and newlines would close the alt text; a backslash
        // would escape the closing bracket, leaving visible text instead of an image; a backtick could
        // open a code span over the link.
        const caption = item.caption.replace(/[\][\r\n\\`]/g, " ").trim();
        return `![${caption}](${item.url})`;
    });
    if (unknown)
        return { problem: `the body refers to "${unknown}", which was not captured` };
    const unused = published.find(item => !used.has(item.file));
    if (unused)
        return { problem: `"${unused.file}" was captured but the body never shows it` };
    return { body: result };
}
/** Whether a body still carries a placeholder: a decision with evidence but no body to place it in. */
export function hasPlaceholder(body) {
    return new RegExp(PLACEHOLDER.source).test(body);
}
/**
 * The apply step's whole handling of a decision's screenshots, kept apart from GitHub so its
 * safety rule can be tested: evidence matters only to a merge on the head the session finished
 * on; anything that cannot be validated, published or placed turns that merge into an escalation.
 * Other actions keep their own message and never publish (a stray file must not override what the
 * session asked a person to do), and a dry run never publishes.
 */
export function applyEvidence(decision, opts) {
    const relevant = decision.action === "merge" && opts.open && decision.head === opts.liveHead;
    if (!relevant)
        return decision;
    const escalate = (why) => ({ ...decision, action: "escalate", needsHuman: why });
    if (!decision.evidence.length) {
        return decision.body && hasPlaceholder(decision.body)
            ? escalate("The session left a screenshot placeholder in the pull request body but listed no screenshots. Attach the visual evidence by hand.")
            : decision;
    }
    const failed = (problem) => escalate(`The session captured screenshots as visual evidence, but they could not be published: ${problem}. Attach the evidence by hand.`);
    if (!decision.body)
        return failed("the decision lists screenshots but carries no body to show them in");
    const prepared = prepareEvidence(opts.dir, decision.evidence);
    if ("problem" in prepared)
        return failed(prepared.problem);
    // Substitute against the would-be links first, so a body that cannot place them is refused
    // before anything is written to the repository.
    const check = substituteEvidence(decision.body, opts.preview(prepared.items));
    if ("problem" in check)
        return failed(check.problem);
    if (opts.dryRun)
        return { ...decision, body: check.body };
    let published;
    try {
        published = opts.publish(prepared.items);
    }
    catch (error) {
        const stderr = error.stderr;
        return failed((stderr ? stderr.toString() : error instanceof Error ? error.message : String(error)).trim().split("\n")[0] || "unknown error");
    }
    const placed = substituteEvidence(decision.body, published);
    return "problem" in placed ? failed(placed.problem) : { ...decision, body: placed.body };
}
//# sourceMappingURL=evidence.js.map