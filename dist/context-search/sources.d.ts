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
export declare function contextCoverage(root: string, rules: SourceRules, tracked?: boolean): Promise<Coverage>;
export declare function readContextSources(root: string, paths: readonly string[]): Promise<{
    path: string;
    text: string;
}[]>;
