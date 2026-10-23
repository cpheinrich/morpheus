import { type CdConfig, type SourceRevision, type TestEvidence, type TestProof } from "./schema.js";
import { type GitHubApi } from "./store.js";
export declare function git(root: string, args: string[]): string;
export declare function inputDigest(root: string, revision: string, inputs: string[]): string;
export declare function verifySource(root: string, config: CdConfig, sourceSha: string, expectedDigest: string): void;
export declare function verifyValidator(root: string, evidence: TestEvidence | TestProof): void;
/** Merge time is evidence only for the exact merge commit on the first-parent main chain. */
export declare function loadSources(root: string, config: CdConfig, api: GitHubApi, now: string): Promise<SourceRevision[]>;
export declare function verifyConfiguration(config: CdConfig, expected: string): void;
