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
import { BLOCKER_PROOF_PREFIX, type BlockerClaimReceipt } from "../../src/cd/blocker-proof.js";
import { git, loadSources } from "../../src/cd/source.js";
import { verifyRepairChecks } from "../../src/cd/repair-checks.js";
import { checkLocalReview } from "../../src/review/local.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, prepared, source } from "./fixtures.js";
import { physicalPolicy } from "./physical-device-fixtures.js";

const directories: string[] = [];
vi.mock("node:child_process", async original => {
  const real = await original<typeof import("node:child_process")>();
  return { ...real, spawn: vi.fn(real.spawn) };
});
// Pass-through unless a repair-verification test stubs the provider/Git side of verifyRepair.
vi.mock("../../src/cd/source.js", async original => {
  const real = await original<typeof import("../../src/cd/source.js")>();
  return { ...real, git: vi.fn(real.git), loadSources: vi.fn(real.loadSources) };
});
vi.mock("../../src/cd/repair-checks.js", async original => {
  const real = await original<typeof import("../../src/cd/repair-checks.js")>();
  return { ...real, verifyRepairChecks: vi.fn(real.verifyRepairChecks) };
});
vi.mock("../../src/review/local.js", async original => {
  const real = await original<typeof import("../../src/review/local.js")>();
  return { ...real, checkLocalReview: vi.fn(real.checkLocalReview) };
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
if (args[0] === 'login') { await appendFile(calls + '.admission', 'login\\n'); console.log('Logged in using ChatGPT'); process.exit(0); }
if (args[0] === 'auth') { await appendFile(calls + '.admission', 'auth\\n'); console.log(JSON.stringify({ loggedIn: true, authMethod: 'claude.ai', apiProvider: 'firstParty' })); process.exit(0); }
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
const result = JSON.parse(await readFile(calls + '.result', 'utf8').catch(() => JSON.stringify({ outcome: 'checkpoint', summary: 'Synthetic current checkpoint', evidence: ['synthetic evidence'], pullRequest: '', sourceSha: '', reviewHead: '', missingCapability: '' })));
const proofMode = await readFile(calls + '.proof-mode', 'utf8').catch(() => 'valid');
if (result.outcome === 'blocked' && proofMode !== 'missing') {
  const prefix = 'Blocker proof binding (copy exactly): ';
  const line = prompt.split(String.fromCharCode(10)).find(line => line.startsWith(prefix));
  if (line) {
    const binding = JSON.parse(line.slice(prefix.length)), at = binding.claimedAt;
    const proof = { version: 1, binding, reportedAt: at,
      symptom: { summary: 'Synthetic capability remains absent', identityRef: 'record:synthetic-exact-attempt', observedAt: at, evidenceRefs: ['artifact:synthetic-current-observation'] },
      authority: { ref: 'record:synthetic-current-mandate', summary: 'The fixture permits ordinary diagnosis without account widening', checkedAt: at },
      tried: [{ route: 'Inspect retained operation', action: 'Checked the exact saved operation without replaying its effect', outcome: 'The exact external capability is absent', observedAt: at, checkedAt: at, evidenceRefs: ['artifact:synthetic-retained-operation'] }],
      excluded: [{ route: 'Use unrelated account', disposition: 'outside-authority', reason: 'The fixture has no grant for another account', checkedAt: at, evidenceRefs: ['record:synthetic-current-mandate'] }],
      exhaustionReason: 'The retained operation needs the named capability; the alternative account is outside authority', missingCapability: result.missingCapability,
      minimumExternalStep: 'The named fixture owner supplies the exact missing capability', independentWork: ['Continue the independent channel diagnosis'],
      nextWake: { event: 'Fresh capability evidence or bounded recheck', at: new Date(Date.parse(binding.deadlineAt) + 60000).toISOString() } };
    if (proofMode === 'borrowed') proof.binding.invocationId = 'another-invocation';
    if (proofMode === 'stale-time') proof.authority.checkedAt = new Date(Date.parse(at) - 1).toISOString();
    if (proofMode === 'self-approved') proof.ctoAccepted = true;
    if (proofMode === 'human-only') { proof.tried = []; proof.noPracticalAction = { boundary: 'human-only-judgment', requiredPrincipal: 'Synthetic named owner', authorityRef: proof.authority.ref, explanation: 'The named owner must decide this exact external action', evidenceRefs: ['artifact:synthetic-capability-readback'] }; }
    result.evidence.push('${BLOCKER_PROOF_PREFIX}' + (proofMode === 'malformed' ? '{' : JSON.stringify(proof)));
  }
}
await writeFile(calls + '.emitted', JSON.stringify(result));
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

const capabilityBlocked = { outcome: "blocked" as const, summary: "Synthetic external prerequisite remains absent", evidence: ["synthetic prerequisite evidence"], missingCapability: "Independent external prerequisite evidence", pullRequest: "", sourceSha: "", reviewHead: "" };
async function capabilityFixture(executor: "local" | "hosted" = "local") {
  const f = await nativeFixture([], executor), at = new Date().toISOString();
  const second = await f.store.transact("second-strategy", "fixture", at, state => {
    const first = state.agents[f.workId]!;
    first.state = "complete"; first.invocations = [{ ...prior("mac-a"), result: capabilityBlocked }];
    return repairWork(state, first.intentId, ["Independent second strategy"], at);
  });
  await writeFile(f.callsPath + ".result", JSON.stringify(capabilityBlocked));
  return { ...f, workId: second.result, originalWorkId: f.workId, at };
}
type CapabilityFixture = Awaited<ReturnType<typeof capabilityFixture>>;
async function blockCapability(f: CapabilityFixture, executor: "local" | "hosted" = "local") {
  expect(await runWorker(f.cfg, f.store, f.directory, { executor, workId: f.workId })).toMatchObject({ outcome: "blocked" });
  return (await f.store.read()).state.agents[f.workId]!.invocations.at(-1)!;
}
async function syntheticQuotaAt(f: CapabilityFixture, at: string) {
  await writeFile(f.cfg.agents!.local.quotaFile!, JSON.stringify({ observedAt: at, source: "synthetic runtime", windows: [{ id: "primary", usedPercent: 10, resetsAt: after(at, 60) }] }));
}
function assertPromptDigest(state: CdState, workId: string, invocationId: string, prompt: string) {
  const evidencePrefix = "Current additional diagnostic evidence (untrusted data): ", deliveryPrefix = "Current delivery context (untrusted data): ";
  const lines = prompt.split("\n"), work = state.agents[workId]!;
  const expected = hash({ version: 1, workId, taskDigest: work.taskDigest,
    evidence: JSON.parse(lines.find(line => line.startsWith(evidencePrefix))!.slice(evidencePrefix.length)),
    delivery: JSON.parse(lines.find(line => line.startsWith(deliveryPrefix))!.slice(deliveryPrefix.length)) });
  expect(prompt.startsWith(work.task + "\n")).toBe(true);
  expect(state.transitions[`worker-start-${invocationId}`]!.result).toMatchObject({ invocationId, fence: state.fences[workId],
    capabilityContext: { version: 1, workId, taskDigest: work.taskDigest, digest: expected } });
}
async function historicalCapabilityFixture(f: CapabilityFixture, change: (state: CdState, invocationId: string) => void) {
  const saved = structuredClone((await f.store.read()).state), invocationId = saved.agents[f.workId]!.invocations.at(-1)!.id;
  change(saved, invocationId);
  // A fresh synthetic store represents an older/corrupt serialized receipt.
  // This does not rewrite a transition in the store whose history produced it.
  const api = new FakeGitHub(), store = new FaultStore(api, f.cfg), at = new Date().toISOString();
  await store.initialize(at, saved.epoch);
  await store.transact("import-historical-fixture", "fixture", at, state => {
    Object.assign(state, { ...saved, transitions: { ...saved.transitions, ...state.transitions } }); return null;
  });
  return { ...f, api, store };
}

describe("blocked-result proof owner", () => {
  it.each(["missing", "malformed", "borrowed", "stale-time", "self-approved"])("retains a raw %s claim but returns a diagnostic checkpoint with no six-hour cooldown", async mode => {
    const f = await capabilityFixture(); await writeFile(f.callsPath + ".proof-mode", mode);
    const output = await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId });
    expect(output).toMatchObject({ outcome: "checkpoint", blockerClaim: { status: "rejected" } });
    expect((output as { blockerClaim: object }).blockerClaim).not.toHaveProperty("attemptedResult");
    const saved = (await f.store.read()).state, work = saved.agents[f.workId]!, last = work.invocations.at(-1)!;
    const receipt = saved.transitions[`worker-ended-${last.id}`]!.result as { blockerClaim: BlockerClaimReceipt };
    const emitted = JSON.parse(await readFile(f.callsPath + ".emitted", "utf8"));
    expect(receipt.blockerClaim.attemptedResult).toEqual(emitted); expect(receipt.blockerClaim.attemptedResult.outcome).toBe("blocked");
    expect(last.result!.outcome).toBe("checkpoint"); expect(last.result!.missingCapability).toBe("");
    expect(work.state).toBe("pending"); expect(saved.intents[work.intentId]!.nextAction).toBe("continue-blocker-diagnosis");
    expect(work.nextCheckAt).toBe(after(last.endedAt!, f.cfg.deadlines.pollMinutes));
    await writeFile(f.callsPath + ".proof-mode", "valid");
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(work.nextCheckAt)); await syntheticQuotaAt(f, work.nextCheckAt);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ outcome: "blocked", blockerClaim: { status: "cto-verification-required" } });
    expect(await f.calls()).toHaveLength(2);
    expect((await f.store.read()).state.transitions[`worker-ended-${last.id}`]!.result).toEqual(saved.transitions[`worker-ended-${last.id}`]!.result);
  });

  it.each(["valid", "human-only"])("records a %s proof as a candidate with actual claim/fence/ownership time, without accepting global blockage", async mode => {
    const f = await capabilityFixture(); await writeFile(f.callsPath + ".proof-mode", mode);
    let lease: AgentWork["lease"];
    f.store.beforeTransition = async kind => { if (kind === "agent-checkpoint") lease = (await f.store.read()).state.agents[f.workId]!.lease; };
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "blocked", blockerClaim: { status: "cto-verification-required" } });
    const saved = (await f.store.read()).state, work = saved.agents[f.workId]!, last = work.invocations.at(-1)!;
    const start = saved.transitions[`worker-start-${last.id}`]!.result as { claimedAt: string; deadlineAt: string; fence: number };
    const receipt = saved.transitions[`worker-ended-${last.id}`]!.result as { blockerClaim: BlockerClaimReceipt };
    const encoded = last.result!.evidence.find(value => value.startsWith(BLOCKER_PROOF_PREFIX))!.slice(BLOCKER_PROOF_PREFIX.length), document = JSON.parse(encoded);
    expect(start.claimedAt).toBe(last.startedAt); expect(start.deadlineAt).toBe(lease!.expiresAt); expect(start.fence).toBe(lease!.fence);
    expect(document.binding).toMatchObject({ workId: f.workId, invocationId: last.id, fence: lease!.fence, claimedAt: start.claimedAt, deadlineAt: lease!.expiresAt });
    expect(receipt.blockerClaim.proofDigest).toBe(hash(document)); expect(receipt.blockerClaim.status).toBe("cto-verification-required");
    expect(saved.intents[work.intentId]!.nextAction).toBe("verify-blocker-candidate-with-cto");
    expect(last.result!.summary).toContain("requires independent CTO verification");
    expect(saved.intents[work.intentId]!.attempts).toHaveLength(1);
    expect(document.tried).toHaveLength(mode === "human-only" ? 0 : 1);
    expect(await f.calls()).toHaveLength(1);
  });

  it.each(["missing-receipt", "missing-proof", "malformed-evidence", "borrowed-proof", "self-approved", "wrong-digest", "missing-claim-clock"])("does not park an unsupported %s historical blocked result", async invalid => {
    const original = await capabilityFixture(); await blockCapability(original);
    const f = await historicalCapabilityFixture(original, (state, invocationId) => {
      const work = state.agents[original.workId]!, result = work.invocations.at(-1)!.result!;
      const completion = state.transitions[`worker-ended-${invocationId}`]!.result as { blockerClaim?: BlockerClaimReceipt };
      if (invalid === "missing-receipt") delete completion.blockerClaim;
      if (invalid === "missing-proof") result.evidence = result.evidence.filter(value => !value.startsWith(BLOCKER_PROOF_PREFIX));
      if (invalid === "malformed-evidence") Object.assign(result, { evidence: null });
      if (invalid === "borrowed-proof") {
        const index = result.evidence.findIndex(value => value.startsWith(BLOCKER_PROOF_PREFIX)), document = JSON.parse(result.evidence[index]!.slice(BLOCKER_PROOF_PREFIX.length));
        document.binding.workId = "another-work"; result.evidence[index] = BLOCKER_PROOF_PREFIX + JSON.stringify(document); completion.blockerClaim!.proofDigest = hash(document);
      }
      if (invalid === "self-approved") Object.assign(completion.blockerClaim!, { status: "accepted" });
      if (invalid === "wrong-digest") completion.blockerClaim!.proofDigest = hash("another proof");
      if (invalid === "missing-claim-clock") delete (state.transitions[`worker-start-${invocationId}`]!.result as { claimedAt?: string }).claimedAt;
      work.nextCheckAt = after(new Date().toISOString(), 12 * 60);
    });
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ outcome: "blocked", blockerClaim: { status: "cto-verification-required" } });
    const saved = (await f.store.read()).state;
    expect(saved.agents[f.workId]!.invocations).toHaveLength(2);
    expect(saved.agents[f.workId]!.invocations[0]).toEqual(before.agents[f.workId]!.invocations[0]);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ state: "capability-wait" });
    expect(await f.calls()).toHaveLength(2);
  });
});

