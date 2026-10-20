import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { QuotaReader, normalizeClaudeQuota, runWorker, scheduleHosted } from "../../src/cd/worker.js";
import { after, quotaUsed, repairWork } from "../../src/cd/state.js";
import { GitHubStore } from "../../src/cd/store.js";
import { githubToken } from "../../src/cd/github-token.js";
import { config, now, prepared } from "./fixtures.js";
import { FakeGitHub } from "./fake-github.js";

const directories: string[] = [];
async function temp() { const path = await mkdtemp(join(tmpdir(), "morpheus-cd-worker-test-")); directories.push(path); return path; }
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); vi.restoreAllMocks(); });
describe("actual quota telemetry", () => {
  it("normalizes actual utilization and rejects unknown/expired usage", () => {
    expect(normalizeClaudeQuota({ five_hour: { utilization: 42, resets_at: after(now, 30) }, seven_day: { utilization: 61, resets_at: after(now, 200) } }, now).windows.map(window => window.usedPercent)).toEqual([42, 61]);
    expect(() => normalizeClaudeQuota({}, now)).toThrow("no valid"); expect(() => normalizeClaudeQuota({ five_hour: { utilization: 0, resets_at: now } }, now)).toThrow("no valid");
  });
  it("joins shared limits to the configured Opus bucket without unrelated model exhaustion", () => {
    const raw = { five_hour: { utilization: 42, resets_at: after(now, 30) }, seven_day: { utilization: 61, resets_at: after(now, 200) }, seven_day_opus: { utilization: 79, resets_at: after(now, 200) }, seven_day_fable: { utilization: 100, resets_at: after(now, 200) } };
    const snapshot = normalizeClaudeQuota(raw, now, "opus");
    expect(snapshot.model).toBe("opus"); expect(snapshot.windows.map(window => window.id)).toEqual(["five_hour", "seven_day", "seven_day_opus"]); expect(quotaUsed(snapshot, now)).toBe(79);
    expect(quotaUsed(normalizeClaudeQuota(raw, now), now)).toBe(100);
    expect(quotaUsed(normalizeClaudeQuota({ ...raw, seven_day_opus: { ...raw.seven_day_opus, utilization: 100 } }, now, "claude-opus-4-6"), now)).toBe(100);
    expect(quotaUsed(normalizeClaudeQuota({ ...raw, five_hour: { ...raw.five_hour, utilization: 100 } }, now, "opus"), now)).toBe(100);
  });
  it("does not turn absent, null, invalid or expired model limits into zero usage", () => {
    const shared = { five_hour: { utilization: 20, resets_at: after(now, 30) }, seven_day: { utilization: 30, resets_at: after(now, 200) } };
    for (const bucket of [undefined, null, { utilization: null, resets_at: after(now, 20) }, { utilization: 0, resets_at: now }]) {
      expect(() => normalizeClaudeQuota({ ...shared, seven_day_opus: bucket }, now, "opus")).toThrow();
    }
    expect(() => normalizeClaudeQuota({ seven_day_opus: { utilization: 0, resets_at: after(now, 20) } }, now, "opus")).toThrow("required");
    expect(() => normalizeClaudeQuota(shared, now, "unknown-model")).toThrow("known quota family");
  });
  it("reads and caches telemetry for the explicit configured model", async () => {
    const cfg = config(); cfg.agents = { local: { command: ["codex"] }, hosted: { command: ["claude"], model: "opus", workflow: "repair.yml", ref: "main" } };
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ five_hour: { utilization: 20, resets_at: after(now, 60) }, seven_day: { utilization: 30, resets_at: after(now, 200) }, seven_day_opus: { utilization: 40, resets_at: after(now, 200) }, seven_day_fable: { utilization: 100, resets_at: after(now, 200) } })));
    const reader = new QuotaReader(cfg, "hosted", "/unused", { CLAUDE_CODE_OAUTH_TOKEN: "fake-test-token" }, fetcher);
    const snapshot = await reader.read(now); expect(snapshot.model).toBe("opus"); expect(quotaUsed(snapshot, now)).toBe(40);
    expect(await reader.read(after(now, 4))).toBe(snapshot); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("requires a telemetry file to attest the configured model", async () => {
    const directory = await temp(), path = join(directory, "usage.json"), cfg = config();
    cfg.agents = { local: { command: ["codex"] }, hosted: { command: ["claude"], model: "opus", workflow: "repair.yml", ref: "main", quotaFile: path } };
    const snapshot = { observedAt: now, source: "actual runtime", windows: ["five_hour", "seven_day", "seven_day_opus"].map(id => ({ id, usedPercent: 35, resetsAt: after(now, 200) })) };
    await writeFile(path, JSON.stringify(snapshot)); const reader = new QuotaReader(cfg, "hosted", "/unused", {});
    await expect(reader.read(now)).rejects.toThrow("configured Claude model");
    await writeFile(path, JSON.stringify({ ...snapshot, model: "fable" })); await expect(reader.read(now)).rejects.toThrow("configured Claude model");
    await writeFile(path, JSON.stringify({ ...snapshot, model: "opus", windows: snapshot.windows.slice(2) })); await expect(reader.read(now)).rejects.toThrow("required Claude runtime window");
    await writeFile(path, JSON.stringify({ ...snapshot, model: "opus" })); expect(quotaUsed(await reader.read(now), now)).toBe(35);
    await writeFile(path, JSON.stringify({ ...snapshot, model: "opus", windows: [...snapshot.windows, { id: "seven_day_fable", usedPercent: 100, resetsAt: after(now, 200) }] }));
    const filtered = await reader.read(now); expect(filtered.windows.map(window => window.id)).toEqual(["five_hour", "seven_day", "seven_day_opus"]); expect(quotaUsed(filtered, now)).toBe(35);
    await writeFile(path, JSON.stringify({ ...snapshot, model: "opus", windows: snapshot.windows.map(window => ({ ...window, usedPercent: window.id === "seven_day_opus" ? 100 : 35 })) }));
    expect(quotaUsed(await reader.read(now), now)).toBe(100);
  });
  it("caches actual OAuth observations for five minutes and backs off 429 without model calls", async () => {
    const cfg = config(); cfg.agents = { local: { command: ["codex"] }, hosted: { command: ["claude"], workflow: "repair.yml", ref: "main" } };
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ five_hour: { utilization: 20, resets_at: after(now, 60) } }))).mockResolvedValueOnce(new Response("", { status: 429 }));
    const reader = new QuotaReader(cfg, "hosted", "/unused", { CLAUDE_CODE_OAUTH_TOKEN: "fake-test-token" }, fetcher);
    expect((await reader.read(now)).windows[0]!.usedPercent).toBe(20); await reader.read(after(now, 4)); expect(fetcher).toHaveBeenCalledTimes(1);
    await expect(reader.read(after(now, 6))).rejects.toThrow("HTTP 429"); await expect(reader.read(after(now, 7))).rejects.toThrow("backoff"); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("persists a budget wait without fabricating work completion when telemetry is missing", async () => {
    const cfg = config(); cfg.agents = { local: { command: ["codex"] }, hosted: { command: ["claude"], workflow: "repair.yml", ref: "main" } }; const api = new FakeGitHub(), store = new GitHubStore(api, cfg); await store.initialize(now, "e");
    const fixture = prepared(); await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, epoch: state.epoch, configurationDigest: state.configurationDigest, transitions: state.transitions }); repairWork(state, fixture.intentId, ["failure"], now); return null; });
    const workId = Object.keys((await store.read()).state.agents)[0]!;
    const result = await runWorker(cfg, store, "/unused", { executor: "hosted", workId }, {}); expect(result).toMatchObject({ state: "budget-wait" }); const state = (await store.read()).state; expect(state.intents[fixture.intentId]!.state).not.toBe("delivered"); expect(Object.values(state.agents)[0]!.invocations).toEqual([]); expect(state.budget.spentMicros).toBe(0);
  });
  it("honors an operator pause before telemetry, model invocation or hosted dispatch", async () => {
    const cfg = config(); cfg.agents = { local: { command: ["missing-codex"] }, hosted: { command: ["missing-claude"], workflow: "repair.yml", ref: "main" } }; const api = new FakeGitHub(), store = new GitHubStore(api, cfg); await store.initialize(now, "e");
    const fixture = prepared(); const seeded = await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, epoch: state.epoch, configurationDigest: state.configurationDigest, transitions: state.transitions }); const workId = repairWork(state, fixture.intentId, ["failure"], now); state.pauses.push({ scope: "all", actor: "operator", reason: "Investigating", resumeCondition: "verified", human: true, createdAt: now }); return workId; });
    const before = (await store.read()).head; expect(await runWorker(cfg, store, "/unused", { executor: "hosted", workId: seeded.result }, {})).toMatchObject({ state: "paused" }); await scheduleHosted(cfg, store, after(now, 30));
    expect((await store.read()).head).toBe(before); expect(api.calls.some(call => call.path.endsWith("/dispatches"))).toBe(false);
  });
});

