import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export interface ReleaseTarget {
  project: string;
  rules: { release: string; path: string }[];
  indexes: string;
}

type JsonObject = Record<string, unknown>;
export type ReadSource = (path: string) => string;
export type GetJson = (url: string) => Promise<unknown>;

function object(value: unknown): JsonObject {
  assert(value !== null && typeof value === "object" && !Array.isArray(value), "Expected a JSON object");
  return value as JsonObject;
}

function sourcePath(value: unknown): string {
  assert(typeof value === "string" && /^[A-Za-z0-9_./-]+$/.test(value)
    && !value.startsWith("/") && value.split("/").every((part) => part && part !== "." && part !== ".."),
  "Source paths must be repository-relative without traversal");
  return value;
}

export function selectTarget(policy: unknown, environment: string): ReleaseTarget {
  const root = object(policy);
  assert(Object.keys(root).every((key) => ["version", "environments"].includes(key)), "Unsupported release policy option");
  assert.equal(root.version, 1, "Unsupported Firebase release policy version");
  assert(/^[a-z][a-z0-9-]*$/.test(environment), "Invalid environment name");
  const environments = object(root.environments);
  assert(Object.hasOwn(environments, environment), "Unknown Firebase environment");
  const target = object(environments[environment]);
  assert(Object.keys(target).every((key) => ["project", "rules", "indexes"].includes(key)), "Unsupported release target option");
  assert(typeof target.project === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(target.project),
    "An explicit Firebase project ID is required");
  assert(Array.isArray(target.rules) && target.rules.length > 0, "At least one rules release is required");
  const seen = new Set<string>();
  const rules = target.rules.map((value) => {
    const rule = object(value);
    assert(Object.keys(rule).every((key) => ["release", "path"].includes(key)), "Unsupported rules policy option");
    assert(typeof rule.release === "string"
      && /^(cloud\.firestore|firebase\.storage\/[a-z0-9][a-z0-9._-]+)$/.test(rule.release),
    "Only default Firestore and explicit Storage bucket releases are supported");
    assert(!seen.has(rule.release), "Duplicate rules release");
    seen.add(rule.release);
    return { release: rule.release, path: sourcePath(rule.path) };
  });
  assert(seen.has("cloud.firestore"), "Default Firestore rules are required for index readiness");
  return { project: target.project, rules, indexes: sourcePath(target.indexes) };
}

export const digest = (content: string): string => createHash("sha256").update(content).digest("hex");

export function assertSource(sourceSha: string, mainSha: string, checkoutSha: string, ref: string): void {
  assert(/^[a-f0-9]{40}$/.test(sourceSha), "An exact tested source SHA is required");
  assert.equal(ref, "refs/heads/main", "Firebase release operations must run on main");
  assert.equal(checkoutSha, sourceSha, "Checkout differs from the tested source");
  assert.equal(mainSha, sourceSha, "Superseded source refused; rerun the latest main workflow");
}

export function indexKey(value: unknown, expected = false): string {
  const index = object(value);
  assert(Object.keys(index).every((key) => ["collectionGroup", "queryScope", "fields", "apiScope", "density", "multikey", "unique"].includes(key)
    || (!expected && ["name", "state"].includes(key))), "Unsupported index option requires a reviewed readiness implementation");
  // These are the pinned CLI's defaults for Native Standard databases. Nondefault live
  // indexes must not satisfy a simpler client declaration merely because fields match.
  assert((index.apiScope === undefined || index.apiScope === "ANY_API")
    && (index.density === undefined || index.density === "SPARSE_ALL")
    && (index.multikey === undefined || index.multikey === false)
    && (index.unique === undefined || index.unique === false), "Unsupported index semantics");
  const namedGroup = typeof index.name === "string" ? index.name.split("/collectionGroups/")[1]?.split("/")[0] : undefined;
  if (namedGroup && index.collectionGroup !== undefined) assert.equal(index.collectionGroup, namedGroup, "Index collection identity differs");
  const collectionGroup = index.collectionGroup ?? namedGroup;
  assert(typeof collectionGroup === "string" && collectionGroup.length > 0, "Invalid index collection group");
  assert(["COLLECTION", "COLLECTION_GROUP"].includes(String(index.queryScope)), "Unsupported index query scope");
  assert(Array.isArray(index.fields) && index.fields.length > 0, "Index fields are required");
  const fields = index.fields.map((value) => {
    const field = object(value);
    assert(typeof field.fieldPath === "string" && field.fieldPath, "Invalid index field path");
    assert(Object.keys(field).every((key) => ["fieldPath", "order", "arrayConfig"].includes(key)),
      "Unsupported index field option requires a reviewed readiness implementation");
    assert((field.order === undefined || field.order === "ASCENDING" || field.order === "DESCENDING")
      && (field.arrayConfig === undefined || field.arrayConfig === "CONTAINS")
      && (field.order !== undefined) !== (field.arrayConfig !== undefined),
      "Each index field must have exactly one supported ordering or array mode");
    return { fieldPath: field.fieldPath, order: field.order, arrayConfig: field.arrayConfig };
  });
  if (!fields.some((field) => field.fieldPath === "__name__")) {
    fields.push({ fieldPath: "__name__", order: fields.findLast((field) => field.order)?.order ?? "ASCENDING", arrayConfig: undefined });
  }
  return JSON.stringify({ collectionGroup, queryScope: index.queryScope, fields });
}

