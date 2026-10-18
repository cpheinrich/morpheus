/** Expected resource/provider waits keep their delivery retryable without manufacturing a defect. */
export declare class CdWait extends Error {
    readonly code: string;
    constructor(message: string, code: string);
}
