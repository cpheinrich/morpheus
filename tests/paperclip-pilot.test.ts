import { execFileSync, spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir, userInfo } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

// Cheap sleeping fixtures stand in for Codex, the quota reader and SSH. Nothing here
// launches a model or touches a provider.
const DIR = resolve("scripts/paperclip-pilot");
const SUPERVISOR = join(DIR, "supervisor.py");
const WORKER = join(DIR, "worker.py");
const PILOT = join(DIR, "pilot.mjs");
const TOKEN = "pcp-run-token-SENTINEL-7f3a";
const hashBinding = (binding: unknown[]) => createHash("sha256").update(JSON.stringify(binding)).digest("hex");
const bindings = new Map<string, string>();
const bindingOf = (name: string, h: any) => [name, h.transport, h.sshTarget ?? null, h.accountId, h.controllerCwd, h.hostConfig.workspace, h.supervisorPath, h.hostConfigPath];
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
if mode in ("native-over", "native-rise"):
    import os, pwd
    selected = {k: os.environ.get(k) for k in ("HOME", "CODEX_HOME", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "PAPERCLIP_API_KEY")}
    open(log + ".env", "a").write(json.dumps(selected) + "\\n")
    polluted = selected["HOME"] != pwd.getpwuid(os.getuid()).pw_dir or any(selected[k] for k in selected if k != "HOME") or any(k.startswith("PAPERCLIP_") for k in os.environ)
    used = 10.0 if polluted else (90.0 if mode == "native-over" or calls > 0 else 10.0)
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
  const binding = ["host-a", "local", null, "acct", workspace, workspace, SUPERVISOR, config];
  Object.assign(base, { binding, bindingSha256: hashBinding(binding) });
  let counter = 0;
  const f: Fixture = { root, workspace, state, config, quotaLog, uuid: () => {
    const id = `${Date.now().toString(16).padStart(16, "0")}${(++counter).toString(16).padStart(16, "0")}`.slice(-32);
    bindings.set(id, JSON.parse(readFileSync(config, "utf8")).bindingSha256); return id;
  },
    write: (extra = {}) => { writeFileSync(config, JSON.stringify({ ...base, ...patch, ...extra }), { mode: 0o600 }); chmodSync(config, 0o600); } };
  f.write();
  cleanups.push(() => { killMarked(root); rmSync(root, { recursive: true, force: true }); });
  return f;
}

