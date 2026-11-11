export declare function requireMorpheusProject(root: string): Promise<void>;
export declare function codexHookProject(cwd: string): Promise<{
    root: string;
    gitDir: string;
}>;
export declare function withCodexHookApproval<T>(home: string, action: (approveProject: (root: string) => Promise<number>) => Promise<T>, binary?: string): Promise<T>;
export declare function approveCodexHooks(cwd?: string, binary?: string): Promise<number>;
export declare function runCodexHooks(args: string[]): Promise<number>;
