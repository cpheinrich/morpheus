import { afterEach, describe, expect, it } from "vitest";
import { rm } from "node:fs/promises";
import { claudeEnvironment, claudeQuota, claudeSessionProblem, CLAUDE_CODE_ANALYSED_VERSIONS, CLAUDE_USAGE_SOURCE, normalizeClaudeUsage, verifyClaudeLogin } from "../../src/cd/claude-quota.js";
import { QuotaReadError } from "../../src/cd/quota-reader.js";
import { account, claudeFixture, usageReply } from "./claude-fixture.js";

const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
type Row = { kind: string; percent: unknown; resets_at: unknown; scope: unknown };
type Reply = ReturnType<typeof usageReply> & { rate_limits: Record<string, unknown> & { limits: Row[] } };
const reply = (change: (value: Reply) => void = () => {}) => { const value = usageReply() as Reply; change(value); return value; };
const read = (value: unknown, model = "fable") => normalizeClaudeUsage(value, account, model, new Date().toISOString());
const row = (value: Reply, kind: string) => value.rate_limits.limits.find(item => item.kind === kind)!;

describe("Claude get_usage validation", () => {
  it("returns every unscoped row plus the configured family's weekly row", () => {
    const snapshot = read(reply());
    expect(snapshot.source).toBe(CLAUDE_USAGE_SOURCE); expect(snapshot.model).toBe("fable");
    expect(snapshot.windows.map(window => [window.id, window.usedPercent])).toEqual([["session", 12], ["weekly_all", 30], ["weekly_scoped:fable", 3]]);
  });

  it("counts surface-scoped rows and skips rows scoped to another model", () => {
    const value = reply(value => {
      value.rate_limits.limits.push({ kind: "weekly_scoped", percent: 95, resets_at: new Date(Date.now() + 3_600_000).toISOString(), scope: { model: { display_name: "Opus", id: null }, surface: null } });
      value.rate_limits.limits.push({ kind: "weekly_scoped", percent: 41, resets_at: new Date(Date.now() + 3_600_000).toISOString(), scope: { model: null, surface: "cowork" } });
    });
    const snapshot = read(value);
    expect(snapshot.windows.map(window => window.id)).toEqual(["session", "weekly_all", "weekly_scoped:fable", "weekly_scoped:cowork"]);
    expect(Math.max(...snapshot.windows.map(window => window.usedPercent))).toBe(41);
  });

  it("waits when the server lists no weekly window for the configured family", () => {
    expect(() => read(reply(), "claude-opus-5")).toThrow("listed no session, weekly or model-family window");
  });

  it.each([
    ["no object", null, "returned no usage object"],
    ["a different subscription", reply(value => { value.subscription_type = "pro"; }), "different subscription"],
    ["unavailable plan limits", reply(value => { value.rate_limits_available = false; }), "plan limits unavailable"],
    ["missing plan limits", reply(value => { value.rate_limits = null as never; }), "no plan limits"],
    ["a seeded answer without limits", reply(value => { delete (value.rate_limits as Record<string, unknown>).limits; }), "not freshly read"],
    ["paid extra usage enabled", reply(value => { value.rate_limits.extra_usage = { is_enabled: true }; }), "paid extra usage"],
    ["extra usage unknown", reply(value => { delete value.rate_limits.extra_usage; }), "paid extra usage"],
    ["extra usage as a string", reply(value => { value.rate_limits.extra_usage = { is_enabled: "false" }; }), "paid extra usage"],
    ["a missing session row", reply(value => { value.rate_limits.limits = value.rate_limits.limits.filter(item => item.kind !== "session"); }), "listed no session"],
    ["a missing weekly row", reply(value => { value.rate_limits.limits = value.rate_limits.limits.filter(item => item.kind !== "weekly_all"); }), "listed no session"],
    ["a non-numeric percent", reply(value => { row(value, "weekly_all").percent = "30"; }), "invalid plan window"],
    ["a malformed row", reply(value => { value.rate_limits.limits.push("session" as never); }), "malformed plan rows"],
    ["a session row disagreeing with its window", reply(value => { row(value, "session").percent = 14; }), "disagree"],
    ["a weekly window on a 0-1 scale", reply(value => { value.rate_limits.seven_day = { utilization: 0.3, resets_at: new Date(Date.now() + 3_600_000).toISOString() }; }), "disagree"],
    ["a missing five-hour window", reply(value => { value.rate_limits.five_hour = null; }), "disagree"],
    ["an expired window", reply(value => { row(value, "session").resets_at = new Date(Date.now() - 1000).toISOString(); }), "unknown or expired"],
    ["a nonzero window without a reset", reply(value => { row(value, "weekly_all").resets_at = null; }), "invalid plan window"],
    ["usage above 100", reply(value => { row(value, "weekly_scoped").percent = 101; }), "unknown or expired"],
  ])("refuses %s as unknown telemetry", (_label, value, message) => {
    expect(() => read(value)).toThrow(QuotaReadError);
    expect(() => read(value)).toThrow(message);
  });

  it("accepts an unused window with no reset as zero percent", () => {
    const value = reply(value => { row(value, "weekly_scoped").percent = 0; row(value, "weekly_scoped").resets_at = null; });
    expect(read(value).windows.find(window => window.id === "weekly_scoped:fable")?.usedPercent).toBe(0);
  });

  it("accepts rows within one percentage point and refuses past it", () => {
    expect(() => read(reply(value => { row(value, "session").percent = 13; }))).not.toThrow();
    expect(() => read(reply(value => { row(value, "session").percent = 13.01; }))).toThrow("disagree");
  });

  it("refuses an unknown model family", () => {
    expect(() => read(reply(), "default")).toThrow("no known quota family");
  });
});

