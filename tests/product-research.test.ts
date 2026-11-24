import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { asoProductResearch, validateProductResearch } from "../src/cli/product-research.js";
import { fetchAppeekySnapshot } from "../src/product-research/appeeky.js";
import {
  isSafeAssetPath,
  parseAppeekySnapshot,
  parseAppResearchStudy,
  ProductResearchValidationError,
  type AppResearchFlow,
} from "../src/product-research/index.js";
import { validateStudyDirectory } from "../src/product-research/server.js";
import { asset, FILES, sha, syntheticStudy } from "./fixtures/product-research-study.js";

function issuesOf(input: unknown): string[] {
  try {
    parseAppResearchStudy(input);
  } catch (error) {
    expect(error).toBeInstanceOf(ProductResearchValidationError);
    return (error as ProductResearchValidationError).issues.map((issue) => `${issue.path}: ${issue.message}`);
  }
  return [];
}

function studyWithFlows(flows: AppResearchFlow[]) {
  const study = syntheticStudy();
  return { ...study, app: { ...study.app, flows } };
}

describe("parseAppResearchStudy", () => {
  it("accepts a valid study, keeps unknown keys and normalizes a null screenshot list", () => {
    const study = parseAppResearchStudy(syntheticStudy());
    expect((study as Record<string, unknown>).captureTool).toEqual({ name: "synthetic", version: "0" });
    expect(study.app.screens[1]!.screenshots).toEqual([]);
    expect(study.app.screens[0]!.elements[1]!.bounds).toBeNull();
    expect(study.app).not.toHaveProperty("flows");
  });

  it("keeps authored flows, shared screens, and source-documented transitions in v1", () => {
    const flows: AppResearchFlow[] = [
      { id: "preferences", title: "Preferences", entryScreenId: "settings", parentFlowId: "onboarding", screenIds: ["settings"] },
      { id: "onboarding", title: "Onboarding", entryScreenId: "home", screenIds: ["settings"] },
      { id: "profile", title: "Profile", entryScreenId: "settings", parentFlowId: "preferences" },
    ];
    const study = studyWithFlows(flows);
    study.app.transitions[0]!.status = "source-documented";
    const parsed = parseAppResearchStudy(study);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.app.flows).toEqual(flows);
    expect(parsed.app.transitions[0]!.status).toBe("source-documented");
    expect(parseAppResearchStudy(studyWithFlows([])).app.flows).toEqual([]);
  });

  it("rejects duplicate flow and member IDs and unknown screen and parent references", () => {
    const study = studyWithFlows([
      { id: "onboarding", title: "Onboarding", entryScreenId: "missing-entry", parentFlowId: "missing-parent", screenIds: ["home", "missing-member", "home"] },
      { id: "onboarding", title: "Another flow", entryScreenId: "home" },
    ]);
    expect(issuesOf(study)).toEqual([
      'app.flows.1.id: duplicate flow id "onboarding"',
      'app.flows.0.entryScreenId: unknown screen "missing-entry"',
      'app.flows.0.parentFlowId: unknown flow "missing-parent"',
      'app.flows.0.screenIds.1: unknown screen "missing-member"',
      'app.flows.0.screenIds.2: duplicate screen id "home"',
    ]);
  });

  it("rejects cycles, including self-parenting and a cycle reached from another flow", () => {
    const study = studyWithFlows([
      { id: "tail", title: "Tail", entryScreenId: "home", parentFlowId: "first" },
      { id: "first", title: "First", entryScreenId: "home", parentFlowId: "second" },
      { id: "second", title: "Second", entryScreenId: "home", parentFlowId: "first" },
      { id: "self", title: "Self", entryScreenId: "home", parentFlowId: "self" },
    ]);
    expect(issuesOf(study)).toEqual([
      'app.flows.2.parentFlowId: flow parent cycle through "first"',
      'app.flows.3.parentFlowId: flow parent cycle through "self"',
    ]);
  });

  it("requires an entry screen ID on each authored flow", () => {
    const study = syntheticStudy();
    expect(() => parseAppResearchStudy({ ...study, app: { ...study.app, flows: [{ id: "onboarding", title: "Onboarding" }] } }))
      .toThrow(/Invalid app research study:\n {2}app\.flows\.0\.entryScreenId:/);
  });

  it("rejects duplicate ids and unresolved references with their paths", () => {
    const study = syntheticStudy();
    study.app.screens[1]!.id = "home";
    study.app.transitions[0]!.elementId = "nope";
    study.app.entryScreenId = "missing";
    study.downloads.push({ label: "Ghost", path: "exports/ghost.csv" });
    expect(issuesOf(study)).toEqual(expect.arrayContaining([
      'app.screens.1.id: duplicate screen id "home"',
      'app.transitions.0.elementId: unknown element "nope"',
      'app.entryScreenId: unknown screen "missing"',
      'downloads.1.path: "exports/ghost.csv" is not in assets',
    ]));
  });

  it("rejects a screenshot hash that disagrees with the inventory", () => {
    const study = syntheticStudy();
    study.app.screens[0]!.screenshots![0]!.sha256 = sha("other");
    expect(issuesOf(study)).toEqual(["app.screens.0.screenshots.0.sha256: does not match the asset inventory"]);
  });

  it.each(["../escape.png", "/abs.png", "a//b.png", "a/./b.png", "a\\b.png", ".hidden", "a/b.png?x=1", "https://x/y.png"])(
    "refuses the unsafe asset path %s", (unsafe) => {
      expect(isSafeAssetPath(unsafe)).toBe(false);
      const study = syntheticStudy() as { assets: Record<string, unknown> };
      study.assets[unsafe] = asset("x", "image/png");
      expect(issuesOf(study).some((issue) => issue.startsWith("assets."))).toBe(true);
    });

  it("accepts the nested safe path form and refuses study.json as an asset", () => {
    expect(isSafeAssetPath("screens/a-1_b.v2.png")).toBe(true);
    const study = syntheticStudy() as { assets: Record<string, unknown> };
    study.assets["study.json"] = asset("{}", "application/json");
    expect(issuesOf(study)).toEqual(["assets.study.json: study.json is not an asset"]);
  });

  it("names the failing field in the thrown message", () => {
    expect(() => parseAppResearchStudy({ ...syntheticStudy(), schemaVersion: 2 }))
      .toThrow(/Invalid app research study:\n {2}schemaVersion:/);
  });
});

