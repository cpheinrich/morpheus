import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Cheap sleeping fixtures stand in for Codex, the quota reader and SSH. Nothing here
// launches a model or touches a provider.
const DIR = resolve("scripts/paperclip-pilot");
const SUPERVISOR = join(DIR, "supervisor.py");
const WORKER = join(DIR, "worker.py");
const PILOT = join(DIR, "pilot.mjs");
const TOKEN = "pcp-run-token-SENTINEL-7f3a";
const ARGS = ["exec", "--json", "-c", 'sandbox_mode="workspace-write"', "-c", "sandbox_workspace_write.network_access=true",
  "--skip-git-repo-check", "--model", "gpt-test", "-c", 'model_reasoning_effort="medium"', "-"];
const JSONL = '{"type":"thread.started","thread_id":"t-1"}\n{"type":"item.completed","item":{"type":"agent_message","text":"ok \\u00e9"}}\n{"type":"turn.completed","usage":{"input_tokens":1}}\n';

const FAKE_CODEX = `#!/usr/bin/env python3
import json, os, subprocess, sys, time
prompt = sys.stdin.read().split()
open(os.path.join(os.getcwd(), "codex-ran"), "a").write(prompt[0] + "\\n")
with open(os.path.join(os.getcwd(), "env-seen.json"), "w") as f:
    json.dump({"argv": sys.argv[1:], "env": {k: os.environ.get(k) for k in ("CODEX_HOME", "OPENAI_API_KEY", "PAPERCLIP_API_KEY", "PAPERCLIP_API_URL", "MORPHEUS_PAPERCLIP_RUN_OWNER")}}, f)
sys.stdout.write('{"type":"thread.started","thread_id":"t-1"}\\n'); sys.stdout.flush()
if prompt[0] == "echo":
    sys.stdout.write('{"type":"item.completed","item":{"type":"agent_message","text":"ok \\\\u00e9"}}\\n{"type":"turn.completed","usage":{"input_tokens":1}}\\n')
elif prompt[0] == "sleep":
    time.sleep(float(prompt[1]))
elif prompt[0] == "hold":
    # Simulates a detached descendant: new session, inherited ownership marker.
    subprocess.Popen([sys.executable, "-c", "import time; time.sleep(60)"], start_new_session=True)
    time.sleep(60)
`;
const FAKE_QUOTA = `#!/usr/bin/env python3
import json, sys
from datetime import datetime, timedelta, timezone
mode, log = sys.argv[1], sys.argv[2]
calls = len(open(log).read().splitlines()) if __import__("os").path.exists(log) else 0
open(log, "a").write(mode + "\\n")
if mode == "fail":
    sys.exit(1)
now = datetime.now(timezone.utc)
used = float(sys.argv[3]) if len(sys.argv) > 3 else 10.0
if mode == "rise" and calls > 0:
    used = 70.0
iso = lambda t: t.strftime("%Y-%m-%dT%H:%M:%S.000Z")
window = sys.argv[4] if len(sys.argv) > 4 else "secondary"
print(json.dumps({"observedAt": iso(now - timedelta(minutes=10) if mode == "stale" else now), "source": "fake",
                  "windows": [{"id": window, "usedPercent": used, "resetsAt": iso(now + timedelta(days=2))}]}))
`;

const cleanups: (() => void)[] = [];
afterEach(() => { while (cleanups.length) cleanups.pop()!(); });

interface Fixture { root: string; workspace: string; state: string; config: string; quotaLog: string; uuid: () => string; write: (patch?: object) => void }

