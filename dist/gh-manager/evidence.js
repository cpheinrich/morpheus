import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
/**
 * Screenshots a session captured, published where a reviewer can see them.
 *
 * A session can render a pull request's web preview but holds no credential to upload anything,
 * and its token must not grow one. So it writes image files and leaves placeholders in the pull
 * request body; the deterministic apply step validates the files, pushes them to a branch of the
 * same repository that nothing else writes, and swaps each placeholder for a link. The files are
 * content-addressed, so a link always shows the bytes the session captured.
 *
 * A repository opts in by approving `evidencePrefix(repo)` in its `review.visualEvidence`
 * allowlist; until then `check pr` refuses these links and the session is told to escalate.
 */
export const EVIDENCE_BRANCH = "gh-manager-evidence";
export const MAX_EVIDENCE_FILES = 10;
export const MAX_EVIDENCE_BYTES = 5 * 1024 * 1024;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.(png|jpe?g)$/i;
const PLACEHOLDER = /\{\{gh-manager-evidence:([^}\s]+)\}\}/g;
/** The URL prefix a repository approves to accept the manager's screenshots. */
export function evidencePrefix(repo) {
    return `https://github.com/${repo}/raw/${EVIDENCE_BRANCH}/`;
}
/** Where one published file lives: per pull request, named by its content hash. */
export function evidencePath(pr, item) {
    return `pr-${pr}/${item.sha256}.${item.ext}`;
}
export function evidenceUrl(repo, pr, item) {
    return `${evidencePrefix(repo)}${evidencePath(pr, item)}`;
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
        // The caption is model-written; keep it from closing the alt text or the link.
        const caption = item.caption.replace(/[\][\r\n]/g, " ").trim();
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
//# sourceMappingURL=evidence.js.map