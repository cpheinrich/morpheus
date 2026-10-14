export interface Worktree {
    path: string;
    head: string;
    branch?: string;
    detached: boolean;
    locked?: string;
    prunable?: string;
}
/** NUL records preserve spaces, newlines, and Git's unquoted paths. */
export declare function listWorktrees(root: string): Promise<Worktree[]>;
export declare function missingDirectory(path: string): Promise<boolean>;
export declare function assertWorktreePolicy(root: string, trunkBranch: string): Promise<void>;