function fixture(patch: Record<string, unknown> = {}, quota: string[] = ["ok", "", "10"]): Fixture {
  const root = mkdtempSync(join(tmpdir(), "paperclip-pilot-"));
  const workspace = join(root, "workspace"), state = join(root, "host-state"), config = join(root, "host.json");
  const quotaLog = join(root, "quota.log");
  mkdirSync(workspace); writeFileSync(join(root, "codex"), FAKE_CODEX, { mode: 0o755 }); writeFileSync(join(root, "quota"), FAKE_QUOTA, { mode: 0o755 });
  const base = { schema: "morpheus-paperclip-host/1", hostId: "host-a", agentId: "agent-a", accountId: "acct", workspace, codexCommand: join(root, "codex"),
    model: "gpt-test", effort: "medium", stateDir: state, slots: 1, maxRunSec: 30, meterIntervalSec: 0, reservePp: 2.5,
    limits: { primary: { stopAt: 90, hardAt: 97 }, secondary: { stopAt: 62.5, hardAt: 67.5 } },
    path: "/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin", quotaCommand: [join(root, "quota"), quota[0]!, quotaLog, ...quota.slice(2)] };
  let counter = 0;
  const f: Fixture = { root, workspace, state, config, quotaLog, uuid: () => `${Date.now().toString(16).padStart(16, "0")}${(++counter).toString(16).padStart(16, "0")}`.slice(-32),
    write: (extra = {}) => { writeFileSync(config, JSON.stringify({ ...base, ...patch, ...extra }), { mode: 0o600 }); chmodSync(config, 0o600); } };
  f.write();
  cleanups.push(() => { killMarked(root); rmSync(root, { recursive: true, force: true }); });
  return f;
}

function envelope(uuid: string, prompt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ schema: "morpheus-paperclip-envelope/1", runUuid: uuid, hostId: "host-a", agentId: "agent-a", args: ARGS,
    env: { PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_RUN_ID: "run-1" }, prompt, inFlight: 1, ...extra }) + "\n";
}

