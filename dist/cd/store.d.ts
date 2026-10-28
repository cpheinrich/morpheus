import { type CdConfig, type CdState } from "./schema.js";
export interface GitHubApi {
    request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
export declare class GhApi implements GitHubApi {
    request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
export interface GitHubReadLimit {
    maximumRequests: number;
    timeoutMs: number;
}
/** An optional read sweep must finish completely within its finite budget or refuse. */
export declare function boundedGitHubReadApi(api: GitHubApi, limits: GitHubReadLimit, signal?: AbortSignal): GitHubApi;
export declare function errorText(error: unknown): string;
export declare function isMissing(error: unknown): boolean;
export declare function pages<T>(api: GitHubApi, path: string, key?: string): Promise<T[]>;
export interface Snapshot {
    head: string;
    tree: string;
    state: CdState;
}
export interface Transaction<T> {
    state: CdState;
    head: string;
    result: T;
    replayed: boolean;
}
export declare class GitHubStore {
    readonly api: GitHubApi;
    readonly config: CdConfig;
    constructor(api: GitHubApi, config: CdConfig);
    private get root();
    read(): Promise<Snapshot>;
    private blob;
    private write;
    initialize(now: string, epoch?: string): Promise<Transaction<{
        epoch: string;
    }>>;
    transact<T>(id: string, kind: string, now: string, transition: (state: CdState) => T): Promise<Transaction<T>>;
    repairBackup(): Promise<void>;
}