describe("bounded unchanged capability waits", () => {
  it.each([false, true])("does not repeat quota, login or a model for an unchanged completed second-strategy block (explicit: %s)", async explicit => {
    const f = await capabilityFixture();
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "blocked" });
    const before = await f.store.read(), work = before.state.agents[f.workId]!, last = work.invocations.at(-1)!;
    const admission = await readFile(f.callsPath + ".admission", "utf8"), quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", ...(explicit ? { workId: f.workId } : {}) })).toEqual({ state: "capability-wait", workId: f.workId, nextCheckAt: after(last.endedAt!, 360) });
    expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    expect(await readFile(f.callsPath + ".admission", "utf8")).toBe(admission);
    expect((await f.store.read()).head).toBe(before.head);
    assertPromptDigest(before.state, f.workId, last.id, (await f.calls())[0]!.prompt);
  });

  it("selects another ordinary repair while the earlier second-strategy work is capability-waiting", async () => {
    const f = await capabilityFixture(); await blockCapability(f);
    const secondId = (await f.store.transact("another-channel", "fixture", new Date().toISOString(), state => {
      const intent = structuredClone(state.intents[state.agents[f.workId]!.intentId]!);
      intent.id = "other-capability-channel"; intent.channel = "production";
      state.intents[intent.id] = intent;
      return repairWork(state, intent.id, ["Another ordinary repair"], new Date().toISOString());
    })).result;
    const before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: secondId, outcome: "blocked" });
    expect((await f.store.read()).state.agents[f.workId]).toEqual(before.agents[f.workId]);
    expect(await f.calls()).toHaveLength(2);
  });

  it.each(["evidence", "attempt", "source"])("wakes genuine changed %s despite a deferred next check", async changed => {
    const f = await capabilityFixture(); await blockCapability(f);
    await f.store.transact("new-context", "fixture", new Date().toISOString(), state => {
      const work = state.agents[f.workId]!, intent = state.intents[work.intentId]!;
      work.nextCheckAt = after(new Date().toISOString(), 12 * 60);
      if (changed === "evidence") work.evidence.push("NEW-EXTERNAL-EVIDENCE");
      else if (changed === "attempt") intent.attempts.at(-1)!.status = "failed";
      else { const source = { ...state.sources.at(-1)!, sha: "f".repeat(40), order: state.sources.at(-1)!.order + 1 }; state.sources.push(source); intent.source = source.sha; }
      return null;
    });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.workId, outcome: "blocked" });
    const state = (await f.store.read()).state, last = state.agents[f.workId]!.invocations.at(-1)!;
    expect(await f.calls()).toHaveLength(2);
    assertPromptDigest(state, f.workId, last.id, (await f.calls())[1]!.prompt);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ state: "capability-wait" });
  });

  it.each(["quiescence", "workflow-terminal"])("wakes newly recorded %s evidence while the exact attempt stays active", async changed => {
    const f = await capabilityFixture(), beforeAt = new Date().toISOString();
    const originalQuiescence = { kind: "host-terminated" as const, ref: "synthetic exact executor termination proof", observedAt: beforeAt };
    await f.store.transact("initial-executor-context", "fixture", beforeAt, state => {
      const attempt = state.intents[state.agents[f.workId]!.intentId]!.attempts.at(-1)!;
      expect(attempt.status).toBe("active");
      if (changed === "quiescence") attempt.workflowTerminalAt = beforeAt;
      else attempt.quiescence = originalQuiescence;
      return null;
    });
    await writeFile(f.callsPath + ".result", JSON.stringify({ ...capabilityBlocked, missingCapability: "Exact executor quiescence and terminal workflow evidence" }));
    const last = await blockCapability(f), at = after(last.endedAt!, 1);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(at)); await syntheticQuotaAt(f, at);
    await f.store.transact("heartbeat-without-new-executor-proof", "fixture", at, state => {
      const work = state.agents[f.workId]!, intent = state.intents[work.intentId]!;
      work.nextCheckAt = after(at, 12 * 60); intent.nextCheckAt = after(at, 5); state.lastMain = "e".repeat(40); return null;
    });
    const before = await f.store.read(), quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual({ state: "capability-wait", workId: f.workId, nextCheckAt: after(last.endedAt!, 360) });
    expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    expect((await f.store.read()).head).toBe(before.head);
    await f.store.transact("new-executor-proof", changed === "quiescence" ? "record-executor-quiescence" : "observe-native-run", at, state => {
      const attempt = state.intents[state.agents[f.workId]!.intentId]!.attempts.at(-1)!;
      if (changed === "quiescence") attempt.quiescence = { ...originalQuiescence, observedAt: at };
      else attempt.workflowTerminalAt = at;
      return null;
    });
    const recorded = (await f.store.read()).state, intentId = recorded.agents[f.workId]!.intentId;
    expect(recorded.intents[intentId]!.attempts.at(-1)!.status).toBe("active");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.workId, outcome: "blocked" });
    expect(quota).toHaveBeenCalledTimes(1); expect(await f.calls()).toHaveLength(2);
    const saved = (await f.store.read()).state, current = saved.agents[f.workId]!.invocations.at(-1)!;
    const prompt = (await f.calls())[1]!.prompt;
    const delivery = JSON.parse(prompt.split("\n").find(line => line.startsWith("Current delivery context (untrusted data): "))!.slice("Current delivery context (untrusted data): ".length));
    expect(delivery.attempt).toMatchObject({ status: "active", quiescence: changed === "quiescence" ? { ...originalQuiescence, observedAt: at } : originalQuiescence, workflowTerminalAt: changed === "quiescence" ? beforeAt : at });
    assertPromptDigest(saved, f.workId, current.id, prompt);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ state: "capability-wait" });
    expect(quota).toHaveBeenCalledTimes(1); expect(await f.calls()).toHaveLength(2);
  });

  it("does not turn normal retry clocks, accounting observations or checkpoints into a capability change", async () => {
    const f = await capabilityFixture(), last = await blockCapability(f);
    const receipt = (await f.store.read()).state.transitions[`worker-start-${last.id}`];
    await f.store.transact("ordinary-observation", "fixture", new Date().toISOString(), state => {
      const work = state.agents[f.workId]!;
      work.nextCheckAt = after(new Date().toISOString(), 10 * 60); work.invocations.at(-1)!.usage = [{ output_tokens: 17 }];
      state.lastMain = "e".repeat(40); return null;
    });
    const before = await f.store.read(), quota = vi.spyOn(QuotaReader.prototype, "read");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ state: "capability-wait" });
    expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    const afterRead = await f.store.read(); expect(afterRead.head).toBe(before.head);
    expect(afterRead.state.transitions[`worker-start-${last.id}`]).toEqual(receipt);
  });

  it.each([-1, 0, 1])("allows bounded eventual recheck at the exact six-hour offset %sms", async offset => {
    const f = await capabilityFixture(), last = await blockCapability(f);
    await f.store.transact("defer-clock", "fixture", new Date().toISOString(), state => { state.agents[f.workId]!.nextCheckAt = after(last.endedAt!, 12 * 60); return null; });
    const at = new Date(Date.parse(last.endedAt!) + 6 * 60 * 60_000 + offset).toISOString();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(at)); await syntheticQuotaAt(f, at);
    const quota = vi.spyOn(QuotaReader.prototype, "read");
    const result = await runWorker(f.cfg, f.store, f.directory, { executor: "local" });
    if (offset < 0) { expect(result).toEqual({ state: "capability-wait", workId: f.workId, nextCheckAt: after(last.endedAt!, 360) }); expect(quota).not.toHaveBeenCalled(); }
    else { expect(result).toMatchObject({ workId: f.workId, outcome: "blocked" }); expect(quota).toHaveBeenCalledTimes(1); }
    expect(await f.calls()).toHaveLength(offset < 0 ? 1 : 2);
  });

  it.each(["quota", "cas-conflict", "completion-cas-conflict"])("does not swallow evidence arriving during %s after prompt context was frozen", async phase => {
    const f = await capabilityFixture(); await blockCapability(f);
    await f.store.transact("wake-first", "fixture", new Date().toISOString(), state => { state.agents[f.workId]!.evidence.push("FIRST-WAKE-EVIDENCE"); return null; });
    let changed = false;
    const appendLate = async () => { changed = true; await f.store.transact("late-context", "fixture", new Date().toISOString(), state => { state.agents[f.workId]!.evidence.push("LATE-ADMISSION-EVIDENCE"); return null; }); };
    if (phase === "quota") {
      const read = QuotaReader.prototype.read;
      vi.spyOn(QuotaReader.prototype, "read").mockImplementationOnce(async function (this: QuotaReader, at?: string) { await appendLate(); return read.call(this, at); });
    } else {
      let completing = phase !== "completion-cas-conflict";
      if (!completing) f.store.beforeTransition = async kind => { if (kind === "agent-checkpoint") completing = true; };
      const request = f.api.request.bind(f.api);
      f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
        if (completing && !changed && method === "PATCH" && path.endsWith(`/git/refs/heads/${f.cfg.stateBranch}`)) await appendLate();
        return request<T>(method, path, body);
      };
    }
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "checkpoint", blockerClaim: { status: "rejected" } });
    expect(changed).toBe(true);
    const saved = (await f.store.read()).state, last = saved.agents[f.workId]!.invocations.at(-1)!;
    const racingPrompt = (await f.calls())[1]!.prompt;
    expect(racingPrompt).toContain("FIRST-WAKE-EVIDENCE"); expect(racingPrompt).not.toContain("LATE-ADMISSION-EVIDENCE");
    expect(saved.agents[f.workId]!.evidence).toContain("LATE-ADMISSION-EVIDENCE");
    expect(saved.agents[f.workId]!.nextCheckAt).toBe(last.endedAt);
    expect((saved.transitions[`worker-ended-${last.id}`]!.result as { blockerClaim: BlockerClaimReceipt }).blockerClaim.attemptedResult.outcome).toBe("blocked");
    assertPromptDigest(saved, f.workId, last.id, racingPrompt);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.workId, outcome: "blocked" });
    expect(await f.calls()).toHaveLength(3);
    expect((await f.calls())[2]!.prompt).toContain("LATE-ADMISSION-EVIDENCE");
  });

  it.each(["absent", "version", "digest", "extra-field", "work", "task", "invocation", "fence"])("does not suppress admission using an %s historical context receipt", async invalid => {
    const original = await capabilityFixture(); await blockCapability(original);
    const f = await historicalCapabilityFixture(original, (state, invocationId) => {
      const receipt = state.transitions[`worker-start-${invocationId}`]!.result as { invocationId: string; fence: number; capabilityContext?: { version: number; workId: string; taskDigest: string; digest: string; extra?: boolean } };
      if (invalid === "absent") delete receipt.capabilityContext;
      else if (invalid === "version") receipt.capabilityContext!.version = 2;
      else if (invalid === "digest") receipt.capabilityContext!.digest = "not-a-digest";
      else if (invalid === "extra-field") receipt.capabilityContext!.extra = true;
      else if (invalid === "work") receipt.capabilityContext!.workId = "borrowed-work";
      else if (invalid === "task") receipt.capabilityContext!.taskDigest = "f".repeat(64);
      else if (invalid === "invocation") receipt.invocationId = "borrowed-invocation";
      else receipt.fence += 1;
      state.agents[original.workId]!.nextCheckAt = after(new Date().toISOString(), 12 * 60);
    });
    const previous = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: f.workId, outcome: "blocked" });
    const saved = (await f.store.read()).state;
    expect(saved.agents[f.workId]!.invocations).toHaveLength(2);
    expect(saved.agents[f.workId]!.invocations[0]).toEqual(previous.agents[f.workId]!.invocations[0]);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ state: "capability-wait" });
    expect(await f.calls()).toHaveLength(2);
  });

  it.each([false, true])("never hides mutated task bytes behind capability cooldown (explicit: %s)", async explicit => {
    const f = await capabilityFixture(); await blockCapability(f);
    const before = await f.store.read(), selected = structuredClone(before);
    selected.state.agents[f.workId]!.task += " forbidden task mutation";
    vi.spyOn(f.store, "read").mockResolvedValueOnce(selected);
    const quota = vi.spyOn(QuotaReader.prototype, "read");
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", ...(explicit ? { workId: f.workId } : {}) })).rejects.toThrow("Durable task was altered");
    expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    expect((await f.store.read()).head).toBe(before.head);
  });

  it("revalidates immutable task bytes on the fresh claim after quota admission", async () => {
    const f = await capabilityFixture(); await blockCapability(f);
    await f.store.transact("wake-task-test", "fixture", new Date().toISOString(), state => { state.agents[f.workId]!.evidence.push("new capability input"); return null; });
    const before = await f.store.read(), read = f.store.read.bind(f.store);
    f.store.beforeTransition = async kind => {
      if (kind !== "claim-agent-invocation") return;
      f.store.beforeTransition = undefined;
      vi.spyOn(f.store, "read").mockImplementationOnce(async () => { const selected = await read(); selected.state.agents[f.workId]!.task += " changed during admission"; return selected; });
    };
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).rejects.toThrow("Durable task was altered during admission");
    expect((await f.store.read()).head).toBe(before.head); expect(await f.calls()).toHaveLength(1);
  });

  it.each(["", " \n\t", 7])("requires an actual nonblank missing capability before suppressing %j", async missingCapability => {
    const f = await capabilityFixture();
    await writeFile(f.callsPath + ".result", JSON.stringify({ ...capabilityBlocked, missingCapability }));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "checkpoint", blockerClaim: { status: "rejected" } });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "checkpoint", blockerClaim: { status: "rejected" } });
    expect(await f.calls()).toHaveLength(2);
  });

  it("keeps the first independent blocked strategy on its existing successor path", async () => {
    const f = await nativeFixture(); await writeFile(f.callsPath + ".result", JSON.stringify(capabilityBlocked));
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "blocked" });
    const state = (await f.store.read()).state, next = Object.values(state.agents).find(work => work.id !== f.workId)!;
    expect(state.agents[f.workId]!.state).toBe("complete"); expect(next.strategy).toBe(2); expect(next.invocations).toEqual([]);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toMatchObject({ workId: next.id, outcome: "blocked" });
    expect(await f.calls()).toHaveLength(2);
  });

  it("honors a real hosted dispatch -> explicit worker baseline and skips unchanged Actions lookup", async () => {
    const f = await capabilityFixture("hosted"), request = f.api.request.bind(f.api);
    const actions: { method: string; path: string; body?: unknown }[] = [];
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (path.includes("/actions/")) {
        actions.push({ method, path, body });
        if (method === "GET" && path.includes("actions/workflows/repair.yml/runs")) return { workflow_runs: [] } as T;
        if (method === "POST" && path.endsWith("repair.yml/dispatches")) return undefined as T;
      }
      return request<T>(method, path, body);
    };
    let at = after(f.at, f.cfg.deadlines.admissionMinutes + 1);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(at)); await syntheticQuotaAt(f, at);
    await scheduleHosted(f.cfg, f.store, at);
    const dispatched = (await f.store.read()).state, placeholder = dispatched.agents[f.workId]!.invocations.at(-1)!;
    expect(placeholder).toMatchObject({ executor: "hosted", dispatchState: "uncertain", dispatchCount: 1 });
    expect(dispatched.transitions[`worker-start-${placeholder.id}`]).toBeUndefined();
    at = after(at, 1); vi.setSystemTime(new Date(at)); await syntheticQuotaAt(f, at);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "hosted", workId: f.workId, invocationId: placeholder.id, taskDigest: dispatched.agents[f.workId]!.taskDigest })).toMatchObject({ outcome: "blocked" });
    const blocked = await f.store.read(), last = blocked.state.agents[f.workId]!.invocations.at(-1)!, actionCount = actions.length;
    expect((blocked.state.transitions[`worker-start-${last.id}`]!.result as { claimedAt: string; deadlineAt: string }).claimedAt).toBe(at);
    expect(at).not.toBe(placeholder.startedAt);
    const admission = await readFile(f.callsPath + ".admission", "utf8"), quota = vi.spyOn(QuotaReader.prototype, "read");
    await scheduleHosted(f.cfg, f.store, at);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "hosted", workId: f.workId, invocationId: "not-a-bypass" })).toEqual({ state: "capability-wait", workId: f.workId, nextCheckAt: after(last.endedAt!, 360) });
    expect(actions).toHaveLength(actionCount); expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    expect(await readFile(f.callsPath + ".admission", "utf8")).toBe(admission); expect((await f.store.read()).head).toBe(blocked.head);
    await f.store.transact("hosted-new-evidence", "fixture", at, state => { state.agents[f.workId]!.evidence.push("NEW-HOSTED-CAPABILITY-EVIDENCE"); state.agents[f.workId]!.nextCheckAt = after(at, 12 * 60); return null; });
    at = after(at, 1); vi.setSystemTime(new Date(at)); await syntheticQuotaAt(f, at);
    await scheduleHosted(f.cfg, f.store, at);
    const fresh = (await f.store.read()).state, next = fresh.agents[f.workId]!.invocations.at(-1)!;
    expect(next.id).not.toBe(last.id); expect(next.dispatchCount).toBe(1);
    expect(actions.filter(call => call.method === "POST")).toHaveLength(2);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "hosted", workId: f.workId, invocationId: next.id, taskDigest: fresh.agents[f.workId]!.taskDigest })).toMatchObject({ outcome: "blocked" });
    expect(quota).toHaveBeenCalledTimes(1); expect(await f.calls()).toHaveLength(2);
    expect((await f.calls())[1]!.prompt).toContain("NEW-HOSTED-CAPABILITY-EVIDENCE");
  });

  it("does not let an unstarted hosted placeholder bypass the prior blocked context", async () => {
    const f = await capabilityFixture("hosted"); await blockCapability(f, "hosted");
    await f.store.transact("legacy-hosted-placeholder", "fixture", new Date().toISOString(), state => {
      const work = state.agents[f.workId]!;
      work.invocations.push({ id: "legacy-dispatch-only", executor: "hosted", startedAt: new Date().toISOString(), dispatchState: "uncertain", dispatchCount: 1 });
      work.nextCheckAt = new Date().toISOString(); return null;
    });
    const before = await f.store.read(), quota = vi.spyOn(QuotaReader.prototype, "read");
    const request = vi.spyOn(f.api, "request");
    await scheduleHosted(f.cfg, f.store, new Date().toISOString());
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "hosted", workId: f.workId, invocationId: "legacy-dispatch-only" })).toMatchObject({ state: "capability-wait" });
    expect(request.mock.calls.filter(call => call[1].includes("/actions/"))).toEqual([]);
    expect(quota).not.toHaveBeenCalled(); expect(await f.calls()).toHaveLength(1);
    expect((await f.store.read()).head).toBe(before.head);
  });
});

