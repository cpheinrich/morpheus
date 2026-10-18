import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import { AppleAdapter, AppleHttp, applePages, type AppleApi } from "../../src/cd/apple.js";
import { ActionsAdapter, matchesEffect, uploadEvidence } from "../../src/cd/actions.js";
import { git, inputDigest, loadSources, verifySource } from "../../src/cd/source.js";
import { validatePayloadFiles } from "../../src/cd/evidence.js";
import { hash } from "../../src/cd/schema.js";
import { type GitHubApi } from "../../src/cd/store.js";
import { config, now, prepared } from "./fixtures.js";

const directories: string[] = [];
async function temp() { const path = await mkdtemp(join(tmpdir(), "morpheus-cd-test-")); directories.push(path); return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); vi.restoreAllMocks(); });
const apple = (handle: (method: string, path: string, body?: unknown) => unknown): AppleApi => ({ async request<T>(method: string, path: string, body?: unknown): Promise<T> { return handle(method, path, body) as T; } });

describe("Apple transport and exact identity readback", () => {
  it("signs short-lived ES256 credentials and never sends them to another origin", async () => {
    const directory = await temp(), { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true }), path = join(directory, "key.p8"); await writeFile(path, await exportPKCS8(privateKey), { mode: 0o600 });
    const fetcher = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => { const headers = options!.headers as Record<string, string>; const { payload } = await jwtVerify(headers.Authorization!.slice(7), publicKey, { issuer: "issuer", audience: "appstoreconnect-v1" }); expect(payload.exp! - payload.iat!).toBe(600); return new Response(JSON.stringify({ ok: true })); });
    const api = new AppleHttp(config(), { ISSUER: "issuer", KEY: "key-id", P8: path }, fetcher as typeof fetch);
    expect(await api.request("GET", "/v1/apps/123")).toEqual({ ok: true }); await expect(api.request("GET", "https://attacker.example/steal")).rejects.toThrow("another host"); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("finds provider maximum across every page with exact decimal arithmetic", async () => {
    const calls: string[] = [], adapter = new AppleAdapter(apple((_method, path) => { calls.push(path); return path === "https://api.appstoreconnect.apple.com/next" ? { data: [{ id: "2", attributes: { version: "9007199254740993" } }] } : { data: [{ id: "1", attributes: { version: "8" } }], links: { next: "https://api.appstoreconnect.apple.com/next" } }; }));
    expect(await adapter.maximum("123", "1.0")).toBe("9007199254740993"); expect(calls).toHaveLength(2); expect(decodeURIComponent(calls[0]!)).toContain("filter[preReleaseVersion.version]=1.0");
  });
  it("observes terminal upload failure even when no build will ever exist", async () => {
    const { state, intentId } = prepared(), attempt = state.intents[intentId]!.attempts[0]!; attempt.upload = { id: "u", claimedAt: now, fence: 1, identity: prepared().upload, outcome: "uncertain", providerUploadId: "resource" };
    const adapter = new AppleAdapter(apple((_method, path) => path.includes("buildUploads/") ? { data: { id: "resource", attributes: { state: { state: "FAILED", errors: [{ code: "90683" }] } } } } : { data: [] }));
    expect(await adapter.observe(attempt, "staging", now)).toEqual({ uploadState: "FAILED", diagnostics: '{"state":"FAILED","errors":[{"code":"90683"}]}' });
  });
  it("joins exact app/version/build relationships and actual group membership", async () => {
    const { state, intentId } = prepared(), attempt = state.intents[intentId]!.attempts[0]!;
    const adapter = new AppleAdapter(apple((_method, path) => {
      if (path.startsWith("/v1/builds?")) return { data: [{ id: "build", attributes: { version: "8", processingState: "VALID" }, relationships: { app: { data: { id: "123", type: "apps" } }, preReleaseVersion: { data: { id: "version", type: "preReleaseVersions" } }, buildBetaDetail: { data: { id: "detail", type: "buildBetaDetails" } } } }], included: [{ id: "123", type: "apps" }, { id: "version", type: "preReleaseVersions", attributes: { version: "1.0" } }, { id: "detail", type: "buildBetaDetails", attributes: { internalBuildState: "IN_BETA_TESTING" } }] };
      if (path.includes("relationships/betaTesters")) return { data: [{ id: "member", type: "betaTesters" }] };
      if (path.includes("relationships/builds")) return { data: [{ id: "build", type: "builds" }] };
      return { data: { id: "staging", attributes: { isInternalGroup: true, hasAccessToAllBuilds: false }, relationships: { app: { data: { id: "123", type: "apps" } } } } };
    }));
    const observed = await adapter.observe(attempt, "staging", now); expect(observed.observation!.group).toEqual({ id: "staging", appId: "123", internal: true, automaticDistribution: false, testerIds: ["member"], buildIds: ["build"] }); expect(observed.observation!.betaState).toBe("IN_BETA_TESTING");
  });
  it("refuses cyclic provider pagination and treats unknown upload state as uncertainty", async () => {
    await expect(applePages(apple(() => ({ data: [], links: { next: "/same" } })), "/same")).rejects.toThrow("cyclic");
    expect(uploadEvidence({ state: "FUTURE_STATE", runId: "1", runAttempt: "1", buildNumber: "8", uploadId: "resource" })).toMatchObject({ outcome: "uncertain", providerUploadId: "resource" });
  });
});

