export declare const QA_RESPONDER_CONFIG = "local/qa-comments/responder.json";
export declare const QA_RESPONDER_LOCK = "local/qa-comments/responder.lock";
export interface QaResponderConfig {
    agent: string;
    command: string[];
    pollMs: number;
}
export declare function loadResponderConfig(root: string): Promise<QaResponderConfig>;
interface ResponderMarker {
    agent: string;
    pid: number;
    startedAt: string;
    root: string;
}
export declare function responderStatus(root: string): Promise<ResponderMarker | null>;
export declare function isResponderActive(root: string): Promise<boolean>;
export declare function requestResponderStop(root: string): Promise<boolean>;
export declare function recoverStoppedResponder(root: string, confirmedNoAgentProcess?: boolean): Promise<boolean>;
/** One process per checkout. Later Sends accumulate while the configured agent handles a batch. */
export declare function runQaResponder(root: string, config: QaResponderConfig, signal: AbortSignal, log?: {
    (...data: any[]): void;
    (message?: any, ...optionalParams: any[]): void;
}): Promise<void>;
export {};
