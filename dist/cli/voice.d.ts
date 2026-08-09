/**
 * `morpheus voice` — moving context into a voice conversation and back.
 *
 * A voice session starts cold every time: it cannot read the repo, run the CLI,
 * or see the board. Two commands, matching the two halves of what it needs.
 * `knowledge` is the standing explainer, uploaded once to the claude.ai project.
 * `brief` is today's state, regenerated and pasted each session.
 *
 * The return leg is a skill rather than a command, because ingesting a spec is
 * judgment — checking it against the codebase and finding where it is wrong —
 * and that is not something a deterministic command can do.
 */
/** Where the standing explainer is written. Not a handoff, so not beside them. */
export declare const KNOWLEDGE_PATH = "local/voice/knowledge.md";
export declare function knowledge(root: string, out?: string): Promise<number>;
export interface BriefOptions {
    root: string;
    productDir: string;
    topic?: string;
    slug?: string;
    notes?: string;
    /** Inline the standing explainer, for a chat with no project knowledge. */
    full?: boolean;
}
export declare function brief(opts: BriefOptions): Promise<number>;