describe("Actions and actual evidence bytes", () => {
  it("matches the exact dispatch token, never a sibling prefix", () => { expect(matchesEffect("CD · dispatch-a1", "dispatch-a1")).toBe(true); expect(matchesEffect("CD · dispatch-a10", "dispatch-a1")).toBe(false); });
  it("sweeps past the first page and binds only matching effect runs", async () => {
    const api: GitHubApi = { async request<T>(_method: string, path: string): Promise<T> { return { workflow_runs: path.endsWith("page=1") ? Array.from({ length: 100 }, (_, id) => ({ id, display_title: "other" })) : [{ id: 101, display_title: "CD · dispatch-a1" }] } as T; } };
    expect((await new ActionsAdapter(api, config()).runs("dispatch-a1")).map(run => run.id)).toEqual([101]);
  });
  it("rejects altered payloads and attempts to read outside the downloaded artifact", async () => {
    const directory = await temp(), { tests } = prepared(); tests.artifacts = [{ name: "actual.json", sha256: hash("actual bytes") }]; await writeFile(join(directory, "actual.json"), "actual bytes");
    await validatePayloadFiles(tests, join(directory, "evidence.json")); await writeFile(join(directory, "actual.json"), "substituted bytes"); await expect(validatePayloadFiles(tests, join(directory, "evidence.json"))).rejects.toThrow("hash mismatch");
    tests.artifacts[0]!.name = "../secret"; await expect(validatePayloadFiles(tests, join(directory, "evidence.json"))).rejects.toThrow("escapes");
  });
  it("rejects a green workflow from the wrong control revision", () => {
    const { state, intentId } = prepared(), attempt = state.intents[intentId]!.attempts[0]!, adapter = new ActionsAdapter({ request: vi.fn() }, config());
    expect(() => adapter.verifyRun({ id: 100, head_sha: "d".repeat(40), event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", display_title: `CD ${attempt.dispatchEffectId}`, run_attempt: 1, status: "completed", conclusion: "success", created_at: now, updated_at: now }, attempt)).toThrow("trusted exact");
  });
});

describe("real Git source evidence", () => {
  it("uses exact merged-PR entry instead of a deliberately backdated commit", async () => {
    const directory = await temp(), bare = join(directory, "remote.git"), root = join(directory, "app"); await mkdir(root);
    git(directory, ["init", "--bare", bare]); git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "CD Test"]); git(root, ["config", "user.email", "test@example.invalid"]);
    await writeFile(join(root, "README"), "no app yet"); git(root, ["add", "README"]); git(root, ["commit", "-m", "before app"]); await mkdir(join(root, "app")); await writeFile(join(root, "app", "source"), "immutable"); git(root, ["add", "app"]); git(root, ["-c", "core.hooksPath=/dev/null", "commit", "--date", "2000-01-01T00:00:00Z", "-m", "backdated author"]); const revision = git(root, ["rev-parse", "HEAD"]);
    git(root, ["remote", "add", "origin", bare]); git(root, ["push", "origin", "main"]);
    const api: GitHubApi = { async request<T>(): Promise<T> { return [{ number: 1, merged_at: "2026-10-18T17:00:00.000Z", merge_commit_sha: revision, base: { ref: "main" } }] as T; } };
    const sources = await loadSources(root, config(), api, now); expect(sources).toHaveLength(1); expect(sources[0]!.mainEnteredAt).toBe("2026-10-18T17:00:00.000Z"); expect(sources[0]!.evidence.kind).toBe("merged-pr"); expect(sources[0]!.inputDigest).toBe(inputDigest(root, revision, ["app"]));
    verifySource(root, config(), revision, sources[0]!.inputDigest); await writeFile(join(root, "app", "source"), "changed after tests"); expect(() => verifySource(root, config(), revision, sources[0]!.inputDigest)).toThrow("modified");
  });
});
