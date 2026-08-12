import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export const ANALYTICS_SCHEMA_DIRECTORY = "packages/shared/schema";
export const ANALYTICS_SCHEMA_PATH = `${ANALYTICS_SCHEMA_DIRECTORY}/analytics.ts`;
export const EMPTY_ANALYTICS_EVENT_MAP = "Record<never, never>";

export function isAnalyticsContractSource(source: string): boolean {
  return /\bexport\s+(?:(?:type|interface)\s+ProjectAnalyticsEvents\b|\{\s*type\s+ProjectAnalyticsEvents\b)/.test(
    source,
  );
}

export interface AnalyticsContractDiscovery {
  contracts: string[];
  unreadable: string[];
}

export async function findAnalyticsContracts(
  directory: string,
): Promise<AnalyticsContractDiscovery> {
  const entries = (await readdir(directory))
    .filter(
      (name) =>
        name.endsWith(".ts") &&
        !/(?:\.d|\.test|\.spec|\.stories)\.ts$/i.test(name),
    )
    .sort();
  const contracts: string[] = [];
  const unreadable: string[] = [];

  for (const name of entries) {
    const source = await readFile(join(directory, name), "utf8").catch(() => null);
    if (source === null) {
      unreadable.push(name);
      continue;
    }
    if (isAnalyticsContractSource(source)) contracts.push(name);
  }

  return { contracts, unreadable };
}
