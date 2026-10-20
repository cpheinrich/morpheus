import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { configSchema, configurationDigest, hash, type AgentWork, type CdState } from "../../src/cd/schema.js";
import { GhApi, GitHubStore, type Transaction } from "../../src/cd/store.js";
import { cd } from "../../src/cd/cli.js";
import { after, repairWork } from "../../src/cd/state.js";
import { runWorker, scheduleHosted } from "../../src/cd/worker.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, prepared } from "./fixtures.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); vi.restoreAllMocks(); });

class FaultStore extends GitHubStore {
  beforeTransition?: (kind: string) => Promise<void>;
  override async transact<T>(id: string, kind: string, at: string, transition: (state: CdState) => T): Promise<Transaction<T>> {
    await this.beforeTransition?.(kind);
    return super.transact(id, kind, at, transition);
  }
}
const checkpoint = { outcome: "checkpoint" as const, summary: "Prior durable checkpoint", evidence: ["https://github.com/example/app/pull/42"] };
const prior = (hostId?: string, session: string | undefined = "old-session") => ({ id: "prior", executor: "local" as const, hostId, session, startedAt: now, endedAt: after(now, 1), result: checkpoint });

async function nativeFixture(history: AgentWork["invocations"] = [], executor: "local" | "hosted" = "local") {
  const directory = await mkdtemp(join(tmpdir(), "cd-native-worker-")); directories.push(directory);
  const script = join(directory, "synthetic-agent.mjs"), callsPath = join(directory, "calls.jsonl"), quotaPath = join(directory, "quota.json");
  // Real child/guardian and JSON output ABI; this executable never contacts a model.
  await writeFile(script, `import { appendFile, writeFile } from 'node:fs/promises';
const [calls, ...args] = process.argv.slice(2);
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' })); process.exit(0); }
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
await appendFile(calls, JSON.stringify({ args, prompt }) + '\\n');
const result = { outcome: 'checkpoint', summary: 'Synthetic current checkpoint', evidence: ['synthetic evidence'], pullRequest: '', sourceSha: '', reviewHead: '', missingCapability: '' };
if (args.includes('--output-last-message')) await writeFile(args[args.indexOf('--output-last-message') + 1], JSON.stringify(result));
console.log(JSON.stringify({ type: 'thread.started', thread_id: 'new-native-session' }));
console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
if (args[0] === '-p') console.log(JSON.stringify({ type: 'result', structured_output: result }));
`);
  const at = new Date().toISOString();
  await writeFile(quotaPath, JSON.stringify({ observedAt: at, source: "synthetic runtime", windows: [{ id: "primary", usedPercent: 10, resetsAt: after(at, 60) }] }));
  const cfg = config(); cfg.agents = { local: { command: [process.execPath, script, callsPath], quotaFile: quotaPath } };
  if (executor === "hosted") cfg.agents.hosted = { command: [process.execPath, script, callsPath], quotaFile: quotaPath, workflow: "repair.yml", ref: "main" };
  const api = new FakeGitHub(), store = new FaultStore(api, cfg); await store.initialize(at, "native-test-epoch");
  const fixture = prepared();
  const seeded = await store.transact("seed", "fixture", at, state => {
    Object.assign(state, { ...fixture.state, epoch: state.epoch, configurationDigest: state.configurationDigest, transitions: state.transitions });
    const id = repairWork(state, fixture.intentId, ["Original durable diagnostic"], now);
    state.agents[id]!.invocations = history;
    return id;
  });
  const calls = async () => (await readFile(callsPath, "utf8")).trim().split("\n").map(line => JSON.parse(line) as { args: string[]; prompt: string });
  return { cfg, api, store, directory, callsPath, calls, workId: seeded.result };
}

describe("optional hosted repair", () => {
  it("preserves configured hosted normalization bytes and digest from merged 431", () => {
    const cfg = configSchema.parse({ ...config(), agents: { local: {}, hosted: { workflow: "repair.yml", model: "opus" } } });
    expect(configurationDigest(cfg)).toBe("fe556465e201db5a95d170bc71f4b4c78840194559eabe8aea2a672e9144e89d");
    expect(hash(JSON.stringify(cfg))).toBe("4a967d4aab2254eb628d51213c6173099004f0bcea46c05ed76c1588e591bcbb");
    expect(cfg.agents).toEqual({ local: { command: ["codex"] }, hosted: { workflow: "repair.yml", ref: "main", command: ["claude"], model: "opus" } });
    const localOnly = configSchema.parse({ ...cfg, agents: { local: {} } });
    expect(localOnly.agents).toEqual({ local: { command: ["codex"] } });
    expect(configurationDigest(localOnly)).not.toBe(configurationDigest(cfg));
  });

  it.each([false, true])("does not even read an uninitialized ledger when hosted is absent (local configured: %s)", async local => {
    const cfg = config(); if (local) cfg.agents = { local: { command: ["codex"] } };
    const api = new FakeGitHub(), store = new GitHubStore(api, cfg), read = vi.spyOn(store, "read"), transact = vi.spyOn(store, "transact");
    await scheduleHosted(cfg, store, now);
    expect(read).not.toHaveBeenCalled(); expect(transact).not.toHaveBeenCalled(); expect(api.calls).toEqual([]);
    await expect(runWorker(cfg, store, "/unused", { executor: "hosted" }, {})).rejects.toThrow("Agent executor not configured");
    expect(read).not.toHaveBeenCalled(); expect(transact).not.toHaveBeenCalled(); expect(api.calls).toEqual([]);
  });
});