describe("validateStudyDirectory", () => {
  let root: string;
  afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

  async function writeStudy(study: unknown = syntheticStudy(), files = FILES) {
    root = await mkdtemp(path.join(tmpdir(), "product-research-"));
    for (const [relative, content] of Object.entries(files)) {
      await mkdir(path.dirname(path.join(root, relative)), { recursive: true });
      await writeFile(path.join(root, relative), content);
    }
    await writeFile(path.join(root, "study.json"), JSON.stringify(study));
    return root;
  }

  it("accepts an exact inventory", async () => {
    const result = await validateStudyDirectory(await writeStudy());
    expect(result.issues).toEqual([]);
    expect(result.study?.studyId).toBe("study-1");
  });

  it("reports extra, missing, resized and altered files", async () => {
    const dir = await writeStudy(syntheticStudy(), {
      "screens/home.png": "synthetic-png-homE", // same size, different hash
      "screens/home.ax.json": '{"role":"window"} ', // one byte longer
      "notes.txt": "unlisted",
    });
    const { study, issues } = await validateStudyDirectory(dir);
    expect(study).toBeNull();
    expect(issues).toEqual([
      { path: "screens/home.png", message: "SHA-256 does not match assets" },
      { path: "screens/home.ax.json", message: "has 18 bytes; assets records 17" },
      { path: "exports/flows.csv", message: "is in assets but not in the directory" },
      { path: "notes.txt", message: "is not listed in assets" },
    ]);
  });

  it("refuses symlinks inside the directory and as the directory", async () => {
    const dir = await writeStudy();
    await rm(path.join(dir, "exports/flows.csv"));
    await symlink(path.join(dir, "screens/home.png"), path.join(dir, "exports/flows.csv"));
    expect((await validateStudyDirectory(dir)).issues).toContainEqual({ path: "exports/flows.csv", message: "is a symlink" });
    const link = dir + "-link";
    await symlink(dir, link);
    try {
      expect((await validateStudyDirectory(link)).issues).toEqual([{ path: link, message: "is not a real directory" }]);
    } finally {
      await rm(link);
    }
  });

  it("prefixes schema issues with study.json and exits non-zero from the CLI", async () => {
    const dir = await writeStudy({ ...syntheticStudy(), studyId: "" });
    const { issues } = await validateStudyDirectory(dir);
    expect(issues[0]!.path).toBe("study.json:studyId");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await validateProductResearch(dir)).toBe(1);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("study.json:studyId"));
    error.mockRestore();
  });

  it("prints a one-line summary for a valid directory", async () => {
    const dir = await writeStudy();
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await validateProductResearch(dir)).toBe(0);
    const bytes = Object.values(FILES).reduce((total, text) => total + Buffer.byteLength(text), 0);
    expect(log).toHaveBeenCalledWith(`${dir}: valid study study-1 — 2 screens, 1 transitions, 3 assets (${bytes} bytes)`);
    log.mockRestore();
  });
});

