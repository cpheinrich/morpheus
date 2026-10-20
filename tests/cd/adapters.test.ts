import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { generateKeyPair, exportPKCS8, jwtVerify } from "jose";
import { AppleAdapter, AppleHttp, AppleRequestError, applePages, type AppleApi } from "../../src/cd/apple.js";
import { ActionsAdapter, matchesEffect, uploadEvidence } from "../../src/cd/actions.js";
import { git, inputDigest, loadSources, verifySource } from "../../src/cd/source.js";
import { validatePayloadFiles } from "../../src/cd/evidence.js";
import { hash } from "../../src/cd/schema.js";
import { type GitHubApi } from "../../src/cd/store.js";
import { config, now, prepared } from "./fixtures.js";
import { claimUpload, deliver, recordUpload } from "../../src/cd/state.js";
import { observation } from "./fixtures.js";
import { FakeGitHub } from "./fake-github.js";

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
  it("reads external state and review through the immutable exact-build routes", async () => {
    const fixture = prepared(), cfg = config(); claimUpload(fixture.state, cfg, fixture.upload, now); recordUpload(fixture.state, { ...fixture.upload, outcome: "accepted" }, now); fixture.state.intents[fixture.intentId]!.attempts[0]!.artifactsVerifiedAt = now;
    const receipt = deliver(fixture.state, fixture.intentId, fixture.attemptId, observation(), now), calls: { method: string; path: string; body?: unknown }[] = [];
    const adapter = new AppleAdapter(apple((method, path, body) => {
      calls.push({ method, path, body });
      if (method === "POST" && path === "/v1/betaAppReviewSubmissions") return { data: { id: "review", type: "betaAppReviewSubmissions" } };
      if (method === "PATCH" || method === "POST") return undefined;
      if (path === "/v1/builds/apple-build/betaAppReviewSubmission") return { data: { id: "review", type: "betaAppReviewSubmissions", attributes: { betaReviewState: "APPROVED" } } };
      if (path.startsWith("/v1/builds/apple-build?")) return { data: { id: "apple-build", type: "builds", attributes: { version: "8", processingState: "VALID" }, relationships: { app: { data: { id: "123", type: "apps" } }, preReleaseVersion: { data: { id: "version", type: "preReleaseVersions" } }, buildBetaDetail: { data: { id: "detail", type: "buildBetaDetails" } } } }, included: [{ id: "123", type: "apps" }, { id: "version", type: "preReleaseVersions", attributes: { version: "1.0" } }, { id: "detail", type: "buildBetaDetails", attributes: { externalBuildState: "IN_BETA_TESTING", autoNotifyEnabled: true } }] };
      if (path.includes("relationships/betaTesters")) return { data: [{ id: "tester" }] };
      if (path.includes("relationships/builds")) return { data: [{ id: "apple-build" }, { id: "newer-build" }] };
      return { data: { id: "external", attributes: { isInternalGroup: false, hasAccessToAllBuilds: false }, relationships: { app: { data: { id: "123", type: "apps" } } } } };
    }));
    expect(await adapter.external(receipt, ["external"], now)).toMatchObject({ appId: "123", buildId: "apple-build", betaState: "IN_BETA_TESTING", autoNotifyEnabled: true, review: { id: "review", state: "APPROVED" }, groups: [{ id: "external", internal: false, buildIds: ["apple-build", "newer-build"], testerIds: ["tester"] }] });
    await adapter.notifyExternal("detail"); await adapter.assign("apple-build", "external"); expect(await adapter.submitReview("apple-build")).toBe("review");
    expect(calls.filter(call => call.method !== "GET")).toEqual([
      { method: "PATCH", path: "/v1/buildBetaDetails/detail", body: { data: { type: "buildBetaDetails", id: "detail", attributes: { autoNotifyEnabled: true } } } },
      { method: "POST", path: "/v1/betaGroups/external/relationships/builds", body: { data: [{ type: "builds", id: "apple-build" }] } },
      { method: "POST", path: "/v1/betaAppReviewSubmissions", body: { data: { type: "betaAppReviewSubmissions", relationships: { build: { data: { type: "builds", id: "apple-build" } } } } } },
    ]);
  });
  it("treats only an exact review 404 as absence and refuses unknown external group type", async () => {
    const receipt = { observation: observation() } as Parameters<AppleAdapter["external"]>[0];
    const build = { data: { id: "apple-build", attributes: { version: "8" }, relationships: { app: { data: { id: "123", type: "apps" } }, preReleaseVersion: { data: { id: "version", type: "preReleaseVersions" } }, buildBetaDetail: { data: { id: "detail", type: "buildBetaDetails" } } } }, included: [{ id: "123", type: "apps" }, { id: "version", type: "preReleaseVersions", attributes: { version: "1.0" } }, { id: "detail", type: "buildBetaDetails" }] };
    let failure = 404;
    const adapter = new AppleAdapter(apple((_method, path) => { if (path.includes("betaAppReviewSubmission")) throw new AppleRequestError(failure, "unavailable"); return build; }));
    expect((await adapter.external(receipt, [], now)).review).toBeUndefined(); failure = 403; await expect(adapter.external(receipt, [], now)).rejects.toThrow("unavailable");
    await expect(new AppleAdapter(apple(() => ({ data: { id: "external", attributes: {} } }))).group("external")).rejects.toThrow("identity/type");
  });
  it.each([
    { internal: false, value: null, expected: false },
    { internal: false, value: undefined, expected: false },
    { internal: false, value: false, expected: false },
    { internal: false, value: true, expected: true },
    { internal: true, value: null, expected: true },
    { internal: true, value: undefined, expected: true },
    { internal: true, value: false, expected: false },
    { internal: true, value: true, expected: true },
  ])("interprets optional all-build access for internal=$internal value=$value", async ({ internal, value, expected }) => {
    const adapter = new AppleAdapter(apple((_method, path) => path.includes("relationships/") ? { data: [] } : { data: { id: "group", attributes: { isInternalGroup: internal, ...(value === undefined ? {} : { hasAccessToAllBuilds: value }) }, relationships: { app: { data: { id: "123", type: "apps" } } } } }));
    expect(await adapter.group("group")).toEqual({ id: "group", appId: "123", internal, automaticDistribution: expected, buildIds: [], testerIds: [] });
  });
});

