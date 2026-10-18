import { type TestEvidence } from "./schema.js";
/** Hashes alone are assertions. Verify the downloaded bytes before committing evidence. */
export declare function validatePayloadFiles(evidence: TestEvidence, evidencePath: string): Promise<void>;
