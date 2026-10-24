import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { assertIsolation, issueBody, operate, prepare, recordPath, savePrepared, type JobRecord } from "../scripts/paperclip-bridge/bridge.js";

// Synthetic Git and HTTP only. These tests never invoke a model, native executor,
// installed service, provider account, authentication store, or live Paperclip API.
const ID = "MO-26-10-23-00.15.26";
const BRANCH = "mo-26-10-23-00.15.26-qualify-paperclip";
const COMPANY = "10000000-0000-4000-8000-000000000001";
const PROJECT = "10000000-0000-4000-8000-000000000002";
const AGENT = "10000000-0000-4000-8000-000000000003";
const ISSUE = "10000000-0000-4000-8000-000000000004";
const OTHER = "10000000-0000-4000-8000-000000000005";
const TOKEN = "synthetic-secret-never-in-records";
const hash = (v: string) => createHash("sha256").update(v).digest("hex");
const roots: string[] = [];
const git = (cwd: string, ...args: string[]) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: "pipe", env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_AUTHOR_NAME: "Test", GIT_AUTHOR_EMAIL: "test@example.invalid", GIT_COMMITTER_NAME: "Test", GIT_COMMITTER_EMAIL: "test@example.invalid" } }).trim();
async function put(repo: string, path: string, value: string) {
  await mkdir(join(repo, path, ".."), { recursive: true });
  await writeFile(join(repo, path), value);
}
const itemPath = `hq/product/roadmap/${ID}-qualify-paperclip.md`;
const ITEM = `---\nid: ${ID}\ntitle: Qualify Paperclip\nstatus: in-progress\npriority: P2\nowner: agent\nprs: []\nacceptance: qa/acceptance/bridge.md\ncreated: 2026-10-23\nupdated: 2026-10-23\n---\nPrivate parent prose is not copied into job instructions.\n`;
async function fixture(parent = tmpdir()) {
  const repo = await mkdtemp(join(parent, "paperclip-bridge-test-"));
  roots.push(repo);
  git(repo, "init", "--initial-branch", BRANCH);
  git(repo, "remote", "add", "origin", "https://github.com/example/project.git");
  await put(repo, itemPath, ITEM);
  await put(repo, "qa/acceptance/bridge.md", "# Acceptance\nExact artifact bytes verified.\n");
  await put(repo, "qa/job.md", "Write the specified artifact.\n");
  git(repo, "add", "."); git(repo, "commit", "-m", "fixture source");
  const input = { roadmapId: ID, job: "artifact-a", task: "qa/job.md", title: "Bounded artifact", baseUrl: "http://127.0.0.1:3100", companyId: COMPANY, projectId: PROJECT, agentId: AGENT };
  const record = await prepare(repo, input);
  return { repo, input, record };
}
async function committedJob(repo: string, record: JobRecord) {
  await savePrepared(repo, record);
  git(repo, "add", recordPath(record.plan)); git(repo, "commit", "-m", "freeze execution intent");
  return recordPath(record.plan);
}
function api(record: JobRecord) {
  const calls: Array<{ path: string; method: string; body: any; authorization?: string | null }> = [];
  const state = {
    anonymousStatus: 401,
    me: { companyId: COMPANY, keyScope: { kind: "task_bridge", projectId: PROJECT, allowedAssigneeAgentIds: [AGENT] } } as any,
    issue: { ...issueBody(record.plan), id: ISSUE, companyId: COMPANY, parentId: null } as any,
    failPost: false, postStatus: 201, beforePost: async () => {},
  };
  const transport: typeof fetch = async (url, init) => {
    const headers = new Headers(init?.headers);
    const path = new URL(String(url)).pathname;
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ path, method, body, authorization: headers.get("authorization") });
    expect(init?.redirect).toBe("error");
    if (!headers.has("authorization")) return Response.json({}, { status: state.anonymousStatus });
    expect(headers.get("authorization")).toBe(`Bearer ${TOKEN}`);
    if (path === "/api/agents/me") return Response.json(state.me);
    if (method === "POST") {
      await state.beforePost();
      expect(path).toBe(`/api/companies/${COMPANY}/issues`);
      expect(body).toEqual(issueBody(record.plan));
      if (state.failPost) throw new Error(TOKEN);
      if (state.postStatus !== 201) return Response.json({ error: "Assignee is not invokable" }, { status: state.postStatus });
      return Response.json({ id: ISSUE }, { status: 201 });
    }
    return Response.json(state.issue);
  };
  return { state, calls, transport, posts: () => calls.filter(c => c.method === "POST") };
}
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

