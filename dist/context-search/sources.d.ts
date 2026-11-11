export declare const CONTEXT_SOURCE_DEFAULTS: string[];
export declare const CONTEXT_KINDS: readonly ["decision", "lesson", "roadmap", "worklog", "runbook", "meeting_note", "other"];
export type ContextKind = typeof CONTEXT_KINDS[number];
export declare function contextKind(path: string): ContextKind;
export interface SourceRules {
    include: readonly string[];
    exclude: readonly string[];
}
export interface Coverage {
    included: string[];
    excluded: string[];
    uncovered: string[];
    emptyPatterns: string[];
}
export declare function classifySources(paths: readonly string[], rules: SourceRules): Coverage;
export declare function discoverSources(root: string, rules: SourceRules): Promise<Coverage>;
export declare function contextCoverage(root: string, rules: SourceRules): Promise<Coverage & {
    unavailable: string[];
}>;
export declare function readContextSources(root: string, paths: readonly string[]): Promise<{
    path: string;
    text: string;
}[]>;
