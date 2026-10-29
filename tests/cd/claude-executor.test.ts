import { afterEach, describe, expect, it, vi } from "vitest";
import { rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cd } from "../../src/cd/cli.js";
import { configSchema, configurationDigest, type AgentWork } from "../../src/cd/schema.js";
import { after } from "../../src/cd/state.js";
import { CLAUDE_DISALLOWED_TOOLS, runWorker } from "../../src/cd/worker.js";
import { claudeFixture } from "./claude-fixture.js";
import { config, now } from "./fixtures.js";

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
const claudeAgent = { model: "fable", account: { email: "operator@example.com", subscription: "max" } };
const prior = (executor: "local" | "claude", hostId: string, id = "prior"): AgentWork["invocations"][number] =>
  ({ id, executor, hostId, session: `${executor}-old-session`, startedAt: now, endedAt: after(now, 1), result: { outcome: "checkpoint", summary: "Prior durable checkpoint", evidence: [] } });

describe("Claude executor configuration", () => {
  it("leaves configurations without agents.claude hashing exactly as on trunk", () => {
    // Fixed digests computed from trunk's committed runtime before this change.
    expect(configurationDigest(config())).toBe("b71edea032bd39142b1cd27b61c211a9864e46f38f7d2d39463c89daf4f77127");
    expect(configurationDigest(configSchema.parse({ ...config(), agents: { local: { command: ["codex"] } } }))).toBe("da99e122ed180c8260ce4a3fda89abba53df32a3365584d57f45a8159165e579");
  });

  it("parses an explicit Claude executor with its default command and changes the digest", () => {
    const parsed = configSchema.parse({ ...config(), agents: { local: { command: ["codex"] }, claude: claudeAgent } });
    expect(parsed.agents?.claude).toEqual({ command: ["claude"], ...claudeAgent });
    expect(configurationDigest(parsed)).not.toBe("da99e122ed180c8260ce4a3fda89abba53df32a3365584d57f45a8159165e579");
  });

  it.each([
    ["a team plan", { ...claudeAgent, account: { ...claudeAgent.account, subscription: "team" } }],
    ["an unknown model family", { ...claudeAgent, model: "default" }],
    ["a model flag", { ...claudeAgent, model: "--dangerously-skip-permissions" }],
    ["a quota file", { ...claudeAgent, quotaFile: "/tmp/quota.json" }],
    ["a missing account", { model: "fable" }],
    ["an invalid email", { ...claudeAgent, account: { ...claudeAgent.account, email: "not-an-email" } }],
  ])("refuses %s", (_label, claude) => {
    expect(() => configSchema.parse({ ...config(), agents: { local: { command: ["codex"] }, claude } })).toThrow();
  });
});

