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
 * tag `gh-manager-evidence/<commit>`, so a link names the exact commit the apply step wrote: the
 * bytes behind it cannot be swapped later by anyone pushing to a shared branch.
 */
export declare const EVIDENCE_TAG_PREFIX = "gh-manager-evidence";
export declare const MAX_EVIDENCE_FILES = 10;
export declare const MAX_EVIDENCE_BYTES: number;
export interface EvidenceRequest {
    file: string;
    caption: string;
}
export interface EvidenceItem extends EvidenceRequest {
    bytes: Buffer;
    sha256: string;
    ext: "png" | "jpg";
}
/** The URL prefix a repository approves to accept the manager's screenshots. */
export declare function evidencePrefix(repo: string): string;
/** Where one file sits inside a publish commit: per pull request, named by its content hash. */
export declare function evidencePath(pr: number, item: Pick<EvidenceItem, "sha256" | "ext">): string;
/** The link to one file through the publish commit's tag. */
export declare function evidenceUrl(repo: string, commit: string, pr: number, item: Pick<EvidenceItem, "sha256" | "ext">): string;
/**
 * Read and check every file a decision names. Returns the items, or the first reason they cannot
 * be published. The file content decides the type, not the extension: a session's output is not
 * trusted to be what it says.
 */
export declare function prepareEvidence(dir: string, requests: EvidenceRequest[]): {
    items: EvidenceItem[];
} | {
    problem: string;
};
/**
 * Replace each `{{gh-manager-evidence:<file>}}` in a body with the published image. Every
 * placeholder must name a published file, and every published file must be placed: an orphan
 * either way means the body and the evidence disagree, which is exactly what a reviewer of the
 * evidence would be misled by.
 */
export declare function substituteEvidence(body: string, published: {
    file: string;
    caption: string;
    url: string;
}[]): {
    body: string;
} | {
    problem: string;
};
/** Whether a body still carries a placeholder: a decision with evidence but no body to place it in. */
export declare function hasPlaceholder(body: string): boolean;
type Published = {
    file: string;
    caption: string;
    url: string;
}[];
/**
 * The apply step's whole handling of a decision's screenshots, kept apart from GitHub so its
 * safety rule can be tested: evidence matters only to a merge on the head the session finished
 * on; anything that cannot be validated, published or placed turns that merge into an escalation.
 * Other actions keep their own message and never publish (a stray file must not override what the
 * session asked a person to do), and a dry run never publishes.
 */
export declare function applyEvidence<D extends {
    action: string;
    head: string;
    body?: string | undefined;
    evidence: EvidenceRequest[];
    needsHuman?: string | undefined;
}>(decision: D, opts: {
    dir: string;
    liveHead: string;
    open: boolean;
    dryRun: boolean;
    publish: (items: EvidenceItem[]) => Published;
    preview: (items: EvidenceItem[]) => Published;
}): D;
export {};
