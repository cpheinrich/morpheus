import { parseAppeekySnapshot } from "./index.js";
const COST = { listing: 2, organic: 3, rank: 2 };
export const APPEEKY_TERM_LIMITS = { min: 3, max: 5 };
export async function fetchAppeekySnapshot(request, options) {
    const terms = configuredTerms(request);
    const get = appeekyGetter(options);
    const store = { platform: "apple", country: request.country, device: request.device };
    // Spend only included plan credits: the wallet would keep paid requests running after the plan
    // runs out, so the worst case must fit in what the plan alone has left.
    const worstCase = COST.listing + COST.organic + COST.rank * terms.length;
    const usage = record(await get("/v1/auth/usage", {}));
    const remaining = record(record(usage.credits).general).remaining;
    if (typeof remaining !== "number")
        throw new Error("Appeeky usage did not report included general credits.");
    if (remaining < worstCase) {
        throw new Error(`Appeeky has ${remaining} included general credits left; this snapshot may use ${worstCase}. Nothing was fetched.`);
    }
    const appPath = `/v1/apps/${encodeURIComponent(request.appId)}`;
    const metadata = record(record(await get(appPath, store)).metadata);
    const organic = arrayOf(record(await get(`${appPath}/keywords`, store)).keywords);
    const keywords = [];
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
function configuredTerms(request) {
    const seen = new Set();
    const terms = [];
    const add = (values, branded) => {
        for (const value of values ?? []) {
            const term = value.trim();
            const key = term.toLowerCase();
            if (!term || seen.has(key))
                continue;
            seen.add(key);
            terms.push({ term, branded });
        }
    };
    add(request.terms, false);
    add(request.brandedTerms, true);
    if (terms.length < APPEEKY_TERM_LIMITS.min || terms.length > APPEEKY_TERM_LIMITS.max) {
        throw new Error(`Configure ${APPEEKY_TERM_LIMITS.min}–${APPEEKY_TERM_LIMITS.max} distinct terms; got ${terms.length}.`);
    }
    if (!/^[a-z]{2}$/.test(request.country))
        throw new Error("--country must be a two-letter lowercase ISO code.");
    if (!/^[0-9]+$/.test(request.appId))
        throw new Error("--app must be a numeric App Store id.");
    return terms;
}
function appeekyGetter(options) {
    const fetcher = options.fetch ?? globalThis.fetch;
    const base = options.baseUrl ?? "https://api.appeeky.com";
    return async (route, query) => {
        const url = new URL(route, base);
        for (const [key, value] of Object.entries(query))
            url.searchParams.set(key, value);
        const response = await fetcher(url, {
            headers: { "X-API-Key": options.apiKey, Accept: "application/json" },
            signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
            throw new AppeekyHttpError(route, response.status);
        return record(await response.json()).data;
    };
}
class AppeekyHttpError extends Error {
    status;
    constructor(route, status) {
        super(`Appeeky ${route} answered HTTP ${status}.`);
        this.status = status;
    }
}
function organicKeyword(term, branded, entry) {
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
async function rankedKeyword(get, store, appId, term, branded) {
    let data;
    try {
        data = record(await get("/v1/keywords/ranks", { ...store, keyword: term }));
    }
    catch (error) {
        // Quota exhaustion is the one failure that must stop the run rather than degrade a row.
        if (error instanceof AppeekyHttpError && error.status !== 429 && error.status !== 401) {
            return { term, branded, rank: null, status: "missing" };
        }
        throw error;
    }
    if (!Array.isArray(data.ranks))
        return { term, branded, rank: null, status: "missing" };
    const match = arrayOf(data.ranks).find((entry) => String(entry.appId) === appId);
    const rank = match ? positiveInteger(match.rank) : null;
    return {
        term, branded, rank,
        status: rank === null ? "unranked" : "ranked",
        ...numbers(data, ["volumeScore", "difficulty"]),
    };
}
function listing(metadata) {
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
function sameTerm(value, term) {
    return typeof value === "string" && value.trim().toLowerCase() === term.toLowerCase();
}
function numbers(source, keys) {
    const out = {};
    for (const key of keys)
        if (typeof source[key] === "number" && Number.isFinite(source[key]))
            out[key] = source[key];
    return out;
}
function record(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
}
function arrayOf(value) {
    return Array.isArray(value) ? value.map(record) : [];
}
function stringOr(value) {
    return typeof value === "string" && value.trim() ? value : undefined;
}
function positiveInteger(value) {
    return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : null;
}
//# sourceMappingURL=appeeky.js.map