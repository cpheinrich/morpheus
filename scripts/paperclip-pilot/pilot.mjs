#!/usr/bin/env node
// Operator CLI for the Paperclip pilot. Paperclip owns the queue, runs, sessions and
// parser; this only enrolls host-bound agents, stages host files and reports state.
//
//   node pilot.mjs [--inventory PATH] <command> [args] [--apply]
//
// Read-only unless --apply. The inventory is operator-owned and private (default
// ~/.local/share/morpheus-paperclip/inventory.json, or MORPHEUS_PAPERCLIP_INVENTORY);
// it is never committed. See scripts/paperclip-pilot/README.md.
import { execFileSync, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// Tracked worker instructions, installed as the workspace AGENTS.md on every host. They
// carry no project lessons: evaluation conditions must not inherit them from the workspace.
const INSTRUCTIONS = join(HERE, "worker-instructions.md");
// Pilot workers may not hire agents, author skills or assign tasks. The installed
// server's PATCH schema requires canCreateAgents and canAssignTasks together.
const LOCKED = { canCreateAgents: false, canCreateSkills: false, canAssignTasks: false };
const sha = text => createHash("sha256").update(text).digest("hex");
const SCHEMA = "morpheus-paperclip-inventory/1";
const SSH = ["-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15"];
// Fields that bind an agent to a host. Drift is refused, never repaired in place:
// a different host, workspace or route needs a new agent (remove, then enroll).
const BOUND = ["engine", "command", "cwd", "model", "modelReasoningEffort", "dangerouslyBypassApprovalsAndSandbox"];

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const words = argv.filter(arg => arg !== "--apply");
let inventoryPath = process.env.MORPHEUS_PAPERCLIP_INVENTORY ?? join(homedir(), ".local/share/morpheus-paperclip/inventory.json");
if (words[0] === "--inventory") { inventoryPath = resolve(words[1] ?? ""); words.splice(0, 2); }
const [command, ...rest] = words;

function fail(message, code = 2) { console.error(`paperclip-pilot: ${message}`); process.exit(code); }
function print(value) { console.log(JSON.stringify(value, null, 2)); }

function loadInventory() {
  if (!existsSync(inventoryPath)) fail(`no inventory at ${inventoryPath}; copy inventory.example.json there and fill it in`);
  const info = statSync(inventoryPath);
  if ((info.mode & 0o022) !== 0) fail("inventory must not be group/world writable (chmod 600)");
  const inventory = JSON.parse(readFileSync(inventoryPath, "utf8"));
  if (inventory.schema !== SCHEMA) fail(`inventory schema must be ${SCHEMA}`);
  for (const [name, host] of Object.entries(inventory.hosts ?? {})) {
    for (const key of ["controllerCwd", "supervisorPath", "hostConfigPath"]) if (!isAbsolute(host[key] ?? "")) fail(`hosts.${name}.${key} must be absolute`);
    if (!["local", "ssh"].includes(host.transport)) fail(`hosts.${name}.transport must be local or ssh`);
    if (host.transport === "ssh" && !/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(host.sshTarget ?? "")) fail(`hosts.${name}.sshTarget must be user@host`);
    if (host.transport === "ssh" && !(Number.isInteger(host.tunnelPort) && host.tunnelPort > 1024 && host.tunnelPort < 65536)) fail(`hosts.${name}.tunnelPort must be a fixed unprivileged port`);
    if (!host.hostConfig?.workspace || !isAbsolute(host.hostConfig.workspace)) fail(`hosts.${name}.hostConfig.workspace must be absolute`);
  }
  return inventory;
}

function saveInventory(inventory) {
  const tmp = `${inventoryPath}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(inventory, null, 2) + "\n", { mode: 0o600 });
  renameSync(tmp, inventoryPath);
}

function hostOf(inventory, name) {
  const host = inventory.hosts?.[name];
  if (!host) fail(`unknown host ${name ?? "(none)"}; hosts: ${Object.keys(inventory.hosts ?? {}).join(", ")}`);
  return host;
}

export function agentBody(inventory, name) {
  const host = hostOf(inventory, name), adapter = inventory.adapter ?? {};
  return {
    name: host.agentName ?? `${name}-codex`,
    role: "engineer",
    adapterType: "codex_local",
    adapterConfig: {
      engine: "cli",
      command: inventory.launcher,
      cwd: host.controllerCwd,
      model: host.hostConfig.model,
      modelReasoningEffort: host.hostConfig.effort,
      // Explicit: the upstream default can be true.
      dangerouslyBypassApprovalsAndSandbox: false,
      timeoutSec: adapter.timeoutSec ?? 180,
      graceSec: adapter.graceSec ?? 15,
      outputInactivityTimeoutMs: adapter.outputInactivityTimeoutMs ?? 60_000,
      extraArgs: ["--skip-git-repo-check"],
      env: { OPENAI_API_KEY: "" },
      ...(host.instructionsFilePath ? { instructionsFilePath: host.instructionsFilePath } : {}),
    },
    runtimeConfig: { heartbeat: { enabled: false, intervalSec: 0, wakeOnDemand: true, maxConcurrentRuns: 1, skipTimerWhenNoActionableWork: true, maxDailyRuns: adapter.maxDailyRuns ?? 12 } },
    permissions: { canCreateAgents: false, canCreateSkills: false },
    // Zero dollars of API budget; subscription quota is metered by the supervisor.
    budgetMonthlyCents: 0,
  };
}

export function hostConfig(inventory, name) {
  const host = hostOf(inventory, name);
  if (!host.agentId) fail(`host ${name} is not enrolled yet (no agentId)`);
  return { schema: "morpheus-paperclip-host/1", ...host.hostConfig, hostId: name, agentId: host.agentId, accountId: host.accountId,
    instructionsSha256: sha(readFileSync(INSTRUCTIONS, "utf8")) };
}

function launcherText(inventory) {
  const worker = join(HERE, "worker.py");
  return `#!/bin/sh\n# Generated by paperclip-pilot. Paperclip's codex_local command for every pilot agent.\nexec ${quote(inventory.python ?? "/usr/bin/python3")} ${quote(worker)} --inventory ${quote(inventoryPath)} "$@"\n`;
}
function quote(text) { return `'${String(text).replaceAll("'", `'\\''`)}'`; }

async function api(inventory, method, path, body) {
  const headers = { "content-type": "application/json" };
  if (process.env.PAPERCLIP_BOARD_TOKEN) headers.authorization = `Bearer ${process.env.PAPERCLIP_BOARD_TOKEN}`;
  const response = await fetch(new URL(`/api${path}`, inventory.controller.url), { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(20_000) });
  const text = await response.text();
  let value; try { value = JSON.parse(text); } catch { value = text; }
  if (!response.ok) fail(`${method} ${path} → HTTP ${response.status}`, 3);
  return value;
}
const list = value => Array.isArray(value) ? value : (value?.items ?? value?.data ?? value?.agents ?? value?.companies ?? []);

export function drift(agent, body) {
  const actual = agent.adapterConfig ?? {}, expected = body.adapterConfig;
  const fields = BOUND.filter(key => actual[key] !== expected[key]);
  if (agent.adapterType !== "codex_local") fields.unshift("adapterType");
  return fields;
}

function runOnHost(host, args, input) {
  const remote = [host.python ?? "/usr/bin/python3", host.supervisorPath, "--config", host.hostConfigPath, ...args];
  const [file, params] = host.transport === "local" ? [remote[0], remote.slice(1)] : ["ssh", [...SSH, host.sshTarget, remote.map(quote).join(" ")]];
  return spawnSync(file, params, { input, encoding: "utf8", timeout: 60_000 });
}

// undefined means absent; a transport failure is an error, never mistaken for absence.
function readOnHost(host, path) {
  if (host.transport === "local") return existsSync(path) ? readFileSync(path, "utf8") : undefined;
  const result = spawnSync("ssh", [...SSH, host.sshTarget, `if [ -e ${quote(path)} ]; then cat ${quote(path)}; else exit 3; fi`], { encoding: "utf8", timeout: 30_000 });
  if (result.status === 3) return undefined;
  if (result.status !== 0) fail(`could not read ${path} on ${host.sshTarget.split("@")[1]} (ssh exit ${result.status})`, 3);
  return result.stdout;
}

const commands = {
  async "agent-config"() { print(agentBody(loadInventory(), rest[0])); },
  async "host-config"() { print(hostConfig(loadInventory(), rest[0])); },
  async launcher() {
    const inventory = loadInventory();
    if (!isAbsolute(inventory.launcher ?? "")) fail("inventory.launcher must be an absolute path outside any workspace");
    const text = launcherText(inventory), current = existsSync(inventory.launcher) ? readFileSync(inventory.launcher, "utf8") : undefined;
    if (current === text) return print({ launcher: inventory.launcher, changed: false });
    if (!apply) return print({ launcher: inventory.launcher, changed: true, applied: false, text });
    mkdirSync(dirname(inventory.launcher), { recursive: true, mode: 0o700 });
    writeFileSync(inventory.launcher, text, { mode: 0o700 }); chmodSync(inventory.launcher, 0o700);
    print({ launcher: inventory.launcher, changed: true, applied: true });
  },
  // Create both workspaces, install the tracked AGENTS.md, copy supervisor.py, quota.mjs and the
  // host config. Idempotent. A different existing AGENTS.md is kept and reported (exit 1)
  // unless --replace-instructions: never overwritten silently.
  async stage() {
    const inventory = loadInventory(), name = rest[0], host = hostOf(inventory, name);
    const replace = rest.includes("--replace-instructions");
    const config = JSON.stringify(hostConfig(inventory, name), null, 2) + "\n";
    const instructions = readFileSync(INSTRUCTIONS, "utf8"), agents = join(host.hostConfig.workspace, "AGENTS.md");
    const files = [[join(HERE, "supervisor.py"), host.supervisorPath], [join(HERE, "quota.mjs"), join(dirname(host.supervisorPath), "quota.mjs")]];
    const current = readOnHost(host, agents);
    const state = current === undefined ? "absent" : current === instructions ? "current" : "differs";
    const install = state === "absent" || (state === "differs" && replace);
    const plan = { host: name, transport: host.transport, applied: apply, controllerCwd: host.controllerCwd, workspace: host.hostConfig.workspace,
      instructions: { path: agents, state, sha256: sha(instructions), action: install ? "install" : state === "current" ? "none" : "keep (pass --replace-instructions)" },
      files: files.map(([, to]) => to).concat(host.hostConfigPath) };
    if (apply) {
      mkdirSync(host.controllerCwd, { recursive: true, mode: 0o700 }); // Paperclip requires the adapter cwd locally.
      if (host.transport === "local") {
        mkdirSync(host.hostConfig.workspace, { recursive: true, mode: 0o700 });
        if (install) writeFileSync(agents, instructions, { mode: 0o644 });
        for (const [from, to] of files) { mkdirSync(dirname(to), { recursive: true, mode: 0o700 }); writeFileSync(to, readFileSync(from), { mode: 0o700 }); }
        mkdirSync(dirname(host.hostConfigPath), { recursive: true, mode: 0o700 });
        writeFileSync(host.hostConfigPath, config, { mode: 0o600 }); chmodSync(host.hostConfigPath, 0o600);
      } else {
        const dirs = [...new Set([dirname(host.supervisorPath), dirname(host.hostConfigPath), host.hostConfig.workspace])];
        execFileSync("ssh", [...SSH, host.sshTarget, `umask 077 && mkdir -p ${dirs.map(quote).join(" ")}`], { stdio: "inherit", timeout: 30_000 });
        for (const [from, to] of files) execFileSync("scp", [...SSH, "-q", from, `${host.sshTarget}:${to}`], { stdio: "inherit", timeout: 60_000 });
        execFileSync("ssh", [...SSH, host.sshTarget, `umask 077 && cat > ${quote(host.hostConfigPath)} && chmod 600 ${quote(host.hostConfigPath)}`], { input: config, stdio: ["pipe", "inherit", "inherit"], timeout: 30_000 });
        if (install) execFileSync("ssh", [...SSH, host.sshTarget, `cat > ${quote(agents)} && chmod 644 ${quote(agents)}`], { input: instructions, stdio: ["pipe", "inherit", "inherit"], timeout: 30_000 });
      }
    }
    print(plan);
    if (state === "differs" && !replace) process.exit(1);
  },
  // Idempotent: adopt matching agents, create missing ones, refuse drift.
  async enroll() {
    const inventory = loadInventory(), plan = [];
    const companies = list(await api(inventory, "GET", "/companies"));
    let company = companies.find(c => c.id === inventory.company.id) ?? companies.find(c => c.name === inventory.company.name);
    if (!company) {
      plan.push({ create: "company", name: inventory.company.name });
      if (apply) company = await api(inventory, "POST", "/companies", { name: inventory.company.name, description: inventory.company.description ?? "Morpheus Paperclip pilot", budgetMonthlyCents: 0 });
    }
    if (company && inventory.company.id && inventory.company.id !== company.id) fail("inventory company id does not match the controller");
    if (company) inventory.company.id = company.id;
    const agents = company ? list(await api(inventory, "GET", `/companies/${company.id}/agents`)) : [];
    for (const name of Object.keys(inventory.hosts)) {
      const host = inventory.hosts[name], body = agentBody(inventory, name);
      const existing = host.agentId ? agents.find(a => a.id === host.agentId) : agents.find(a => a.name === body.name);
      if (host.agentId && !existing) fail(`hosts.${name}.agentId ${host.agentId} is not on the controller; remove it from the inventory explicitly before re-enrolling`);
      if (existing) {
        const fields = drift(existing, body);
        if (fields.length) fail(`agent ${existing.id} for ${name} drifted in ${fields.join(", ")}; do not repoint — remove it and enroll a new agent`);
        if ((inventory.retiredAgentIds ?? []).includes(existing.id)) fail(`agent ${existing.id} was retired; it cannot be re-bound`);
        plan.push({ host: name, agentId: existing.id, action: "adopt" });
        host.agentId = existing.id;
      } else {
        plan.push({ host: name, action: "create", name: body.name });
        if (apply) host.agentId = (await api(inventory, "POST", `/companies/${company.id}/agents`, body)).id;
      }
      // Tightening permissions is not repointing; apply it to adopted agents too.
      const granted = existing?.permissions ?? {};
      if (!existing || granted.canCreateAgents !== false || granted.canCreateSkills !== false) {
        plan.push({ host: name, action: "restrict-permissions", permissions: LOCKED });
        if (apply) await api(inventory, "PATCH", `/agents/${host.agentId}/permissions`, LOCKED);
      }
    }
    if (apply) saveInventory(inventory);
    print({ applied: apply, companyId: inventory.company.id ?? null, plan });
  },
  // Executable and cwd readiness only. Not evidence that a real task can run.
  async "test-environment"() {
    const inventory = loadInventory(), host = hostOf(inventory, rest[0]);
    const result = await api(inventory, "POST", `/companies/${inventory.company.id}/adapters/codex_local/test-environment`, { agentId: host.agentId, adapterConfig: agentBody(inventory, rest[0]).adapterConfig });
    print({ note: "metadata readiness only; a real nonce task is the acceptance probe", result });
  },
  async health() {
    const inventory = loadInventory();
    let controller; try { controller = await api(inventory, "GET", "/health"); } catch { controller = "unreachable"; }
    const hosts = {};
    for (const [name, host] of Object.entries(inventory.hosts)) {
      if (!rest.includes("--hosts") && host.transport !== "local") { hosts[name] = "skipped (pass --hosts to check over SSH)"; continue; }
      const result = runOnHost(host, ["status"]);
      try { hosts[name] = JSON.parse(result.stdout); } catch { hosts[name] = { error: `status exit ${result.status}` }; }
    }
    print({ controller, hosts });
  },
  async list() {
    const inventory = loadInventory();
    const agents = list(await api(inventory, "GET", `/companies/${inventory.company.id}/agents`));
    const bound = Object.fromEntries(Object.entries(inventory.hosts).map(([name, host]) => [host.agentId, name]));
    print(agents.map(a => ({ id: a.id, name: a.name, status: a.status, host: bound[a.id] ?? null, adapterType: a.adapterType, cwd: a.adapterConfig?.cwd, model: a.adapterConfig?.model, effort: a.adapterConfig?.modelReasoningEffort })));
  },
  async status() {
    const inventory = loadInventory(), names = rest.length ? rest : Object.keys(inventory.hosts), hosts = {};
    for (const name of names) {
      const result = runOnHost(hostOf(inventory, name), ["status"]);
      try { hosts[name] = JSON.parse(result.stdout); } catch { hosts[name] = { error: `status exit ${result.status}` }; }
    }
    const accounts = {};
    for (const account of new Set(Object.values(inventory.hosts).map(h => h.accountId))) {
      const file = join(inventory.stateDir, "accounts", `${account}.json`);
      accounts[account] = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : [];
    }
    print({ hosts, reservations: accounts });
  },
  async reconcile() {
    const result = spawnSync(loadInventory().python ?? "/usr/bin/python3", [join(HERE, "worker.py"), "--inventory", inventoryPath, "reconcile"], { stdio: "inherit", timeout: 300_000 });
    process.exit(result.status ?? 1);
  },
  // Pause: Paperclip admits no new runs for this agent. A live run is cancelled from the dashboard or `cancel-run`.
  async stop() { const inventory = loadInventory(), host = hostOf(inventory, rest[0]); print(apply ? await api(inventory, "POST", `/agents/${host.agentId}/pause`, {}) : { would: `POST /agents/${host.agentId}/pause` }); },
  async resume() { const inventory = loadInventory(), host = hostOf(inventory, rest[0]); print(apply ? await api(inventory, "POST", `/agents/${host.agentId}/resume`, {}) : { would: `POST /agents/${host.agentId}/resume` }); },
  async "cancel-run"() { const inventory = loadInventory(); print(apply ? await api(inventory, "POST", `/heartbeat-runs/${rest[0]}/cancel`, {}) : { would: `POST /heartbeat-runs/${rest[0]}/cancel` }); },
  // Retire: terminate the agent (history kept) and unbind it. Re-enrolling creates a new agent id.
  async remove() {
    const inventory = loadInventory(), name = rest[0], host = hostOf(inventory, name);
    if (!host.agentId) return print({ host: name, action: "none (not enrolled)" });
    if (!apply) return print({ would: [`POST /agents/${host.agentId}/terminate`, `retire ${host.agentId} and clear hosts.${name}.agentId`] });
    await api(inventory, "POST", `/agents/${host.agentId}/terminate`, {});
    inventory.retiredAgentIds = [...new Set([...(inventory.retiredAgentIds ?? []), host.agentId])];
    delete host.agentId; saveInventory(inventory);
    print({ host: name, retired: inventory.retiredAgentIds.at(-1) });
  },
  // A bounded artifact task with a fresh nonce. Acceptance is reading the artifact back, not the agent's comment.
  async "nonce-task"() {
    const inventory = loadInventory(), name = rest[0], host = hostOf(inventory, name);
    const nonce = randomBytes(16).toString("hex"), relative = `pilot-artifacts/nonce-${nonce.slice(0, 8)}.txt`;
    const body = { title: `Pilot nonce artifact on ${name}`, status: "todo", workMode: "standard", priority: "medium", assigneeAgentId: host.agentId,
      description: `Write exactly the text ${nonce} followed by a newline to ${relative} inside your current working directory, then mark this issue done with a comment naming the file. Do nothing else.` };
    const issue = apply ? await api(inventory, "POST", `/companies/${inventory.company.id}/issues`, body) : undefined;
    print({ applied: apply, issueId: issue?.id ?? null, nonce, artifact: join(host.hostConfig.workspace, relative), verify: `node pilot.mjs verify-artifact ${name} ${relative} ${nonce}` });
  },
  async "create-task"() {
    const inventory = loadInventory(), [name, title, file] = rest, host = hostOf(inventory, name);
    if (!title || !file) fail("usage: create-task HOST TITLE DESCRIPTION_FILE [--apply]");
    const description = readFileSync(file, "utf8");
    const body = { title, description, status: "todo", workMode: "standard", priority: "medium", assigneeAgentId: host.agentId };
    const issue = apply ? await api(inventory, "POST", `/companies/${inventory.company.id}/issues`, body) : undefined;
    print({ applied: apply, issueId: issue?.id ?? null, descriptionSha256: createHash("sha256").update(description).digest("hex") });
  },
  async "verify-artifact"() {
    const inventory = loadInventory(), [name, relative, nonce] = rest, host = hostOf(inventory, name);
    if (!relative || relative.includes("..") || isAbsolute(relative) || !nonce) fail("usage: verify-artifact HOST RELATIVE_PATH NONCE");
    const text = readOnHost(host, join(host.hostConfig.workspace, relative));
    const ok = text === `${nonce}\n`;
    print({ host: name, path: relative, found: text !== undefined, matches: ok, sha256: text === undefined ? null : createHash("sha256").update(text).digest("hex") });
    process.exit(ok ? 0 : 1);
  },
};

// realpath both sides, or a symlinked path (/var -> /private/var) silently runs nothing.
if (process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))) {
  const handler = commands[command];
  if (!handler) fail(`commands: ${Object.keys(commands).join(", ")}`, 64);
  await handler();
}