describe("scoped GitHub OIDC token boundary", () => {
  it.each(["v1.JWT-shaped.opaque-token+/=", "opaque%0Acredential"])("transports opaque single-line provider credentials safely: %s", async token => {
    const directory = await temp(), output = join(directory, "outputs"), logger = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ value: "oidc-test" }))).mockResolvedValueOnce(new Response(JSON.stringify({ token: "", app_token: token })));
    const result = await githubToken({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-test", GITHUB_OUTPUT: output }, false, fetcher);
    expect(await readFile(output, "utf8")).toBe(`token=${token}\n`); expect(logger).toHaveBeenCalledExactlyOnceWith(`::add-mask::${token.replaceAll("%", "%25")}`); expect(JSON.stringify(result)).not.toContain(token);
  });
  it.each(["", null, 12, {}, "secret\nINJECTED=value", "secret\rvalue", "secret\u0000value", "secret value", "secret\u007fvalue"])("refuses malformed credentials before mask or output: %j", async token => {
    const directory = await temp(), output = join(directory, "outputs"), logger = vi.spyOn(console, "log").mockImplementation(() => {});
    await writeFile(output, "existing=value\n");
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ value: "oidc-test" }))).mockResolvedValueOnce(new Response(JSON.stringify({ token })));
    await expect(githubToken({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-test", GITHUB_OUTPUT: output }, false, fetcher)).rejects.toThrow(/omitted a token|single-line/);
    expect(logger).not.toHaveBeenCalled(); expect(await readFile(output, "utf8")).toBe("existing=value\n");
  });
  it("writes only masked token output and reports requested/granted authority separately", async () => {
    const directory = await temp(), output = join(directory, "outputs"), logger = vi.spyOn(console, "log").mockImplementation(() => {});
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ value: "oidc-test" }))).mockResolvedValueOnce(new Response(JSON.stringify({ app_token: "ghs_TEST", permissions: { contents: "write" }, expires_at: after(now, 60) })));
    const result = await githubToken({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc?api-version=1", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "request-test", GITHUB_OUTPUT: output }, false, fetcher);
    expect(await readFile(output, "utf8")).toBe("token=ghs_TEST\n"); expect(logger).toHaveBeenCalledExactlyOnceWith("::add-mask::ghs_TEST"); expect(result).toMatchObject({ created: true, grantedPermissions: { contents: "write" } }); expect(JSON.stringify(result)).not.toContain("ghs_TEST");
  });
  it("refuses redirecting OIDC credentials and refuses unreviewed workflow exchange", async () => {
    const fetcher = vi.fn(); await expect(githubToken({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://attacker.example/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test", GITHUB_OUTPUT: "/tmp/unused" }, false, fetcher)).rejects.toThrow("Unrecognized"); expect(fetcher).not.toHaveBeenCalled();
    fetcher.mockResolvedValueOnce(new Response(JSON.stringify({ value: "oidc-test" }))).mockResolvedValueOnce(new Response("", { status: 401 }));
    await expect(githubToken({ GITHUB_ACTIONS: "true", ACTIONS_ID_TOKEN_REQUEST_URL: "https://pipelines.actions.githubusercontent.com/oidc", ACTIONS_ID_TOKEN_REQUEST_TOKEN: "test", GITHUB_OUTPUT: "/tmp/unused" }, false, fetcher)).rejects.toThrow("default-branch workflow");
  });
});
describe("durable hosted invocation dispatch", () => {
  it("sweeps visibility then retries a lost POST and closes a workflow that never claimed work", async () => {
    const cfg = config(); cfg.agents = { local: { command: ["codex"] }, hosted: { command: ["claude"], workflow: "repair.yml", ref: "main" } };
    const api = new FakeGitHub(), original = api.request.bind(api); let dispatches = 0, completed = false;
    api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (method === "GET" && path.includes("actions/workflows/repair.yml/runs")) return { workflow_runs: completed ? [{ id: 99, display_title: `CD ${Object.values((await store.read()).state.agents)[0]!.invocations.at(-1)!.id}`, status: "completed" }] : [] } as T;
      if (method === "POST" && path.endsWith("repair.yml/dispatches")) { dispatches++; if (dispatches === 1) throw new Error("HTTP503 unknown dispatch outcome"); return undefined as T; }
      return original<T>(method, path, body);
    };
    const store = new GitHubStore(api, cfg); await store.initialize(now, "epoch"); const fixture = prepared();
    await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, configurationDigest: state.configurationDigest, transitions: state.transitions }); return repairWork(state, fixture.intentId, ["failed"], now); });
    await expect(scheduleHosted(cfg, store, after(now, 16))).rejects.toThrow("HTTP503"); await scheduleHosted(cfg, store, after(now, 20)); expect(dispatches).toBe(1);
    await scheduleHosted(cfg, store, after(now, 32)); expect(dispatches).toBe(2); const first = Object.values((await store.read()).state.agents)[0]!.invocations[0]!; expect(first.dispatchCount).toBe(2);
    completed = true; await scheduleHosted(cfg, store, after(now, 38)); const work = Object.values((await store.read()).state.agents)[0]!; expect(work.state).toBe("pending"); expect(work.invocations[0]!.endedAt).toBe(after(now, 38));
    completed = false; await scheduleHosted(cfg, store, after(now, 44)); expect(dispatches).toBe(3); expect(Object.values((await store.read()).state.agents)[0]!.invocations).toHaveLength(2);
  });
});
