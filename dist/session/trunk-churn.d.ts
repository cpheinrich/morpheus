/**
 * Which dirty-trunk edits are IDE churn rather than anybody's work.
 *
 * Nineteen `wip/trunk-*` rescue drafts were opened across the fleet and none
 * was ever adopted. Most held what an IDE writes by itself: Xcode re-sorting
 * a `project.pbxproj` build-settings dictionary, re-serialising a shared
 * `.xcscheme` from one attribute per line to one element per line, or
 * per-user state that should never have been tracked. Evo opened ten of them
 * in two days, alternating between two such diffs, and each became a human's
 * queue item.
 *
 * So the rescue classifies before it publishes. The rule is deliberately
 * narrow, because a false positive discards somebody's edit while a false
 * negative only opens a draft that ages out (see `RESCUE_MAX_AGE_DAYS`). An
 * edit is churn only when it provably carries nothing:
 *
 * - **user state** — a modified or deleted file at a path that is per-user
 *   IDE state by definition (`xcuserdata/`, `.DS_Store`, JetBrains'
 *   `workspace.xml` and friends). `.vscode/` is *not* here: every file VS Code
 *   keeps there is shared configuration people edit on purpose.
 * - **format only** — a modified Xcode file whose structure is unchanged:
 *   a pbxproj where only whitespace, comments and dictionary key order moved
 *   (arrays keep their order, because build-phase order is behaviour), or an
 *   XML scheme/workspace whose elements and attributes are identical.
 * - **on trunk** — the working tree already holds exactly what trunk now has
 *   for that path (same bytes and mode, or the same structure for the Xcode
 *   formats above), so the fast-forward after the reset restores it.
 *
 * Anything unparseable, oversized, binary-looking, a submodule, or simply not
 * matched is real work and is rescued as before. A checkout whose edits are
 * all churn is reset with a one-line report; one real edit among them and the
 * whole set is rescued as today, churn included, so nothing is split apart.
 */
export type ChurnKind = "user-state" | "format-only" | "on-trunk";
export interface ChurnEntry {
    path: string;
    kind: ChurnKind;
}
/** One path from `git diff --raw -z --no-renames`. */
export interface RawChange {
    path: string;
    /** `A`, `M`, `D`, `T`… */
    status: string;
    oldMode: string;
    newMode: string;
    oldBlob: string;
    newBlob: string;
}
export interface TreeEntry {
    mode: string;
    blob: string;
}
/** Reads a blob's text, or null when it cannot (too large, missing). Injected so the classifier stays pure. */
export type BlobReader = (blob: string) => Promise<string | null>;
/** Per-user IDE state by path alone. A path *segment* must match, so `src/xcuserdata.ts` is not one. */
export declare function userStatePath(path: string): boolean;
type Canonicalizer = (text: string) => string | null;
/** The structured formats whose re-serialisation by Xcode is recognised. */
export declare function canonicalizerFor(path: string): Canonicalizer | null;
/**
 * An OpenStep property list — the pbxproj format — with whitespace and
 * comments dropped and dictionary keys sorted. Array order is kept: it is
 * meaningful (`buildPhases` runs in that order). Strings keep their exact
 * spelling, quotes included, so `"Evo"` and `Evo` differ: Xcode's quoting is
 * deterministic, and a difference there is not something it does on its own.
 * Returns null for anything it does not fully understand.
 */
export declare function canonicalPbxproj(text: string): string | null;
/**
 * An Xcode XML file (`.xcscheme`, `.xcworkspacedata`) as its sequence of
 * elements, with attributes sorted and whitespace-only text dropped. Xcode
 * writes one attribute per line; other tools write one element per line; both
 * are the same document. Element order, attribute values (raw, entities
 * unexpanded) and any real text are kept. Returns null for anything beyond
 * plain elements, attributes, comments and the XML declaration.
 */
export declare function canonicalXml(text: string): string | null;
/**
 * Classify every changed path. `trunk` is the fetched trunk tip's entry for
 * each path, absent when trunk does not have it. Returns the churn and the
 * paths that are real work; the caller resets only when `real` is empty.
 */
export declare function classifyChanges(changes: RawChange[], trunk: ReadonlyMap<string, TreeEntry>, read: BlobReader): Promise<{
    churn: ChurnEntry[];
    real: string[];
}>;
/** Parse `git diff --raw -z --no-renames --no-abbrev`. */
export declare function parseRawDiff(raw: string): RawChange[];
/** Parse `git ls-tree -r -z`: `<mode> <type> <object>\t<path>`. */
export declare function parseLsTree(raw: string): Map<string, TreeEntry>;
/** `2 IDE user state, 1 formatting only: a/b.pbxproj, …` — for the one-line report. */
export declare function describeChurn(churn: ChurnEntry[]): string;
export {};
