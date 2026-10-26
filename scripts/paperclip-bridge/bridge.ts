import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdir, open, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { gitSubprocessEnv } from "../../src/git-env.js";
import { parseArtifact } from "../../src/pm/parse.js";
import { roadmapIdFromBranch } from "../../src/pm/id.js";
import { acceptancePath } from "../../src/review/prompt.js";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const text = z.string().trim().min(1);
const uuid = z.string().uuid();
const sha = z.string().regex(/^[a-f0-9]{40}$/);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const sourceRef = z.object({ path: text, sha256: digest, url: z.string().url() }).strict();
const Plan = z.object({
  version: z.literal(1), operationId: z.string().regex(/^morpheus-[a-f0-9]{64}$/),
  repository: z.string().url(), roadmapId: text, job: z.string().regex(/^[a-z][a-z0-9-]{0,31}$/),
  branch: text, sourceSha: sha, roadmap: sourceRef, acceptance: sourceRef,
  task: sourceRef.extend({ instructions: text }), title: text,
  target: z.object({ baseUrl: z.string().url(), companyId: uuid, projectId: uuid, agentId: uuid }).strict(),
}).strict();
const Verification = z.object({
  issueId: uuid, sourceSha: sha, outcome: z.enum(["result", "blocked"]), summary: text,
  needs: text.optional(), evidence: z.array(z.object({ path: text, sha256: digest }).strict()).min(1),
}).strict().refine(v => v.outcome !== "blocked" || Boolean(v.needs), "blocked requires needs");
const RecordSchema = z.object({
  plan: Plan, issueId: uuid.optional(),
  verification: z.object({ receipt: Verification, observedStatus: text }).strict().optional(),
}).strict();
export type JobRecord = z.infer<typeof RecordSchema>;
type JobPlan = JobRecord["plan"];
const Journal = z.object({
  planHash: digest, state: z.enum(["posting", "unknown", "linked"]), issueId: uuid.optional(),
}).strict();
type Transport = typeof fetch;