type Route = { status?: number; data?: unknown };
function fakeAppeeky(routes: Record<string, Route>) {
  const calls: URL[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    calls.push(url);
    expect(new Headers(init?.headers).get("X-API-Key")).toBe("test-key");
    const key = url.pathname === "/v1/keywords/ranks" ? `ranks:${url.searchParams.get("keyword")}` : url.pathname;
    const route = routes[key];
    if (!route) return new Response("{}", { status: 404 });
    return new Response(JSON.stringify({ data: route.data }), { status: route.status ?? 200 });
  });
  return { fetcher: fetcher as unknown as typeof fetch, calls };
}

const USAGE_OK = { data: { credits: { general: { limit: 100, used: 85, remaining: 15, walletCredits: 500, available: 515 } } } };
const LISTING = { data: { metadata: {
  trackName: "Example App", primaryGenreName: "Utilities", version: "1.2.3", currentVersionReleaseDate: "2026-10-01T00:00:00Z",
  averageUserRating: 4.5, userRatingCount: 120, price: 0, currency: "USD", trackViewUrl: "https://apps.apple.com/us/app/id123",
} } };
const ORGANIC = { data: { keywords: [{ keyword: "Alpha Term", rank: 4, rankChange7d: 2, volumeScore: 40, difficulty: 30 }] } };