interface Started { child: ChildProcess; out: () => string; err: () => string; done: Promise<number | null> }
function start(file: string, args: string[], env: NodeJS.ProcessEnv = process.env): Started {
  const child = spawn("python3", [file, ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
  let out = "", err = "";
  child.stdout!.on("data", b => { out += b; }); child.stderr!.on("data", b => { err += b; });
  const done = new Promise<number | null>(r => child.on("close", code => r(code)));
  return { child, out: () => out, err: () => err, done };
}
function supervise(f: Fixture, uuid: string, prompt: string, extra = {}, keepOpen = false): Started {
  const run = start(SUPERVISOR, ["--config", f.config, "run"]);
  run.child.stdin!.write(envelope(uuid, prompt, extra));
  if (!keepOpen) { /* stdin stays open until the test ends it */ }
  cleanups.push(() => { try { run.child.stdin!.end(); } catch { /* closed */ } });
  return run;
}
async function until(check: () => boolean, ms = 10_000) {
  const end = Date.now() + ms;
  while (!check()) { if (Date.now() > end) throw new Error("timed out waiting"); await new Promise(r => setTimeout(r, 50)); }
}
function receipt(run: Started) {
  const line = run.err().split("\n").find(l => l.startsWith("MORPHEUS_PAPERCLIP_RECEIPT "));
  return line ? JSON.parse(line.slice("MORPHEUS_PAPERCLIP_RECEIPT ".length)) : undefined;
}
function marked(uuid: string) {
  const rows = execFileSync("/bin/ps", ["axeww", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return rows.split("\n").filter(row => row.includes(`MORPHEUS_PAPERCLIP_RUN_OWNER=${uuid}`)).length;
}
function killMarked(root: string) {
  // Test hygiene only: stop any fixture process left by a failed assertion.
  const rows = execFileSync("/bin/ps", ["axeww", "-o", "pid=,command="], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  for (const row of rows.split("\n")) if (row.includes(root) || /MORPHEUS_PAPERCLIP_RUN_OWNER=[0-9a-f]{32}/.test(row) && row.includes("time.sleep(60)")) {
    try { process.kill(Number(row.trim().split(/\s+/)[0]), "SIGKILL"); } catch { /* gone */ }
  }
}
const stateText = (f: Fixture) => readdirSync(join(f.state, "receipts")).map(n => readFileSync(join(f.state, "receipts", n), "utf8")).join("\n");

describe("paperclip supervisor", () => {
  it("passes Codex JSONL through byte for byte and builds the model environment from nothing", async () => {
    const f = fixture(), uuid = f.uuid();
    const run = start(SUPERVISOR, ["--config", f.config, "run"], { ...process.env, CODEX_HOME: "/tmp/controller-codex-home", OPENAI_API_KEY: "sk-controller" });
    run.child.stdin!.write(envelope(uuid, "echo"));
    expect(await run.done).toBe(0);
    expect(run.out()).toBe(JSONL);
    const seen = JSON.parse(readFileSync(join(f.workspace, "env-seen.json"), "utf8"));
    expect(seen.env).toEqual({ CODEX_HOME: null, OPENAI_API_KEY: null, PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", MORPHEUS_PAPERCLIP_RUN_OWNER: uuid });
    expect(seen.argv).toEqual(ARGS);
    expect(receipt(run)).toMatchObject({ runUuid: uuid, state: "exited", termination: "verified", exitCode: 0, paperclipRunId: "run-1", hostId: "host-a", model: "gpt-test", effort: "medium", quotaDecision: "admit" });
    // The run token reaches the model on stdin only; receipts and stderr never hold it.
    expect(stateText(f)).not.toContain(TOKEN);
    expect(run.err()).not.toContain(TOKEN);
  });

  it.each([
    ["sandbox bypass", ["--dangerously-bypass-approvals-and-sandbox"]],
    ["provider override", ["-c", 'model_provider="api"']],
    ["profile", ["--profile", "api"]],
    ["working directory", ["-C", "/tmp"]],
    ["another model", ["--model", "gpt-other"]],
  ])("refuses a %s before reading quota or starting the model", async (_label, extra) => {
    const f = fixture(), uuid = f.uuid();
    const run = supervise(f, uuid, "echo", { args: [...ARGS.slice(0, -1), ...extra, "-"] });
    expect(await run.done).toBe(75);
    expect(receipt(run)).toMatchObject({ state: "refused", termination: "not-started" });
    expect(existsSync(join(f.workspace, "codex-ran"))).toBe(false);
    expect(existsSync(f.quotaLog)).toBe(false);
  });

  it("refuses a missing workspace-write sandbox", async () => {
    const f = fixture(), run = supervise(f, f.uuid(), "echo", { args: ["exec", "--json", "--model", "gpt-test", "-c", 'model_reasoning_effort="medium"', "-"] });
    expect(await run.done).toBe(75);
    expect(receipt(run).stopReason).toContain("workspace-write");
  });

  it("refuses an envelope bound to another agent and a config inside the workspace", async () => {
    const f = fixture(), run = supervise(f, f.uuid(), "echo", { agentId: "agent-b" });
    expect(await run.done).toBe(78);
    const g = fixture({ stateDir: "" });
    g.write({ stateDir: join(g.workspace, "state") });
    const inside = supervise(g, g.uuid(), "echo");
    expect(await inside.done).toBe(78);
    expect(inside.err()).toContain("outside the workspace");
  });

  it.each([
    ["62.4% admits", ["ok", "", "62.4"], 1, 0],
    ["62.5% refuses at stop-admission", ["ok", "", "62.5"], 1, 75],
    ["60% with another run in flight refuses", ["ok", "", "60"], 2, 75],
    ["57.4% with another run in flight admits", ["ok", "", "57.4"], 2, 0],
    ["stale telemetry refuses", ["stale", "", "10"], 1, 75],
    ["failed read refuses", ["fail", ""], 1, 75],
    ["an unconfigured window refuses", ["ok", "", "1", "tertiary"], 1, 75],
  ])("quota: %s", async (_label, quota, inFlight, code) => {
    const f = fixture({}, quota as string[]), run = supervise(f, f.uuid(), "echo", { inFlight });
    expect(await run.done).toBe(code);
    expect(existsSync(join(f.workspace, "codex-ran"))).toBe(code === 0);
  });

  it("stops a run at its hard deadline and proves the process group is gone", async () => {
    const f = fixture({ maxRunSec: 1 }), uuid = f.uuid();
    const run = supervise(f, uuid, "sleep 30");
    expect(await run.done).toBe(124);
    expect(receipt(run)).toMatchObject({ state: "stopped", termination: "verified", stopReason: "deadline" });
    expect(marked(uuid)).toBe(0);
  });

  it("stops the model when its controller connection (stdin) is lost", async () => {
    const f = fixture(), uuid = f.uuid();
    const run = supervise(f, uuid, "sleep 30", {}, true);
    await until(() => run.out().includes("thread.started"));
    expect(marked(uuid)).toBe(1);
    run.child.stdin!.end();
    expect(await run.done).toBe(124);
    expect(receipt(run)).toMatchObject({ termination: "verified", stopReason: "controller connection lost" });
    expect(marked(uuid)).toBe(0);
  });

  it("stops the model on SIGTERM", async () => {
    const f = fixture(), uuid = f.uuid();
    const run = supervise(f, uuid, "sleep 30", {}, true);
    await until(() => run.out().includes("thread.started"));
    run.child.kill("SIGTERM");
    expect(await run.done).toBe(124);
    expect(receipt(run).stopReason).toBe("signal 15");
    expect(marked(uuid)).toBe(0);
  });

  it("stops the model when the running meter crosses the hard ceiling", async () => {
    const f = fixture({ meterIntervalSec: 1 }, ["rise", "", "10"]), uuid = f.uuid();
    const run = supervise(f, uuid, "sleep 30", {}, true);
    expect(await run.done).toBe(124);
    expect(receipt(run).stopReason).toMatch(/^meter refuse: window secondary at 70\.0%/);
    expect(marked(uuid)).toBe(0);
  });

  it("keeps the slot while an orphaned model lives after a supervisor crash, then reconciles its descendants", async () => {
    const f = fixture(), first = f.uuid();
    const crashed = supervise(f, first, "hold", {}, true);
    await until(() => crashed.out().includes("thread.started") && marked(first) === 2);
    const exited = new Promise(r => crashed.child.once("exit", r));
    crashed.child.kill("SIGKILL"); // controller host restart: no cleanup ran
    await exited; // not "close": the orphan still holds the inherited stdout pipe
    expect(marked(first)).toBe(2);
    const blocked = supervise(f, f.uuid(), "echo");
    expect(await blocked.done).toBe(75);
    expect(receipt(blocked).stopReason).toBe("no free host slot");
    // The leader ends on its own; its detached descendant still carries the marker.
    const leader = JSON.parse(readFileSync(join(f.state, "receipts", `${first}.json`), "utf8")).child.pid;
    process.kill(leader, "SIGKILL");
    await until(() => marked(first) === 1);
    const next = supervise(f, f.uuid(), "echo");
    expect(await next.done).toBe(0);
    expect(marked(first)).toBe(0);
    expect(JSON.parse(readFileSync(join(f.state, "receipts", `${first}.json`), "utf8"))).toMatchObject({ state: "reconciled", termination: "verified" });
  });

  it("quarantines a slot whose termination cannot be observed, until a census proves it", async () => {
    const f = fixture(), uuid = f.uuid();
    // A census that always reports an unkillable survivor for this run.
    writeFileSync(join(f.root, "census"), `#!/bin/sh\necho "2147483646 Thu Oct 22 23:16:58 2026 python3 MORPHEUS_PAPERCLIP_RUN_OWNER=${uuid}"\n`, { mode: 0o755 });
    f.write({ census: [join(f.root, "census")] });
    const run = supervise(f, uuid, "echo");
    expect(await run.done).toBe(125);
    expect(receipt(run)).toMatchObject({ state: "quarantined", termination: "unknown" });
    const refused = supervise(f, f.uuid(), "echo");
    expect(await refused.done).toBe(75);
    f.write();
    const cleared = supervise(f, f.uuid(), "echo");
    expect(await cleared.done).toBe(0);
  }, 40_000);
});

describe("paperclip worker wrapper", () => {
  function inventory(f: Fixture, extra: Record<string, unknown> = {}, host: Record<string, unknown> = {}) {
    const path = join(f.root, "inventory.json");
    writeFileSync(path, JSON.stringify({ schema: "morpheus-paperclip-inventory/1", controller: { url: "http://127.0.0.1:3100", port: 3100 }, stateDir: join(f.root, "controller-state"),
      accounts: { acct: { maxInFlight: 1 } }, ...extra,
      hosts: { "host-a": { transport: "local", agentId: "agent-a", accountId: "acct", python: "python3", supervisorPath: SUPERVISOR, hostConfigPath: f.config, controllerCwd: f.workspace, ...host } } }), { mode: 0o600 });
    return path;
  }
  const paperclipEnv = (extra: NodeJS.ProcessEnv = {}) => ({ ...process.env, CODEX_HOME: "/tmp/controller-codex-home", OPENAI_API_KEY: "sk-controller",
    PAPERCLIP_AGENT_ID: "agent-a", PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_RUN_ID: "run-9", ...extra });
  function relay(inv: string, prompt: string, env = paperclipEnv()) {
    const run = start(WORKER, ["--inventory", inv, ...ARGS], env);
    run.child.stdin!.end(prompt);
    return run;
  }
  const ledger = (f: Fixture) => JSON.parse(readFileSync(join(f.root, "controller-state", "accounts", "acct.json"), "utf8"));

  it("relays one turn to the bound host and releases the account reservation", async () => {
    const f = fixture(), run = relay(inventory(f), "echo");
    expect(await run.done).toBe(0);
    expect(run.out()).toBe(JSONL);
    expect(JSON.parse(readFileSync(join(f.workspace, "env-seen.json"), "utf8")).env).toMatchObject({ CODEX_HOME: null, OPENAI_API_KEY: null, PAPERCLIP_API_KEY: TOKEN });
    expect(ledger(f)).toEqual([]);
    expect(readFileSync(join(f.root, "controller-state", "accounts", "acct.json"), "utf8")).not.toContain(TOKEN);
  });

  it("refuses an agent that is not bound to exactly one host", async () => {
    const f = fixture(), run = relay(inventory(f), "echo", paperclipEnv({ PAPERCLIP_AGENT_ID: "agent-x" }));
    expect(await run.done).toBe(78);
    expect(existsSync(join(f.workspace, "codex-ran"))).toBe(false);
  });

  it("admits one run per shared account and reconciles a reservation left by a killed wrapper", async () => {
    const f = fixture(), inv = inventory(f);
    const first = relay(inv, "sleep 30");
    await until(() => first.out().includes("thread.started"));
    const second = relay(inv, "echo");
    expect(await second.done).toBe(75);
    expect(second.err()).toContain("no free reservation");
    first.child.kill("SIGKILL"); // wrapper dies; the host sees EOF and stops the model
    await until(() => readdirSync(join(f.state, "receipts")).some(n => readFileSync(join(f.state, "receipts", n), "utf8").includes('"termination": "verified"')));
    expect(ledger(f)).toHaveLength(1);
    const third = relay(inv, "echo");
    expect(await third.done).toBe(0);
    expect(ledger(f)).toEqual([]);
  });

  it("reaches an SSH host through one quoted command and rewrites the API URL to its tunnel", async () => {
    const f = fixture(), bin = join(f.root, "bin");
    mkdirSync(bin);
    // Fake ssh: run the final (remote command) argument through a shell, recording the rest.
    writeFileSync(join(bin, "ssh"), `#!/bin/sh\nfor a; do last="$a"; done\nprintf '%s\\n' "$@" > "${join(f.root, "ssh-args")}"\nexec /bin/sh -c "$last"\n`, { mode: 0o755 });
    const inv = inventory(f, {}, { transport: "ssh", sshTarget: "worker@host-b.example", tunnelPort: 43100, python: "python3" });
    const run = relay(inv, "echo", paperclipEnv({ PATH: `${bin}:${process.env.PATH}` }));
    expect(await run.done).toBe(0);
    expect(run.out()).toBe(JSONL);
    const sshArgs = readFileSync(join(f.root, "ssh-args"), "utf8");
    expect(sshArgs).toContain("127.0.0.1:43100:127.0.0.1:3100");
    expect(sshArgs).toContain("ExitOnForwardFailure=yes");
    expect(sshArgs).not.toContain(TOKEN);
    expect(JSON.parse(readFileSync(join(f.workspace, "env-seen.json"), "utf8")).env.PAPERCLIP_API_URL).toBe("http://127.0.0.1:43100");
  });
});

describe("paperclip pilot enrollment", () => {
  let server: Server | undefined;
  afterEach(() => { server?.close(); server = undefined; });

  async function controller() {
    const state = { companies: [] as { id: string; name: string }[], agents: [] as Record<string, any>[], posts: [] as string[] };
    server = createServer((req, res) => {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        const send = (value: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
        if (req.method === "POST") state.posts.push(req.url!);
        if (req.method === "GET" && req.url === "/api/companies") return send(state.companies);
        if (req.method === "POST" && req.url === "/api/companies") { const c = { id: `c${state.companies.length + 1}`, ...JSON.parse(body) }; state.companies.push(c); return send(c); }
        const m = req.url!.match(/^\/api\/companies\/([^/]+)\/agents$/);
        if (m && req.method === "GET") return send(state.agents);
        if (m && req.method === "POST") { const a = { id: `a${state.agents.length + 1}`, ...JSON.parse(body) }; state.agents.push(a); return send(a); }
        res.statusCode = 404; res.end("{}");
      });
    });
    await new Promise<void>(r => server!.listen(0, "127.0.0.1", () => r()));
    const address = server!.address() as { port: number };
    return { state, url: `http://127.0.0.1:${address.port}` };
  }

  function writeInventory(root: string, url: string) {
    const path = join(root, "inventory.json");
    const host = (name: string, transport: string) => ({ transport, accountId: "acct", controllerCwd: `/w/${name}`, supervisorPath: "/h/supervisor.py", hostConfigPath: `/h/${name}.json`,
      ...(transport === "ssh" ? { sshTarget: "u@h", tunnelPort: 43100 } : {}),
      hostConfig: { workspace: `/w/${name}`, model: "gpt-6.1-sol", effort: "medium" } });
    writeFileSync(path, JSON.stringify({ schema: "morpheus-paperclip-inventory/1", controller: { url, port: 3100 }, company: { name: "Pilot" }, launcher: "/l/worker", stateDir: "/s",
      hosts: { a: host("a", "local"), b: host("b", "ssh") } }), { mode: 0o600 });
    return path;
  }
  const pilot = (inv: string, ...args: string[]) => new Promise<{ code: number | null; out: string; err: string }>(r => {
    const child = spawn("node", [PILOT, "--inventory", inv, ...args]);
    let out = "", err = "";
    child.stdout.on("data", b => { out += b; }); child.stderr.on("data", b => { err += b; });
    child.on("close", code => r({ code, out, err }));
  });

  it("builds an explicit no-bypass, no-timer, zero-API-budget agent", () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-enroll-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const out = spawnSync("node", [PILOT, "--inventory", writeInventory(root, "http://127.0.0.1:9"), "agent-config", "b"], { encoding: "utf8" });
    expect(JSON.parse(out.stdout)).toEqual({ name: "b-codex", role: "engineer", adapterType: "codex_local",
      adapterConfig: { engine: "cli", command: "/l/worker", cwd: "/w/b", model: "gpt-6.1-sol", modelReasoningEffort: "medium", dangerouslyBypassApprovalsAndSandbox: false,
        timeoutSec: 180, graceSec: 15, outputInactivityTimeoutMs: 60000, extraArgs: ["--skip-git-repo-check"], env: { OPENAI_API_KEY: "" } },
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1, skipTimerWhenNoActionableWork: true, maxDailyRuns: 12 } },
      budgetMonthlyCents: 0 });
  });

  it("enrolls idempotently and refuses to repoint a drifted agent", async () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-enroll-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const { state, url } = await controller(), inv = writeInventory(root, url);
    const dry = await pilot(inv, "enroll");
    expect(dry.code).toBe(0);
    expect(state.posts).toEqual([]);
    expect((await pilot(inv, "enroll", "--apply")).code).toBe(0);
    expect(state.posts).toEqual(["/api/companies", "/api/companies/c1/agents", "/api/companies/c1/agents"]);
    const saved = JSON.parse(readFileSync(inv, "utf8"));
    expect([saved.company.id, saved.hosts.a.agentId, saved.hosts.b.agentId]).toEqual(["c1", "a1", "a2"]);
    const again = await pilot(inv, "enroll", "--apply");
    expect(again.code).toBe(0);
    expect(state.posts).toHaveLength(3);
    expect(JSON.parse(again.out).plan.map((p: { action: string }) => p.action)).toEqual(["adopt", "adopt"]);
    state.agents[1]!.adapterConfig.cwd = "/w/elsewhere";
    const drifted = await pilot(inv, "enroll", "--apply");
    expect(drifted.code).toBe(2);
    expect(drifted.err).toContain("drifted in cwd");
  });

  it("refuses a group-writable inventory", async () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-enroll-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const inv = writeInventory(root, "http://127.0.0.1:9");
    chmodSync(inv, 0o664);
    const result = await pilot(inv, "agent-config", "a");
    expect(result.code).toBe(2);
    expect(result.err).toContain("group/world writable");
  });
});