function envelope(uuid: string, prompt: string, extra: Record<string, unknown> = {}) {
  return JSON.stringify({ schema: "morpheus-paperclip-envelope/1", runUuid: uuid, hostId: "host-a", agentId: "agent-a", args: ARGS,
    bindingSha256: bindings.get(uuid), env: { PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_RUN_ID: "run-1" }, prompt, inFlight: 1, ...extra }) + "\n";
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
  it.each(["native-over", "native-rise"])("uses the model's native account environment for %s quota reads", async mode => {
    const f = fixture({ meterIntervalSec: 0.2, maxRunSec: 15 }, [mode, "", "10"]), uuid = f.uuid();
    const run = start(SUPERVISOR, ["--config", f.config, "run"], { ...process.env, HOME: "/synthetic/other-home", CODEX_HOME: "/synthetic/other-account", OPENAI_API_KEY: "synthetic-api", ANTHROPIC_API_KEY: "synthetic-claude", PAPERCLIP_API_KEY: TOKEN });
    run.child.stdin!.write(envelope(uuid, mode === "native-over" ? "echo" : "sleep 30"));
    expect(await run.done).toBe(mode === "native-over" ? 75 : 124);
    expect(receipt(run).quotaDecision).toBe(mode === "native-over" ? "refuse" : "admit");
    if (mode === "native-over") expect(existsSync(join(f.workspace, "codex-ran"))).toBe(false);
    else expect(receipt(run)).toMatchObject({ termination: "verified", stopReason: "meter refuse: window secondary at 90.0% (+0.0pp in flight) reaches hardAt 67.5%" });
    const reads = readFileSync(f.quotaLog + ".env", "utf8").trim().split("\n").map(s => JSON.parse(s));
    expect(reads.length).toBe(mode === "native-over" ? 1 : 2);
    for (const observed of reads) expect(observed).toEqual({ HOME: userInfo().homedir, CODEX_HOME: null, OPENAI_API_KEY: null, ANTHROPIC_API_KEY: null, PAPERCLIP_API_KEY: null });
  });

  it.each(["legacy-config", "legacy-envelope", "workspace", "account"])("refuses invalid staged binding before quota: %s", async mode => {
    const f = fixture(), uuid = f.uuid();
    if (mode === "legacy-config") f.write({ bindingSha256: undefined });
    if (mode === "workspace") f.write({ workspace: "/another-workspace" });
    if (mode === "account") f.write({ accountId: "another-account" });
    const run = supervise(f, uuid, "echo", mode === "legacy-envelope" ? { bindingSha256: undefined } : {});
    expect(await run.done).toBe(78);
    expect(existsSync(f.quotaLog)).toBe(false);
    expect(existsSync(join(f.workspace, "codex-ran"))).toBe(false);
  });
  it("passes Codex JSONL through byte for byte and builds the model environment from nothing", async () => {
    const f = fixture(), uuid = f.uuid();
    const run = start(SUPERVISOR, ["--config", f.config, "run"], { ...process.env, CODEX_HOME: "/tmp/controller-codex-home", OPENAI_API_KEY: "sk-controller" });
    run.child.stdin!.write(envelope(uuid, "echo"));
    expect(await run.done).toBe(0);
    expect(run.out()).toBe(JSONL);
    const seen = JSON.parse(readFileSync(join(f.workspace, "env-seen.json"), "utf8"));
    expect(seen.env).toEqual({ CODEX_HOME: null, OPENAI_API_KEY: null, PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", MORPHEUS_PAPERCLIP_RUN_OWNER: uuid });
    expect(seen.argv).toEqual(ARGS);
    expect(receipt(run)).toMatchObject({ runUuid: uuid, state: "exited", termination: "verified", exitCode: 0, paperclipRunId: "run-1", hostId: "host-a", model: "gpt-test", effort: "medium", quotaDecision: "admit",
      requested: { model: "gpt-test", effort: "medium" }, observed: { model: "unknown", effort: "unknown" } });
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

  it("refuses a run when the workspace AGENTS.md differs from the staged digest", async () => {
    const staged = "# staged\n", digest = createHash("sha256").update(staged).digest("hex");
    const f = fixture({ instructionsSha256: digest });
    writeFileSync(join(f.workspace, "AGENTS.md"), "# rewritten by a model\n");
    const refused = supervise(f, f.uuid(), "echo");
    expect(await refused.done).toBe(75);
    expect(receipt(refused).stopReason).toBe("workspace AGENTS.md differs from the staged instructions");
    expect(existsSync(f.quotaLog)).toBe(false);
    writeFileSync(join(f.workspace, "AGENTS.md"), staged);
    expect(await supervise(f, f.uuid(), "echo").done).toBe(0);
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
      hosts: { "host-a": { transport: "local", agentId: "agent-a", accountId: "acct", python: "python3", supervisorPath: SUPERVISOR, hostConfigPath: f.config, controllerCwd: f.workspace, hostConfig: { workspace: f.workspace }, ...host } } }), { mode: 0o600 });
    const binding = bindingOf("host-a", JSON.parse(readFileSync(path, "utf8")).hosts["host-a"]);
    f.write({ binding, bindingSha256: hashBinding(binding) });
    return path;
  }
  const paperclipEnv = (extra: NodeJS.ProcessEnv = {}) => ({ ...process.env, CODEX_HOME: "/tmp/controller-codex-home", OPENAI_API_KEY: "sk-controller",
    PAPERCLIP_AGENT_ID: "agent-a", PAPERCLIP_API_KEY: TOKEN, PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_RUN_ID: "run-9", ...extra });
  function relay(inv: string, prompt: string, env = paperclipEnv()) {
    const h = JSON.parse(readFileSync(inv, "utf8")).hosts["host-a"];
    const bound = Object.hasOwn(env, "PAPERCLIP_HOST_BINDING_SHA256") ? env : { ...env, PAPERCLIP_HOST_BINDING_SHA256: hashBinding(bindingOf("host-a", h)) };
    const run = start(WORKER, ["--inventory", inv, ...ARGS], bound);
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

  it.each(["host-name", "transport", "sshTarget", "accountId", "controllerCwd", "workspace", "supervisorPath", "hostConfigPath", "missing"])("refuses registered binding drift: %s before reservation", async field => {
    const f = fixture(), inv = inventory(f), original = JSON.parse(readFileSync(inv, "utf8"));
    const registered = hashBinding(bindingOf("host-a", original.hosts["host-a"]));
    const h = original.hosts["host-a"];
    if (field === "host-name") { original.hosts["renamed"] = h; delete original.hosts["host-a"]; }
    else if (field === "workspace") h.hostConfig.workspace = "/another-workspace";
    else if (field === "transport") h.transport = "ssh";
    else if (field !== "missing") h[field] = field === "sshTarget" ? "another@host" : "/another-identity";
    writeFileSync(inv, JSON.stringify(original));
    const run = start(WORKER, ["--inventory", inv, ...ARGS], paperclipEnv({ PAPERCLIP_HOST_BINDING_SHA256: field === "missing" ? undefined : registered }));
    run.child.stdin!.end("echo");
    expect(await run.done).toBe(78);
    expect(existsSync(join(f.root, "controller-state"))).toBe(false);
    expect(existsSync(join(f.workspace, "codex-ran"))).toBe(false);
  });

  it("refuses a stage-only change after the inventory is rolled back", async () => {
    const f = fixture(), inv = inventory(f), value = JSON.parse(readFileSync(inv, "utf8"));
    const originalHash = hashBinding(bindingOf("host-a", value.hosts["host-a"]));
    const staged = { ...value.hosts["host-a"], hostConfig: { workspace: join(f.root, "staged-elsewhere") } };
    mkdirSync(staged.hostConfig.workspace);
    const binding = bindingOf("host-a", staged);
    f.write({ workspace: staged.hostConfig.workspace, binding, bindingSha256: hashBinding(binding) });
    const run = relay(inv, "echo", paperclipEnv({ PAPERCLIP_HOST_BINDING_SHA256: originalHash }));
    expect(await run.done).toBe(78);
    expect(existsSync(f.quotaLog)).toBe(false);
    expect(existsSync(join(staged.hostConfig.workspace, "codex-ran"))).toBe(false);
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
    const state = { companies: [] as { id: string; name: string }[], agents: [] as Record<string, any>[], posts: [] as string[], patches: [] as { url: string; body: unknown }[] };
    server = createServer((req, res) => {
      let body = "";
      req.on("data", c => { body += c; });
      req.on("end", () => {
        const send = (value: unknown) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(value)); };
        if (req.method === "POST") state.posts.push(req.url!);
        if (req.method === "GET" && req.url === "/api/companies") return send(state.companies);
        if (req.method === "POST" && req.url === "/api/companies") { const c = { id: `c${state.companies.length + 1}`, ...JSON.parse(body) }; state.companies.push(c); return send(c); }
        const m = req.url!.match(/^\/api\/companies\/([^/]+)\/agents$/);
        if (m && req.method === "GET") return send(state.agents.filter(a => a.status !== "terminated"));
        if (m && req.method === "POST") { const a = { id: `a${state.agents.length + 1}`, ...JSON.parse(body) }; state.agents.push(a); return send(a); }
        const retired = req.url!.match(/^\/api\/agents\/([^/]+)\/terminate$/);
        if (retired && req.method === "POST") { const agent = state.agents.find(a => a.id === retired[1])!; agent.status = "terminated"; return send(agent); }
        const p = req.url!.match(/^\/api\/agents\/([^/]+)\/permissions$/);
        if (p && req.method === "PATCH") {
          const parsed = JSON.parse(body);
          // The installed server's schema: canCreateAgents and canAssignTasks are required.
          if (typeof parsed.canCreateAgents !== "boolean" || typeof parsed.canAssignTasks !== "boolean") { res.statusCode = 400; return res.end("{}"); }
          state.patches.push({ url: req.url!, body: parsed });
          const agent = state.agents.find(a => a.id === p[1])!;
          agent.permissions = { canCreateAgents: parsed.canCreateAgents, canCreateSkills: parsed.canCreateSkills, canAssignTasks: parsed.canAssignTasks };
          return send(agent);
        }
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
    const bindingSha256 = hashBinding(["b", "ssh", "u@h", "acct", "/w/b", "/w/b", "/h/supervisor.py", "/h/b.json"]);
    expect(JSON.parse(out.stdout)).toEqual({ name: "b-codex", role: "engineer", adapterType: "codex_local",
      adapterConfig: { engine: "cli", command: "/l/worker", cwd: "/w/b", model: "gpt-6.1-sol", modelReasoningEffort: "medium", dangerouslyBypassApprovalsAndSandbox: false,
        morpheusHostBindingSha256: bindingSha256, timeoutSec: 180, graceSec: 15, outputInactivityTimeoutMs: 60000, extraArgs: ["--skip-git-repo-check"], env: { OPENAI_API_KEY: "", PAPERCLIP_HOST_BINDING_SHA256: bindingSha256 } },
      runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1, skipTimerWhenNoActionableWork: true, maxDailyRuns: 12 } },
      permissions: { canCreateAgents: false, canCreateSkills: false }, budgetMonthlyCents: 0 });
  });

  it("routes new work to the least loaded eligible queue, excluding paused and drifted agents", () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-pool-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const inv = writeInventory(root, "http://127.0.0.1:9");
    const script = `import {readFileSync} from 'node:fs'; import {agentBody,selectPoolHost} from ${JSON.stringify(PILOT)};
      const i=JSON.parse(readFileSync(${JSON.stringify(inv)}));i.hosts.a.agentId='a1';i.hosts.b.agentId='a2';
      const agents=['a','b'].map((n,j)=>({...agentBody(i,n),id:'a'+(j+1),status:'idle'}));
      const runs=[{agentId:'a1',status:'running'},{agentId:'a1',status:'queued'},{agentId:'a2',status:'succeeded'}];
      const result=[selectPoolHost(i,agents,runs)];agents[1].status='paused';result.push(selectPoolHost(i,agents,runs));
      agents[0].adapterConfig.cwd='/wrong';result.push(selectPoolHost(i,agents,runs)??null);console.log(JSON.stringify(result));`;
    expect(JSON.parse(execFileSync("node", ["--input-type=module", "-e", script], { encoding: "utf8" }))).toEqual(["b", "a", null]);
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
    expect(state.patches).toEqual(["a1", "a2"].map(id => ({ url: `/api/agents/${id}/permissions`, body: { canCreateAgents: false, canCreateSkills: false, canAssignTasks: false } })));
    const saved = JSON.parse(readFileSync(inv, "utf8"));
    expect([saved.company.id, saved.hosts.a.agentId, saved.hosts.b.agentId]).toEqual(["c1", "a1", "a2"]);
    const again = await pilot(inv, "enroll", "--apply");
    expect(again.code).toBe(0);
    expect(state.posts).toHaveLength(3);
    expect(state.patches).toHaveLength(2);
    expect(JSON.parse(again.out).plan.map((p: { action: string }) => p.action)).toEqual(["adopt", "adopt"]);
    state.agents[0]!.permissions.canAssignTasks = true;
    expect((await pilot(inv, "enroll", "--apply")).code).toBe(0);
    expect(state.agents[0]!.permissions.canAssignTasks).toBe(false);
    expect(state.patches).toHaveLength(3);
    state.agents[1]!.adapterConfig.cwd = "/w/elsewhere";
    const drifted = await pilot(inv, "enroll", "--apply");
    expect(drifted.code).toBe(2);
    expect(drifted.err).toContain("drifted in cwd");
  });

  it("requires retirement for changed route bindings and creates a new identity afterward", async () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-retire-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const { state, url } = await controller(), inv = writeInventory(root, url);
    expect((await pilot(inv, "enroll", "--apply")).code).toBe(0);
    const value = JSON.parse(readFileSync(inv, "utf8")); value.hosts.b.hostConfig.workspace = "/different-remote";
    writeFileSync(inv, JSON.stringify(value));
    expect((await pilot(inv, "enroll", "--apply")).err).toContain("morpheusHostBindingSha256");
    expect((await pilot(inv, "remove", "b", "--apply")).code).toBe(0);
    expect((await pilot(inv, "enroll", "--apply")).code).toBe(0);
    const enrolled = JSON.parse(readFileSync(inv, "utf8"));
    expect(enrolled.hosts.b.agentId).toBe("a3");
    expect(enrolled.retiredAgentIds).toEqual(["a2"]);
    expect(state.agents.find(a => a.id === "a2")!.status).toBe("terminated");
    expect(state.agents.find(a => a.id === "a3")!.adapterConfig.morpheusHostBindingSha256).toBe(hashBinding(bindingOf("b", enrolled.hosts.b)));
  });

  it("sets up a configured local host in one command and keeps reconciliation a preview without apply", async () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-setup-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const { state, url } = await controller(), inv = writeInventory(root, url);
    const value = JSON.parse(readFileSync(inv, "utf8"));
    delete value.hosts.b;
    Object.assign(value, { launcher: join(root, "bin/worker"), stateDir: join(root, "state"), python: "/must-not-run" });
    Object.assign(value.hosts.a, { controllerCwd: join(root, "workspace"), supervisorPath: join(root, "host/supervisor.py"), hostConfigPath: join(root, "host/config.json") });
    value.hosts.a.hostConfig.workspace = value.hosts.a.controllerCwd;
    writeFileSync(inv, JSON.stringify(value));
    expect((await pilot(inv, "setup", "a")).code).toBe(0);
    expect(state.posts).toEqual([]);
    expect(existsSync(value.launcher)).toBe(false);
    expect((await pilot(inv, "setup", "a", "--apply")).code).toBe(0);
    expect(state.posts).toEqual(["/api/companies", "/api/companies/c1/agents"]);
    expect(readFileSync(join(value.hosts.a.controllerCwd, "AGENTS.md"), "utf8")).toBe(readFileSync(join(DIR, "worker-instructions.md"), "utf8"));
    expect(JSON.parse(readFileSync(value.hosts.a.hostConfigPath, "utf8")).agentId).toBe("a1");
    const preview = await pilot(inv, "reconcile");
    expect(preview.code).toBe(0);
    expect(JSON.parse(preview.out)).toEqual({ would: "reconcile held reservations; this may terminate orphaned host processes", applied: false });
    expect(existsSync(value.stateDir)).toBe(false);
  });

  it("stages workspaces and tracked instructions, never silently replacing different ones", async () => {
    const root = mkdtempSync(join(tmpdir(), "paperclip-stage-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const inv = join(root, "inventory.json"), workspace = join(root, "ws"), hostDir = join(root, "host");
    writeFileSync(inv, JSON.stringify({ schema: "morpheus-paperclip-inventory/1", controller: { url: "http://127.0.0.1:9", port: 3100 }, company: { name: "Pilot" }, launcher: "/l/worker", stateDir: join(root, "s"),
      hosts: { a: { transport: "local", agentId: "a1", accountId: "acct", controllerCwd: workspace, supervisorPath: join(hostDir, "supervisor.py"), hostConfigPath: join(hostDir, "a.json"),
        hostConfig: { workspace, model: "gpt-6.1-sol", effort: "medium" } } } }), { mode: 0o600 });
    const asset = readFileSync(join(DIR, "worker-instructions.md"), "utf8");
    const first = await pilot(inv, "stage", "a", "--apply");
    expect(first.code).toBe(0);
    expect(JSON.parse(first.out).instructions).toMatchObject({ state: "absent", action: "install" });
    expect(readFileSync(join(workspace, "AGENTS.md"), "utf8")).toBe(asset);
    expect(asset).not.toContain("Known project judgments");
    const config = JSON.parse(readFileSync(join(hostDir, "a.json"), "utf8"));
    expect(config.instructionsSha256).toBe(JSON.parse(first.out).instructions.sha256);
    expect(existsSync(join(hostDir, "supervisor.py")) && existsSync(join(hostDir, "quota.mjs"))).toBe(true);
    expect(JSON.parse((await pilot(inv, "stage", "a", "--apply")).out).instructions).toMatchObject({ state: "current", action: "none" });
    writeFileSync(join(workspace, "AGENTS.md"), "operator's own text\n");
    const kept = await pilot(inv, "stage", "a", "--apply");
    expect(kept.code).toBe(1);
    expect(readFileSync(join(workspace, "AGENTS.md"), "utf8")).toBe("operator's own text\n");
    expect((await pilot(inv, "stage", "a", "--apply", "--replace-instructions")).code).toBe(0);
    expect(readFileSync(join(workspace, "AGENTS.md"), "utf8")).toBe(asset);
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

describe("agent-stack historical evaluation harness", () => {
  const EVAL = resolve("qa/evals/agent-stack");
  const harness = (dir: string, ...args: string[]) => spawnSync("node", [join(dir, "harness.mjs"), ...args], { encoding: "utf8" });
  const ids = readdirSync(join(EVAL, "cases")).map(n => n.replace(/\.json$/, "")).sort();
  const oracle = (id: string) => JSON.parse(readFileSync(join(EVAL, "oracles", `${id}.json`), "utf8"));

  it("has twelve frozen cases split into development and execution holdout, all inputs unchanged", () => {
    expect(ids).toHaveLength(12);
    const result = harness(EVAL, "verify");
    expect(result.status).toBe(0);
    const manifest = JSON.parse(readFileSync(join(EVAL, "manifest.json"), "utf8"));
    // The operator may re-freeze for another model before any execution; never blank.
    expect(manifest.model).toMatch(/\S/);
    expect(manifest.effort).toMatch(/\S/);
    expect(Object.keys(manifest.files)).toContain("../../../scripts/paperclip-pilot/worker-instructions.md");
    expect(Object.values(manifest.splits).filter(s => s === "holdout")).toHaveLength(5);
  });

  it("never puts oracle content into a worker prompt and gives both conditions identical evidence", () => {
    const lessons = readFileSync(join(EVAL, "lessons.json"), "utf8");
    const actions = Object.keys(JSON.parse(readFileSync(join(EVAL, "rubric.json"), "utf8")).actions);
    for (const action of actions) expect(JSON.parse(lessons).lessons.map((l: { text: string }) => l.text).join(" ")).not.toContain(action);
    for (const id of ids) {
      const o = oracle(id), rendered: Record<string, string> = {};
      for (const condition of ["baseline", "candidate"]) {
        const result = harness(EVAL, "render", id, condition);
        expect(result.status).toBe(0);
        rendered[condition] = result.stdout;
        for (const secret of [o.source, ...o.mechanisms, "acceptableActions", "forbiddenActions", "requiredEvidence"]) expect(result.stdout).not.toContain(secret);
      }
      const tail = (text: string) => text.slice(text.indexOf("## Situation")).replaceAll(".candidate.", ".X.").replaceAll(".baseline.", ".X.");
      expect(tail(rendered.candidate!)).toBe(tail(rendered.baseline!));
      expect(rendered.candidate!.length).toBeGreaterThan(rendered.baseline!.length);
    }
  });

  it("scores the typed decision against the separate oracle and flags harmful choices", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-stack-score-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const score = (output: object, label = "H07.candidate.1") => {
      const file = join(root, `${label}.json`);
      writeFileSync(file, JSON.stringify(output));
      return JSON.parse(harness(EVAL, "score", "H07", file).stdout);
    };
    const good = { runLabel: "H07.candidate.1", caseId: "H07", nextAction: "reduce-or-serialize", evidenceIds: ["E3", "E4"], completionClaim: "incomplete", rationale: "r" };
    expect(score(good)).toMatchObject({ status: "scored", pass: true, forbidden: false });
    expect(score({ ...good, nextAction: "reclaim-stale-state" })).toMatchObject({ pass: false, forbidden: true, checks: { action: false } });
    expect(score({ ...good, evidenceIds: ["E4"] })).toMatchObject({ pass: false, checks: { evidence: false } });
    expect(score({ ...good, evidenceIds: ["E3", "E9"] })).toMatchObject({ pass: false, checks: { noFabricatedEvidence: false } });
    expect(score({ ...good, completionClaim: "complete" })).toMatchObject({ pass: false, checks: { claim: false } });
    expect(score({ ...good, runLabel: "H07.candidate.0" })).toMatchObject({ status: "unknown", pass: false });
  });

  it("reports every case and condition, keeping missing output as unknown", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-stack-report-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, "H07.baseline.1.json"), JSON.stringify({ runLabel: "H07.baseline.1", caseId: "H07", nextAction: "reclaim-stale-state", evidenceIds: ["E2"], completionClaim: "incomplete", rationale: "r" }));
    writeFileSync(join(root, "H07.candidate.1.json"), JSON.stringify({ runLabel: "H07.candidate.1", caseId: "H07", nextAction: "reduce-or-serialize", evidenceIds: ["E3"], completionClaim: "incomplete", rationale: "r" }));
    writeFileSync(join(root, "H01.candidate.1.json"), JSON.stringify({ runLabel: "H01.candidate.1", caseId: "H01", nextAction: "fix-check-then-rerun", evidenceIds: ["E2"], completionClaim: "incomplete", rationale: "r" }));
    writeFileSync(join(root, "H01.candidate.1.meta.json"), JSON.stringify({ receipt: { resume: true } }));
    const report = JSON.parse(harness(EVAL, "report", root).stdout);
    expect(report.rows).toHaveLength(24);
    expect(report.rows.find((r: { caseId: string; condition: string }) => r.caseId === "H01" && r.condition === "candidate")).toMatchObject({ status: "unknown", reason: "resumed session" });
    expect(report.summary["baseline/dev"]).toEqual({ pass: 0, scored: 1, unknown: 6, forbidden: 1 });
    expect(report.summary["candidate/dev"]).toEqual({ pass: 1, scored: 1, unknown: 6, forbidden: 0 });
    expect([report.paired, report.improvements, report.regressions, report.ceiling]).toEqual([1, ["H07"], [], null]);
  });

  it("refuses to render or score after a frozen input changes", () => {
    const root = mkdtempSync(join(tmpdir(), "agent-stack-tamper-"));
    cleanups.push(() => rmSync(root, { recursive: true, force: true }));
    const copy = join(root, "qa", "evals", "agent-stack");
    mkdirSync(copy, { recursive: true }); mkdirSync(join(root, "scripts", "paperclip-pilot"), { recursive: true });
    execFileSync("cp", ["-R", `${EVAL}/.`, copy]);
    execFileSync("cp", [join(DIR, "worker-instructions.md"), join(root, "scripts", "paperclip-pilot")]);
    expect(harness(copy, "render", "H01", "baseline").status).toBe(0);
    const o = JSON.parse(readFileSync(join(copy, "oracles", "H03.json"), "utf8"));
    o.acceptableActions.push("ask-human-credentials");
    writeFileSync(join(copy, "oracles", "H03.json"), JSON.stringify(o, null, 2) + "\n");
    const result = harness(copy, "render", "H01", "baseline");
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("oracles/H03.json");
    // The workspace instructions both conditions load are frozen as well.
    o.acceptableActions.pop();
    writeFileSync(join(copy, "oracles", "H03.json"), JSON.stringify(o, null, 2) + "\n");
    writeFileSync(join(root, "scripts", "paperclip-pilot", "worker-instructions.md"), "Known project judgments: ...\n");
    const contaminated = harness(copy, "render", "H01", "baseline");
    expect(contaminated.status).toBe(1);
    expect(contaminated.stderr).toContain("worker-instructions.md");
  });
});
