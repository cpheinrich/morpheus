import type { ContextReceipt } from "./lease.js";
import type { RecordContent } from "./inputs.js";
import { type Provider, type Range, type ReadEntry } from "./evidence.js";
/**
 * How `context refresh` certifies reading in this process.
 *
 * - `recorded` — a read hook has run in this provider session and understood
 *   its results, so a record is certified only where the log covers it.
 * - `unhooked` — no hook can be shown to be watching (a human terminal, a tool
 *   without hooks, a project without them, a Codex hook not yet trusted).
 *   Refresh falls back to the old assertion and says so.
 * - `override` — `MORPHEUS_READ_EVIDENCE=off`, the declared escape for a hook
 *   that runs but cannot see a read. The receipt records `asserted`.
 */
export type EvidenceMode = {
    kind: "recorded";
    provider: Provider;
    reads: ReadEntry[];
    malformed: number;
} | {
    kind: "unhooked";
    reason: string;
} | {
    kind: "override";
};
/**
 * Decide the mode, and gather this session's evidence from every checkout of
 * the repository.
 *
 * Evidence is keyed by record id and content fingerprint, so a record read in
 * the primary checkout is read in the task worktree `pm claim` prepares at the
 * same trunk — requiring a second 35k-token read of identical content is the
 * waste this item exists to remove.
 */
export declare function evidenceMode(root: string, env?: NodeJS.ProcessEnv): Promise<EvidenceMode>;
/** The new-side lines a change added or rewrote, and what it removed. */
export interface Hunk {
    /** New-side range; `to < from` for a pure deletion before line `from`. */
    from: number;
    to: number;
    removed: string[];
}
/**
 * Line hunks from `before` to `after`, from Git's own diff.
 *
 * Considered `diff` (jsdiff): maintained, zero dependencies. Git is already a
 * hard dependency of every session command and its Myers diff is the one the
 * agent will see in review, so this adds no package. Null when Git cannot
 * answer — the caller then asks for the whole record rather than guessing
 * that nothing changed.
 */
export declare function changedHunks(before: string, after: string): Promise<Hunk[] | null>;
/** What one record still needs read before refresh can certify it. */
export interface Requirement {
    id: string;
    lines: number;
    /** `full` without a usable baseline; `changed` for a delta against the last receipt. */
    reason: "full" | "changed";
    needed: Range[];
    missing: Range[];
    hunks?: Hunk[];
}
/**
 * Per record, what must be covered by read evidence at its current content.
 *
 * Unchanged since `previous` → nothing. Changed, with the previous content in
 * the snapshot → the changed hunks. Otherwise → the whole record. Records with
 * no content are skipped: they are unresolvable, which the lease reports, and
 * no amount of reading clears them.
 */
export declare function requirements(previous: ContextReceipt | null, snapshot: ReadonlyMap<string, {
    fingerprint: string;
    content: string;
}>, current: readonly RecordContent[], reads: readonly ReadEntry[]): Promise<Requirement[]>;
/**
 * The content a receipt was taken on, so the next refresh can diff against it.
 * Beside the lease, local and ignored, overwritten with each receipt.
 */
export declare function snapshotPath(root: string, leaseId: string): string;
export declare function readSnapshot(root: string, leaseId: string): Promise<Map<string, {
    fingerprint: string;
    content: string;
}>>;
export declare function writeSnapshot(root: string, leaseId: string, records: readonly RecordContent[]): Promise<void>;
