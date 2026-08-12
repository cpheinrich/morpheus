export declare const ANALYTICS_SCHEMA_DIRECTORY = "packages/shared/schema";
export declare const ANALYTICS_SCHEMA_PATH = "packages/shared/schema/analytics.ts";
export declare const EMPTY_ANALYTICS_EVENT_MAP = "Record<never, never>";
export declare function isAnalyticsContractSource(source: string): boolean;
export interface AnalyticsContractDiscovery {
    contracts: string[];
    unreadable: string[];
}
export declare function findAnalyticsContracts(directory: string): Promise<AnalyticsContractDiscovery>;