export function expectedIndexKeys(value: unknown): string[] {
  const expected = object(value);
  assert(Object.keys(expected).every((key) => ["indexes", "fieldOverrides"].includes(key)), "Unsupported index policy option");
  assert(Array.isArray(expected.indexes), "Expected an indexes array");
  assert(expected.fieldOverrides === undefined || (Array.isArray(expected.fieldOverrides) && expected.fieldOverrides.length === 0),
    "Field overrides require a separately reviewed rollout");
  return expected.indexes.map((index) => indexKey(index, true));
}

export async function verifyRelease(options: {
  target: ReleaseTarget; environment: string; sourceSha: string; read: ReadSource; get: GetJson; now?: number;
}): Promise<Record<string, unknown>> {
  const { target, environment, sourceSha, read, get } = options;
  assert(/^[a-f0-9]{40}$/.test(sourceSha), "An exact tested source SHA is required");
  const now = options.now ?? Date.now();
  const databaseName = `projects/${target.project}/databases/(default)`;
  const database = object(await get(`https://firestore.googleapis.com/v1/${databaseName}`));
  assert(database.name === databaseName && database.type === "FIRESTORE_NATIVE"
    && (database.databaseEdition === undefined || database.databaseEdition === "STANDARD"),
  "Unsupported database identity, mode or edition; require Firestore Native Standard");
  const rules = [];
  for (const rule of target.rules) {
    const release = object(await get(`https://firebaserules.googleapis.com/v1/projects/${target.project}/releases/${rule.release}`));
    assert(typeof release.rulesetName === "string"
      && new RegExp(`^projects/${target.project}/rulesets/[^/]+$`).test(release.rulesetName), "Missing or cross-project ruleset");
    const ruleset = object(await get(`https://firebaserules.googleapis.com/v1/${release.rulesetName}`));
    const files = object(ruleset.source).files;
    assert(Array.isArray(files) && files.length === 1, "Expected exactly one deployed rules source");
    const content = object(files[0]).content;
    assert(typeof content === "string", "Missing deployed rules content");
    const sha256 = digest(read(rule.path));
    assert.equal(digest(content), sha256, `${rule.release}: deployed rules differ from tested source`);
    const age = now - Date.parse(String(release.updateTime));
    assert(Number.isFinite(age) && age >= 600_000, `${rule.release}: retry after the ten-minute propagation window`);
    rules.push({ release: rule.release, rulesetName: release.rulesetName, sha256, updatedAt: release.updateTime });
  }
  const required = expectedIndexKeys(JSON.parse(read(target.indexes)));
  const ready = new Set<string>();
  const pages = new Set<string>();
  let token = "";
  do {
    assert(!pages.has(token) && pages.size < 1000, "Repeated or excessive index pagination");
    pages.add(token);
    // The API rejects nonzero pageSize for this collection-group query. Follow its token instead.
    const page = object(await get(`https://firestore.googleapis.com/v1/projects/${target.project}/databases/(default)/collectionGroups/-/indexes${token ? `?pageToken=${encodeURIComponent(token)}` : ""}`));
    assert(page.indexes === undefined || Array.isArray(page.indexes), "Invalid live index list");
    for (const value of (page.indexes ?? []) as unknown[]) {
      const index = object(value);
      if (index.state !== "READY") continue;
      assert(typeof index.name === "string" && index.name.startsWith(`projects/${target.project}/databases/(default)/collectionGroups/`),
        "Missing or cross-project index identity");
      // Unrelated indexes with newer unsupported options cannot satisfy a required index.
      try { ready.add(indexKey(index)); } catch { /* Required keys remain missing. */ }
    }
    assert(page.nextPageToken === undefined || typeof page.nextPageToken === "string", "Invalid index page token");
    token = (page.nextPageToken ?? "") as string;
  } while (token);
  for (const key of required) assert(ready.has(key), `Required index missing or not READY: ${key}; provision separately and retry`);
  return { version: 1, sourceSha, environment, project: target.project, verifiedAt: new Date(now).toISOString(), rules, indexes: required };
}

/** Generate only the supported rules deployment surface, with explicit Storage bucket names. */
export function deployConfig(target: ReleaseTarget, sourceFiles: Record<string, string>): { config: object; only: string } {
  const firestore = target.rules.find((rule) => rule.release === "cloud.firestore")!;
  const storage = target.rules.filter((rule) => rule.release.startsWith("firebase.storage/"));
  return {
    config: {
      firestore: { database: "(default)", rules: sourceFiles[firestore.path] },
      ...(storage.length ? { storage: storage.map((rule) => ({ bucket: rule.release.slice("firebase.storage/".length), rules: sourceFiles[rule.path] })) } : {}),
    },
    only: storage.length ? "firestore:rules,storage" : "firestore:rules",
  };
}
