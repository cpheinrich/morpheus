export declare const MOODBOARD_DIR = "moodboard";
export declare const RESEARCH_DIR = "research";
export declare const CONCEPT_ASSETS_DIR = "research/assets";
export declare const EXPLORE_PROMPT_FILE = "explore-prompt.md";
export declare const FINALIZE_PROMPT_FILE = "finalize-prompt.md";
export interface WorkflowWriteResult {
    files: string[];
    skipped: string[];
}
export declare function initializeWorkflow(opts: {
    brandDir: string;
    name: string;
    prefix: string;
    refresh?: boolean;
}): Promise<WorkflowWriteResult>;
export declare function writeFinalizePrompt(opts: {
    brandDir: string;
    name: string;
    selection: string;
}): Promise<{
    path?: string;
    error?: string;
}>;
export declare function migrateLegacyAnswers(opts: {
    brandDir: string;
    name: string;
}): Promise<{
    path?: string;
    error?: string;
}>;
