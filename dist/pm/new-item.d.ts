import { type ArtifactKind } from "./schema.js";
export interface Allocation {
    id: string;
    /**
     * True when the remote could not be consulted, so the id is derived from
     * local files alone and may already be claimed elsewhere.
     */
    blind: boolean;
}
/**
 * Allocate the next sequential id for an artifact kind.
 *
 * Two sources, because neither alone is complete: the item files hold every id
 * that has **merged**, and the remote branch heads hold every id another
 * session has **claimed** but not yet landed. Reading only the first re-issues
 * a live claim.
 *
 * `blind` is returned rather than swallowed. An unreachable origin cannot tell
 * us an id is free, and reporting that as a clean allocation is the mistake
 * `.agent/learned.md` records under *never let an unanswerable question render
 * as a confident answer*.
 */
export declare function nextId(productDir: string, kind: ArtifactKind, prefix: string, cwd: string, now?: Date): Promise<Allocation>;
export interface NewItemOptions {
    productDir: string;
    kind: ArtifactKind;
    /** Project prefix from morpheus.json. */
    prefix: string;
    title: string;
    /** Repo root, so allocation can ask origin which ids are already claimed. */
    cwd: string;
    /** Roadmap only. */
    priority?: string;
    /** Name the slug deliberately, like a branch. Falls back to the title. */
    slug?: string;
    goal?: string;
    /** GitHub issues the roadmap item fully resolves. */
    issues?: number[];
    /** Injectable clock, so tests can pin the period a goal lands in. */
    now?: Date;
}
export interface NewItem {
    path: string;
    id: string;
    /** True when origin could not be consulted and the id may collide. */
    blind: boolean;
}
/** Create a new item file with valid frontmatter. */
export declare function createItem(opts: NewItemOptions): Promise<NewItem>;
