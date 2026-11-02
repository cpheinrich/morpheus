import { type MeetingIntakeConfig } from "./schema.js";
import type { DiscoveryRecord } from "./core.js";
/** Read immutable Git objects; uncommitted files never acquire a committed source label. */
export declare function readCanonicalRecords(source: string, ref: string, config: MeetingIntakeConfig): Promise<{
    revision: string;
    records: DiscoveryRecord[];
}>;
