import { type WebQaEvidence, type WebQaEvidenceInput } from "./schema.js";
type Status = WebQaEvidence["status"];
export declare function evidenceMetadata(win: Window, target: Element, input: WebQaEvidenceInput, errors: number): WebQaEvidence;
export declare function captureViewport(win: Window, container: ShadowRoot, signal: AbortSignal): Promise<Status>;
export {};