describe("Actions and actual evidence bytes", () => {
  it("dispatches the recorded control after main advances, and never retargets its tag", async () => {
    const api = new FakeGitHub(), original = api.request.bind(api), { state, intentId } = prepared(), attempt = state.intents[intentId]!.attempts[0]!, adapter = new ActionsAdapter(api, config());
    api.refs.set("heads/main", attempt.controlSha); const dispatched: string[] = [];
    api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (method === "POST" && path.endsWith("/git/refs")) api.refs.set("heads/main", "d".repeat(40));
      if (method === "POST" && path.endsWith("/dispatches")) { const ref = (body as { ref: string }).ref; dispatched.push(api.refs.get(`tags/${ref}`)!); return undefined as T; }
      return original<T>(method, path, body);
    };
    await adapter.dispatch(attempt, intentId, "staging"); await adapter.dispatch(attempt, intentId, "staging"); expect(dispatched).toEqual([attempt.controlSha, attempt.controlSha]); expect(api.refs.get("heads/main")).toBe("d".repeat(40));
    api.refs.set(`tags/morpheus-cd-control-${attempt.controlSha}`, "d".repeat(40)); await expect(adapter.dispatch(attempt, intentId, "staging")).rejects.toThrow("never overwrite"); expect(dispatched).toHaveLength(2);
  });
  it("recovers lost execution-tag creation acknowledgment by exact ref readback", async () => {
    const api = new FakeGitHub(), original = api.request.bind(api), adapter = new ActionsAdapter(api, config()), sha = "c".repeat(40);
    api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => { const value = await original<T>(method, path, body); if (method === "POST" && path.endsWith("/git/refs")) throw new Error("lost acknowledgment"); return value; };
    expect(await adapter.executionRef(sha)).toBe(`morpheus-cd-control-${sha}`); expect(api.refs.get(`tags/morpheus-cd-control-${sha}`)).toBe(sha);
  });
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
  it("imports the real producer's resource-only acceptance artifact after a hook failure", async () => {
    const directory = await temp(), root = join(directory, "source"), bin = join(directory, "bin"); await mkdir(root); await mkdir(bin);
    git(root, ["init", "-b", "main"]); git(root, ["config", "user.name", "CD Test"]); git(root, ["config", "user.email", "test@example.invalid"]); await writeFile(join(root, "file"), "source"); git(root, ["add", "file"]); git(root, ["commit", "-m", "source"]);
    const sourceSha = git(root, ["rev-parse", "HEAD"]), { state, intentId, upload } = prepared(), attempt = state.intents[intentId]!.attempts[0]!; attempt.sourceSha = sourceSha;
    const output = join(directory, "outputs"), producer = fileURLToPath(new URL("../../.github/actions/ios-testflight-upload/upload-receipt.py", import.meta.url));
    const env = { ...process.env, GITHUB_REPOSITORY: "example/app", GITHUB_RUN_ID: "100", GITHUB_RUN_ATTEMPT: "1", GITHUB_JOB: "upload", GITHUB_WORKSPACE: root, GITHUB_OUTPUT: output, RUNNER_TEMP: directory, ASC_APP_ID: "123", IOS_BUNDLE_ID: "example.staging", MARKETING_VERSION: "1.0", BUILD_NUMBER: "8", IPA_SHA256: upload.ipaSha256, MORPHEUS_CD_INTENT_ID: intentId, MORPHEUS_CD_ATTEMPT_ID: attempt.id, MORPHEUS_CD_DISPATCH_EFFECT_ID: attempt.dispatchEffectId, MORPHEUS_CD_CONTROL_SHA: attempt.controlSha, MORPHEUS_CD_SOURCE_SHA: sourceSha };
    execFileSync("/usr/bin/python3", [producer, "prepare"], { env });
    const lines = (await import("node:fs/promises")).readFile(output, "utf8"), values = Object.fromEntries((await lines).trim().split("\n").map(line => { const index = line.indexOf("="); return [line.slice(0, index), line.slice(index + 1)]; }));
    execFileSync("/usr/bin/python3", [producer, "resource"], { env: { ...env, UPLOAD_RECEIPT_DIRECTORY: values.directory }, input: JSON.stringify({ data: { id: "resource-1", state: "AWAITING_UPLOAD" } }) });
    await writeFile(join(bin, "gh"), '#!/usr/bin/env node\nconst fs=require("node:fs"); const args=process.argv; fs.cpSync(process.env.CD_TEST_PAYLOAD,args[args.indexOf("--dir")+1],{recursive:true});\n', { mode: 0o755 });
    vi.stubEnv("PATH", `${bin}:${process.env.PATH}`); vi.stubEnv("CD_TEST_PAYLOAD", values.directory!);
    try {
      const api: GitHubApi = { async request<T>(): Promise<T> { return { artifacts: [{ id: 9, name: values["artifact-name"], expired: false }] } as T; } };
      const found = await new ActionsAdapter(api, config()).evidence({ id: 100, run_attempt: 1, status: "completed", conclusion: "failure", display_title: `CD ${attempt.dispatchEffectId}`, head_sha: attempt.controlSha, event: "workflow_dispatch", path: ".github/workflows/cd-v2-delivery.yml", created_at: now, updated_at: now }, attempt);
      expect(values["artifact-name"]).toMatch(/^ios-upload-acceptance-100-1-/); expect(found.uploads).toHaveLength(1); expect(found.uploads[0]).toMatchObject({ sourceSha, providerUploadId: "resource-1", outcome: "uncertain", ipaSha256: upload.ipaSha256 });
    } finally { vi.unstubAllEnvs(); }
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
    verifySource(root, config(), revision, sources[0]!.inputDigest);
    await writeFile(join(root, "app", "Injected.swift"), "injected untracked app source"); expect(inputDigest(root, revision, ["app"])).toBe(sources[0]!.inputDigest); expect(() => verifySource(root, config(), revision, sources[0]!.inputDigest)).toThrow("injected"); await rm(join(root, "app", "Injected.swift"));
    await writeFile(join(root, "app", "source"), "changed after tests"); expect(() => verifySource(root, config(), revision, sources[0]!.inputDigest)).toThrow("modified");
  });
});