describe("Claude account binding", () => {
  const status = (change: Record<string, unknown> = {}) => JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", email: " OPERATOR@example.com ", subscriptionType: "max", ...change });
  it("accepts the exact bound account case-insensitively in auth status", () => { expect(() => verifyClaudeLogin(status(), account)).not.toThrow(); });
  it.each([
    ["another account", { email: "other@example.com" }], ["another subscription", { subscriptionType: "pro" }],
    ["an API key", { authMethod: "api_key" }], ["a third-party provider", { apiProvider: "bedrock" }],
    ["a signed-out CLI", { loggedIn: false }], ["a missing email", { email: undefined }],
  ])("refuses %s in auth status", (_label, change) => { expect(() => verifyClaudeLogin(status(change), account)).toThrow("bound claude.ai subscription"); });
  it("refuses unparseable auth status output", () => { expect(() => verifyClaudeLogin("Logged in", account)).toThrow("bound claude.ai subscription"); });

  const init = (change: Record<string, unknown> = {}, version: unknown = CLAUDE_CODE_ANALYSED_VERSIONS[0]) =>
    ({ claude_code_version: version, account: { email: "operator@example.com", organization: "Synthetic", subscriptionType: "Claude Max", apiProvider: "firstParty", ...change } });
  it("binds an analysed build to the exact account in initialize", () => { expect(claudeSessionProblem(init(), account)).toBeUndefined(); });
  it.each([
    ["an unanalysed build", init({}, "2.1.313"), "has not been analysed"],
    ["a missing version", init({}, null), "has not been analysed"],
    ["an API key from a settings file", init({ apiKeySource: "ANTHROPIC_API_KEY", subscriptionType: undefined }), "not the bound"],
    ["a key helper", init({ apiKeySource: "apiKeyHelper" }), "not the bound"],
    ["an injected token", init({ tokenSource: "CLAUDE_CODE_OAUTH_TOKEN" }), "not the bound"],
    ["another account", init({ email: "other@example.com" }), "not the bound"],
    ["another plan", init({ subscriptionType: "Claude Pro" }), "not the bound"],
    ["a third-party provider", init({ apiProvider: "bedrock" }), "not the bound"],
    ["no account", { claude_code_version: CLAUDE_CODE_ANALYSED_VERSIONS[0] }, "not the bound"],
  ])("refuses %s in initialize", (_label, value, message) => { expect(claudeSessionProblem(value, account)).toContain(message); });
});

describe("Claude usage reader process", () => {
  it("strips every Claude, Anthropic and CCR variable, keeps the config directory and disables auto-update", () => {
    const env = claudeEnvironment({ ANTHROPIC_API_KEY: "x", ANTHROPIC_UNIX_SOCKET: "x", CLAUDE_CODE_OAUTH_TOKEN: "x", CLAUDE_CODE_OAUTH_TOKEN_FILE_DESCRIPTOR: "3",
      CCR_OAUTH_TOKEN_FILE: "x", AWS_BEARER_TOKEN_BEDROCK: "x", CLAUDE_CODE_USE_VERTEX: "1", HOME: "/home/synthetic", CLAUDE_CONFIG_DIR: "/cfg" });
    expect(env).toEqual({ HOME: "/home/synthetic", CLAUDE_CONFIG_DIR: "/cfg", DISABLE_AUTOUPDATER: "1" });
  });

  it("binds the session, then reads usage through the supervisor without a model turn", async () => {
    const f = await claudeFixture(directories);
    const snapshot = await claudeQuota(f.cfg.agents!.claude!.command, account, "fable", { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: "synthetic-token" }, new Date().toISOString());
    expect(snapshot.windows.map(window => window.id)).toEqual(["session", "weekly_all", "weekly_scoped:fable"]);
    const [call] = await f.lines(".usage-args");
    expect(call.args).toEqual(expect.arrayContaining(["-p", "--input-format", "stream-json", "--strict-mcp-config", "--no-session-persistence", "--tools"]));
    expect(call.args[call.args.indexOf("--setting-sources") + 1]).toBe("");
    expect(call.envSeen).toEqual([]); expect(call.autoupdater).toBe("1"); expect(call.cwd).not.toContain(f.directory);
    expect(await f.lines()).toEqual([]); expect((await f.lines(".quota-count")).length).toBe(1);
  });

  it("never asks an unbound or unanalysed session for usage", async () => {
    const f = await claudeFixture(directories);
    await f.set(".init-reply", { claude_code_version: "2.1.313", account: { email: "operator@example.com", subscriptionType: "Claude Max", apiProvider: "firstParty" } });
    await expect(claudeQuota(f.cfg.agents!.claude!.command, account, "fable", process.env, new Date().toISOString())).rejects.toThrow("has not been analysed");
    expect(await f.lines(".quota-count")).toEqual([]);
  });

  it.each([
    ["an error reply", "error", "request refused"],
    ["a reader that exits early", "exit", "reader exited (code=3)"],
  ])("fails closed on %s", async (_label, mode, message) => {
    const f = await claudeFixture(directories); await f.set(".usage-mode", mode);
    await expect(claudeQuota(f.cfg.agents!.claude!.command, account, "fable", process.env, new Date().toISOString())).rejects.toThrow(message);
  });

  it("fails closed with the validation reason for a paid-usage reply", async () => {
    const f = await claudeFixture(directories); await f.set(".usage", reply(value => { value.rate_limits.extra_usage = { is_enabled: true }; }));
    await expect(claudeQuota(f.cfg.agents!.claude!.command, account, "fable", process.env, new Date().toISOString())).rejects.toThrow("paid extra usage is enabled or unknown");
  });
});
