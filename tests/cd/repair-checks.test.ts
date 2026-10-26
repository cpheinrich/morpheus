import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyRepairChecks } from "../../src/cd/repair-checks.js";
import { GitHubStore, type GitHubApi } from "../../src/cd/store.js";
import { verifyRepair } from "../../src/cd/worker.js";
import { git } from "../../src/cd/source.js";
import { checkLocalReview } from "../../src/review/local.js";
import { config } from "./fixtures.js";

vi.mock("../../src/cd/source.js", () => ({ git: vi.fn(), loadSources: vi.fn() }));
vi.mock("../../src/review/local.js", () => ({ checkLocalReview: vi.fn(() => []) }));
beforeEach(() => { vi.clearAllMocks(); vi.mocked(checkLocalReview).mockReturnValue([]); });

const retained = JSON.parse(readFileSync(new URL("./repair-checks-provider.json", import.meta.url), "utf8"));
type Fixture = typeof retained;
const fixture = (): Fixture => structuredClone(retained);
const oldCheck = (f: Fixture) => f.checks.find((item: { conclusion: string }) => item.conclusion === "cancelled");
const oldJob = (f: Fixture) => f.jobs.find((item: { id: number }) => item.id === oldCheck(f).id);
const oldRun = (f: Fixture) => f.runs.find((item: { id: number }) => item.id === oldJob(f).run_id);
const successor = (f: Fixture) => f.runs.find((item: { workflow_id: number; conclusion: string }) => item.workflow_id === oldRun(f).workflow_id && item.conclusion === "success");
const successorJob = (f: Fixture) => f.jobs.find((item: { run_id: number }) => item.run_id === successor(f).id);
class API implements GitHubApi {
  calls: string[] = [];
  change?: (path: string, value: unknown, count: number) => unknown;
  constructor(readonly data = fixture()) {}
  async request<T>(method: string, path: string): Promise<T> {
    expect(method).toBe("GET"); this.calls.push(path);
    const url = new URL(`https://api.github.com/${path}`), p = url.pathname;
    const collection = (key: string, rows: unknown[]) => {
      const page = Number(url.searchParams.get("page")); expect(url.searchParams.get("per_page")).toBe("100");
      return { total_count: rows.length, [key]: rows.slice((page - 1) * 100, page * 100) };
    };
    let value: unknown;
    if (p.endsWith("/check-runs")) { expect(url.searchParams.get("filter")).toBe("all"); value = collection("check_runs", this.data.checks); }
    else if (p.endsWith("/actions/runs")) { expect(url.searchParams.get("head_sha")).toBe(this.data.subject.sha); value = collection("workflow_runs", this.data.runs); }
    else if (/\/attempts\/\d+\/jobs$/.test(p)) {
      const ids = p.match(/\/runs\/(\d+)\/attempts\/(\d+)\/jobs$/)!;
      value = collection("jobs", this.data.jobs.filter((item: { run_id: number; run_attempt: number }) => item.run_id === Number(ids[1]) && item.run_attempt === Number(ids[2])));
    } else if (/\/actions\/jobs\/\d+$/.test(p)) value = this.data.jobs.find((item: { id: number }) => item.id === Number(p.split("/").at(-1)));
    else if (/\/actions\/runs\/\d+$/.test(p)) value = this.data.runs.find((item: { id: number }) => item.id === Number(p.split("/").at(-1)));
    else throw new Error(`Unexpected API route ${path}`);
    return structuredClone(this.change ? this.change(path, value, this.calls.filter(item => item === path).length) : value) as T;
  }
}
const verify = (api = new API()) => verifyRepairChecks(api, api.data.baseRepository.full_name, api.data.subject, api.data.baseRepository);

