import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { configSchema, configurationDigest, hash, type AgentWork, type CdState } from "../../src/cd/schema.js";
import { GhApi, GitHubStore, type Transaction } from "../../src/cd/store.js";
import { cd } from "../../src/cd/cli.js";
import { after, repairWork } from "../../src/cd/state.js";
import { codexQuota, QuotaReader, runWorker, scheduleHosted } from "../../src/cd/worker.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, prepared } from "./fixtures.js";

const directories: string[] = [];
vi.mock("node:child_process", async original => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
afterEach(async () => { vi.useRealTimers(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); vi.restoreAllMocks(); vi.mocked(spawn).mockClear(); });

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
  await writeFile(script, `import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
const [calls, ...args] = process.argv.slice(2);
if (args[0] === 'login') { console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'auth') { console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' })); process.exit(0); }
if (args[0] === 'app-server') {
  for await (const line of createInterface({ input: process.stdin })) {
    const message = JSON.parse(line);
    if (message.method === 'initialize') console.log(JSON.stringify({ id: message.id, result: {} }));
    if (message.method === 'account/rateLimits/read') {
      await appendFile(calls + '.quota-count', 'read\\n');
      const delay = Number(await readFile(calls + '.quota-delay', 'utf8').catch(() => '0'));
      await new Promise(resolve => setTimeout(resolve, delay));
      console.log(JSON.stringify({ id: message.id, result: JSON.parse(await readFile(calls + '.native-quota', 'utf8')) }));
    }
  }
  process.exit(0);
}
let prompt = ''; for await (const chunk of process.stdin) prompt += chunk;
await appendFile(calls, JSON.stringify({ args, prompt }) + '\\n');
if (await readFile(calls + '.hold', 'utf8').catch(() => '') === 'hold') await new Promise(resolve => setTimeout(resolve, 60_000));
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
  return { cfg, api, store, directory, callsPath, calls, workId: seeded.result, nativeQuotaPath: callsPath + ".native-quota" };
}

async function queuedFixture() {
  const f = await nativeFixture(), at = new Date().toISOString();
  const second = await f.store.transact("second-repair", "fixture", at, state => {
    const first = state.agents[f.workId]!, intent = structuredClone(state.intents[first.intentId]!);
    intent.id = "second-ordinary-intent";
    intent.channel = intent.channel === "staging" ? "production" : "staging";
    state.intents[intent.id] = intent;
    first.createdAt = after(at, -30); first.nextCheckAt = after(at, -10);
    return repairWork(state, intent.id, ["Independent second repair"], after(at, -20));
  });
  return { ...f, secondId: second.result, at };
}

describe("default ordinary repair selection", () => {
  it.each(["paused", "post-resume"])("passes a first %s repair to invoke a due ordinary second repair", async blocked => {
    const f = await queuedFixture();
    if (blocked === "paused") await f.store.transact("block-first", "fixture", f.at, state => {
      state.pauses.push({ scope: state.agents[f.workId]!.intentId, actor: "operator", reason: "Synthetic pause", resumeCondition: "Synthetic evidence", human: true, createdAt: f.at }); return null;
    });
    const before = await f.store.read();
    if (blocked === "post-resume") {
      // Project only the initial selection read. Normal CAS must never retrofit
      // a typed origin onto this ordinary fixture's immutable intent.
      const selected = structuredClone(before);
      selected.state.intents[selected.state.agents[f.workId]!.intentId]!.postResumeKey = "synthetic-post-resume";
      vi.spyOn(f.store, "read").mockResolvedValueOnce(selected);
    }
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" })).toMatchObject({ workId: f.secondId, outcome: "checkpoint" });
    const selectedAfter = (await f.store.read()).state;
    expect(selectedAfter.agents[f.workId]).toEqual(before.state.agents[f.workId]);
    expect(selectedAfter.agents[f.secondId]!.invocations).toHaveLength(1);
    expect(await f.calls()).toHaveLength(1);
  });

  it.each([-1, -25])("uses the last actual invocation at offset %s, not creation, renewed due time or count", async lastStart => {
    const f = await queuedFixture();
    await f.store.transact("repeat-first", "fixture", f.at, state => {
      const first = state.agents[f.workId]!, second = state.agents[f.secondId]!;
      first.invocations = [-29, -28, lastStart].map((offset, index) => ({ ...prior("mac-a"), id: `past-${index}`, startedAt: after(f.at, offset), endedAt: after(f.at, offset + 0.1) }));
      first.nextCheckAt = after(f.at, lastStart === -1 ? -20 : -1);
      second.nextCheckAt = after(f.at, lastStart === -1 ? -1 : -10);
      return null;
    });
    const before = (await f.store.read()).state;
    const selected = lastStart === -1 ? f.secondId : f.workId, untouched = lastStart === -1 ? f.workId : f.secondId;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" })).toMatchObject({ workId: selected, outcome: "checkpoint" });
    const selectedAfter = (await f.store.read()).state;
    expect(selectedAfter.agents[untouched]).toEqual(before.agents[untouched]);
    expect(selectedAfter.agents[selected]!.invocations).toHaveLength(before.agents[selected]!.invocations.length + 1);
    expect(await f.calls()).toHaveLength(1);
  });

  it.each(["future", "leased"])("excludes a first %s repair before considering fairness", async excluded => {
    const f = await queuedFixture();
    await f.store.transact("exclude-first", "fixture", f.at, state => {
      const first = state.agents[f.workId]!;
      if (excluded === "future") first.nextCheckAt = after(f.at, 10);
      else {
        first.lease = { owner: "other-executor", fence: 1, expiresAt: after(f.at, 10) }; first.state = "running";
        first.invocations = [{ id: "other-executor", executor: "hosted", startedAt: after(f.at, -1) }]; state.fences[first.id] = 1;
      }
      return null;
    });
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.secondId, outcome: "checkpoint" });
    expect((await f.store.read()).state.agents[f.workId]).toEqual(before.agents[f.workId]);
    expect(await f.calls()).toHaveLength(1);
  });

  it("admits exact due-time and expired-lease equality without changing their bounds", async () => {
    const f = await queuedFixture();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(f.at));
    await f.store.transact("exact-boundaries", "fixture", f.at, state => {
      const first = state.agents[f.workId]!;
      first.nextCheckAt = f.at;
      first.lease = { owner: "expired-invocation", fence: 1, expiresAt: f.at };
      first.invocations = [{ id: "expired-invocation", executor: "hosted", startedAt: after(f.at, -25), endedAt: after(f.at, -24) }];
      state.fences[first.id] = 1; state.agents[f.secondId]!.nextCheckAt = after(f.at, 10);
      return null;
    });
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.workId, outcome: "checkpoint" });
    const selectedAfter = (await f.store.read()).state;
    expect(selectedAfter.agents[f.workId]!.invocations).toHaveLength(2);
    expect(selectedAfter.fences[f.workId]).toBe(2);
    expect(selectedAfter.agents[f.secondId]).toEqual(before.agents[f.secondId]);
    expect(await f.calls()).toHaveLength(1);
  });

  it.each([false, true])("breaks equal-priority ties by ID regardless of insertion order (reversed: %s)", async reversed => {
    const f = await queuedFixture();
    await f.store.transact("equal-priority", "fixture", f.at, state => {
      state.agents[f.workId]!.createdAt = state.agents[f.secondId]!.createdAt;
      if (reversed) state.agents = Object.fromEntries(Object.entries(state.agents).reverse());
      return null;
    });
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.secondId, outcome: "checkpoint" });
    const selectedAfter = (await f.store.read()).state;
    expect(Object.keys(selectedAfter.agents)).toEqual(Object.keys(before.agents));
    expect(selectedAfter.agents[f.workId]).toEqual(before.agents[f.workId]);
    expect(await f.calls()).toHaveLength(1);
  });

  it("retains explicit target selection even when it is not due or the default winner", async () => {
    const f = await queuedFixture();
    await f.store.transact("explicit-future", "fixture", f.at, state => { state.agents[f.secondId]!.nextCheckAt = after(f.at, 10); return null; });
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.secondId, taskDigest: before.agents[f.secondId]!.taskDigest })).toMatchObject({ workId: f.secondId, outcome: "checkpoint" });
    expect((await f.store.read()).state.agents[f.workId]).toEqual(before.agents[f.workId]);
    expect(await f.calls()).toHaveLength(1);
  });

  it("retains explicit missing-target and immutable-task validation before quota", async () => {
    const f = await queuedFixture(), before = await f.store.read(), quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: "missing-work" })).toEqual({ state: "idle" });
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.secondId, taskDigest: "different-task-digest" })).rejects.toThrow("differs from immutable repair task");
    expect(quota).not.toHaveBeenCalled(); expect((await f.store.read()).head).toBe(before.head);
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each(["paused", "post-resume"])("retains explicit %s refusal before quota or a replacement selection", async blocked => {
    const f = await queuedFixture();
    if (blocked === "paused") await f.store.transact("pause-explicit", "fixture", f.at, state => {
      state.pauses.push({ scope: state.agents[f.workId]!.intentId, actor: "operator", reason: "Synthetic pause", resumeCondition: "Synthetic proof", human: true, createdAt: f.at }); return null;
    });
    const before = await f.store.read();
    if (blocked === "post-resume") {
      const selected = structuredClone(before); selected.state.intents[selected.state.agents[f.workId]!.intentId]!.postResumeKey = "synthetic-post-resume";
      vi.spyOn(f.store, "read").mockResolvedValueOnce(selected);
    }
    const quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toEqual({ state: blocked === "paused" ? "paused" : "observe-post-resume", workId: f.workId });
    expect(quota).not.toHaveBeenCalled(); expect((await f.store.read()).head).toBe(before.head);
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each(["paused", "post-resume", "future", "leased", "complete"])("retains a %s/idle diagnostic when no ordinary work can run", async blocked => {
    const f = await nativeFixture(), before = await f.store.read(), selected = structuredClone(before);
    const work = selected.state.agents[f.workId]!;
    if (blocked === "paused") selected.state.pauses.push({ scope: "all", actor: "operator", reason: "Synthetic pause", resumeCondition: "Synthetic proof", human: true, createdAt: work.createdAt });
    else if (blocked === "post-resume") selected.state.intents[work.intentId]!.postResumeKey = "synthetic-post-resume";
    else if (blocked === "future") work.nextCheckAt = after(new Date().toISOString(), 10);
    else if (blocked === "complete") work.state = "complete";
    else work.lease = { owner: "still-owned", fence: 1, expiresAt: after(new Date().toISOString(), 10) };
    vi.spyOn(f.store, "read").mockResolvedValueOnce(selected);
    const quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual(["future", "leased", "complete"].includes(blocked) ? { state: "idle" } : { state: blocked === "paused" ? "paused" : "observe-post-resume", workId: f.workId });
    expect(quota).not.toHaveBeenCalled(); expect((await f.store.read()).head).toBe(before.head);
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });
});

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


const ordinaryQuota = (at: string, ordinaryUsageAllowed: unknown = true) => ({
  ordinaryUsageAllowed, credits: { hasCredits: true },
  rateLimitsByLimitId: { codex: { primary: { usedPercent: 0, resetsAt: Date.parse(after(at, 60)) / 1000 } } },
});

describe("native ordinary subscription eligibility", () => {
  it("records a missing configured reader as telemetry failure without a repair invocation", async () => {
    const f = await nativeFixture(); delete f.cfg.agents!.local.quotaFile;
    f.cfg.agents!.local.command = [join(f.directory, "absent-reader")];
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" })).toMatchObject({
      state: "budget-wait", failureKind: "telemetry", reason: expect.stringContaining("configured reader could not start (errno=2)"),
    });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-telemetry");
    expect(state.intents[work.intentId]!.blocker).toContain("phase=initialize");
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("reserves measured capacity wording for the exact admission threshold", async () => {
    const f = await nativeFixture(), path = f.cfg.agents!.local.quotaFile!;
    const quota = JSON.parse(await readFile(path, "utf8"));
    quota.windows[0].usedPercent = f.cfg.budget.subscriptionAdmitBelowPercent;
    await writeFile(path, JSON.stringify(quota));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual({
      state: "budget-wait", failureKind: "capacity", reason: "Subscription admission threshold reached",
    });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-measured-subscription-capacity");
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("records failed subscription authentication without retaining command stderr", async () => {
    const f = await nativeFixture(), script = f.cfg.agents!.local.command[1]!;
    await writeFile(script, (await readFile(script, "utf8")).replace("console.log('Logged in using ChatGPT'); process.exit(0);", "console.error('SECRET AUTH PROVIDER TEXT'); process.exit(7);"));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual({
      state: "budget-wait", failureKind: "authentication", reason: "Subscription authentication verification failed",
    });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-authentication");
    expect(JSON.stringify(state)).not.toContain("SECRET AUTH PROVIDER TEXT");
  });

  it("does not copy untrusted telemetry parse errors into admission evidence", async () => {
    const f = await nativeFixture();
    vi.spyOn(QuotaReader.prototype, "read").mockRejectedValueOnce(new Error("SECRET TELEMETRY CONFIG TEXT"));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual({
      state: "budget-wait", failureKind: "telemetry", reason: "Subscription telemetry acquisition failed; unavailable, stale or invalid",
    });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-telemetry");
    expect(JSON.stringify(state)).not.toContain("SECRET TELEMETRY CONFIG TEXT");
  });

  it("retains the sanitized provider HTTP and missing-scope diagnostic as telemetry failure", async () => {
    const f = await nativeFixture([], "hosted"); delete f.cfg.agents!.hosted!.quotaFile;
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      error: { type: "permission_error", message: "scope requirement user:profile SECRET PROVIDER TEXT" },
    }), { status: 403 }));
    const reason = "Claude usage readback HTTP 403; permission_error; required OAuth scope user:profile; retain budget wait";
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "hosted" }, { CLAUDE_CODE_OAUTH_TOKEN: "synthetic-fixture-auth" })).toEqual({ state: "budget-wait", failureKind: "telemetry", reason });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-telemetry");
    expect(state.intents[work.intentId]!.blocker).toBe(reason);
    expect(JSON.stringify(state)).not.toContain("SECRET PROVIDER TEXT");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("does not overlap slow meter reads and still checkpoints on fresh unknown eligibility", async () => {
    const f = await nativeFixture(); delete f.cfg.agents!.local.quotaFile;
    await writeFile(f.nativeQuotaPath, JSON.stringify(ordinaryQuota(new Date().toISOString())));
    await writeFile(f.callsPath + ".hold", "hold");
    let meter: (() => void) | undefined; const original = globalThis.setInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback, delay, ...args) => {
      if (delay === 30_000) meter = () => callback(...args);
      return original(callback, 60_000, ...args);
    });
    const running = runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" });
    await vi.waitFor(async () => { expect(await f.calls()).toHaveLength(1); expect(meter).toBeTypeOf("function"); });
    await writeFile(f.callsPath + ".quota-delay", "250");
    await writeFile(f.nativeQuotaPath, JSON.stringify(ordinaryQuota(new Date().toISOString(), false)));
    meter!(); meter!();
    expect(await running).toMatchObject({ outcome: "checkpoint" });
    expect((await readFile(f.callsPath + ".quota-count", "utf8")).trim().split("\n")).toEqual(["read", "read"]);
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(work.invocations).toHaveLength(1); expect(work.lease).toBeUndefined();
    expect(work.invocations[0]!.result!.summary).toContain("ordinary subscription usage is unavailable or unknown");
  });

  it.each([false, undefined, null, "true"])("refuses non-true ordinary allowance %s despite zero usage and prepaid credits", async value => {
    const f = await nativeFixture(), at = new Date().toISOString();
    await writeFile(f.nativeQuotaPath, JSON.stringify({ ...ordinaryQuota(at), ordinaryUsageAllowed: value }));
    await expect(codexQuota(f.cfg.agents!.local.command, f.directory, at)).rejects.toThrow("ordinary subscription usage is unavailable or unknown");
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("retains exact live windows only when ordinary allowance is explicitly true", async () => {
    const f = await nativeFixture(), at = new Date().toISOString();
    await writeFile(f.nativeQuotaPath, JSON.stringify(ordinaryQuota(at)));
    expect(await codexQuota(f.cfg.agents!.local.command, f.directory, at)).toEqual({
      observedAt: at, source: "Codex account/rateLimits/read",
      windows: [{ id: "primary", usedPercent: 0, resetsAt: after(at, 60) }],
    });
  });

  it.each([false, undefined])("does not claim or invoke repair when native ordinary allowance is %s", async value => {
    const f = await nativeFixture(); delete f.cfg.agents!.local.quotaFile;
    await writeFile(f.nativeQuotaPath, JSON.stringify({ ...ordinaryQuota(new Date().toISOString()), ordinaryUsageAllowed: value }));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" })).toMatchObject({ state: "budget-wait", reason: expect.stringContaining("ordinary subscription usage") });
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(work.invocations).toEqual([]); expect(work.lease).toBeUndefined();
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each([false, undefined])("stops an admitted native process when ordinary allowance becomes %s during metering", async value => {
    const f = await nativeFixture(); delete f.cfg.agents!.local.quotaFile;
    await writeFile(f.nativeQuotaPath, JSON.stringify(ordinaryQuota(new Date().toISOString())));
    await writeFile(f.callsPath + ".hold", "hold");
    let meter: (() => void) | undefined; const original = globalThis.setInterval;
    vi.spyOn(globalThis, "setInterval").mockImplementation((callback, delay, ...args) => {
      if (delay === 30_000) meter = () => callback(...args);
      return original(callback, 60_000, ...args);
    });
    const running = runWorker(f.cfg, f.store, f.directory, { executor: "local", hostId: "mac-a" });
    await vi.waitFor(async () => { expect(await f.calls()).toHaveLength(1); expect(meter).toBeTypeOf("function"); });
    await writeFile(f.nativeQuotaPath, JSON.stringify({ ...ordinaryQuota(new Date().toISOString()), ordinaryUsageAllowed: value }));
    meter!();
    expect(await running).toMatchObject({ outcome: "checkpoint" });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations).toHaveLength(1); expect(work.lease).toBeUndefined();
    expect(work.invocations[0]!.result!.summary).toContain("ordinary subscription usage is unavailable or unknown");
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-telemetry");
  });
});

// Only Date is virtual: the existing fixture still exercises the real guardian,
// login executable, ledger CAS and checkpoint ABI without a model/account call.
// loginMs models admission elapsed time at the claim boundary; API delays are separate.
async function claimClock(quotaMs = 0, loginMs = 0, readMs = 0, resetMs = 3_600_000) {
  const f = await nativeFixture();
  vi.useFakeTimers({ toFake: ["Date"] });
  const start = Date.now(), iso = (offset = 0) => new Date(start + offset).toISOString();
  let reads = 0, claimRead = false;
  vi.spyOn(QuotaReader.prototype, "read").mockImplementation(async (at = new Date().toISOString()) => {
    if (reads++ === 0) vi.setSystemTime(start + quotaMs);
    return { observedAt: at, source: "synthetic fresh quota", windows: [{ id: "primary", usedPercent: 10, resetsAt: reads === 1 ? iso(resetMs) : after(at, 60) }] };
  });
  f.store.beforeTransition = async kind => {
    if (kind === "claim-agent-invocation" && reads === 1) { vi.setSystemTime(Date.now() + loginMs); claimRead = true; }
  };
  const request = f.api.request.bind(f.api);
  f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    if (claimRead && method === "GET" && path.includes("/git/ref/heads/")) { claimRead = false; vi.setSystemTime(Date.now() + readMs); }
    return request<T>(method, path, body);
  };
  return { ...f, start, iso };
}

describe("worker lease admission clock", () => {
  it("anchors lease and start after near-sixty-second quota, login and claim read delays", async () => {
    const f = await claimClock(59_999, 9_999, 75_000), before = (await f.store.read()).state;
    let claimed: CdState | undefined;
    const hook = f.store.beforeTransition;
    f.store.beforeTransition = async kind => { await hook?.(kind); if (kind === "agent-session-checkpoint") claimed = (await f.store.read()).state; };
    await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations[0]!.startedAt).toBe(f.iso(144_998));
    expect(claimed!.transitions[`worker-start-${work.invocations[0]!.id}`]!.at).toBe(f.iso(59_999));
    expect(claimed!.agents[f.workId]!.lease!.expiresAt).toBe(f.iso(144_998 + 47 * 60_000));
    expect(claimed!.agents[f.workId]!.lease).toMatchObject({ owner: work.invocations[0]!.id, fence: 1 });
    expect(work).toMatchObject({ task: before.agents[f.workId]!.task, taskDigest: before.agents[f.workId]!.taskDigest, intentId: before.agents[f.workId]!.intentId });
    for (const key of ["sources", "slots", "intents", "builds", "cursors", "evaluatedSlots", "groupOperations", "groupCursors", "pauses", "configurationDigest"] as const) expect(claimed![key]).toEqual(before[key]);
    const { lease, invocations, state: status, ...identity } = claimed!.agents[f.workId]!;
    const { lease: oldLease, invocations: oldInvocations, state: oldStatus, ...originalIdentity } = before.agents[f.workId]!;
    expect(identity).toEqual(originalIdentity);
    const { telemetry, ...budget } = claimed!.budget, { telemetry: oldTelemetry, ...originalBudget } = before.budget;
    expect(budget).toEqual(originalBudget);
  });

  it("retains two minutes at the configured 45-minute guardian boundary despite admission delays", async () => {
    const f = await claimClock(59_999, 9_999, 75_000), hook = f.store.beforeTransition;
    let remaining: number | undefined;
    f.store.beforeTransition = async kind => {
      await hook?.(kind);
      if (kind !== "agent-session-checkpoint") return;
      f.store.beforeTransition = undefined;
      const work = (await f.store.read()).state.agents[f.workId]!;
      const guardian = vi.mocked(spawn).mock.calls.find(call => String(call[1]?.[0]).endsWith("/guarded-run.py"));
      expect(guardian![1]![1]).toBe("2700000"); // Actual configured guardian argument.
      vi.setSystemTime(Date.now() + Number(guardian![1]![1]) + 500);
      remaining = Date.parse(work.lease!.expiresAt) - Date.now();
      await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId, invocationId: "competitor" })).rejects.toThrow("already owned");
    };
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "checkpoint" });
    expect(remaining).toBe(119_500); expect(await f.calls()).toHaveLength(1);
    expect((await f.store.read()).state.agents[f.workId]!.lease).toBeUndefined();
  });

  it.each(["same-work", "other-work"])("uses exact expiry boundaries for %s ownership", async scope => {
    for (const offset of [-1, 0, 1]) {
      const f = await claimClock(0, 0, 1_000);
      await f.store.transact("owner", "fixture", f.iso(), state => {
        const current = state.agents[f.workId]!, other = structuredClone(current);
        other.id = scope === "same-work" ? current.id : "other"; other.state = "running";
        other.lease = { owner: "prior", fence: 1, expiresAt: f.iso(1_000 + offset) };
        other.invocations = [{ id: "prior", executor: "local", startedAt: f.iso() }];
        state.agents[other.id] = other; state.fences[other.id] = 1; return null;
      });
      const before = await f.store.read(), running = runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId, invocationId: "next" });
      if (offset === 1) {
        await expect(running).rejects.toThrow(scope === "same-work" ? "already owned" : "in-flight reservation");
        expect((await f.store.read()).head).toBe(before.head);
        await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
      } else {
        await running; expect(await f.calls()).toHaveLength(1);
        expect((await f.store.read()).state.agents[f.workId]!.invocations.at(-1)!.startedAt).toBe(f.iso(1_000));
      }
      vi.restoreAllMocks(); vi.useRealTimers();
    }
  });

  it.each([{ delay: 300_000, accepts: true }, { delay: 300_001, accepts: false }])("revalidates quota age after a $delay ms claim read", async ({ delay, accepts }) => {
    const f = await claimClock(0, 0, delay), before = await f.store.read();
    const running = runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    if (accepts) { await running; expect((await f.store.read()).state.agents[f.workId]!.invocations[0]!.startedAt).toBe(f.iso(delay)); }
    else { await expect(running).rejects.toThrow("telemetry expired"); expect((await f.store.read()).head).toBe(before.head); }
  });

  it("refuses a quota reset reached during login before creating a lease", async () => {
    const f = await claimClock(59_999, 10_000, 0, 69_999), before = await f.store.read();
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).rejects.toThrow("telemetry expired");
    expect((await f.store.read()).head).toBe(before.head); await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each([false, true])("recomputes claim time and quota on a real CAS conflict (expires: %s)", async expires => {
    const f = await claimClock(59_999, 9_999, 0, expires ? 80_000 : 3_600_000), request = f.api.request.bind(f.api);
    let conflict = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (conflict && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) {
        conflict = false; vi.setSystemTime(Date.now() + 20_000);
        await f.store.transact("concurrent", "fixture", new Date().toISOString(), () => null);
      }
      return request<T>(method, path, body);
    };
    const running = runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    if (expires) {
      await expect(running).rejects.toThrow("telemetry expired");
      const state = (await f.store.read()).state; expect(state.agents[f.workId]!.invocations).toEqual([]);
      expect(Object.keys(state.transitions).filter(id => id.startsWith("worker-start-"))).toEqual([]);
    } else {
      await running; expect(await f.calls()).toHaveLength(1);
      expect((await f.store.read()).state.agents[f.workId]!.invocations[0]!.startedAt).toBe(f.iso(89_998));
    }
  });

  it("preserves a competing claim accepted during a rejected CAS write", async () => {
    const f = await claimClock(59_999, 9_999), request = f.api.request.bind(f.api);
    let conflict = true, winningHead = "";
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (conflict && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) {
        conflict = false; vi.setSystemTime(Date.now() + 20_000);
        winningHead = (await f.store.transact("competitor", "fixture", new Date().toISOString(), state => {
          const current = state.agents[f.workId]!;
          current.state = "running"; current.lease = { owner: "winner", fence: 1, expiresAt: after(new Date().toISOString(), 47) };
          current.invocations.push({ id: "winner", executor: "local", startedAt: new Date().toISOString() });
          state.fences[current.id] = 1; return null;
        })).head;
      }
      return request<T>(method, path, body);
    };
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).rejects.toThrow("already owned");
    const snapshot = await f.store.read(); expect(snapshot.head).toBe(winningHead);
    expect(snapshot.state.agents[f.workId]!.lease).toEqual({ owner: "winner", fence: 1, expiresAt: f.iso(89_998 + 47 * 60_000) });
    expect(snapshot.state.agents[f.workId]!.invocations).toEqual([{ id: "winner", executor: "local", startedAt: f.iso(89_998) }]);
    await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each([-1, 0, 1])("checks quota reset after claim ACK at offset %s ms", async offset => {
    const f = await claimClock(0, 0, 0, 1_000), request = f.api.request.bind(f.api);
    let delay = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const result = await request<T>(method, path, body);
      if (delay && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) { delay = false; vi.setSystemTime(f.start + 1_000 + offset); }
      return result;
    };
    const result = await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(result).toMatchObject({ outcome: "checkpoint" });
    expect(work.lease).toBeUndefined();
    if (offset < 0) { expect(await f.calls()).toHaveLength(1); expect(work.state).toBe("pending"); }
    else {
      expect(result).toMatchObject({ reason: expect.stringContaining("telemetry expired") });
      expect(work).toMatchObject({ state: "waiting", nextCheckAt: after(f.iso(1_000 + offset), f.cfg.deadlines.pollMinutes) });
      expect(work.invocations[0]).toMatchObject({ startedAt: f.iso(), endedAt: f.iso(1_000 + offset), result: { outcome: "checkpoint", summary: expect.stringContaining("before invocation") } });
      expect(spawn).not.toHaveBeenCalled();
      await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
    }
  });

  it("refuses quota becoming stale during claim ACK and preserves a replacement fence", async () => {
    const f = await claimClock(), request = f.api.request.bind(f.api);
    let delay = true, replacementHead = "";
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const result = await request<T>(method, path, body);
      if (delay && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) {
        delay = false; vi.setSystemTime(f.start + 300_001);
        replacementHead = (await f.store.transact("replacement", "fixture", f.iso(300_001), state => {
          const current = state.agents[f.workId]!;
          current.lease = { owner: "replacement", fence: 2, expiresAt: after(f.iso(300_001), 47) };
          current.invocations.push({ id: "replacement", executor: "local", startedAt: f.iso(300_001) });
          state.fences[current.id] = 2; return null;
        })).head;
      }
      return result;
    };
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).rejects.toThrow("error checkpoint lost its ownership fence");
    const snapshot = await f.store.read(), work = snapshot.state.agents[f.workId]!;
    expect(snapshot.head).toBe(replacementHead);
    expect(work.lease).toEqual({ owner: "replacement", fence: 2, expiresAt: after(f.iso(300_001), 47) });
    expect(work.invocations[0]!.endedAt).toBeUndefined(); expect(work.invocations[0]!.result).toBeUndefined();
    expect(Object.keys(snapshot.state.transitions).filter(id => id.startsWith("worker-error-") || id.startsWith("worker-ended-"))).toEqual([]);
    expect(spawn).not.toHaveBeenCalled(); await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it.each([119_999, 120_000, 120_001])("requires execution headroom after a %s ms claim ACK", async delayMs => {
    const f = await claimClock(), request = f.api.request.bind(f.api);
    let delay = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      const result = await request<T>(method, path, body);
      if (delay && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) { delay = false; vi.setSystemTime(f.start + delayMs); }
      return result;
    };
    const result = await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    const work = (await f.store.read()).state.agents[f.workId]!;
    expect(work.lease).toBeUndefined();
    if (delayMs < 120_000) { expect(await f.calls()).toHaveLength(1); expect(work.state).toBe("pending"); }
    else {
      expect(result).toMatchObject({ outcome: "checkpoint", reason: expect.stringContaining("cannot cover configured execution time") });
      expect(work).toMatchObject({ state: "waiting", nextCheckAt: after(f.iso(delayMs), f.cfg.deadlines.pollMinutes) });
      expect(work.invocations[0]).toMatchObject({ startedAt: f.iso(), endedAt: f.iso(delayMs), result: { outcome: "checkpoint" } });
      expect(spawn).not.toHaveBeenCalled(); await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
    }
  });

  it.each([false, true])("preserves a replacement fence on a delayed/unknown claim ACK (unknown: %s)", async unknown => {
    const f = await claimClock(), request = f.api.request.bind(f.api);
    let delay = true, replacementHead = "";
    const replace = async () => {
      vi.setSystemTime(f.start + (unknown ? 1_000 : 120_000));
      replacementHead = (await f.store.transact("new-owner", "fixture", new Date().toISOString(), state => {
        const current = state.agents[f.workId]!;
        current.lease = { owner: "replacement", fence: 2, expiresAt: after(new Date().toISOString(), 47) };
        current.invocations.push({ id: "replacement", executor: "local", startedAt: new Date().toISOString() });
        state.fences[current.id] = 2; return null;
      })).head;
    };
    if (unknown) {
      f.api.loseNextAcknowledgment = true; f.api.afterLostAcknowledgment = replace;
    } else {
      f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
        const result = await request<T>(method, path, body);
        if (delay && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) { delay = false; await replace(); }
        return result;
      };
    }
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).rejects.toThrow("error checkpoint lost its ownership fence");
    const snapshot = await f.store.read(), work = snapshot.state.agents[f.workId]!;
    expect(snapshot.head).toBe(replacementHead);
    expect(work.lease).toEqual({ owner: "replacement", fence: 2, expiresAt: after(f.iso(unknown ? 1_000 : 120_000), 47) });
    expect(work.invocations[0]!.endedAt).toBeUndefined(); expect(work.invocations[0]!.result).toBeUndefined();
    expect(work.invocations.at(-1)).toEqual({ id: "replacement", executor: "local", startedAt: f.iso(unknown ? 1_000 : 120_000) });
    expect(Object.keys(snapshot.state.transitions).filter(id => id.startsWith("worker-error-") || id.startsWith("worker-ended-"))).toEqual([]);
    expect(spawn).not.toHaveBeenCalled(); await expect(readFile(f.callsPath)).rejects.toHaveProperty("code", "ENOENT");
  });

  it("replays a previously accepted claim without renewing its clock or invoking again", async () => {
    const f = await claimClock(), options = { executor: "local" as const, workId: f.workId, invocationId: "same-request" };
    await runWorker(f.cfg, f.store, f.directory, options); const before = await f.store.read();
    vi.setSystemTime(Date.now() + 120_000);
    expect(await runWorker(f.cfg, f.store, f.directory, options)).toEqual({ state: "already-owned", invocationId: "same-request" });
    expect((await f.store.read()).head).toBe(before.head); expect(await f.calls()).toHaveLength(1);
  });
});