describe("fetchAppeekySnapshot", () => {
  const request = { appId: "123", country: "us", device: "iphone" as const, terms: ["alpha term", "beta", "gamma"], brandedTerms: ["Example"] };

  it("marks a missing rank result list as unchecked", async () => {
    const { fetcher } = fakeAppeeky({
      "/v1/auth/usage": USAGE_OK, "/v1/apps/123": LISTING, "/v1/apps/123/keywords": ORGANIC,
      "ranks:beta": { data: {} }, "ranks:gamma": { data: { ranks: [] } }, "ranks:Example": { data: { ranks: [] } },
    });
    const snapshot = await fetchAppeekySnapshot(request, { apiKey: "test-key", fetch: fetcher });
    expect(snapshot.keywords.find(({ term }) => term === "beta")?.status).toBe("missing");
    expect(snapshot.keywords.find(({ term }) => term === "gamma")?.status).toBe("unranked");
  });

  it("joins listing, organic ranks and per-term fallbacks, distinguishing unranked from missing", async () => {
    const { fetcher, calls } = fakeAppeeky({
      "/v1/auth/usage": USAGE_OK,
      "/v1/apps/123": LISTING,
      "/v1/apps/123/keywords": ORGANIC,
      "ranks:beta": { data: { volumeScore: 10, difficulty: 5, ranks: [{ appId: "999", rank: 1 }] } },
      "ranks:gamma": { status: 503 },
      "ranks:Example": { data: { ranks: [{ appId: "123", rank: 1 }] } },
    });
    const snapshot = await fetchAppeekySnapshot(request, { apiKey: "test-key", fetch: fetcher, now: () => new Date("2026-11-20T00:00:00Z") });
    expect(snapshot).toEqual({
      schemaVersion: 1, source: "appeeky", appId: "123", country: "us", device: "iphone", fetchedAt: "2026-11-20T00:00:00.000Z",
      listing: {
        title: "Example App", category: "Utilities", version: "1.2.3", releasedAt: "2026-10-01T00:00:00Z",
        rating: 4.5, ratingCount: 120, downloadPrice: 0, currency: "USD", appStoreUrl: "https://apps.apple.com/us/app/id123",
      },
      keywords: [
        { term: "alpha term", branded: false, rank: 4, status: "ranked", rankChange7d: 2, volumeScore: 40, difficulty: 30 },
        { term: "beta", branded: false, rank: null, status: "unranked", volumeScore: 10, difficulty: 5 },
        { term: "gamma", branded: false, rank: null, status: "missing" },
        { term: "Example", branded: true, rank: 1, status: "ranked" },
      ],
    });
    expect(calls.map((url) => url.pathname + (url.searchParams.get("keyword") ? `?${url.searchParams.get("keyword")}` : ""))).toEqual([
      "/v1/auth/usage", "/v1/apps/123", "/v1/apps/123/keywords", "/v1/keywords/ranks?beta", "/v1/keywords/ranks?gamma", "/v1/keywords/ranks?Example",
    ]);
    for (const url of calls.slice(1)) {
      expect(Object.fromEntries(url.searchParams)).toMatchObject({ platform: "apple", country: "us", device: "iphone" });
    }
  });

  it("stops before any paid call when included credits cannot cover the worst case, ignoring the wallet", async () => {
    // Worst case for four terms is 2 + 3 + 4 × 2 = 13; 12 plan credits plus a large wallet is not enough.
    const usage = { data: { credits: { general: { remaining: 12, walletCredits: 10_000, available: 10_012 } } } };
    const { fetcher, calls } = fakeAppeeky({ "/v1/auth/usage": usage });
    await expect(fetchAppeekySnapshot(request, { apiKey: "test-key", fetch: fetcher }))
      .rejects.toThrow("Appeeky has 12 included general credits left; this snapshot may use 13. Nothing was fetched.");
    expect(calls.map((url) => url.pathname)).toEqual(["/v1/auth/usage"]);
  });

  it.each([
    ["exact overlap at the lower bound", ["example app", "meal tracker", "food journal"], ["example app"]],
    ["case and whitespace overlap at the upper bound", [" Example App ", "meal tracker", "food journal", "nutrition", "MEAL TRACKER"], ["EXAMPLE APP", " example app ", "Brand Only", "brand only", "  "]],
  ])("merges branded membership while keeping first term order and casing: %s", async (_name, terms, brandedTerms) => {
    const expected = [
      { term: terms[0]!.trim(), branded: true },
      { term: "meal tracker", branded: false },
      { term: "food journal", branded: false },
      ...(terms.length > 3 ? [{ term: "nutrition", branded: false }, { term: "Brand Only", branded: true }] : []),
    ];
    const { fetcher, calls } = fakeAppeeky({
      "/v1/auth/usage": { data: { credits: { general: { remaining: 5 + expected.length * 2 } } } },
      "/v1/apps/123": LISTING, "/v1/apps/123/keywords": { data: { keywords: [] } },
      ...Object.fromEntries(expected.map(({ term }) => [`ranks:${term}`, { data: { ranks: [] } }])),
    });
    const snapshot = await fetchAppeekySnapshot({ ...request, terms, brandedTerms }, { apiKey: "test-key", fetch: fetcher });
    expect(snapshot.keywords).toEqual(expected.map((term) => ({ ...term, rank: null, status: "unranked" })));
    expect(calls.slice(3).map((url) => url.searchParams.get("keyword"))).toEqual(expected.map(({ term }) => term));
  });

  it("proceeds at exactly the worst-case credit boundary", async () => {
    const usage = { data: { credits: { general: { remaining: 13 } } } };
    const { fetcher } = fakeAppeeky({
      "/v1/auth/usage": usage, "/v1/apps/123": LISTING, "/v1/apps/123/keywords": ORGANIC,
      "ranks:beta": { data: { ranks: [] } }, "ranks:gamma": { data: { ranks: [] } }, "ranks:Example": { data: { ranks: [] } },
    });
    await expect(fetchAppeekySnapshot(request, { apiKey: "test-key", fetch: fetcher })).resolves.toMatchObject({ appId: "123" });
  });

  it("aborts on a quota refusal mid-run instead of recording a missing row", async () => {
    const { fetcher } = fakeAppeeky({
      "/v1/auth/usage": USAGE_OK, "/v1/apps/123": LISTING, "/v1/apps/123/keywords": ORGANIC, "ranks:beta": { status: 429 },
    });
    await expect(fetchAppeekySnapshot(request, { apiKey: "test-key", fetch: fetcher })).rejects.toThrow("HTTP 429");
  });

  it.each([
    [{ terms: ["a", "b"] }, "Configure 3–5 distinct terms; got 2."],
    [{ terms: ["a", "b", "c", "d", "e", "f"] }, "Configure 3–5 distinct terms; got 6."],
    [{ terms: ["a", "A", "b"], brandedTerms: [] }, "Configure 3–5 distinct terms; got 2."],
    [{ terms: ["a", "b"], brandedTerms: [" A ", "B"] }, "Configure 3–5 distinct terms; got 2."],
    [{ terms: ["a", "b", "c", "d", "e", "f"], brandedTerms: [" A "] }, "Configure 3–5 distinct terms; got 6."],
    [{ appId: "com.example" }, "--app must be a numeric App Store id."],
  ])("validates the request before any network call: %j", async (override, message) => {
    const { fetcher, calls } = fakeAppeeky({});
    await expect(fetchAppeekySnapshot({ ...request, brandedTerms: undefined, ...override }, { apiKey: "test-key", fetch: fetcher }))
      .rejects.toThrow(message);
    expect(calls).toEqual([]);
  });

  it("accepts five terms at the upper bound", async () => {
    const { fetcher } = fakeAppeeky({ "/v1/auth/usage": { data: { credits: { general: { remaining: 0 } } } } });
    await expect(fetchAppeekySnapshot({ ...request, terms: ["a1", "b1", "c1", "d1"] }, { apiKey: "test-key", fetch: fetcher }))
      .rejects.toThrow("may use 15");
  });
});