describe("repair SourceCI cancellation lineage", () => {
  it("discharges only the three anonymized provider-shaped cancellations and records exact provenance", async () => {
    const api = new API();
    expect(api.data.checks.every((c: { conclusion: string }) => ["success", "skipped", "neutral"].includes(c.conclusion))).toBe(false);
    const proof = await verify(api);
    expect(proof.checkIds).toEqual(api.data.checks.map((c: { id: number }) => c.id).sort((a: number, b: number) => a - b));
    expect(proof.superseded.map(row => [row.checkId, row.successorCheckId])).toEqual([[10033, 10039], [10034, 10040], [10036, 10041]]);
    expect(proof.superseded.map(row => [row.oldRun.run_number, row.successorRun.run_number])).toEqual([[10004, 10005], [10004, 10005], [10002, 10003]]);
    expect(proof.superseded[0]!.successorRun.referenced_workflows?.[0]?.sha).toBe("0000000000000000000000000000000000000005");
    expect(api.calls.filter(p => p.includes("check-runs?")).length).toBe(2);
    expect(api.calls.filter(p => p.includes("actions/runs?head_sha=")).length).toBe(2);
    expect(api.data.runs.every((r: { pull_requests?: unknown[] }) => Array.isArray(r.pull_requests) && r.pull_requests.length === 0)).toBe(true);
  });
  it("accepts authoritative floated-reference advancement but rejects a contradictory immutable pin", async () => {
    const api = new API(), floated = api.data.runs.find((r: { path: string; conclusion: string }) => r.path === ".github/workflows/web-ci.yml" && r.conclusion === "success");
    expect(floated.referenced_workflows[0].path).toMatch(/@main$/); floated.referenced_workflows[0].sha = "f".repeat(40);
    expect((await verify(api)).superseded).toHaveLength(3);
    floated.referenced_workflows[0].path = `owner/control/.github/workflows/test.yml@${"a".repeat(40)}`;
    await expect(verify(api)).rejects.toThrow("immutable reference");
  });
  it.each(["failure", "timed_out", "action_required", "stale", "unknown", null])("keeps every genuine/unknown check blocking: %s", async conclusion => {
    const api = new API(); api.data.checks[0].conclusion = conclusion;
    await expect(verify(api)).rejects.toThrow("failed/incomplete"); expect(api.calls).toHaveLength(1);
  });
  it.each(["queued", "in_progress", "waiting", "pending"]) ("blocks a live check even if its conclusion is stale-success: %s", async status => {
    const api = new API(); api.data.checks[0].status = status;
    await expect(verify(api)).rejects.toThrow("failed/incomplete");
  });
  it("does not collapse external checks by name", async () => {
    const api = new API(); const external = api.data.checks[0]; external.conclusion = "cancelled"; external.name = oldCheck(api.data).name;
    await expect(verify(api)).rejects.toThrow("not GitHub Actions");
  });
  it.each([
    ["head", (f: Fixture) => { oldCheck(f).head_sha = "0".repeat(40); }],
    ["check URL", (f: Fixture) => { oldCheck(f).details_url = oldCheck(f).details_url.replace("github.com", "attacker.example"); }],
    ["job association", (f: Fixture) => { oldJob(f).check_run_url += "0"; }],
    ["steps", (f: Fixture) => { oldJob(f).steps.push({ name: "real execution" }); }],
    ["missing steps", (f: Fixture) => { delete oldJob(f).steps; }],
    ["runner ID", (f: Fixture) => { oldJob(f).runner_id = 1; }],
    ["runner name", (f: Fixture) => { oldJob(f).runner_name = "assigned"; }],
    ["PR branch", (f: Fixture) => { f.subject.ref = "other"; }],
    ["PR head repository", (f: Fixture) => { f.subject.repo.id++; }],
    ["base repository", (f: Fixture) => { f.baseRepository.id++; }],
    ["event", (f: Fixture) => { oldRun(f).event = "push"; }],
    ["workflow", (f: Fixture) => { successor(f).workflow_id++; }],
    ["workflow path", (f: Fixture) => { successor(f).path = ".github/workflows/other.yml"; }],
    ["successor app", (f: Fixture) => { f.checks.find((c: { id: number }) => c.id === successorJob(f).id).app.id++; }],
    ["job name", (f: Fixture) => { successorJob(f).name += " different matrix"; }],
    ["job check identity", (f: Fixture) => { successorJob(f).check_run_url += "0"; }],
    ["same run number", (f: Fixture) => { successor(f).run_number = oldRun(f).run_number; }],
    ["older success", (f: Fixture) => { successor(f).run_number = oldRun(f).run_number - 1; }],
  ])("refuses mismatched/unknown lineage: %s", async (_name, mutate) => {
    const api = new API(); (mutate as (f: Fixture) => void)(api.data); await expect(verify(api)).rejects.toThrow();
  });
  it.each(["skipped", "neutral", "failure", null])("requires a successful replacement workflow, not %s", async conclusion => {
    const api = new API(); successor(api.data).conclusion = conclusion; await expect(verify(api)).rejects.toThrow("latest workflow has not succeeded");
  });
  it.each(["skipped", "neutral", "failure", null])("requires an executed successful replacement job, not %s", async conclusion => {
    const api = new API(); successorJob(api.data).conclusion = conclusion; await expect(verify(api)).rejects.toThrow("successor job");
  });
  it.each(["skipped", "neutral"])("requires a successful replacement check, not %s", async conclusion => {
    const api = new API(); api.data.checks.find((c: { id: number }) => c.id === successorJob(api.data).id).conclusion = conclusion;
    await expect(verify(api)).rejects.toThrow("successor check has not succeeded");
  });
  it("sees a newer queued run before that run has created any check", async () => {
    const api = new API(), latest = structuredClone(successor(api.data)); latest.id = Math.max(...api.data.runs.map((r: { id: number }) => r.id)) + 1; latest.run_number++; latest.status = "queued"; latest.conclusion = null;
    api.data.runs.push(latest); await expect(verify(api)).rejects.toThrow("latest workflow has not succeeded");
  });
  it("does not support a same-run newer attempt as an implicit replacement", async () => {
    const api = new API(); const old = oldRun(api.data), next = successor(api.data);
    api.data.runs = api.data.runs.filter((r: { id: number }) => r.id !== next.id); old.run_attempt++; old.conclusion = "success";
    await expect(verify(api)).rejects.toThrow("execution or unknown job evidence");
  });
  it.each(["job", "check"])("refuses ambiguous matrix/name identity in the %s inventory", async kind => {
    const api = new API();
    if (kind === "job") { const clone = structuredClone(successorJob(api.data)); clone.id = Math.max(...api.data.jobs.map((j: { id: number }) => j.id)) + 1; api.data.jobs.push(clone); }
    else { const clone = structuredClone(oldCheck(api.data)); clone.id = Math.max(...api.data.checks.map((c: { id: number }) => c.id)) + 1; api.data.checks.push(clone); }
    await expect(verify(api)).rejects.toThrow("ambiguous");
  });
  it("paginates a failure beyond the first hundred checks", async () => {
    const api = new API(); const safe = api.data.checks[0]; api.data.checks = Array.from({ length: 101 }, (_, i) => ({ ...structuredClone(safe), id: i + 1, conclusion: i === 100 ? "failure" : "success" }));
    await expect(verify(api)).rejects.toThrow("failed/incomplete"); expect(api.calls.at(-1)).toContain("page=2");
  });
  it("refuses count changes across pages and the workflow search truncation boundary", async () => {
    const api = new API(), sample = api.data.checks[0];
    api.data.checks = Array.from({ length: 101 }, (_, i) => ({ ...structuredClone(sample), id: i + 1 }));
    api.change = (path, value) => {
      if (path.includes("check-runs?") && path.endsWith("page=2")) (value as { total_count: number }).total_count++;
      return value;
    }; await expect(verify(api)).rejects.toThrow("changed during pagination");
    const capped = new API(); capped.change = (path, value) => {
      if (path.includes("actions/runs?")) (value as { total_count: number }).total_count = 1000;
      return value;
    }; await expect(verify(capped)).rejects.toThrow("over-limit total");
  });
  it("paginates jobs and same-head runs without relying on response ordering", async () => {
    const api = new API(); const sample = successor(api.data), work = successorJob(api.data);
    for (let i = 0; i < 101; i++) {
      api.data.runs.push({ ...structuredClone(sample), id: 500 + i, workflow_id: 600 + i, path: `.github/workflows/unrelated-${i}.yml` });
      api.data.jobs.push({ ...structuredClone(work), id: 700 + i, name: `unrelated-${i}` });
    }
    api.data.runs.reverse(); api.data.jobs.reverse();
    expect((await verify(api)).superseded).toHaveLength(3);
    expect(api.calls.some(p => p.includes("actions/runs?head_sha=") && p.endsWith("page=2"))).toBe(true);
    expect(api.calls.some(p => p.includes("/jobs?") && p.endsWith("page=2"))).toBe(true);
  });
  it.each(["missing", "duplicate", "short", "count drift", "over-limit", "API failure"])("does not call incomplete inventory healthy: %s", async condition => {
    const api = new API(); api.change = (path, value, count) => {
      if (!path.includes("check-runs?")) return value;
      const data = value as { total_count: number; check_runs: unknown[] };
      if (condition === "missing") return {};
      if (condition === "duplicate") data.check_runs[1] = data.check_runs[0];
      if (condition === "short") data.total_count++;
      if (condition === "count drift" && count === 2) data.total_count++;
      if (condition === "over-limit") data.total_count = 10_001;
      if (condition === "API failure") throw new Error("HTTP503 read unavailable");
      return data;
    }; await expect(verify(api)).rejects.toThrow();
  });
  it("retains a changed final view rather than looping for a favorable snapshot", async () => {
    const api = new API(); api.change = (path, value, count) => {
      if (path.includes("check-runs?") && count === 2) (value as { check_runs: { name: string }[] }).check_runs[0]!.name += " changed";
      return value;
    }; await expect(verify(api)).rejects.toThrow("view changed");
    expect(api.calls.filter(p => p.includes("check-runs?")).length).toBe(2);
  });
  it("keeps the ordinary successful/neutral/skipped gate without Actions discovery", async () => {
    const api = new API(); api.data.checks = api.data.checks.filter((c: { conclusion: string }) => c.conclusion !== "cancelled");
    expect((await verify(api)).superseded).toEqual([]); expect(api.calls).toHaveLength(1);
    api.data.checks = []; await expect(verify(api)).rejects.toThrow("failed/incomplete");
  });
});