function git(repo: string, args: string[]): string {
  return execFileSync("git", args, { cwd: repo, env: gitSubprocessEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
function repoUrl(value: string): string {
  const normalized = value.replace(/^git@github.com:/, "https://github.com/").replace(/\.git$/, "");
  const url = new URL(normalized);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("repository must be an HTTPS repository URL without credentials");
  return url.href.replace(/\/$/, "");
}
function apiUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" ||
      !(url.protocol === "https:" || (url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)))) {
    throw new Error("API must use HTTPS or loopback HTTP, without credentials or a path");
  }
  return url.origin;
}
async function contained(repo: string, path: string): Promise<string> {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) throw new Error("expected a repository-relative path");
  const abs = await realpath(resolve(repo, path));
  const rel = relative(await realpath(repo), abs);
  if (rel.startsWith("../") || isAbsolute(rel)) throw new Error("path escapes repository");
  return abs;
}
async function source(repo: string, sourceSha: string, path: string, repository: string, checkCurrent = true) {
  if (isAbsolute(path) || path.includes("\\") || path.split("/").includes("..")) throw new Error("invalid source path");
  const normalized = path;
  const mode = git(repo, ["ls-tree", sourceSha, "--", normalized]).split(" ")[0];
  if (!["100644", "100755"].includes(mode!)) throw new Error("source must be a regular committed file");
  const committed = execFileSync("git", ["show", `${sourceSha}:${normalized}`], { cwd: repo, env: gitSubprocessEnv(), stdio: ["ignore", "pipe", "pipe"] });
  if (checkCurrent && !(await readFile(await contained(repo, path))).equals(committed)) throw new Error(`uncommitted source: ${normalized}`);
  return { path: normalized, sha256: hash(committed), url: `${repository}/blob/${sourceSha}/${normalized.split("/").map(encodeURIComponent).join("/")}` };
}
export function recordPath(plan: Pick<JobPlan, "roadmapId" | "job">): string {
  if (!/^[A-Z]{2,4}-[0-9.-]+$/.test(plan.roadmapId) || !/^[a-z][a-z0-9-]{0,31}$/.test(plan.job)) throw new Error("invalid record identity");
  return `.agent/paperclip/${plan.roadmapId}/${plan.job}.json`;
}
export async function prepare(repo: string, input: {
  roadmapId: string; job: string; acceptance?: string; task: string; title: string;
  baseUrl: string; companyId: string; projectId: string; agentId: string;
}): Promise<JobRecord> {
  const repository = repoUrl(git(repo, ["remote", "get-url", "origin"]));
  const branch = git(repo, ["branch", "--show-current"]);
  if (roadmapIdFromBranch(branch) !== input.roadmapId) throw new Error("use the roadmap's Morpheus claimed branch");
  const parsed = await parseArtifact(join(repo, "hq/product"), "roadmap");
  const candidates = parsed.items.filter(item => item.data.id === input.roadmapId);
  if (parsed.issues.length || candidates.length !== 1) throw new Error("roadmap must parse without issues and resolve exactly once");
  const item = candidates[0]!;
  if (!["in-progress", "review"].includes(item.data.status)) throw new Error("roadmap is not active claimed work");
  const sourceSha = git(repo, ["rev-parse", "HEAD"]);
  const acceptance = input.acceptance ?? (item.data.acceptance ? acceptancePath(item.data.acceptance) : undefined);
  if (!acceptance) throw new Error("an explicit acceptance reference is required");
  const plan = Plan.parse({
    version: 1, operationId: `morpheus-${hash(`${repository}\n${input.roadmapId}\n${input.job}`)}`,
    repository, roadmapId: input.roadmapId, job: input.job, branch, sourceSha, title: input.title,
    roadmap: await source(repo, sourceSha, relative(repo, item.path), repository),
    acceptance: await source(repo, sourceSha, acceptance, repository),
    task: { ...await source(repo, sourceSha, input.task, repository), instructions: (await readFile(await contained(repo, input.task), "utf8")).trim() },
    target: { baseUrl: apiUrl(input.baseUrl), companyId: input.companyId, projectId: input.projectId, agentId: input.agentId },
  });
  recordPath(plan);
  return { plan };
}
export function issueBody(plan: JobPlan) {
  const linkage = { operationId: plan.operationId, repository: plan.repository, roadmapId: plan.roadmapId,
    job: plan.job, branch: plan.branch, sourceSha: plan.sourceSha, acceptance: plan.acceptance, planHash: hash(JSON.stringify(plan)) };
  return {
    title: `${plan.roadmapId} / ${plan.job}: ${plan.title}`, status: "todo", priority: "medium",
    projectId: plan.target.projectId, assigneeAgentId: plan.target.agentId,
    idempotencyKey: plan.operationId,
    description: `Morpheus execution job. Delivery requires the repository's claim, PR, independent review, CI and merge.\n\n` +
      `Roadmap: ${plan.roadmap.url}\nAcceptance: ${plan.acceptance.url}\nSource: ${plan.repository}/tree/${plan.sourceSha}\n` +
      `Branch: ${plan.branch}\n\n${plan.task.instructions}\n\n<!-- morpheus-link ${JSON.stringify(linkage)} -->`,
  };
}
async function request(transport: Transport, base: string, path: string, token?: string, body?: unknown) {
  let response: Response;
  try {
    response = await transport(`${base}/api${path}`, {
      method: body === undefined ? "GET" : "POST", redirect: "error", signal: AbortSignal.timeout(10_000),
      headers: { accept: "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  } catch { throw new Error("Paperclip transport failed; outcome may be unknown"); }
  return response;
}
async function json(response: Response): Promise<any> {
  if (!response.ok) throw new Error(`Paperclip HTTP ${response.status}`);
  try { return await response.json(); } catch { throw new Error("Paperclip returned invalid JSON"); }
}
export async function assertIsolation(plan: JobPlan, token: string, transport: Transport = fetch) {
  if (!token || /[\r\n]/.test(token)) throw new Error("missing or invalid private token");
  const base = apiUrl(plan.target.baseUrl);
  const anonymous = await request(transport, base, `/companies/${plan.target.companyId}/agents`);
  if (![401, 403].includes(anonymous.status)) throw new Error("anonymous API access is not denied; keep workers paused");
  const me = await json(await request(transport, base, "/agents/me", token));
  const scope = me.keyScope;
  if (me.companyId !== plan.target.companyId || scope?.kind !== "task_bridge" ||
      scope.projectId !== plan.target.projectId || (scope.projectIds?.length ?? 0) !== 0 ||
      scope.parentIssueId || (scope.parentIssueIds?.length ?? 0) !== 0 ||
      JSON.stringify(scope.allowedAssigneeAgentIds) !== JSON.stringify([plan.target.agentId])) {
    throw new Error("requires a task_bridge key for exactly this project and assignee");
  }
}
export async function readIssue(plan: JobPlan, issueId: string, token: string, transport: Transport = fetch) {
  uuid.parse(issueId);
  const issue = await json(await request(transport, plan.target.baseUrl, `/issues/${issueId}`, token));
  const expected = issueBody(plan);
  if (issue.id !== issueId || issue.companyId !== plan.target.companyId || issue.projectId !== expected.projectId ||
      issue.assigneeAgentId !== expected.assigneeAgentId || issue.title !== expected.title || issue.description !== expected.description ||
      issue.parentId != null || !["backlog", "todo", "in_progress", "in_review", "blocked", "done", "cancelled"].includes(issue.status)) {
    throw new Error("issue readback does not match the exact immutable job linkage");
  }
  return issue as { id: string; status: string };
}
async function replace(path: string, value: unknown) {
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { flag: "wx", mode: 0o600, flush: true });
  try {
    await rename(tmp, path);
    const directory = await open(dirname(path), "r");
    try { await directory.sync(); } finally { await directory.close(); }
  } finally { await rm(tmp, { force: true }); }
}
async function validateRecord(repo: string, record: JobRecord) {
  const p = record.plan;
  if (repoUrl(git(repo, ["remote", "get-url", "origin"])) !== p.repository || git(repo, ["branch", "--show-current"]) !== p.branch || roadmapIdFromBranch(p.branch) !== p.roadmapId) throw new Error("repository or claimed branch changed");
  git(repo, ["merge-base", "--is-ancestor", p.sourceSha, "HEAD"]);
  if (p.operationId !== `morpheus-${hash(`${p.repository}\n${p.roadmapId}\n${p.job}`)}`) throw new Error("operation identity mismatch");
  apiUrl(p.target.baseUrl);
  for (const ref of [p.roadmap, p.acceptance, p.task]) {
    if (JSON.stringify(await source(repo, p.sourceSha, ref.path, p.repository, false)) !== JSON.stringify({ path: ref.path, sha256: ref.sha256, url: ref.url })) throw new Error("source reference mismatch");
  }
  if (git(repo, ["show", `${p.sourceSha}:${p.task.path}`]) !== p.task.instructions) throw new Error("task instructions mismatch");
}
export async function savePrepared(repo: string, record: JobRecord) {
  RecordSchema.parse(record);
  const path = join(repo, recordPath(record.plan));
  await mkdir(dirname(path), { recursive: true });
  const directory = relative(await realpath(repo), await realpath(dirname(path)));
  if (directory === ".." || directory.startsWith("../") || isAbsolute(directory)) throw new Error("record directory escapes repository");
  try {
    await writeFile(join(repo, ".agent/paperclip/README.md"), "# Paperclip execution links\n\nOne directory per roadmap parent, one immutable job intent per JSON file. Commit links and independently verified evidence through the normal task PR; live status stays in Paperclip. Never store credentials here.\n\n[Integration contract](https://github.com/cpheinrich/morpheus/blob/main/docs/paperclip-integration.md).\n", { flag: "wx" });
  } catch (err) { if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err; }
  await writeFile(path, `${JSON.stringify(record, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  return path;
}
export async function operate(repo: string, path: string, input: {
  command: "submit" | "link" | "status" | "reconcile"; token: string; issueId?: string; evidence?: string;
}, transport: Transport = fetch) {
  const abs = await contained(repo, path);
  const original = await readFile(abs, "utf8");
  const record = RecordSchema.parse(JSON.parse(original));
  if (relative(await realpath(repo), abs) !== recordPath(record.plan)) throw new Error("record path does not match job identity");
  await validateRecord(repo, record);
  const common = resolve(repo, git(repo, ["rev-parse", "--git-common-dir"]));
  const journalDir = join(common, "morpheus-paperclip");
  await mkdir(journalDir, { recursive: true, mode: 0o700 });
  const journalPath = join(journalDir, `${record.plan.operationId}.json`);
  const lock = `${journalPath}.lock`;
  try { await mkdir(lock); } catch { throw new Error("job is locked; inspect the previous operator before removing a stale lock"); }
  try {
    await assertIsolation(record.plan, input.token, transport);
    let journal: z.infer<typeof Journal> | undefined;
    try { journal = Journal.parse(JSON.parse(await readFile(journalPath, "utf8"))); }
    catch (err) { if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err; }
    const planHash = hash(JSON.stringify(record.plan));
    if (journal && journal.planHash !== planHash) throw new Error("operation already belongs to different immutable input");
    if (record.issueId && journal?.issueId && record.issueId !== journal.issueId) throw new Error("journal and Git issue linkage conflict");
    let issueId = record.issueId ?? journal?.issueId;
    if (input.command === "submit" && !issueId) {
      if (journal) throw new Error("previous POST outcome is unknown; observe upstream and link its exact issue ID, never repost");
      // The immutable intent must survive losing this worktree before an external mutation.
      const committed = execFileSync("git", ["show", `HEAD:${path}`], { cwd: repo, env: gitSubprocessEnv(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
      if (committed !== original) throw new Error("commit the prepared job before submission");
      journal = { planHash, state: "posting" };
      await replace(journalPath, journal);
      try {
        const created = await json(await request(transport, record.plan.target.baseUrl, `/companies/${record.plan.target.companyId}/issues`, input.token, issueBody(record.plan)));
        issueId = uuid.parse(created.id);
        journal = { ...journal, issueId };
        await replace(journalPath, journal);
      } catch {
        await replace(journalPath, { ...journal, state: "unknown" });
        throw new Error("POST outcome unknown; inspect upstream and link the exact issue ID; no automatic retry");
      }
    }
    if (input.command === "link") {
      const candidate = uuid.parse(input.issueId);
      if (issueId && candidate !== issueId) throw new Error("cannot replace an existing issue linkage");
      issueId = candidate;
    }
    if (!issueId) throw new Error("no issue linkage; submit or link an observed exact issue ID");
    const issue = await readIssue(record.plan, issueId, input.token, transport);
    if (input.command === "status") return { operationId: record.plan.operationId, issueId, status: issue.status, delivery: "Morpheus PR/review/CI/merge required" };
    record.issueId = issueId;
    if (input.command === "reconcile") {
      if (!input.evidence) throw new Error("explicit independently verified evidence receipt required");
      const receipt = Verification.parse(JSON.parse(await readFile(await contained(repo, input.evidence), "utf8")));
      await source(repo, git(repo, ["rev-parse", "HEAD"]), input.evidence, record.plan.repository);
      if (receipt.issueId !== issueId || receipt.sourceSha !== record.plan.sourceSha ||
          issue.status !== (receipt.outcome === "blocked" ? "blocked" : "done")) throw new Error("receipt identity or upstream status mismatch");
      for (const ref of receipt.evidence) {
        const committed = await source(repo, git(repo, ["rev-parse", "HEAD"]), ref.path, record.plan.repository);
        if (committed.sha256 !== ref.sha256) throw new Error("evidence digest mismatch");
      }
      const verification = { receipt, observedStatus: issue.status };
      if (record.verification && JSON.stringify(record.verification) !== JSON.stringify(verification)) throw new Error("verification is immutable; create a new job for new evidence");
      record.verification = verification;
    }
    await replace(journalPath, { planHash, state: "linked", issueId });
    if (await readFile(abs, "utf8") !== original) throw new Error("record changed during operation; preserve the journal and reconcile");
    await replace(abs, record);
    return record;
  } finally { await rm(lock, { recursive: true }); }
}
