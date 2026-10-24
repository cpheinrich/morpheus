import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm, realpath, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  bindingDigest, judgeQuota, loadHost, poolSchema, profileSchema, sha256, shellQuote, transportArgv, transportEnv,
} from "../src/pool-config.mjs";
import { apiOrigin } from "../src/pool-paperclip.mjs";
import { parseMarker, marker, requestId } from "../src/pool-store.mjs";
import { foldLine } from "../src/pool.mjs";

const profile = {
  provider: "claude", agentId: randomUUID(), account: "acct",
  host: { transport: "ssh", target: "zoe@mini.test", ssh: "ssh", node: "/n/node", bridge: "/b/it's", hostConfig: "/h/pool-host.json" },
  workspace: "/w", model: "opus", effort: "high", permission: "default",
};
test("quota admission refuses at the limit, on stale or unconfigured windows, and admits just below", () => {
  const quota = { limits: { weekly: { stopAt: 70, hardAt: 80 } }, freshSeconds: 120 };
  const now = Date.parse("2026-10-24T08:00:00Z");
  const snap = (used, extra = {}) => ({ observedAt: "2026-10-24T07:59:30Z", windows: [{ id: "weekly", usedPercent: used, resetsAt: "2026-10-28T00:00:00Z" }], ...extra });
  assert.equal(judgeQuota(snap(69.9), quota, now).decision, "admit");
  assert.deepEqual(judgeQuota(snap(70), quota, now), { decision: "refuse", detail: "window weekly at 70% reaches stopAt 70%" });
  assert.equal(judgeQuota(snap(79.9), quota, now, "hardAt").decision, "admit");
  assert.equal(judgeQuota(snap(80), quota, now, "hardAt").decision, "refuse");
  assert.deepEqual(judgeQuota(snap(10, { observedAt: "2026-10-24T07:57:59Z" }), quota, now), { decision: "unknown", detail: "quota observation is stale or undated" });
  assert.equal(judgeQuota({ observedAt: "2026-10-24T07:59:30Z", windows: [{ id: "five_hour", usedPercent: 1, resetsAt: "2026-10-28T00:00:00Z" }] }, quota, now).decision, "unknown");
  assert.equal(judgeQuota(snap(10, { windows: [{ id: "weekly", usedPercent: 10, resetsAt: "2026-10-23T00:00:00Z" }] }), quota, now).decision, "unknown");
  assert.equal(judgeQuota(snap(-1), quota, now).decision, "unknown");
  assert.equal(judgeQuota(null, quota, now).decision, "unknown");
});
test("profiles refuse full access, moving aliases and malformed SSH targets", () => {
  assert.equal(profileSchema.safeParse(profile).success, true);
  assert.equal(profileSchema.safeParse({ ...profile, permission: "bypassPermissions" }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, provider: "codex", model: "gpt-5.6-sol", effort: "high", permission: "danger-full-access" }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, model: "best" }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, model: "-x" }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, host: { ...profile.host, target: "zoe@mini;rm" } }).success, false);
  assert.equal(profileSchema.safeParse({ ...profile, host: { ...profile.host, target: undefined } }).success, false);
  assert.equal(poolSchema.safeParse({ version: 1, controller: { baseUrl: "http://127.0.0.1:3100", companyId: randomUUID(), tokenFile: "relative" }, profiles: {} }).success, false);
});
test("every binding field changes the digest", () => {
  const base = bindingDigest("p", profile);
  for (const change of [{ account: "b" }, { workspace: "/v" }, { model: "sonnet" }, { effort: "low" }, { permission: "plan" }, { agentId: randomUUID() }, { host: { ...profile.host, target: "zoe@other" } }, { host: { ...profile.host, hostConfig: "/h/x.json" } }])
    assert.notEqual(bindingDigest("p", { ...profile, ...change }), base);
  assert.notEqual(bindingDigest("q", profile), base);
  assert.equal(bindingDigest("p", { ...profile }), base);
});
test("the SSH transport quotes each remote word once and forwards no run token", () => {
  const argv = transportArgv(profile, "reconcile", "abc");
  assert.equal(argv[0], "ssh");
  assert.equal(argv.at(-2), "zoe@mini.test");
  assert.equal(argv.at(-1), `'/n/node' '/b/it'\\''s/scripts/pool-remote.mjs' 'reconcile' 'abc' '--config' '/h/pool-host.json'`);
  assert.equal(shellQuote("a'b"), `'a'\\''b'`);
  assert.deepEqual(transportArgv({ ...profile, host: { ...profile.host, transport: "local" } }, "run"), ["/n/node", "/b/it's/scripts/pool-remote.mjs", "run", "--config", "/h/pool-host.json"]);
  assert.deepEqual(transportEnv({ HOME: "/h", PATH: "/p", SSH_AUTH_SOCK: "/s", PAPERCLIP_API_KEY: "secret", ANTHROPIC_API_KEY: "k", OPENAI_API_KEY: "o" }), { HOME: "/h", PATH: "/p", SSH_AUTH_SOCK: "/s" });
});
test("markers, request ids and API origins have exact shapes", () => {
  const id = randomUUID();
  const text = `do it\n\n${marker(id, 3, "do it")}`;
  assert.deepEqual(parseMarker(text), { conversationId: id, turn: 3, promptSha256: sha256("do it") });
  assert.equal(parseMarker("<!-- codex-claude-pool {\"conversationId\":\"x\",\"turn\":1,\"promptSha256\":\"y\"} -->"), null);
  assert.equal(parseMarker(undefined), null);
  assert.match(requestId(id, 2), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(requestId(id, 2), requestId(id, 2));
  assert.notEqual(requestId(id, 2), requestId(id, 3));
  assert.equal(apiOrigin("http://127.0.0.1:3100"), "http://127.0.0.1:3100");
  assert.equal(apiOrigin("https://paperclip.example/api"), "https://paperclip.example");
  for (const bad of ["http://10.0.0.5:3100", "https://u:p@x.example", "https://x.example/other", "https://x.example/?q=1"])
    assert.throws(() => apiOrigin(bad), /HTTPS or loopback/);
});
test("the folded view never makes a question live; only the runner record can", () => {
  const fold = { progress: "", sequence: 0 };
  foldLine(fold, "claude", JSON.stringify({ pool: "event", event: { type: "control_request", request_id: "q", request: { tool_name: "AskUserQuestion" } } }));
  assert.equal(fold.question, undefined);
  assert.equal(fold.state, "needs_input");
  foldLine(fold, "claude", JSON.stringify({ pool: "event", event: { type: "stream_event", event: { delta: { type: "text_delta", text: "hi" } } } }));
  assert.equal(fold.progress, "hi");
  foldLine(fold, "claude", "not json");
  foldLine(fold, "claude", JSON.stringify({ pool: "receipt", state: "completed", termination: "verified", code: 0, secret: "x" }));
  assert.deepEqual(fold.receipt, { state: "completed", termination: "verified", code: 0 });
});
test("a host file refuses shared workspaces, loose permissions and a location inside a workspace", async (t) => {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pool-host-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const entry = { bindingSha256: "a".repeat(64), provider: "codex", workspace: join(root, "w"), model: "gpt-5.6-sol", effort: "high", permission: "read-only" };
  const path = join(root, "pool-host.json");
  await writeFile(path, JSON.stringify({ version: 1, hostId: "h", profiles: { a: entry, b: { ...entry, bindingSha256: "b".repeat(64) } } }), { mode: 0o600 });
  await assert.rejects(loadHost(path), /each workspace belongs to exactly one profile/);
  await rm(path);
  await writeFile(path, JSON.stringify({ version: 1, hostId: "h", profiles: { a: entry } }));
  await chmod(path, 0o644);
  await assert.rejects(loadHost(path), /mode 600/);
  await rm(path);
  await writeFile(path, JSON.stringify({ version: 1, hostId: "h", profiles: { a: { ...entry, workspace: root } } }), { mode: 0o600 });
  await assert.rejects(loadHost(path), /outside every workspace/);
  await writeFile(path, JSON.stringify({ version: 1, hostId: "h", profiles: { a: entry } }), { mode: 0o600 });
  const loaded = await loadHost(path);
  assert.deepEqual([loaded.graceSeconds, loaded.maxRunSeconds, loaded.quota], [30, 3600, {}]);
});
test("a delegated worker cannot start or follow up a pool conversation from the CLI", async (t) => {
  const { execFile } = await import("node:child_process");
  const root = await realpath(await mkdtemp(join(tmpdir(), "pool-loop-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const command of ["pool.start", "pool.followup", "start"]) {
    const result = await new Promise((resolve) =>
      execFile(process.execPath, [new URL("../scripts/bridge.mjs", import.meta.url).pathname, command, "{}"], {
        env: { PATH: process.env.PATH, CODEX_CLAUDE_HOME: root, CODEX_CLAUDE_DELEGATED: "1" },
      }, (error, stdout, stderr) => resolve({ code: error?.code ?? 0, stderr })),
    );
    assert.deepEqual([result.code, result.stderr.trim()], [1, "Delegated workers cannot delegate again."]);
  }
});
