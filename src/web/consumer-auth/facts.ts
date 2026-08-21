import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { EnvironmentFacts, WorkloadIdentityFacts } from "./context.js";

/**
 * Read both environments' Firebase facts back out of a generated
 * `lib/firebase/config.ts`.
 *
 * The single-environment reader in `survey.ts` matches the *first* occurrence
 * of each key, which on the two-environment consumer config is the production
 * block — correct for production, silent about staging. This one is
 * block-scoped: each set of keys is read from inside its own `*_CONFIG`
 * object, so the two cannot be crossed.
 *
 * Parsed rather than imported, for `survey.ts`'s reason: the file is
 * TypeScript, and evaluating a repository's code to answer a question about it
 * is a much larger thing to do than matching the keys we generated. Any
 * missing key returns null for that environment, so a hand-edited config is
 * treated as unknown rather than half-understood.
 */

export interface TwoEnvFacts {
  production: EnvironmentFacts | null;
  staging: EnvironmentFacts | null;
  workloadIdentity: WorkloadIdentityFacts | null;
}

function block(source: string, name: string): string | null {
  const start = source.indexOf(`const ${name} = {`);
  if (start === -1) return null;
  const end = source.indexOf("}", start);
  return end === -1 ? null : source.slice(start, end);
}

function factsFrom(blockSource: string | null): EnvironmentFacts | null {
  if (!blockSource) return null;
  const read = (key: string): string | undefined =>
    new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(blockSource)?.[1];

  const projectId = read("projectId");
  const apiKey = read("apiKey");
  const authDomain = read("authDomain");
  const storageBucket = read("storageBucket");
  const messagingSenderId = read("messagingSenderId");
  const appId = read("appId");
  if (!projectId || !apiKey || !authDomain || !storageBucket || !messagingSenderId || !appId) {
    return null;
  }
  return { projectId, apiKey, authDomain, storageBucket, messagingSenderId, appId };
}

export function parseTwoEnvFacts(source: string): TwoEnvFacts {
  const read = (key: string): string | undefined =>
    new RegExp(`${key}\\s*:\\s*"([^"]+)"`).exec(source)?.[1];
  const poolId = read("poolId");
  const providerId = read("providerId");
  const serviceAccount = read("serviceAccount");

  return {
    production: factsFrom(block(source, "PRODUCTION_CONFIG")),
    staging: factsFrom(block(source, "STAGING_CONFIG")),
    workloadIdentity:
      poolId && providerId && serviceAccount ? { poolId, providerId, serviceAccount } : null,
  };
}

export async function readTwoEnvFacts(root: string, webRoot: string): Promise<TwoEnvFacts> {
  const path = join(
    root,
    webRoot === "." ? "lib/firebase/config.ts" : `${webRoot}/lib/firebase/config.ts`,
  );
  const source = await readFile(path, "utf8").catch(() => null);
  if (!source) return { production: null, staging: null, workloadIdentity: null };
  return parseTwoEnvFacts(source);
}