describe("immutable one-to-many linkage", () => {
  it("freezes precise source and acceptance links while copying only selected instructions", async () => {
    const { repo, input, record } = await fixture();
    const p = record.plan;
    expect(p.sourceSha).toBe(git(repo, "rev-parse", "HEAD"));
    expect(p.roadmap.path).toBe(itemPath);
    expect(p.acceptance.url).toBe(`https://github.com/example/project/blob/${p.sourceSha}/qa/acceptance/bridge.md`);
    expect(p.acceptance.sha256).toBe(hash("# Acceptance\nExact artifact bytes verified.\n"));
    expect(issueBody(p).description).toContain(`"branch":"${BRANCH}"`);
    expect(issueBody(p).description).not.toContain("Private parent prose");
    expect(issueBody(p).idempotencyKey).toBe(p.operationId);
    expect((await prepare(repo, { ...input, job: "artifact-b" })).plan.operationId).not.toBe(p.operationId);
    expect((await prepare(repo, input)).plan.operationId).toBe(p.operationId);
  });
  it("requires active claimed work, committed inputs, explicit acceptance and regular source files", async () => {
    const { repo, input } = await fixture();
    git(repo, "checkout", "-b", "main");
    await expect(prepare(repo, input)).rejects.toThrow("claimed branch");
    git(repo, "checkout", BRANCH);
    await put(repo, "qa/job.md", "uncommitted change");
    await expect(prepare(repo, input)).rejects.toThrow("uncommitted source");
    git(repo, "checkout", "--", "qa/job.md");
    await symlink("bridge.md", join(repo, "qa/acceptance/link.md"));
    git(repo, "add", "."); git(repo, "commit", "-m", "symlink fixture");
    await expect(prepare(repo, { ...input, acceptance: "qa/acceptance/link.md" })).rejects.toThrow("regular committed");
    await put(repo, itemPath, ITEM.replace("acceptance: qa/acceptance/bridge.md\n", ""));
    git(repo, "add", "."); git(repo, "commit", "-m", "no acceptance");
    await expect(prepare(repo, input)).rejects.toThrow("acceptance reference");
  });
  it("resolves the roadmap's bare acceptance filename with the existing PM convention and preserves explicit repo paths", async () => {
    const { repo, input } = await fixture();
    await put(repo, itemPath, ITEM.replace("acceptance: qa/acceptance/bridge.md", "acceptance: bridge.md"));
    git(repo, "add", "."); git(repo, "commit", "-m", "bare acceptance filename");
    expect((await prepare(repo, input)).plan.acceptance.path).toBe("qa/acceptance/bridge.md");
    expect((await prepare(repo, { ...input, acceptance: "qa/job.md" })).plan.acceptance.path).toBe("qa/job.md");
  });
  it("rejects dangerous job identities and API destinations", async () => {
    const { repo, input } = await fixture();
    for (const baseUrl of ["http://10.0.0.2:3100", "https://user:secret@example.com", "https://example.com/api", "https://example.com/?secret=x"]) {
      await expect(prepare(repo, { ...input, baseUrl })).rejects.toThrow("API must");
    }
    await expect(prepare(repo, { ...input, job: "../other" })).rejects.toThrow();
    await expect(prepare(repo, { ...input, task: "../outside" })).rejects.toThrow("source path");
  });
  it("rejects a record directory symlink to the immediate repository parent without writing outside", async () => {
    const parent = await mkdtemp(join(tmpdir(), "paperclip-escape-parent-")); roots.push(parent);
    const { repo, record } = await fixture(parent);
    await mkdir(join(repo, ".agent/paperclip"), { recursive: true });
    await symlink(await realpath(parent), join(repo, ".agent/paperclip", ID));
    await expect(savePrepared(repo, record)).rejects.toThrow("record directory escapes repository");
    await expect(readFile(join(parent, `${record.plan.job}.json`), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

describe("submission and uncertainty", () => {
  it("persists the POST claim first, exact-reads the issue, and recovers lost local linkage without a second POST", async () => {
    const { repo, record } = await fixture();
    const path = await committedJob(repo, record);
    const a = api(record);
    const journal = join(repo, ".git/morpheus-paperclip", `${record.plan.operationId}.json`);
    a.state.beforePost = async () => expect(JSON.parse(await readFile(journal, "utf8"))).toEqual({ planHash: hash(JSON.stringify(record.plan)), state: "posting" });
    const linked = await operate(repo, path, { command: "submit", token: TOKEN }, a.transport);
    expect(linked).toEqual({ ...record, issueId: ISSUE });
    expect(JSON.parse(await readFile(journal, "utf8"))).toEqual({ planHash: hash(JSON.stringify(record.plan)), state: "linked", issueId: ISSUE });
    await writeFile(join(repo, path), JSON.stringify(record, null, 2) + "\n");
    expect(await operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).toEqual(linked);
    expect(a.posts()).toHaveLength(1);
    expect(await readFile(join(repo, path), "utf8")).not.toContain(TOKEN);
  });
  it("never reposts an uncertain request, and links only an exact observed candidate", async () => {
    const { repo, record } = await fixture();
    const path = await committedJob(repo, record);
    const a = api(record); a.state.failPost = true;
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("POST outcome unknown");
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("never repost");
    a.state.issue.description = "similar job, different immutable source";
    await expect(operate(repo, path, { command: "link", issueId: ISSUE, token: TOKEN }, a.transport)).rejects.toThrow("exact immutable job");
    a.state.issue = { ...issueBody(record.plan), id: ISSUE, companyId: COMPANY };
    expect(await operate(repo, path, { command: "link", issueId: ISSUE, token: TOKEN }, a.transport)).toEqual({ ...record, issueId: ISSUE });
    expect(a.posts()).toHaveLength(1);
  });
  it("retains a known response ID when readback is wrong and retries observation only", async () => {
    const { repo, record } = await fixture(); const path = await committedJob(repo, record); const a = api(record);
    a.state.issue.companyId = OTHER;
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("exact immutable job");
    a.state.issue.companyId = COMPANY;
    await operate(repo, path, { command: "submit", token: TOKEN }, a.transport);
    expect(a.posts()).toHaveLength(1);
    await expect(operate(repo, path, { command: "link", issueId: OTHER, token: TOKEN }, a.transport)).rejects.toThrow("cannot replace");
  });
  it("does not treat an assignee-state HTTP rejection as scope proof or blindly repost it", async () => {
    const { repo, record } = await fixture(); const path = await committedJob(repo, record); const a = api(record);
    a.state.postStatus = 409;
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("POST outcome unknown");
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("never repost");
    expect(a.posts()).toHaveLength(1);
    expect(JSON.parse(await readFile(join(repo, path), "utf8")).issueId).toBeUndefined();
  });
  it("requires committed intent and refuses changed payload reuse or concurrent operators", async () => {
    const { repo, record } = await fixture(); await savePrepared(repo, record); const path = recordPath(record.plan); const a = api(record);
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow();
    expect(a.posts()).toEqual([]);
    git(repo, "add", "."); git(repo, "commit", "-m", "intent");
    await operate(repo, path, { command: "submit", token: TOKEN }, a.transport);
    const changed = { ...record, plan: { ...record.plan, title: "Different work" } };
    await writeFile(join(repo, path), JSON.stringify(changed));
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("different immutable input");
    await writeFile(join(repo, path), JSON.stringify(record));
    await mkdir(join(repo, ".git/morpheus-paperclip", `${record.plan.operationId}.json.lock`));
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow("locked");
    expect(a.posts()).toHaveLength(1);
  });
  it.each(["anonymous", "standard", "company", "project", "extra-project", "assignee", "parent", "parents"])("refuses %s authority before POST", async kind => {
    const { repo, record } = await fixture(); const path = await committedJob(repo, record); const a = api(record);
    if (kind === "anonymous") a.state.anonymousStatus = 200;
    if (kind === "standard") a.state.me.keyScope = { kind: "standard" };
    if (kind === "company") a.state.me.companyId = OTHER;
    if (kind === "project") a.state.me.keyScope.projectId = OTHER;
    if (kind === "extra-project") a.state.me.keyScope.projectIds = [OTHER];
    if (kind === "assignee") a.state.me.keyScope.allowedAssigneeAgentIds = [AGENT, OTHER];
    if (kind === "parent") a.state.me.keyScope.parentIssueId = OTHER;
    if (kind === "parents") a.state.me.keyScope.parentIssueIds = [OTHER];
    await expect(operate(repo, path, { command: "submit", token: TOKEN }, a.transport)).rejects.toThrow(
      kind === "anonymous" ? "anonymous API access is not denied" : "requires a task_bridge key for exactly this project and assignee",
    );
    expect(a.posts()).toEqual([]);
  });
});

describe("verified result records preserve Git delivery authority", () => {
  it("reads live status without mirroring it, then accepts committed exact evidence without closing or rewriting the roadmap", async () => {
    const { repo, record } = await fixture(); const path = await committedJob(repo, record); const a = api(record);
    await operate(repo, path, { command: "submit", token: TOKEN }, a.transport);
    const before = await readFile(join(repo, path), "utf8");
    a.state.issue.status = "done";
    expect(await operate(repo, path, { command: "status", token: TOKEN }, a.transport)).toEqual({ operationId: record.plan.operationId, issueId: ISSUE, status: "done", delivery: "Morpheus PR/review/CI/merge required" });
    expect(await readFile(join(repo, path), "utf8")).toBe(before);
    await expect(operate(repo, path, { command: "reconcile", token: TOKEN }, a.transport)).rejects.toThrow("independently verified evidence");
    const receipt = { issueId: ISSUE, sourceSha: record.plan.sourceSha, outcome: "result", summary: "Operator read exact artifact bytes", evidence: [{ path: "qa/result.txt", sha256: hash("verified artifact\n") }] };
    await put(repo, "qa/result.txt", "verified artifact\n");
    await put(repo, "qa/receipt.json", JSON.stringify(receipt));
    await put(repo, itemPath, ITEM.replace("status: in-progress", "status: review"));
    git(repo, "add", "."); git(repo, "commit", "-m", "reviewable result evidence");
    const result = await operate(repo, path, { command: "reconcile", token: TOKEN, evidence: "qa/receipt.json" }, a.transport);
    expect(result).toEqual({ ...record, issueId: ISSUE, verification: { receipt, observedStatus: "done" } });
    expect(await readFile(join(repo, itemPath), "utf8")).toBe(ITEM.replace("status: in-progress", "status: review"));
    expect(a.posts()).toHaveLength(1);
  });
  it.each(["wrong-hash", "wrong-issue", "uncommitted", "blocked-without-needs"])("refuses %s evidence", async kind => {
    const { repo, record } = await fixture(); const path = await committedJob(repo, record); const a = api(record);
    await operate(repo, path, { command: "submit", token: TOKEN }, a.transport);
    a.state.issue.status = kind === "blocked-without-needs" ? "blocked" : "done";
    const receipt = { issueId: kind === "wrong-issue" ? OTHER : ISSUE, sourceSha: record.plan.sourceSha, outcome: kind === "blocked-without-needs" ? "blocked" : "result", summary: "Operator evidence", evidence: [{ path: "qa/result.txt", sha256: hash(kind === "wrong-hash" ? "wrong bytes" : "artifact") }] };
    await put(repo, "qa/result.txt", "artifact"); await put(repo, "qa/receipt.json", JSON.stringify(receipt));
    if (kind !== "uncommitted") { git(repo, "add", "."); git(repo, "commit", "-m", "evidence"); }
    await expect(operate(repo, path, { command: "reconcile", token: TOKEN, evidence: "qa/receipt.json" }, a.transport)).rejects.toThrow();
    expect(JSON.parse(await readFile(join(repo, path), "utf8")).verification).toBeUndefined();
  });
});

it("stages private reversible auth candidates, preserves live configuration and DB identity, and prints no secret", async () => {
  const root = await mkdtemp(join(tmpdir(), "paperclip-auth-test-")); roots.push(root);
  const config = join(root, "config.json"); const plist = join(root, "service.plist"); const privateDir = join(root, "private");
  await writeFile(config, JSON.stringify({ database: { mode: "embedded-postgres", embeddedPostgresPort: 54329 }, server: { deploymentMode: "local_trusted", port: 3100 }, auth: {} }));
  execFileSync("python3", ["-c", "import plistlib,sys;plistlib.dump({'Label':'ing.paperclip.paperclipai','ProgramArguments':['/fixture/paperclipai','run','--instance','default'],'EnvironmentVariables':{'PAPERCLIP_HOME':'/private/existing-data'}},open(sys.argv[1],'wb'))", plist]);
  const beforeConfig = await readFile(config, "utf8"), beforePlist = await readFile(plist, "utf8");
  const script = resolve("scripts/paperclip-bridge/auth-rollout.py");
  const output = execFileSync("python3", [script, "stage", "--config", config, "--plist", plist, "--private-dir", privateDir], { encoding: "utf8" });
  expect(JSON.parse(output)).toEqual({ staged: true, privateDirectory: await realpath(privateDir), port: 3100, dashboardOrigin: "http://127.0.0.1:33100" });
  expect(await readFile(config, "utf8")).toBe(beforeConfig); expect(await readFile(plist, "utf8")).toBe(beforePlist);
  const candidate = JSON.parse(await readFile(join(privateDir, "config.candidate.json"), "utf8"));
  expect(candidate.database).toEqual({ mode: "embedded-postgres", embeddedPostgresPort: 54329 });
  expect(candidate.server).toMatchObject({ deploymentMode: "authenticated", exposure: "private", bind: "loopback", host: "127.0.0.1", port: 3100 });
  expect(candidate.auth).toEqual({ baseUrlMode: "explicit", publicBaseUrl: "http://127.0.0.1:33100", disableSignUp: false });
  const candidatePlist = await readFile(join(privateDir, "service.candidate.plist"), "utf8");
  const secret = /<key>BETTER_AUTH_SECRET<\/key>\s*<string>([^<]+)/.exec(candidatePlist)![1]!;
  expect(secret).toHaveLength(64); expect(output).not.toContain(secret);
  expect(candidatePlist).toContain("<key>BETTER_AUTH_TRUSTED_ORIGINS</key>\n\t\t<string>http://127.0.0.1:33100</string>");
  const refusal = spawnSync("python3", [script, "apply", "--private-dir", privateDir], { encoding: "utf8" });
  expect(refusal.status).toBe(1); expect(refusal.stderr).not.toContain(secret);
  expect(await readFile(config, "utf8")).toBe(beforeConfig);
});

it.each(["bootstrap", "claim-migrated", "resume-signin", "resume-rejected"])("exercises native %s owner flow with HTTP/service fixtures and refuses duplicate signup", async scenario => {
  const root = await mkdtemp(join(tmpdir(), "paperclip-owner-test-")); roots.push(root);
  const output = execFileSync("python3", ["-c", `
import email.message, json, pathlib, plistlib, runpy, sys, types
script, root, scenario = sys.argv[1:]
command = 'resume-claim-migrated' if scenario.startswith('resume-') else scenario
migrated = command != 'bootstrap'
root = pathlib.Path(root).resolve(); private = root / 'private'; private.mkdir(mode=0o700)
config = root / 'config.json'; service = root / 'service.plist'; log = root / 'service.log'
config.write_text(json.dumps({'server':{'deploymentMode':'authenticated'},'auth':{'disableSignUp':False}}))
plistlib.dump({'Label':'ing.paperclip.paperclipai','ProgramArguments':['/fixture/paperclipai','run','--instance','default'],
 'EnvironmentVariables':{},'StandardOutPath':str(log)},service.open('wb'))
token, code, bootstrap_token = 'a'*48, 'b'*24, 'pcp_bootstrap_'+'c'*48
log.write_text('BOARD CLAIM REQUIRED http://127.0.0.1:3100/board-claim/'+token+'?code='+code)
(private/'manifest.json').write_text(json.dumps({'config':str(config),'plist':str(service),'label':'ing.paperclip.paperclipai','publicUrl':'http://127.0.0.1:33100'}))
(private/'applied').write_text('applied')
# Preserve the actual observed harmless bootstrap refusal journal during migration.
if migrated: (private/'owner-started').write_text('no invite; no signup')
if scenario.startswith('resume-'):
 (private/'claim-migrated-started').write_text('prior request inspected')
 (private/'owner-credentials.private.json').write_text(json.dumps({'name':'existing operator','email':'existing@localhost.invalid','password':'same-private-password'}))
module = runpy.run_path(script); g = module['main'].__globals__; calls = []; reloads = []
def http(path, **kwargs):
 calls.append(path)
 headers = email.message.Message()
 if path.startswith('/api/board-claim/') and '?' in path:
  assert migrated
  return 200, {'status':'available','requiresSignIn':True}, headers
 if path in ['/api/auth/sign-up/email','/api/auth/sign-in/email']:
  assert kwargs['origin'] == 'http://127.0.0.1:33100'
  assert path == ('/api/auth/sign-in/email' if scenario == 'resume-signin' else '/api/auth/sign-up/email')
  assert kwargs['body']['email'].endswith('@localhost.invalid')
  if scenario.startswith('resume-'): assert kwargs['body']['email'] == 'existing@localhost.invalid' and kwargs['body']['password'] == 'same-private-password'
  headers.add_header('Set-Cookie','better-auth.session_token=SYNTHETIC-COOKIE; HttpOnly; Path=/')
  return 200, {}, headers
 assert kwargs['origin'] == 'http://127.0.0.1:3100'
 assert kwargs['cookie'] == 'better-auth.session_token=SYNTHETIC-COOKIE'
 if path == '/api/board-claim/'+token+'/claim':
  assert kwargs['body'] == {'code':code}; return 200, {'claimed':True}, headers
 if path == '/api/invites/'+bootstrap_token+'/accept':
  assert kwargs['body'] == {'requestType':'human'}; return 202, {'bootstrapAccepted':True}, headers
 assert path == '/api/board-api-keys'
 return 201, {'token':'SYNTHETIC-BOARD-SECRET'}, headers
def cli(args, **kwargs):
 assert command == 'bootstrap' and '--force' not in args and '--config' in args
 return types.SimpleNamespace(stdout=('Invite URL: http://127.0.0.1:33100/invite/'+bootstrap_token).encode(),stderr=b'')
g['http'] = http; g['reload_service'] = lambda *args: reloads.append(args)
g['subprocess'] = types.SimpleNamespace(run=cli)
sys.argv = [script,command,'--private-dir',str(private),'--apply','--drained']
if scenario == 'resume-rejected': sys.argv.append('--signup-rejected-before-create')
module['main']()
assert json.loads(config.read_text())['auth']['disableSignUp'] is True
assert plistlib.load(service.open('rb'))['EnvironmentVariables']['PAPERCLIP_AUTH_DISABLE_SIGN_UP'] == 'true'
assert json.loads((private/'board-key.private.json').read_text())['token'] == 'SYNTHETIC-BOARD-SECRET'
assert len(reloads) == 1 and calls.count('/api/auth/sign-up/email') == (0 if scenario == 'resume-signin' else 1)
try: module['main'](); raise AssertionError('duplicate owner attempt accepted')
except FileExistsError: assert not scenario.startswith('resume-')
except ValueError as error: assert scenario.startswith('resume-') and 'later owner step' in str(error)
assert calls.count('/api/auth/sign-up/email') == (0 if scenario == 'resume-signin' else 1)
print(json.dumps({'nativeFlowVerified':True,'requestCount':len(calls)}))
`, resolve("scripts/paperclip-bridge/auth-rollout.py"), root, scenario], { encoding: "utf8" });
  const lines = output.trim().split("\n").map(line => JSON.parse(line));
  expect(lines[0]).toMatchObject({ ownerCreated: true, signupDisabled: true, workersMustRemainPaused: true });
  expect(lines[1]).toEqual({ nativeFlowVerified: true, requestCount: scenario === "bootstrap" ? 3 : 4 });
  expect(output).not.toContain("SYNTHETIC-BOARD-SECRET"); expect(output).not.toContain("SYNTHETIC-COOKIE");
});
