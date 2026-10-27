import { type Attempt, type CdConfig, type ExternalObservation, type InternalObservation, type Receipt } from "./schema.js";
export interface AppleApi {
    request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
interface Resource {
    id: string;
    type: string;
    attributes?: Record<string, unknown>;
    relationships?: Record<string, {
        data: {
            id: string;
            type: string;
        } | {
            id: string;
            type: string;
        }[] | null;
    }>;
}
export declare class AppleRequestError extends Error {
    readonly status: number;
    constructor(status: number, message: string);
}
export declare class AppleHttp implements AppleApi {
    readonly config: CdConfig;
    readonly environment: NodeJS.ProcessEnv;
    readonly fetcher: typeof fetch;
    private token?;
    constructor(config: CdConfig, environment?: NodeJS.ProcessEnv, fetcher?: typeof fetch);
    private authorization;
    request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T>;
}
export declare function applePages(api: AppleApi, path: string): Promise<{
    data: Resource[];
    included: Resource[];
}>;
export interface AppleReadLimit {
    maximumRequests: number;
    timeoutMs: number;
}
export declare class AppleAdapter {
    readonly api: AppleApi;
    constructor(api: AppleApi);
    group(groupId: string): Promise<InternalObservation["group"]>;
    maximum(appId: string, version: string, limits?: AppleReadLimit): Promise<string>;
    observe(attempt: Attempt, groupId: string, now: string, limits?: AppleReadLimit): Promise<{
        uploadState?: string;
        diagnostics?: string;
        observation?: InternalObservation;
    }>;
    assign(buildId: string, groupId: string): Promise<void>;
    external(receipt: Receipt, groupIds: string[], now: string): Promise<ExternalObservation>;
    notifyExternal(detailId: string): Promise<void>;
    submitReview(buildId: string): Promise<string>;
}
export {};
