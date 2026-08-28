export declare const MORPHEUS_REMOTE = "https://github.com/cpheinrich/morpheus.git";
export declare const INSTALL_RECEIPT = "morpheus-install.json";
export declare const MORPHEUS_PACKAGE = "morpheus-kit";
export declare const MORPHEUS_PACKAGE_ROOT: string;
export interface MorpheusCommandResult {
    code: number;
    stdout: string;
    stderr: string;
}
export type MorpheusCommandRunner = (command: string, args: string[], cwd: string) => Promise<MorpheusCommandResult>;
export declare const runMorpheusCommand: MorpheusCommandRunner;
export type MorpheusInstallKind = "package" | "checkout" | "unknown";
export type MorpheusInstallRelation = "current" | "ahead" | "stale" | "dirty" | "unknown" | "offline";
export interface MorpheusInstallStatus {
    source: string;
    kind: MorpheusInstallKind;
    relation: MorpheusInstallRelation;
    installedSha: string | null;
    remoteSha: string | null;
    fresh: boolean | null;
    detail?: string;
}
export interface MorpheusStatusOptions {
    runner?: MorpheusCommandRunner;
    packageRoot?: string;
    offline?: boolean;
}
export declare function morpheusInstallStatus(opts?: MorpheusStatusOptions): Promise<MorpheusInstallStatus>;
export declare function formatMorpheusInstallStatus(status: MorpheusInstallStatus): string;
export declare class MorpheusInstallError extends Error {
}
export interface MorpheusInstallOptions {
    runner?: MorpheusCommandRunner;
    tempRoot?: string;
    now?: Date;
}
export interface MorpheusInstallResult {
    commit: string;
    packageRoot: string;
}
/** Install one clean, exact current-main checkout as a copied global package. */
export declare function installCurrentMorpheus(sourceRoot: string, opts?: MorpheusInstallOptions): Promise<MorpheusInstallResult>;
/** Clone current main into a disposable directory, install it, then remove it. */
export declare function updateMorpheus(opts?: MorpheusInstallOptions): Promise<MorpheusInstallResult>;
