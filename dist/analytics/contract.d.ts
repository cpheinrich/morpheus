export declare const ANALYTICS_SCHEMA_DIRECTORY = "packages/shared/schema";
export declare const ANALYTICS_SCHEMA_PATH = "packages/shared/schema/analytics.ts";
export declare const EMPTY_ANALYTICS_EVENT_MAP = "Record<never, never>";
export declare function isAnalyticsContractSource(source: string): boolean;
export declare function findAnalyticsContracts(directory: string): Promise<string[]>;
