/**
 * Before Claude greps project records, add cited Tantivy excerpts for the same terms.
 *
 * Modelled on codebase-memory's search augmenter: it never blocks or rewrites the
 * search, and it stays silent unless the search is aimed at project records, so
 * code searches remain codebase-memory's. The tagged context and the user-visible
 * system message are how a person can tell the context engine took part.
 */
export interface SearchTarget {
    pattern: string;
    /** Paths the search names; empty means the working directory. */
    paths: string[];
    /** A glob or type filter limits the search to Markdown. */
    markdown: boolean;
}
/**
 * Split a command line into simple commands of words. Quotes are honoured, so a pattern
 * such as `"a|b"` stays one word; unquoted `|`, `;`, `&` and newlines end a command.
 * Enough for a hint, not a shell interpreter.
 */
export declare function commands(line: string): string[][];
/** The search a Grep or Bash call is about to run, if it is one. */
export declare function searchTarget(tool: unknown, input: unknown): SearchTarget | undefined;
/** Free-text terms from a regular expression, for a ranked search rather than a literal one. */
export declare function queryTerms(pattern: string): string;
/** Does the search aim at project records rather than code? */
export declare function targetsRecords(paths: readonly string[], markdown: boolean, records: readonly string[]): boolean;
interface HookInput {
    cwd?: unknown;
    session_id?: unknown;
    tool_name?: unknown;
    tool_input?: unknown;
}
export declare function searchHint(input: HookInput, locateRoot: (cwd: string) => Promise<string | null>): Promise<{
    additionalContext: string;
    systemMessage: string;
} | undefined>;
export {};
