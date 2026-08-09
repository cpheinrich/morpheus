import type { ZodType } from "zod";
import { type ArtifactKind, type ArtifactTypes } from "./schema.js";
/** A parsed item: validated frontmatter plus the markdown body. */
export interface Item<T> {
    /** Absolute path the item was read from. */
    path: string;
    /** Validated frontmatter. */
    data: T;
    /** Markdown body after the frontmatter block. */
    body: string;
}
export interface ParseIssue {
    path: string;
    message: string;
}
export interface ParseResult<T> {
    items: Item<T>[];
    issues: ParseIssue[];
}
/**
 * Parse and validate every markdown item in a directory.
 *
 * Invalid files become issues rather than throwing, so a single malformed
 * file cannot block the whole run — `morpheus pm validate` reports all of
 * them at once instead of one per invocation.
 */
export declare function parseDir<T>(dir: string, schema: ZodType<T>): Promise<ParseResult<T>>;
/** Parse one artifact kind out of a product directory (e.g. hq/product). */
export declare function parseArtifact<K extends ArtifactKind>(productDir: string, kind: K): Promise<ParseResult<ArtifactTypes[K]>>;
/** Detect ids used more than once within a set of items. */
export declare function findDuplicateIds<T extends {
    id: string;
}>(items: Item<T>[]): ParseIssue[];
