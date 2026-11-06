/** A changed file and the new-side line ranges that changed in it. */
export interface ChangedFile {
    path: string;
    /** Every line counts as changed: an added, untracked or binary file. */
    whole: boolean;
    /** Inclusive [first, last] new-side lines. A pure deletion spans the two lines around it. */
    ranges: [number, number][];
}
export type ChangeSet = {
    ok: true;
    mergeBase: string;
    files: ChangedFile[];
} | {
    ok: false;
    reason: string;
};
/**
 * What changed between the merge base of `base` and HEAD, and the working
 * tree: committed, staged, unstaged and untracked work alike, because the
 * local check runs before anything is committed.
 */
export declare function changedFiles(root: string, base: string): Promise<ChangeSet>;
export interface NameStatus {
    status: string;
    path: string;
    from?: string;
}
/** `--name-status -z`: a status, then one path, or two for a rename or copy. */
export declare function parseNameStatus(out: string): NameStatus[];
/**
 * New-side ranges from `-U0` hunk headers. `+c,0` is a pure deletion after new
 * line c, so the lines either side of the gap, c and c+1, are what it touched.
 */
export declare function parseHunkRanges(diff: string): [number, number][];
/** Every file in the working tree that Git tracks or would track, for `--all`. */
export declare function allFiles(root: string): Promise<{
    ok: true;
    files: string[];
} | {
    ok: false;
    reason: string;
}>;
