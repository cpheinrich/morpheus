/**
 * The standing explainer, for a voice session's project knowledge.
 *
 * A voice session starts cold. It cannot read the repository, run the CLI, or
 * see the board — so anything it needs to be useful has to arrive as text, and
 * that text competes for the same context the actual conversation needs.
 *
 * This is the half that **does not change between sessions**: what a Morpheus
 * project is, how work moves through it, and what to produce at the end. It is
 * uploaded once to the claude.ai project's knowledge and refreshed only when a
 * convention changes. The per-session half — what the board looks like today —
 * is `brief.ts`, because it goes stale in hours and could never live in a file
 * uploaded once.
 *
 * That split is the whole design. It survives either answer to the question
 * nobody could settle from the docs: whether project knowledge actually reaches
 * a voice conversation. If it does, the brief stays short. If it does not, the
 * brief is prepended with this and the workflow still works.
 */
export interface KnowledgeInput {
    /** Display name, e.g. "Morpheus". */
    name: string;
    /** Id prefix from morpheus.json, e.g. "MO". */
    prefix: string;
    /** company | personal | internal. */
    kind?: string;
    /** One-line description from morpheus.json. */
    description?: string;
}
/**
 * Build the standing knowledge document.
 *
 * Generic over projects on purpose: Morpheus scaffolds other repos, and a
 * knowledge file that only described Morpheus would be wrong in every one of
 * them. Everything project-specific comes from the manifest.
 */
export declare function buildKnowledge(input: KnowledgeInput): string;
