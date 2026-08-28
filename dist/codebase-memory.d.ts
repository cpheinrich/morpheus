/**
 * Pin the bootstrap package rather than piping a moving shell script into a
 * trusted device. The npm wrapper verifies and caches the matching native
 * runtime; updating this value is an ordinary reviewed Morpheus change.
 */
export declare const CODEBASE_MEMORY_PACKAGE = "codebase-memory-mcp@0.10.8";
export declare const CODEBASE_MEMORY_VERSION: string;
export interface CodebaseMemoryCommandResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type CodebaseMemoryCommandRunner = (command: string, args: string[], cwd: string) => Promise<CodebaseMemoryCommandResult>;
export declare const runCommand: CodebaseMemoryCommandRunner;
export interface Invocation {
    command: string;
    prefix: string[];
}
export interface CodebaseMemoryStatus {
    available: boolean;
    version?: string;
    autoIndex: boolean | null;
    autoWatch: boolean | null;
    configuredClients: string[];
    projectName?: string;
    projectIndexed: boolean;
    projectFresh: boolean | null;
    morpheusSource: string;
    morpheusFresh: boolean | null;
    codebaseMemoryReady: boolean;
    ready: boolean;
    issues: string[];
}
export interface CodebaseMemoryOptions {
    runner?: CodebaseMemoryCommandRunner;
    home?: string;
    invocation?: Invocation;
    packageRoot?: string;
    checkMorpheusRemote?: boolean;
}
/**
 * Read operational state without changing it. Morpheus installation freshness asks
 * origin unless `checkMorpheusRemote` is false; every codebase-memory check is
 * local.
 *
 * A project is operational only when the executable runs, at least one local
 * agent client names it, automatic indexing and watching are enabled, and the
 * exact checkout (worktrees included) has a ready index at its current HEAD.
 */
export declare function codebaseMemoryStatus(root: string, opts?: CodebaseMemoryOptions): Promise<CodebaseMemoryStatus>;
export interface InstallResult {
    status: CodebaseMemoryStatus;
    changed: boolean;
    installerWarning?: string;
}
/**
 * Bring this device and this exact checkout to operational mode.
 *
 * The upstream installer owns client-specific files. Morpheus owns the
 * operational policy layered on top: auto-index, auto-watch, a full index for
 * the checkout, and a functional verification. Installer ownership conflicts
 * are surfaced but do not erase a successful functional verification.
 */
export declare function installCodebaseMemory(root: string, opts?: CodebaseMemoryOptions): Promise<InstallResult>;
export declare function formatCodebaseMemoryStatus(status: CodebaseMemoryStatus, installerWarning?: string): string;
