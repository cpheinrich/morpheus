export interface ReleaseTarget {
    project: string;
    rules: {
        release: string;
        path: string;
    }[];
    indexes: string;
}
export type ReadSource = (path: string) => string;
export type GetJson = (url: string) => Promise<unknown>;
export declare function selectTarget(policy: unknown, environment: string): ReleaseTarget;
export declare const digest: (content: string) => string;
export declare function assertSource(sourceSha: string, mainSha: string, checkoutSha: string, ref: string): void;
export declare function indexKey(value: unknown, expected?: boolean): string;
export declare function expectedIndexKeys(value: unknown): string[];
export declare function verifyRelease(options: {
    target: ReleaseTarget;
    environment: string;
    sourceSha: string;
    read: ReadSource;
    get: GetJson;
    now?: number;
}): Promise<Record<string, unknown>>;
/** Generate only the supported rules deployment surface, with explicit Storage bucket names. */
export declare function deployConfig(target: ReleaseTarget, sourceFiles: Record<string, string>): {
    config: object;
    only: string;
};
