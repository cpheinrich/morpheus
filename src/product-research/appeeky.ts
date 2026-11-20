import { parseAppeekySnapshot, type AppeekyKeyword, type AppeekySnapshot } from "./index.js";

/**
 * A bounded, read-only Appeeky snapshot: one listing lookup, one organic keyword list, and a
 * per-term rank lookup only for configured terms the organic list did not cover. Endpoint shapes
 * and credit costs follow https://docs.appeeky.com/docs/rate-limits.md, get-app.md,
 * get-app-keywords.md and get-keyword-ranks.md (checked 2026-11-20).
 */
export type AppeekyRequest = {
  appId: string;
  country: string;
  device: "iphone" | "ipad";
  terms: string[];
  brandedTerms?: string[];
};
export type AppeekyFetchOptions = {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
  baseUrl?: string;
};

const COST = { listing: 2, organic: 3, rank: 2 } as const;
export const APPEEKY_TERM_LIMITS = { min: 3, max: 5 } as const;

export async function fetchAppeekySnapshot(
  request: AppeekyRequest,
  options: AppeekyFetchOptions,
): Promise<AppeekySnapshot> {
  const terms = configuredTerms(request);
  const get = appeekyGetter(options);
  const store = { platform: "apple", country: request.country, device: request.device };

  // Spend only included plan credits: the wallet would keep paid requests running after the plan
  // runs out, so the worst case must fit in what the plan alone has left.
  const worstCase = COST.listing + COST.organic + COST.rank * terms.length;
  const usage = record(await get("/v1/auth/usage", {}));
  const remaining = record(record(usage.credits).general).remaining;
  if (typeof remaining !== "number") throw new Error("Appeeky usage did not report included general credits.");
  if (remaining < worstCase) {
    throw new Error(`Appeeky has ${remaining} included general credits left; this snapshot may use ${worstCase}. Nothing was fetched.`);
  }

  const appPath = `/v1/apps/${encodeURIComponent(request.appId)}`;
  const metadata = record(record(await get(appPath, store)).metadata);
  const organic = arrayOf(record(await get(`${appPath}/keywords`, store)).keywords);

  const keywords: AppeekyKeyword[] = [];
  for (const { term, branded } of terms) {
    const listed = organic.find((entry) => sameTerm(entry.keyword, term));
    keywords.push(listed ? organicKeyword(term, branded, listed) : await rankedKeyword(get, store, request.appId, term, branded));
  }

  return parseAppeekySnapshot({
    schemaVersion: 1,
    source: "appeeky",
    appId: request.appId,
    country: request.country,
    device: request.device,
    fetchedAt: (options.now?.() ?? new Date()).toISOString(),
    listing: listing(metadata),
    keywords,
  });
}

function configuredTerms(request: AppeekyRequest): { term: string; branded: boolean }[] {
  const seen = new Set<string>();
  const terms: { term: string; branded: boolean }[] = [];
  const add = (values: string[] | undefined, branded: boolean) => {
    for (const value of values ?? []) {
      const term = value.trim();
      const key = term.toLowerCase();
      if (!term || seen.has(key)) continue;
      seen.add(key);
      terms.push({ term, branded });
    }
  };
  add(request.terms, false);
  add(request.brandedTerms, true);
  if (terms.length < APPEEKY_TERM_LIMITS.min || terms.length > APPEEKY_TERM_LIMITS.max) {
    throw new Error(`Configure ${APPEEKY_TERM_LIMITS.min}–${APPEEKY_TERM_LIMITS.max} distinct terms; got ${terms.length}.`);
  }
  if (!/^[a-z]{2}$/.test(request.country)) throw new Error("--country must be a two-letter lowercase ISO code.");
  if (!/^[0-9]+$/.test(request.appId)) throw new Error("--app must be a numeric App Store id.");
  return terms;
}

type Getter = (route: string, query: Record<string, string>) => Promise<unknown>;

function appeekyGetter(options: AppeekyFetchOptions): Getter {
  const fetcher = options.fetch ?? globalThis.fetch;
  const base = options.baseUrl ?? "https://api.appeeky.com";
  return async (route, query) => {
    const url = new URL(route, base);
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
    const response = await fetcher(url, {
      headers: { "X-API-Key": options.apiKey, Accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new AppeekyHttpError(route, response.status);
    return record(await response.json()).data;
  };
}

class AppeekyHttpError extends Error {
  constructor(route: string, readonly status: number) {
    super(`Appeeky ${route} answered HTTP ${status}.`);
  }
}

function organicKeyword(term: string, branded: boolean, entry: Record<string, unknown>): AppeekyKeyword {
  const rank = positiveInteger(entry.rank);
  return {
    term, branded, rank,
    status: rank === null ? "unranked" : "ranked",
    ...numbers(entry, ["rankChange7d", "volumeScore", "difficulty"]),
  };
}

/**
 * A term outside the organic list is looked up directly. Absent from a successful result list it
 * is `unranked` (verified); a failed or refused lookup is `missing` (not verified), so the viewer
 * never presents "we could not check" as "the app does not rank".
 */
async function rankedKeyword(
  get: Getter, store: Record<string, string>, appId: string, term: string, branded: boolean,
): Promise<AppeekyKeyword> {
  let data: Record<string, unknown>;
  try {
    data = record(await get("/v1/keywords/ranks", { ...store, keyword: term }));
  } catch (error) {
    // Quota exhaustion is the one failure that must stop the run rather than degrade a row.
    if (error instanceof AppeekyHttpError && error.status !== 429 && error.status !== 401) {
      return { term, branded, rank: null, status: "missing" };
    }
    throw error;
  }
  const match = arrayOf(data.ranks).find((entry) => String(entry.appId) === appId);
  const rank = match ? positiveInteger(match.rank) : null;
  return {
    term, branded, rank,
    status: rank === null ? "unranked" : "ranked",
    ...numbers(data, ["volumeScore", "difficulty"]),
  };
}

function listing(metadata: Record<string, unknown>): AppeekySnapshot["listing"] {
  const url = typeof metadata.trackViewUrl === "string" && metadata.trackViewUrl.startsWith("https://")
    ? metadata.trackViewUrl : undefined;
  return {
    title: stringOr(metadata.trackName),
    category: stringOr(metadata.primaryGenreName),
    version: stringOr(metadata.version),
    releasedAt: stringOr(metadata.currentVersionReleaseDate),
    rating: typeof metadata.averageUserRating === "number" ? metadata.averageUserRating : undefined,
    ratingCount: positiveInteger(metadata.userRatingCount) ?? undefined,
    downloadPrice: typeof metadata.price === "number" && metadata.price >= 0 ? metadata.price : undefined,
    currency: stringOr(metadata.currency),
    appStoreUrl: url,
  };
}

function sameTerm(value: unknown, term: string): boolean {
  return typeof value === "string" && value.trim().toLowerCase() === term.toLowerCase();
}
function numbers<K extends string>(source: Record<string, unknown>, keys: K[]): Partial<Record<K, number>> {
  const out: Partial<Record<K, number>> = {};
  for (const key of keys) if (typeof source[key] === "number" && Number.isFinite(source[key])) out[key] = source[key];
  return out;
}
function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function arrayOf(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}
function stringOr(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}
function positiveInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