describe("host-local native sessions", () => {
  it("preserves configured hosted resume behavior without local host identity or prompt changes", async () => {
    const f = await nativeFixture([{ ...prior(), executor: "hosted" }, { ...prior(), id: "newer", executor: "hosted", session: undefined }], "hosted");
    await runWorker(f.cfg, f.store, f.directory, { executor: "hosted" });
    const [call] = await f.calls(); expect(call!.args[call!.args.indexOf("--resume") + 1]).toBe("old-session");
    expect(call!.prompt).not.toContain("Previous durable checkpoints");
    expect((await f.store.read()).state.agents[f.workId]!.invocations.at(-1)?.hostId).toBeUndefined();
  });

  it("resumes the latest same-host session and retains the host on completion", async () => {
    const f = await nativeFixture([prior("mac-a:user:store")]);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a:user:store" })).toMatchObject({ outcome: "checkpoint" });
    const [call] = await f.calls(); expect(call!.args).toContain("resume"); expect(call!.args[call!.args.indexOf("resume") + 1]).toBe("old-session");
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(work.invocations.at(-1)).toMatchObject({ executor: "local", hostId: "mac-a:user:store", session: "new-native-session", result: { outcome: "checkpoint" } });
    expect(work.lease).toBeUndefined();
  });

  it.each([
    { label: "another host", history: [prior("mac-b:user:store")] },
    { label: "a legacy unidentified host", history: [prior()] },
    { label: "a newer foreign host after an older same-host session", history: [prior("mac-a:user:store"), { ...prior("mac-b:user:store"), id: "newer" }] },
    { label: "the latest same-host invocation without a session", history: [prior("mac-a:user:store"), { ...prior("mac-a:user:store", undefined), id: "newer", session: undefined }] },
  ])("starts fresh from durable evidence for $label", async ({ history }) => {
    const f = await nativeFixture(history);
    await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a:user:store" });
    const [call] = await f.calls(); expect(call!.args).not.toContain("resume"); expect(call!.args).not.toContain("old-session");
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(call!.prompt).toContain(work.task); expect(call!.prompt).toContain("Original durable diagnostic");
    expect(call!.prompt).toContain("Prior durable checkpoint"); expect(call!.prompt).toContain("https://github.com/example/app/pull/42");
    expect(work.invocations.at(-1)?.hostId).toBe("mac-a:user:store");
  });

  it("defaults old callers to the native hostname and rejects empty explicit identities before ledger reads", async () => {
    const f = await nativeFixture();
    const read = vi.spyOn(f.store, "read");
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "" })).rejects.toThrow("stable nonempty"); expect(read).not.toHaveBeenCalled();
    await runWorker(f.cfg, f.store, f.directory, { executor: "local" });
    expect((await f.store.read()).state.agents[f.workId]!.invocations.at(-1)?.hostId).toBe(hostname());
  });

  it("passes the explicit CLI host identity into the durable invocation", async () => {
    const f = await nativeFixture(), path = join(f.directory, "cd.json");
    await writeFile(path, JSON.stringify(f.cfg));
    vi.spyOn(GhApi.prototype, "request").mockImplementation(f.api.request.bind(f.api));
    vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cd(["worker", "--executor", "local", "--host-id", "cli-mac:user:store", "--config", path, "--source-dir", f.directory])).toBe(0);
    expect((await f.store.read()).state.agents[f.workId]!.invocations.at(-1)?.hostId).toBe("cli-mac:user:store");
  });

  it("allows only one of two hosts racing the same CAS claim to invoke the executable", async () => {
    const f = await nativeFixture();
    const results = await Promise.all(["mac-a", "mac-b"].map(hostId => runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId })));
    expect(results.filter(result => (result as { state?: string }).state === "already-owned")).toHaveLength(1);
    expect(results.filter(result => (result as { outcome?: string }).outcome === "checkpoint")).toHaveLength(1);
    expect(await f.calls()).toHaveLength(1); expect((await f.store.read()).state.agents[f.workId]!.invocations).toHaveLength(1);
  });

  it("preserves the global local-subscription reservation across different hosts and work items", async () => {
    const f = await nativeFixture(), at = new Date().toISOString();
    await f.store.transact("other-host", "fixture", at, state => {
      const other = structuredClone(state.agents[f.workId]!); other.id = "other-work";
      other.lease = { owner: "other-invocation", fence: 1, expiresAt: after(at, 30) }; other.state = "running";
      other.invocations = [{ id: "other-invocation", executor: "local", hostId: "mac-b", startedAt: at }];
      state.agents[other.id] = other; state.fences[other.id] = 1; return null;
    });
    const before = await f.store.read();
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a", workId: f.workId })).rejects.toThrow("in-flight reservation");
    expect((await f.store.read()).head).toBe(before.head); await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each(["agent-session-checkpoint", "agent-checkpoint"])("cannot commit stale %s or its error fallback", async kind => {
    const f = await nativeFixture(); let replacementHead = "";
    f.store.beforeTransition = async actual => {
      if (actual !== kind) return;
      f.store.beforeTransition = undefined;
      const replacement = await f.store.transact("replacement-fence", "fixture", new Date().toISOString(), state => {
        const work = state.agents[f.workId]!; work.lease!.fence++; state.fences[work.id] = work.lease!.fence;
        return null;
      }); replacementHead = replacement.head;
    };
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" })).rejects.toThrow("Agent error checkpoint lost its ownership fence");
    const after = await f.store.read(); expect(replacementHead).not.toBe(""); expect(after.head).toBe(replacementHead);
    const invocation = after.state.agents[f.workId]!.invocations.at(-1)!;
    expect(invocation.endedAt).toBeUndefined(); expect(invocation.result).toBeUndefined();
    if (kind === "agent-session-checkpoint") expect(invocation.session).toBeUndefined();
    expect(Object.keys(after.state.transitions).some(id => id.startsWith("worker-ended-") || id.startsWith("worker-error-"))).toBe(false);
  });
});
