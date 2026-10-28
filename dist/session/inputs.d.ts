import { type ContextInput } from "./lease.js";
export declare function fingerprint(content: string): string;
/**
 * Fingerprint canonical inputs on disk. This is the only producer of the
 * fingerprints a receipt stores and an observation compares, so both sides of
 * the comparison are computed the same way by construction.
 *
 * A file that cannot be read gets a sentinel rather than being skipped or
 * throwing. Skipping would make an absent record indistinguishable from an
 * unchanged one, and a freshness check is the wrong place to abort with a raw
 * filesystem error — one bad record must not take the whole check down.
 */
export declare function readInputs(root: string, ids?: readonly string[]): Promise<ContextInput[]>;
/** A record's fingerprint and, when it has any, the content that produced it. */
export interface RecordContent extends ContextInput {
    /** Null exactly when `fingerprint` is a sentinel. */
    content: string | null;
}
/**
 * `readInputs` with the content kept. Read evidence is checked line by line,
 * and a delta refresh diffs against the content a receipt was taken on, so
 * both need the text the fingerprint was computed from — read once, here, so
 * the two can never describe different moments.
 */
export declare function readRecords(root: string, ids?: readonly string[]): Promise<RecordContent[]>;