describe("product-research aso CLI", () => {
  let dir: string;
  afterEach(async () => { if (dir) await rm(dir, { recursive: true, force: true }); });
  const args = ["--app", "123", "--country", "us", "--device", "iphone", "--terms", "alpha term,beta,gamma"];

  it("replaces the output only after a complete snapshot and keeps it on failure", async () => {
    dir = await mkdtemp(path.join(tmpdir(), "product-research-aso-"));
    const out = path.join(dir, "aso", "example.json");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = fakeAppeeky({
      "/v1/auth/usage": USAGE_OK, "/v1/apps/123": LISTING, "/v1/apps/123/keywords": ORGANIC,
      "ranks:beta": { data: { ranks: [] } }, "ranks:gamma": { data: { ranks: [] } },
    });
    expect(await asoProductResearch(args, out, { APPEEKY_API_KEY: "test-key" }, ok.fetcher)).toBe(0);
    const first = await readFile(out, "utf8");
    expect(parseAppeekySnapshot(JSON.parse(first)).keywords.map((keyword) => keyword.status)).toEqual(["ranked", "unranked", "unranked"]);

    const failing = fakeAppeeky({ "/v1/auth/usage": USAGE_OK, "/v1/apps/123": { status: 500 } });
    expect(await asoProductResearch(args, out, { APPEEKY_API_KEY: "test-key" }, failing.fetcher)).toBe(1);
    expect(await readFile(out, "utf8")).toBe(first);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("The previous snapshot, if any, is unchanged."));
    log.mockRestore();
    error.mockRestore();
  });

  it("refuses without a key or with an unknown option, making no request", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetcher, calls } = fakeAppeeky({});
    expect(await asoProductResearch(args, "out.json", {}, fetcher)).toBe(1);
    expect(error).toHaveBeenCalledWith("APPEEKY_API_KEY is not set; nothing was fetched.");
    expect(await asoProductResearch([...args, "--wallet", "yes"], "out.json", { APPEEKY_API_KEY: "k" }, fetcher)).toBe(1);
    expect(calls).toEqual([]);
    error.mockRestore();
  });
});

describe("parseAppeekySnapshot", () => {
  it("rejects a non-https store link and an unknown status", () => {
    const base = { schemaVersion: 1, source: "appeeky", appId: "1", country: "us", device: "iphone", fetchedAt: "2026-11-20T00:00:00Z", listing: {}, keywords: [] };
    expect(parseAppeekySnapshot(base).keywords).toEqual([]);
    expect(() => parseAppeekySnapshot({ ...base, listing: { appStoreUrl: "javascript:alert(1)" } })).toThrow(/listing.appStoreUrl/);
    expect(() => parseAppeekySnapshot({ ...base, keywords: [{ term: "x", branded: false, rank: null, status: "guess" }] }))
      .toThrow(/keywords.0.status/);
  });
});

describe("browser entries", () => {
  it.each(["index.ts", "react.tsx"])("%s imports nothing Node-only", async (file) => {
    const source = await readFile(new URL(`../src/product-research/${file}`, import.meta.url), "utf8");
    expect(source).not.toMatch(/from "node:/);
    expect(source).not.toContain("./server");
    expect(source).not.toContain("./appeeky");
  });
});
