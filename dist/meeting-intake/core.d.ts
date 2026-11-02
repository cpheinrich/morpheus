import { DiscoveryNote, type MeetingIntakeConfig } from "./schema.js";
export interface DiscoveryRecord {
    path: string;
    raw: string;
    data: DiscoveryNote;
}
export interface CatalogEntry {
    id: string;
    occurred: string;
    title: string;
    summary: string;
    projects: string[];
    topics: string[];
    attendees: string[];
    policy: DiscoveryNote["intake_policy"];
    sourceKind: DiscoveryNote["source_kind"];
    sourceCoverage: DiscoveryNote["source_coverage"];
    related: string[];
    noteDigest: string;
    path: string;
    url: string;
    repositoryUrl: string;
}
export interface Catalog {
    schemaVersion: 1;
    project: string;
    source: {
        repository: string;
        revision: string;
        directory: string;
    };
    entries: CatalogEntry[];
}
/** Pure projection. Repository IO, collaborators, topics and destinations stay in config. */
export declare function buildCatalog(records: DiscoveryRecord[], revision: string, config: MeetingIntakeConfig): Catalog;
export declare function renderIndex(catalog: Catalog, config: MeetingIntakeConfig): string;
export declare function searchCatalog(catalog: Catalog, query?: string, topic?: string, limit?: number): CatalogEntry[];
/** This gate formats a notice; the configured adapter owns actual delivery and reconciliation. */
export declare function completionNotice(record: Record<string, unknown>, config: MeetingIntakeConfig): string;