function repair() {
  const api = new API(), original = api.request.bind(api), cfg = config(); cfg.repository = api.data.baseRepository.full_name;
  const pull = { merged: true, merge_commit_sha: "d".repeat(40), head: api.data.subject, base: { ref: cfg.mainBranch, sha: "c".repeat(40), repo: api.data.baseRepository }, body: "review-record: .agent/worklog/repair.md", labels: [{ name: "agent-reviewed" }] };
  api.request = async <T>(method: string, path: string) => path.endsWith("/pulls/42") ? structuredClone(pull) as T : original<T>(method, path);
  const result = { outcome: "repaired" as const, summary: "Test repair", evidence: [] as string[], pullRequest: `https://github.com/${cfg.repository}/pull/42`, reviewHead: api.data.subject.sha, sourceSha: pull.merge_commit_sha };
  return { api, cfg, pull, result, verify: () => verifyRepair(cfg, new GitHubStore(api, cfg), "/hermetic-source", result) };
}
describe("exact repair provenance remains mandatory", () => {
  it("returns only the actual merged source after the independent-review gate, retaining supersession evidence", async () => {
    const f = repair(); expect(await f.verify()).toBe("d".repeat(40));
    expect(checkLocalReview).toHaveBeenCalledWith({ root: expect.any(String), body: f.pull.body, labels: ["agent-reviewed"], head: f.result.reviewHead, base: f.pull.base.sha });
    expect(git).toHaveBeenCalledWith("/hermetic-source", ["fetch", "origin", f.result.reviewHead, "d".repeat(40)]);
    const proof = JSON.parse(f.result.evidence[0]!.split("Morpheus verified cancellation supersession: ")[1]!);
    expect(proof.superseded.map((r: { checkId: number }) => r.checkId)).toEqual([10033, 10034, 10036]);
  });
  it.each(["not merged", "wrong head", "wrong base", "foreign PR"])("refuses before Git/local review: %s", async condition => {
    const f = repair();
    if (condition === "not merged") f.pull.merged = false;
    if (condition === "wrong head") f.result.reviewHead = "b".repeat(40);
    if (condition === "wrong base") f.pull.base.ref = "other";
    if (condition === "foreign PR") f.result.pullRequest = "https://github.com/foreign/project/pull/42";
    await expect(f.verify()).rejects.toThrow(); expect(git).not.toHaveBeenCalled(); expect(checkLocalReview).not.toHaveBeenCalled(); expect(f.result.evidence).toEqual([]);
  });
  it("does not turn green SourceCI into independent review", async () => {
    const f = repair(); vi.mocked(checkLocalReview).mockReturnValue([{ message: "missing review", severity: "error" } as never]);
    await expect(f.verify()).rejects.toThrow("lacks valid independent review"); expect(f.result.evidence).toEqual([]);
  });
  it("does not substitute the reviewed branch SHA for the actual merge", async () => {
    const f = repair(); f.result.sourceSha = f.result.reviewHead;
    await expect(f.verify()).rejects.toThrow("actual merged repair"); expect(f.result.evidence).toEqual([]);
  });
  it("leaves a genuine failing repair in checkpoint without Git verification/evidence", async () => {
    const f = repair(); f.api.data.checks[0].conclusion = "failure";
    await expect(f.verify()).rejects.toThrow("failed/incomplete"); expect(git).not.toHaveBeenCalled(); expect(f.result.evidence).toEqual([]);
  });
});