describe("Claude executor admission and run", () => {
  it("binds the session before sending the prompt and records the result through the existing path", async () => {
    const f = await claudeFixture(directories);
    const result = await runWorker(f.cfg, f.store, f.directory, { executor: "claude", hostId: "mac-pro:operator:claude" }, { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: "synthetic", ANTHROPIC_BASE_URL: "https://example.invalid" });
    expect(result).toMatchObject({ outcome: "checkpoint" });
    const [call] = await f.lines();
    expect(call.args.slice(0, 6)).toEqual(["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose"]);
    expect(call.args).toEqual(expect.arrayContaining(["--permission-mode", "bypassPermissions", "--strict-mcp-config", "--max-turns", "50", "--model", "fable"]));
    expect(call.args[call.args.indexOf("--setting-sources") + 1]).toBe("");
    expect(call.args[call.args.indexOf("--disallowedTools") + 1]).toBe(CLAUDE_DISALLOWED_TOOLS.join(","));
    expect(call.args).not.toContain("--resume"); expect(call.envSeen).toEqual([]); expect(call.autoupdater).toBe("1");
    expect(call.prompt).toContain("Original durable diagnostic"); expect(call.prompt).toContain("independent executor claude");
    expect(await f.lines(".initialize")).toEqual(["reader", "run"]);
    expect((await f.lines(".admission"))[0].args).toEqual(["auth", "status", "--json"]);
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations.at(-1)).toMatchObject({ executor: "claude", hostId: "mac-pro:operator:claude", session: "claude-session-new", result: { outcome: "checkpoint", summary: "Synthetic Claude checkpoint" } });
    expect(work.lease).toBeUndefined(); expect(state.budget.telemetry.claude?.source).toBe("Claude Code get_usage");
    expect(state.budget.telemetry.local).toBeUndefined();
    expect(state.intents[work.intentId]!.nextAction).toBe("resume-repair-checkpoint");
  });

  it("refuses a configuration the ledger has not migrated to, before any read", async () => {
    const f = await claudeFixture(directories); f.cfg.agents!.claude!.model = "claude-fable-5";
    await expect(runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).rejects.toThrow("migrated configuration");
    expect(await f.lines(".initialize")).toEqual([]);
  });

  it("refuses a quota file override without starting the CLI", async () => {
    const f = await claudeFixture(directories);
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" }, { ...process.env, MORPHEUS_CD_QUOTA_FILE: "/tmp/fabricated.json" })).toMatchObject({ state: "budget-wait", failureKind: "telemetry", reason: expect.stringContaining("cannot be supplied by file") });
    expect(await f.lines(".initialize")).toEqual([]); expect(await f.lines()).toEqual([]);
  });

  it("scopes its admission wait to the Claude executor without hiding the work from another subscription", async () => {
    const f = await claudeFixture(directories), before = (await f.store.read()).state.agents[f.workId]!;
    await f.set(".usage-mode", "error");
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toMatchObject({ state: "budget-wait", failureKind: "telemetry" });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.nextCheckAt).toBe(before.nextCheckAt); expect(work.state).toBe(before.state);
    expect(state.intents[work.intentId]).toMatchObject({ nextAction: "wait-subscription-telemetry", blocker: expect.stringContaining("Claude usage request refused") });
    const [id] = Object.keys(state.transitions).filter(key => key.startsWith("admission-wait-"));
    expect(id).toMatch(new RegExp(`^admission-wait-claude-telemetry-${f.workId}-[0-9]+$`));
    expect(state.transitions[id!]!.result).toMatchObject({ executor: "claude", failureKind: "telemetry" });
    expect(await f.lines()).toEqual([]);
  });

  it("refuses another account at auth status before claiming", async () => {
    const f = await claudeFixture(directories);
    await f.set(".auth", { loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: "other@example.com", subscriptionType: "max" });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toMatchObject({ state: "budget-wait", failureKind: "authentication" });
    expect((await f.store.read()).state.agents[f.workId]!.invocations).toEqual([]); expect(await f.lines()).toEqual([]);
  });

  it("treats another subscription's admission wait as due, while the Codex selector keeps its schedule", async () => {
    const f = await claudeFixture(directories), at = new Date().toISOString();
    await f.store.transact("codex-wait", "fixture", at, state => {
      const work = state.agents[f.workId]!; work.state = "waiting"; work.nextCheckAt = after(at, 5);
      state.intents[work.intentId]!.nextAction = "wait-subscription-telemetry"; return null;
    });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "local" })).toEqual({ state: "idle" });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toMatchObject({ outcome: "checkpoint" });
    expect(await f.lines()).toHaveLength(1);
  });

  it("does not treat a scheduled checkpoint as due early", async () => {
    const f = await claudeFixture(directories), at = new Date().toISOString();
    await f.store.transact("scheduled", "fixture", at, state => {
      const work = state.agents[f.workId]!; work.nextCheckAt = after(at, 5);
      state.intents[work.intentId]!.nextAction = "resume-repair-checkpoint"; return null;
    });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toEqual({ state: "idle" });
  });

  it("keeps its own reservation: a running Codex invocation elsewhere does not block it, a running Claude one does", async () => {
    for (const [executor, blocked] of [["local", false], ["claude", true]] as const) {
      const f = await claudeFixture(directories), at = new Date().toISOString();
      await f.store.transact("other", "fixture", at, state => {
        const other = structuredClone(state.agents[f.workId]!); other.id = "other-work"; other.state = "running";
        other.lease = { owner: "other-invocation", fence: 1, expiresAt: after(at, 30) };
        other.invocations = [{ id: "other-invocation", executor, hostId: "other-mac", startedAt: at }];
        state.agents[other.id] = other; state.fences[other.id] = 1; return null;
      });
      const run = runWorker(f.cfg, f.store, f.directory, { executor: "claude", workId: f.workId });
      if (blocked) await expect(run).rejects.toThrow("in-flight reservation"); else await expect(run).resolves.toMatchObject({ outcome: "checkpoint" });
    }
  });

  it.each([
    { label: "resumes the latest same-host Claude session", history: [prior("claude", "mac-pro")], resume: "claude-old-session" },
    { label: "starts fresh after a newer same-host Codex checkpoint", history: [prior("claude", "mac-pro"), prior("local", "mac-pro", "newer")], resume: undefined },
    { label: "starts fresh from another host's Claude session", history: [prior("claude", "mac-mini")], resume: undefined },
  ])("$label", async ({ history, resume }) => {
    const f = await claudeFixture(directories, { history });
    await runWorker(f.cfg, f.store, f.directory, { executor: "claude", hostId: "mac-pro" });
    const [call] = await f.lines();
    if (resume) expect(call.args[call.args.indexOf("--resume") + 1]).toBe(resume); else expect(call.args).not.toContain("--resume");
    expect(call.prompt).toContain("Previous durable checkpoints"); expect(call.prompt).toContain("Prior durable checkpoint");
  });

  it("never sends the prompt when the run's own session is not the bound account", async () => {
    const f = await claudeFixture(directories);
    await f.set(".run-init-reply", { claude_code_version: "2.1.312", account: { email: "operator@example.com", subscriptionType: undefined, apiProvider: "firstParty", apiKeySource: "ANTHROPIC_API_KEY" } });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toMatchObject({ outcome: "checkpoint" });
    expect(await f.lines()).toEqual([]);
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations.at(-1)!.result).toMatchObject({ outcome: "checkpoint", summary: "Claude session is not the bound claude.ai subscription" });
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-authentication");
  });

  it.each([
    { label: "an API key at system/init", init: { type: "system", subtype: "init", apiKeySource: "ANTHROPIC_API_KEY", session_id: "s" }, summary: "Claude run is not using the bound subscription sign-in" },
    { label: "no system/init attestation", init: "none", summary: "Claude run did not attest its bound session" },
  ])("discards the structured result after $label", async ({ init, summary }) => {
    const f = await claudeFixture(directories); await f.set(".init", init);
    await f.set(".result", { outcome: "repaired", summary: "Claims a repair", evidence: [], pullRequest: "https://github.com/example/app/pull/9", sourceSha: "", reviewHead: "a".repeat(40), missingCapability: "" });
    expect(await runWorker(f.cfg, f.store, f.directory, { executor: "claude" })).toMatchObject({ outcome: "checkpoint" });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations.at(-1)!.result).toMatchObject({ outcome: "checkpoint", summary });
    expect(work.state).not.toBe("complete"); expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-authentication");
  });

  it.each([
    ["overageStatus allowed", { status: "allowed", overageStatus: "allowed" }],
    ["overageStatus allowed_warning", { status: "allowed", overageStatus: "allowed_warning" }],
    ["isUsingOverage", { status: "rejected", isUsingOverage: true }],
  ])("stops the run when the provider signals paid usage (%s)", async (_label, info) => {
    const f = await claudeFixture(directories);
    await f.set(".event", JSON.stringify({ type: "rate_limit_event", rate_limit_info: info, session_id: "s", uuid: "u" })); await f.set(".event-hold", "3000");
    await runWorker(f.cfg, f.store, f.directory, { executor: "claude" });
    const state = (await f.store.read()).state, work = state.agents[f.workId]!;
    expect(work.invocations.at(-1)!.result).toMatchObject({ outcome: "checkpoint", summary: expect.stringContaining("Paid extra usage became available") });
    expect(state.intents[work.intentId]!.nextAction).toBe("wait-subscription-telemetry");
  });

  it("continues on a rejected-overage rate event", async () => {
    const f = await claudeFixture(directories);
    await f.set(".event", JSON.stringify({ type: "rate_limit_event", rate_limit_info: { status: "allowed", overageStatus: "rejected", overageDisabledReason: "org_level_disabled" }, session_id: "s", uuid: "u" }));
    await runWorker(f.cfg, f.store, f.directory, { executor: "claude" });
    expect((await f.store.read()).state.agents[f.workId]!.invocations.at(-1)!.result).toMatchObject({ summary: "Synthetic Claude checkpoint" });
  });
});

describe("Claude executor CLI", () => {
  it("prints one fresh Claude reading from cd quota --executor claude", async () => {
    const f = await claudeFixture(directories), path = join(f.directory, "cd.json");
    await writeFile(path, JSON.stringify(f.cfg));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    expect(await cd(["quota", "--executor", "claude", "--config", path, "--source-dir", f.directory])).toBe(0);
    expect(JSON.parse(log.mock.calls.at(-1)![0] as string)).toMatchObject({ source: "Claude Code get_usage", model: "fable" });
  });

  it("still refuses an unknown executor", async () => {
    const f = await claudeFixture(directories), path = join(f.directory, "cd.json");
    await writeFile(path, JSON.stringify(f.cfg));
    await expect(cd(["worker", "--executor", "anthropic", "--config", path, "--source-dir", f.directory])).rejects.toThrow("Unknown agent executor");
  });
});