describe("repair source admissibility at verification", () => {
  afterEach(() => { for (const mock of [git, loadSources, verifyRepairChecks, checkLocalReview]) vi.mocked(mock).mockReset(); });
  // The fixture attempted a (order 0); b (order 1) predates the plan when the floor is c (order 2).
  async function mergedRepair(merged: string, floor?: string) {
    const f = await nativeFixture();
    if (floor) f.cfg.tests.physicalDevice = { ...physicalPolicy(), sourceFloor: floor.repeat(40) };
    await f.store.transact("observed-main", "fixture", new Date().toISOString(), state => { state.lastMain = "a".repeat(40); return null; });
    const pull = { merged: true, merge_commit_sha: merged.repeat(40), head: { sha: "e".repeat(40) }, base: { ref: "main", sha: "a".repeat(40), repo: null }, body: "review-record: .agent/worklog/repair.md", labels: [{ name: "agent-reviewed" }] };
    const original = f.api.request.bind(f.api);
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => path === "repos/example/app/pulls/42" ? structuredClone(pull) as T : original<T>(method, path, body);
    vi.mocked(git).mockReturnValue(""); vi.mocked(verifyRepairChecks).mockResolvedValue({ checkIds: [], superseded: [] }); vi.mocked(checkLocalReview).mockReturnValue([]);
    vi.mocked(loadSources).mockResolvedValue([source("a", 0), source("b", 1), source("c", 2)]);
    await writeFile(f.callsPath + ".result", JSON.stringify({ outcome: "repaired", summary: "Merged a reviewed repair", evidence: [], pullRequest: "https://github.com/example/app/pull/42", sourceSha: merged.repeat(40), reviewHead: "e".repeat(40), missingCapability: "" }));
    return f;
  }
  it.each([
    ["the attempted source", "a", undefined, `Repair source ${"a".repeat(40)} does not descend past attempted source ${"a".repeat(40)}`],
    ["a source below the floor", "b", "c", `Source ${"b".repeat(40)} predates physical-device source floor ${"c".repeat(40)}`],
  ])("returns %s as a verification checkpoint, not a transaction error", async (_label, merged, floor, message) => {
    const f = await mergedRepair(merged, floor), before = (await f.store.read()).state;
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "checkpoint", repairedSha: undefined });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!, last = work.invocations.at(-1)!, intent = state.intents[work.intentId]!;
    expect(last.result!.summary).toContain(`deterministic verification pending: ${message}`);
    expect(state.transitions[`worker-ended-${last.id}`]!.result).toMatchObject({ outcome: "checkpoint" }); expect(state.transitions[`worker-error-${last.id}`]).toBeUndefined();
    expect(work.state).toBe("pending"); expect(intent.source).toBe("a".repeat(40)); expect(intent.lineage).toEqual(before.intents[work.intentId]!.lineage); expect(state.sources).toEqual(before.sources);
    expect(intent.blocker).toContain(message); expect(intent.nextAction).toBe("resume-repair-checkpoint");
  });
  it("shows the agent which sources it may return, outside the capability digest, and adopts the floor itself", async () => {
    const f = await mergedRepair("c", "c");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local", workId: f.workId })).toMatchObject({ outcome: "repaired", repairedSha: "c".repeat(40) });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!, prompt = (await f.calls())[0]!.prompt, prefix = "Repair source admissibility (controller facts): ";
    expect(JSON.parse(prompt.split("\n").find(line => line.startsWith(prefix))!.slice(prefix.length))).toEqual({ lastMain: "a".repeat(40), attemptedSources: ["a".repeat(40)],
      physicalDevice: { profile: "regression-v1", testIds: physicalPolicy().testIds, sourceFloor: "c".repeat(40) } });
    expect(prompt).toContain("A code repair is adopted only when its merged main source is at or after the delivery context's source, strictly after every attemptedSources entry");
    assertPromptDigest(state, f.workId, work.invocations.at(-1)!.id, prompt);
    expect(work.state).toBe("complete"); expect(state.intents[work.intentId]!.source).toBe("c".repeat(40)); expect(state.lastMain).toBe("c".repeat(40));
  });
});

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
