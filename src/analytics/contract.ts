export const ANALYTICS_SCHEMA_DIRECTORY = "packages/shared/schema";
export const ANALYTICS_SCHEMA_PATH = `${ANALYTICS_SCHEMA_DIRECTORY}/analytics.ts`;
export const EMPTY_ANALYTICS_EVENT_MAP = "Record<never, never>";

export function isAnalyticsContractFilename(name: string): boolean {
  return /^analytics(?:[._-].+)?\.ts$/i.test(name);
}
