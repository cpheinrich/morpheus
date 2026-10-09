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
export declare const EVIDENCE_BRANCH = "gh-manager-evidence";
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
/** Where one published file lives: per pull request, named by its content hash. */
export declare function evidencePath(pr: number, item: Pick<EvidenceItem, "sha256" | "ext">): string;
export declare function evidenceUrl(repo: string, pr: number, item: Pick<EvidenceItem, "sha256" | "ext">): string;
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
