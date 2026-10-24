// Shared fixtures for pool tests: an in-memory Paperclip API, a fake `ssh` that runs the
// remote command locally through pipes (so killing it closes the host's stdin, as a
// dropped SSH session does), fake `claude`/`codex` CLIs driven by prompt keywords, and a
// fake native quota reader. Nothing here spends model allowance or opens a network port.
import { mkdtemp, mkdir, rm, writeFile, readFile, chmod, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { Writable } from "node:stream";
import { EventEmitter } from "node:events";
import { initStore, configWrite } from "../src/store.mjs";
import { defaults } from "../src/config.mjs";
import { hostEntry } from "../src/pool-config.mjs";
import { runTurn } from "../src/pool-runner.mjs";
import { Manager } from "../src/service.mjs";

export const pluginRoot = fileURLToPath(new URL("..", import.meta.url));
const header = "#!/usr/bin/env node\n";
const common = `import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const state = join(process.env.HOME, "state");
mkdirSync(state, { recursive: true });
const args = process.argv.slice(2);
const next = (name) => { const f = join(state, name); const n = (existsSync(f) ? Number(readFileSync(f, "utf8")) : 0) + 1; writeFileSync(f, String(n)); return n; };
`;
export const fakeClaude = header + common + `
if (args[0] === "auth") {
  if (existsSync(join(state, "claude-logged-out"))) { console.log(JSON.stringify({ loggedIn: false, authMethod: "none" })); process.exit(1); }
  console.log(JSON.stringify({ loggedIn: true, authMethod: "claude.ai", apiProvider: "firstParty", subscriptionType: "max" }));
  process.exit(0);
}
appendFileSync(join(state, "claude-calls.jsonl"), JSON.stringify({ args, env: Object.keys(process.env).sort(), cwd: process.cwd() }) + "\\n");
const resume = args.includes("--resume") ? args[args.indexOf("--resume") + 1] : null;
let session = resume ?? "sess-" + next("claude-sessions");
let buffer = "", started = false, pending = null;
const emit = (event) => process.stdout.write(JSON.stringify({ ...event, session_id: session }) + "\\n");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  let i;
  while ((i = buffer.indexOf("\\n")) >= 0) {
    const line = buffer.slice(0, i); buffer = buffer.slice(i + 1);
    if (line.trim()) handle(JSON.parse(line));
  }
});
process.stdin.on("end", () => process.exit(0));
function handle(message) {
  if (message.type === "user" && !started) { started = true; turn(message.message.content); }
  else if (message.type === "control_response" && pending && message.response.request_id === pending.id) {
    const p = pending; pending = null; p.resolve(message.response.response);
  }
}
const ask = (id, tool, input) => new Promise((resolve) => {
  pending = { id, resolve };
  emit({ type: "control_request", request_id: id, request: { subtype: "can_use_tool", tool_name: tool, input } });
});
async function turn(prompt) {
  if (prompt.includes("DRIFT") && resume) session = "sess-drift";
  emit({ type: "system", subtype: "init", model: "claude-opus-5-5" });
  let summary = "done";
  if (prompt.includes("ASK")) { const r = await ask("q1", "AskUserQuestion", { questions: [{ question: "Color?" }] }); summary = "answered " + r.updatedInput?.answers?.["Color?"]; }
  if (prompt.includes("TOOL")) { const r = await ask("t1", "Bash", { command: "echo hi" }); summary = "tool " + r.behavior; }
  const write = /WRITE (\\S+) (\\S+)/.exec(prompt);
  if (write) { writeFileSync(join(process.cwd(), write[1]), write[2] + "\\n"); summary += " wrote " + write[1]; }
  emit({ type: "stream_event", event: { delta: { type: "text_delta", text: "working: " + summary } } });
  if (prompt.includes("SLEEP")) { setInterval(() => {}, 1000); return; }
  emit({ type: "result", is_error: false, result: summary, structured_output: { outcome: "completed", summary, evidence: [] }, usage: { input_tokens: 10, output_tokens: 5, service_tier: "standard" } });
}
`;
export const fakeCodex = header + common + `
if (args[0] === "login") {
  if (existsSync(join(state, "codex-logged-out"))) { console.log("Not logged in"); process.exit(1); }
  console.log("Logged in using ChatGPT");
  process.exit(0);
}
appendFileSync(join(state, "codex-calls.jsonl"), JSON.stringify({ args, env: Object.keys(process.env).sort(), cwd: process.cwd() }) + "\\n");
const resume = args[1] === "resume";
let session = resume ? args[args.length - 2] : "thread-" + next("codex-sessions");
let prompt = "";
process.stdin.on("data", (b) => (prompt += b));
process.stdin.on("end", () => {
  if (prompt.includes("DRIFT") && resume) session = "thread-drift";
  const emit = (event) => process.stdout.write(JSON.stringify(event) + "\\n");
  emit({ type: "thread.started", thread_id: session });
  emit({ type: "item.started", item: { type: "command_execution", command: "echo hi" } });
  const write = /WRITE (\\S+) (\\S+)/.exec(prompt);
  if (write) writeFileSync(join(process.cwd(), write[1]), write[2] + "\\n");
  const result = prompt.includes("QUESTION")
    ? { outcome: "needs_input", summary: "need a color", evidence: [], question: "Which color?" }
    : { outcome: "completed", summary: write ? "wrote " + write[1] : "done", evidence: [], question: "" };
  emit({ type: "item.completed", item: { type: "agent_message", text: JSON.stringify(result) } });
  if (prompt.includes("SLEEP")) { setInterval(() => {}, 1000); return; }
  emit({ type: "turn.completed", usage: { input_tokens: 7, cached_input_tokens: 2, output_tokens: 3 } });
});
`;
export const fakeQuota = common + `
const file = join(state, "quota.json");
const q = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
if (q.fail) process.exit(1);
const observed = q.stale ? Date.now() - 3600000 : Date.now();
console.log(JSON.stringify({ observedAt: new Date(observed).toISOString(), windows: [{ id: "weekly", usedPercent: q.usedPercent ?? 10, resetsAt: new Date(Date.now() + 86400000).toISOString() }] }));
`;
export const fakeSsh = header + `import { spawn } from "node:child_process";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const args = process.argv.slice(2);
const state = join(process.env.HOME, "state");
mkdirSync(state, { recursive: true });
appendFileSync(join(state, "ssh-calls.jsonl"), JSON.stringify({ args, env: Object.keys(process.env).sort() }) + "\\n");
let i = 0;
while (args[i] === "-o") i += 2;
if (args.length !== i + 2 || !args[i].includes("@")) process.exit(255);
writeFileSync(join(state, "ssh-pid"), String(process.pid));
const child = spawn("/bin/sh", ["-c", args[i + 1]], { stdio: ["pipe", "pipe", "inherit"] });
process.stdin.pipe(child.stdin);
child.stdout.pipe(process.stdout);
child.stdin.on("error", () => {});
process.stdout.on("error", () => {});
child.on("close", (code) => process.exit(code ?? 255));
`;
export class FakePaperclip {
  constructor(companyId) {
    this.companyId = companyId;
    this.issues = new Map();
    this.comments = new Map();
    this.runIssues = new Map();
    this.logs = new Map();
    this.calls = [];
    this.keys = new Map();
    this.wakes = [];
    this.active = new Set();
    this.fail = null;
    this.fetch = (url, init = {}) => this.handle(url, init);
  }
  json(status, value) {
    return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
  }
  async handle(url, init) {
    const u = new URL(url);
    const path = u.pathname.replace(/^\/api/, "");
    const method = init.method ?? "GET";
    const body = init.body ? JSON.parse(init.body) : undefined;
    // A run credential writes as that run; a board token is a user actor.
    const runId = init.headers?.["x-paperclip-run-id"] ?? null;
    this.calls.push({ method, path, body, authorization: init.headers?.authorization, runId });
    const injected = this.fail?.(method, path, body, this);
    if (injected === "throw") throw new TypeError("fetch failed");
    if (typeof injected === "number") return this.json(injected, { error: "injected" });
    let m;
    if (method === "POST" && (m = /^\/companies\/([^/]+)\/issues$/.exec(path))) {
      if (body.idempotencyKey && this.keys.has(body.idempotencyKey)) return this.json(201, { id: this.keys.get(body.idempotencyKey) });
      const id = randomUUID();
      this.issues.set(id, { id, companyId: m[1], ...body });
      if (body.idempotencyKey) this.keys.set(body.idempotencyKey, id);
      if (injected === "throw-after") throw new TypeError("fetch failed");
      return this.json(201, { id });
    }
    if (method === "GET" && /^\/companies\/[^/]+\/issues$/.test(path)) return this.json(200, [...this.issues.values()]);
    if (method === "GET" && (m = /^\/issues\/([^/]+)$/.exec(path))) return this.issues.has(m[1]) ? this.json(200, this.issues.get(m[1])) : this.json(404, {});
    if (method === "PATCH" && (m = /^\/issues\/([^/]+)$/.exec(path))) {
      // One transaction: status and the run-attributed comment land together.
      const issue = this.issues.get(m[1]);
      if (!issue) return this.json(404, {});
      if (body.status) issue.status = body.status;
      if (body.comment) this.addComment(m[1], { body: body.comment }, runId);
      if (injected === "throw-after") throw new TypeError("fetch failed");
      return this.json(200, issue);
    }
    if ((m = /^\/issues\/([^/]+)\/comments$/.exec(path))) {
      const list = this.comments.get(m[1]) ?? [];
      if (method === "GET") return this.json(200, list);
      const issue = this.issues.get(m[1]);
      // Paperclip honors clientRequestId only for user actors, never for agent runs.
      const replay = !runId && body.clientRequestId && list.find((c) => c.clientRequestId === body.clientRequestId);
      if (!replay) {
        this.addComment(m[1], body, runId);
        if (issue && (body.resume || body.reopen) && issue.status !== "todo") issue.status = "todo";
        // An operator cancel holds a plain comment wake; explicit resume is a new turn.
        if (issue && !runId && (body.resume || !issue.holdAfterCancel) && !["done", "cancelled"].includes(issue.status)) {
          this.wakes.push({ issueId: m[1], resume: body.resume === true });
          if (body.resume) issue.holdAfterCancel = false;
        }
      }
      if (injected === "throw-after") throw new TypeError("fetch failed");
      return this.json(201, (this.comments.get(m[1]) ?? []).at(-1));
    }
    if (method === "GET" && (m = /^\/heartbeat-runs\/([^/]+)\/issues$/.exec(path)))
      return this.json(200, this.runIssues.has(m[1]) ? [{ issueId: this.runIssues.get(m[1]) }] : []);
    if (method === "GET" && (m = /^\/heartbeat-runs\/([^/]+)\/log$/.exec(path))) {
      const all = Buffer.from(this.logs.get(m[1]) ?? "");
      const offset = Number(u.searchParams.get("offset") ?? 0);
      const limit = Number(u.searchParams.get("limitBytes") ?? 65536);
      const slice = all.subarray(offset, offset + limit);
      return this.json(200, { content: slice.toString("utf8"), nextOffset: offset + limit < all.length ? offset + limit : undefined });
    }
    if (method === "POST" && (m = /^\/heartbeat-runs\/([^/]+)\/cancel$/.exec(path))) {
      const issue = this.issues.get(this.runIssues.get(m[1]));
      if (issue) issue.holdAfterCancel = true;
      return this.json(200, { ok: true });
    }
    return this.json(404, {});
  }
  addComment(issueId, body, runId) {
    const list = this.comments.get(issueId) ?? [];
    list.push({ id: randomUUID(), ...body, createdByRunId: runId, authorType: runId ? "agent" : "user" });
    this.comments.set(issueId, list);
  }
  startRun(issueId) {
    const runId = randomUUID();
    this.runIssues.set(runId, issueId);
    this.logs.set(runId, "");
    const issue = this.issues.get(issueId);
    // Execution start checks a todo issue out; other statuses are left as they are.
    if (issue) Object.assign(issue, { executionRunId: runId, ...(issue.status === "todo" ? { status: "in_progress" } : {}) });
    return runId;
  }
  // The pinned server's post-run policy for a legacy process run: a succeeded run with no
  // comment of its own gets a missing_issue_comment retry, and one that leaves its idle
  // issue todo/in_progress gets an issue_disposition_repair wake.
  policy(runId, code) {
    const issueId = this.runIssues.get(runId);
    const issue = this.issues.get(issueId);
    const otherActive = [...this.active].some((id) => id !== runId && this.runIssues.get(id) === issueId);
    return {
      missingComment: code === 0 && !(this.comments.get(issueId) ?? []).some((c) => c.createdByRunId === runId),
      dispositionRepair: code === 0 && !otherActive && ["todo", "in_progress"].includes(issue?.status),
    };
  }
  async listen() {
    const http = await import("node:http");
    this.server = http.createServer(async (req, res) => {
      let text = "";
      for await (const chunk of req) text += chunk;
      const response = await this.handle(`http://127.0.0.1${req.url}`, { method: req.method, headers: req.headers, body: text || undefined }).catch(() => null);
      if (!response) return res.destroy();
      res.writeHead(response.status, { "content-type": "application/json" });
      res.end(await response.text());
    });
    await new Promise((r) => this.server.listen(0, "127.0.0.1", r));
    return `http://127.0.0.1:${this.server.address().port}`;
  }
  // Paperclip's process adapter stores stdout chunks as NDJSON records.
  logStream(runId) {
    return new Writable({
      write: (chunk, _encoding, done) => {
        this.logs.set(runId, (this.logs.get(runId) ?? "") + JSON.stringify({ ts: new Date().toISOString(), stream: "stdout", chunk: chunk.toString() }) + "\n");
        done();
      },
    });
  }
  count(method, pattern) {
    return this.calls.filter((c) => c.method === method && pattern.test(c.path)).length;
  }
}
export async function poolFixture(t, { provider = "claude", transport = "ssh", second = null, quota = true, maxSupervisionReplies = 2 } = {}) {
  const root = await realpath(await mkdtemp(join(tmpdir(), "pool-")));
  t.after(() => rm(root, { recursive: true, force: true }));
  const coord = join(root, "coord");
  const hostHome = join(root, "host");
  const userHome = join(root, "home");
  const bin = join(root, "bin");
  for (const dir of [coord, hostHome, userHome, bin, join(userHome, "state")]) await mkdir(dir, { recursive: true, mode: 0o700 });
  await writeFile(join(bin, "package.json"), '{"type":"module"}\n');
  for (const [name, text] of [["claude", fakeClaude], ["codex", fakeCodex], ["ssh", fakeSsh], ["quota.mjs", fakeQuota]]) {
    await writeFile(join(bin, name), text);
    await chmod(join(bin, name), 0o755);
  }
  process.env.CODEX_CLAUDE_HOME = coord;
  delete process.env.CODEX_CLAUDE_POOL;
  await initStore();
  await configWrite({ ...defaults(), mode: "manual", maxSupervisionReplies });
  const tokenFile = join(root, "board-token");
  await writeFile(tokenFile, "board-secret-token\n", { mode: 0o600 });
  const companyId = randomUUID();
  const hostConfig = join(hostHome, "pool-host.json");
  const makeProfile = (kind, workspace, account) => ({
    provider: kind, agentId: randomUUID(), account,
    host: transport === "ssh"
      ? { transport: "ssh", target: "zoe@mini.test", ssh: join(bin, "ssh"), node: process.execPath, bridge: pluginRoot, hostConfig }
      : { transport: "local", node: process.execPath, bridge: pluginRoot, hostConfig },
    workspace, model: kind === "claude" ? "opus" : "gpt-5.6-sol", effort: "medium",
    permission: kind === "claude" ? "default" : "workspace-write",
  });
  const profiles = { [`mini-${provider}`]: makeProfile(provider, join(root, "workspace"), `acct-${provider}`) };
  if (second) profiles[second.name] = makeProfile(second.provider ?? provider, join(root, "workspace-2"), second.account);
  for (const p of Object.values(profiles)) await mkdir(p.workspace, { recursive: true });
  const pool = { version: 1, controller: { baseUrl: "http://127.0.0.1:3100", companyId, tokenFile }, heartbeatSeconds: 0.1, profiles };
  const writePool = (value) => writeFile(join(coord, "pool.json"), JSON.stringify(value, null, 2), { mode: 0o600 });
  await writePool(pool);
  const host = {
    version: 1, hostId: "mini", path: `${bin}:${dirname(process.execPath)}:/usr/bin:/bin`, graceSeconds: 1, maxRunSeconds: 60,
    quota: quota ? Object.fromEntries(["claude", "codex"].map((k) => [k, { command: [process.execPath, join(bin, "quota.mjs")], limits: { weekly: { stopAt: 70, hardAt: 80 } }, freshSeconds: 120, meterSeconds: 0 }])) : {},
    profiles: Object.fromEntries(Object.entries(profiles).map(([name, p]) => [name, hostEntry(name, p)])),
  };
  const writeHost = (value) => writeFile(hostConfig, JSON.stringify(value, null, 2), { mode: 0o600 });
  await writeHost(host);
  const paperclip = new FakePaperclip(companyId);
  const name = `mini-${provider}`;
  const state = join(userHome, "state");
  const coordinatorCwd = join(root, "coordinator");
  await mkdir(coordinatorCwd);
  const fx = {
    root, coord, hostHome, userHome, bin, state, pool, host, writePool, writeHost, paperclip, name, coordinatorCwd,
    // The bridge service with a stubbed live Codex snapshot, so every pool operation
    // passes through the real admission gate. `snapshot` may be a function per thread.
    coordinator(snapshot = {}) {
      const manager = new Manager();
      manager.snapshot = async (threadId) => {
        const value = typeof snapshot === "function" ? await snapshot(threadId) : snapshot;
        return { cwd: coordinatorCwd, model: "gpt-5.6-sol", reasoningEffort: "medium", sandbox: { type: "dangerFullAccess" }, approvalPolicy: "never", ...value };
      };
      manager.pool.fetchImpl = paperclip.fetch;
      manager.pool.waitStepMs = 50;
      manager.pool.manager = manager;
      return manager.pool;
    },
    profile: profiles[name], profiles, hostConfig,
    signals: new EventEmitter(),
    // Runs one Paperclip process-adapter invocation in this process, as Paperclip would.
    run(runId, profileName = name, extra = {}) {
      paperclip.active.add(runId);
      return runTurn({
        env: {
          PAPERCLIP_RUN_ID: runId, PAPERCLIP_AGENT_ID: profiles[profileName].agentId,
          PAPERCLIP_API_URL: "http://127.0.0.1:3100", PAPERCLIP_API_KEY: "paperclip-run-secret",
          HOME: userHome, PATH: process.env.PATH,
        },
        out: paperclip.logStream(runId), err: new Writable({ write: (_c, _e, done) => done() }),
        fetchImpl: paperclip.fetch, heartbeatMs: 100, pollMs: 50, stopGraceMs: 8000, signals: fx.signals, ...extra,
      }).finally(() => paperclip.active.delete(runId));
    },
    async lines(file) {
      try {
        return (await readFile(join(state, file), "utf8")).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
      } catch (error) {
        if (error.code === "ENOENT") return [];
        throw error;
      }
    },
  };
  return fx;
}
export async function until(check, timeoutMs = 15000, stepMs = 50) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await check();
    if (value) return value;
    await new Promise((r) => setTimeout(r, stepMs));
  }
  throw new Error("condition not reached in time");
}
