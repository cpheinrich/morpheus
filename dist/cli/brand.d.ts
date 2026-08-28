export interface BrandWorkflowOptions {
    brandDir: string;
    name: string;
    prefix: string;
}
export interface BrandIdentity {
    name: string;
    prefix: string;
}
/** Explicit flags win; the durable project manifest wins over a worktree name. */
export declare function resolveBrandIdentity(root: string, overrides?: {
    name?: string;
    prefix?: string;
}): Promise<BrandIdentity>;
/** Add only the local exploration boundaries; never replace project ignore policy. */
export declare function ensureBrandExplorationIgnored(root: string): Promise<string | null>;
/**
 * Scaffold the visual-first brand workflow. It deliberately asks no terminal
 * questions: the editable brief and the moodboard are better design input
 * than a forced questionnaire, and a stopped command leaves useful files.
 */
export declare function init(opts: BrandWorkflowOptions & {
    root?: string;
}): Promise<number>;
/** Refresh only derived handoff material after the brief or reference set moves. */
export declare function explore(opts: BrandWorkflowOptions): Promise<number>;
/**
 * Legacy compatibility for projects which still invoke `brand build`.
 * There is no longer an answers file to generate from; refreshing the
 * exploration handoff is the safe equivalent.
 */
export declare function build(opts: BrandWorkflowOptions): Promise<number>;
/** Create a finalization prompt only after a valid review page exists. */
export declare function finalize(opts: BrandWorkflowOptions & {
    selection?: string;
}): Promise<number>;
/** Copy, never delete, a legacy questionnaire into a free-form exploration brief. */
export declare function migrate(opts: Omit<BrandWorkflowOptions, "prefix">): Promise<number>;
/** A CI-safe completeness check that never writes. */
export declare function check(opts: Pick<BrandWorkflowOptions, "brandDir" | "name">): Promise<number>;
