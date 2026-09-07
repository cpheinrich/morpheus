export interface CheckFinding {
    level: "error" | "warning" | "waived";
    rule: string;
    message: string;
}
export interface VisualEvidenceConfig {
    enabled: true;
    include: string[];
    exclude: string[];
    /** Repository-approved public media locations, scoped to an exact URL path prefix. */
    allowedUrlPrefixes?: string[];
}
export type VisualEvidencePolicy = {
    state: "absent";
} | {
    state: "invalid";
    message: string;
} | {
    state: "configured";
    config: VisualEvidenceConfig;
} | {
    state: "disabled";
    reason: string;
};
/**
 * New projects start with the React and Swift/SwiftUI surfaces covered.
 *
 * These are path contracts, not guesses about rendered pixels. A project can
 * narrow them to its own UI-owned directories, while a legacy project with no
 * declaration receives an advisory migration warning instead of a surprise
 * cross-repository failure.
 */
export declare const DEFAULT_VISUAL_EVIDENCE: VisualEvidenceConfig;
/** Resolve only the manifest block this check owns; unrelated fields pass through untouched. */
export declare function visualEvidencePolicy(manifest: unknown): VisualEvidencePolicy;
/** Use when the manifest itself could not be read, which must never look like an absent policy. */
export declare function unreadableVisualEvidencePolicy(message: string): VisualEvidencePolicy;
export declare function checkVisualEvidence(input: {
    body: string;
    changedFiles: string[];
    policy: VisualEvidencePolicy;
}): CheckFinding[];
