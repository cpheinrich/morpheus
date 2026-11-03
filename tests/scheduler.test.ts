import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { admit, ADMISSION_STEP } from "../src/scheduler/admit.js";
import { runScheduler, resolveToken } from "../src/scheduler/cli.js";
import { instant, parseInstant, parseRunIdentity, runNameSuffix, slotAtOrBefore } from "../src/scheduler/core.js";
import { createGitHub, GitHubError, type GitHubApi, type Job, type Run } from "../src/scheduler/github.js";
import { hostConfigSchema, schedulesFileSchema, type HostConfig } from "../src/scheduler/schema.js";
import { health, tick, withLock, type SchedulerStatus } from "../src/scheduler/tick.js";

const RECEIVER = `name: Nightly
run-name: "Nightly\${{ inputs.scheduler-id && format(' [schedule:{0}:{1}]', inputs.scheduler-id, inputs.scheduled-for) || '' }}"
on:
  workflow_dispatch:
    inputs:
      scheduler-id: { type: string, default: "" }
      scheduled-for: { type: string, default: "" }
`;

interface FakeRepo {
  branch?: string;
  schedules?: unknown;
  activatedAt?: string;
  workflowState?: string | null;
  workflowSource?: string;
  runs?: Run[];
  fail?: Partial<Record<keyof GitHubApi, Error>>;
}

function fakeGitHub(repos: Record<string, FakeRepo>) {
  const dispatches: Array<{ repo: string; workflow: string; ref: string; inputs: Record<string, unknown> }> = [];
  const runReads: Array<{ repo: string; since: string }> = [];
  let nextRun = 9000;
  const repo = (name: string, op: keyof GitHubApi) => {
    const r = repos[name];
    if (!r) throw new GitHubError(`GET /repos/${name} → 404: Not Found`, 404, false);
    if (r.fail?.[op]) throw r.fail[op];
    return r;
  };
  const api: GitHubApi = {
    async defaultBranch(name) {
      return repo(name, "defaultBranch").branch ?? "main";
    },
    async file(name, path) {
      const r = repo(name, "file");
      if (path === ".morpheus/schedules.json") return r.schedules === undefined ? null : JSON.stringify(r.schedules);
      return r.workflowSource ?? RECEIVER;
    },
    async lastCommitAt(name) {
      return new Date(repo(name, "lastCommitAt").activatedAt ?? "2026-01-01T00:00:00Z");
    },
    async workflow(name) {
      const state = repo(name, "workflow").workflowState;
      return state === null ? null : { id: 77, state: state ?? "active" };
    },
    async runs(name, _workflow, since) {
      runReads.push({ repo: name, since: since.toISOString() });
      return (repo(name, "runs").runs ?? []).filter(run => new Date(run.created_at) >= since);
    },
    async run() {
      throw new Error("unused");
    },
    async jobs() {
      throw new Error("unused");
    },
    async dispatch(name, workflow, ref, inputs) {
      const r = repo(name, "dispatch");
      dispatches.push({ repo: name, workflow, ref, inputs });
      const id = nextRun++;
      r.runs = [...(r.runs ?? [])];
      return { runId: id, runUrl: `https://github.com/${name}/actions/runs/${id}` };
    },
  };
  return { api, dispatches, runReads };
}

function run(id: number, scheduleId: string, scheduledFor: string, createdAt = scheduledFor): Run {
  return {
    id,
    display_title: `Nightly${runNameSuffix(scheduleId, scheduledFor)}`,
    html_url: `https://github.com/example-org/app/actions/runs/${id}`,
    created_at: createdAt,
  };
}

const config: HostConfig = { schemaVersion: 1, repositories: ["example-org/app"], instanceId: "test-host" };
const nightly = { id: "nightly", workflow: "nightly.yml", cron: "0 3 * * *", timezone: "America/New_York" };
const every5 = { id: "sync", workflow: "nightly.yml", cron: "*/5 * * * *", timezone: "UTC" };
const at = (iso: string) => () => new Date(iso);

describe("occurrence identity", () => {
  it("spells one occurrence one way", () => {
    expect(instant(new Date("2026-11-03T08:00:00.000Z"))).toBe("2026-11-03T08:00:00Z");
    expect(runNameSuffix("nightly", "2026-11-03T08:00:00Z")).toBe(" [schedule:nightly:2026-11-03T08:00:00Z]");
    expect(parseRunIdentity("Nightly [schedule:nightly:2026-11-03T08:00:00Z]")).toEqual({
      id: "nightly",
      scheduledFor: "2026-11-03T08:00:00Z",
    });
    expect(parseRunIdentity("Nightly [schedule:nightly:2026-11-03T08:00:00.000Z]")).toBeNull();
    expect(parseRunIdentity("Nightly [schedule:nightly:2026-11-03T08:00:00Z] extra")).toBeNull();
    expect(parseInstant("2026-11-03T08:00:00Z")?.toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(parseInstant("2026-11-03T08:00:00.000Z")).toBeNull();
    expect(parseInstant("2026-02-30T08:00:00Z")).toBeNull();
  });
});

describe("due slots", () => {
  it("includes a slot at exactly now and not one millisecond later", () => {
    expect(slotAtOrBefore(nightly, new Date("2026-11-03T08:00:00.000Z"))?.toISOString()).toBe("2026-11-03T08:00:00.000Z");
    expect(slotAtOrBefore(nightly, new Date("2026-11-03T07:59:59.999Z"))?.toISOString()).toBe("2026-11-02T08:00:00.000Z");
  });

  it("follows the schedule's timezone across both DST transitions", () => {
    // 03:00 New York is 08:00Z in EST and 07:00Z in EDT.
    expect(slotAtOrBefore(nightly, new Date("2026-03-09T12:00:00Z"))?.toISOString()).toBe("2026-03-09T07:00:00.000Z");
    // 02:30 does not exist on spring-forward day; Croner runs it at 03:00 EDT.
    const springGap = { cron: "30 2 * * *", timezone: "America/New_York" };
    expect(slotAtOrBefore(springGap, new Date("2026-03-08T12:00:00Z"))?.toISOString()).toBe("2026-03-08T07:00:00.000Z");
    // 01:30 happens twice on fall-back day; only the first is an occurrence.
    const fallRepeat = { cron: "30 1 * * *", timezone: "America/New_York" };
    expect(slotAtOrBefore(fallRepeat, new Date("2026-11-01T06:45:00Z"))?.toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("schemas", () => {
  it("accepts an empty registry and rejects what would break identity", () => {
    expect(schedulesFileSchema.safeParse({ schemaVersion: 1, schedules: [] }).success).toBe(true);
    const bad = (schedule: Record<string, unknown>) =>
      schedulesFileSchema.safeParse({ schemaVersion: 1, schedules: [{ ...nightly, ...schedule }] }).success;
    expect(bad({})).toBe(true);
    expect(bad({ id: "Nightly" })).toBe(false);
    expect(bad({ id: "a".repeat(65) })).toBe(false);
    expect(bad({ id: "a".repeat(64) })).toBe(true);
    expect(bad({ cron: "0 0 3 * * *" })).toBe(false);
    expect(bad({ timezone: "Mars/Olympus" })).toBe(false);
    expect(bad({ inputs: { "scheduled-for": "x" } })).toBe(false);
    expect(bad({ repository: "example-org/app" })).toBe(false);
    expect(schedulesFileSchema.safeParse({ schemaVersion: 1, schedules: [nightly, nightly] }).success).toBe(false);
    expect(hostConfigSchema.safeParse({ ...config, schedules: [] }).success).toBe(false);
  });
});

describe("primary tick", () => {
  it("dispatches the due slot with the scheduler inputs on the default branch", async () => {
    const gh = fakeGitHub({
      "example-org/app": { branch: "trunk", schedules: { schemaVersion: 1, schedules: [{ ...nightly, inputs: { lane: "full", quick: false } }] } },
    });
    const status = await tick({ config, github: gh.api, mode: "primary", dryRun: false, now: at("2026-11-03T08:00:30Z") });
    expect(gh.dispatches).toEqual([
      {
        repo: "example-org/app",
        workflow: "nightly.yml",
        ref: "trunk",
        inputs: { lane: "full", quick: false, "scheduler-id": "nightly", "scheduled-for": "2026-11-03T08:00:00Z" },
      },
    ]);
    const schedule = status.repositories[0]!.schedules[0]!;
    expect(schedule).toMatchObject({ outcome: "dispatched", dueAt: "2026-11-03T08:00:00Z", runId: 9000 });
    expect(schedule.lastDispatch).toEqual({
      scheduledFor: "2026-11-03T08:00:00Z",
      at: "2026-11-03T08:00:30Z",
      uncertain: false,
      runId: 9000,
      runUrl: "https://github.com/example-org/app/actions/runs/9000",
    });
    expect(status).toMatchObject({ schemaVersion: 1, instanceId: "test-host", ok: true, errors: 0, mode: "primary" });
  });

  it("treats any existing run, failed or not, as the spent occurrence — including after a restart", async () => {
    const gh = fakeGitHub({
      "example-org/app": {
        schedules: { schemaVersion: 1, schedules: [nightly] },
        runs: [run(41, "nightly", "2026-11-03T08:00:00Z", "2026-11-03T08:00:05Z")],
      },
    });
    const status = await tick({ config, github: gh.api, mode: "primary", dryRun: false, previous: null, now: at("2026-11-03T08:10:00Z") });
    expect(gh.dispatches).toHaveLength(0);
    expect(status.repositories[0]!.schedules[0]).toMatchObject({ outcome: "accepted", runId: 41 });
  });

  it("catches up only the latest missed slot after days offline", async () => {
    const gh = fakeGitHub({ "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] } } });
    await tick({ config, github: gh.api, mode: "primary", dryRun: false, now: at("2026-11-06T20:00:00Z") });
    expect(gh.dispatches.map(d => d.inputs["scheduled-for"])).toEqual(["2026-11-06T08:00:00Z"]);
  });

  it("never replays a slot from before the registry's commit, but a slot at the commit instant is due", async () => {
    const before = fakeGitHub({
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] }, activatedAt: "2026-11-03T08:00:01Z" },
    });
    const idle = await tick({ config, github: before.api, mode: "primary", dryRun: false, now: at("2026-11-03T09:00:00Z") });
    expect(before.dispatches).toHaveLength(0);
    expect(idle.repositories[0]!.schedules[0]).toMatchObject({ outcome: "idle", dueAt: null });

    const exact = fakeGitHub({
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] }, activatedAt: "2026-11-03T08:00:00Z" },
    });
    await tick({ config, github: exact.api, mode: "primary", dryRun: false, now: at("2026-11-03T09:00:00Z") });
    expect(exact.dispatches).toHaveLength(1);
  });

  it("does not resubmit a confirmed dispatch that history does not show yet", async () => {
    const gh = fakeGitHub({ "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] } } });
    const first = await tick({ config, github: gh.api, mode: "primary", dryRun: false, now: at("2026-11-03T08:00:10Z") });
    const second = await tick({ config, github: gh.api, mode: "primary", dryRun: false, previous: first, now: at("2026-11-03T08:01:10Z") });
    expect(gh.dispatches).toHaveLength(1);
    expect(gh.runReads).toHaveLength(1);
    expect(second.repositories[0]!.schedules[0]).toMatchObject({ outcome: "accepted", runId: 9000 });
  });

  it("reconciles a lost dispatch response by history before resubmitting", async () => {
    const repo: FakeRepo = {
      schedules: { schemaVersion: 1, schedules: [nightly] },
      fail: { dispatch: new GitHubError("POST dispatch: TimeoutError", null, true) },
    };
    const gh = fakeGitHub({ "example-org/app": repo });
    const lost = await tick({ config, github: gh.api, mode: "primary", dryRun: false, now: at("2026-11-03T08:00:10Z") });
    expect(lost.repositories[0]!.schedules[0]).toMatchObject({ outcome: "uncertain", lastDispatch: { uncertain: true } });
    delete repo.fail;

    const settling = await tick({ config, github: gh.api, mode: "primary", dryRun: false, previous: lost, now: at("2026-11-03T08:05:09Z") });
    expect(settling.repositories[0]!.schedules[0]!.outcome).toBe("waiting");
    expect(gh.dispatches).toHaveLength(0);

    repo.runs = [run(55, "nightly", "2026-11-03T08:00:00Z", "2026-11-03T08:00:12Z")];
    const seen = await tick({ config, github: gh.api, mode: "primary", dryRun: false, previous: settling, now: at("2026-11-03T08:05:10Z") });
    expect(seen.repositories[0]!.schedules[0]).toMatchObject({ outcome: "accepted", runId: 55 });
    expect(gh.dispatches).toHaveLength(0);

    repo.runs = [];
    const resubmit = await tick({ config, github: gh.api, mode: "primary", dryRun: false, previous: settling, now: at("2026-11-03T08:05:10Z") });
    expect(resubmit.repositories[0]!.schedules[0]!.outcome).toBe("dispatched");
    expect(gh.dispatches).toHaveLength(1);
  });

  it("isolates a failing repository so the others still dispatch", async () => {
    const gh = fakeGitHub({
      "example-org/broken": { fail: { defaultBranch: new GitHubError("GET /repos/example-org/broken → 401: Bad credentials", 401, false) } },
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] } },
    });
    const status = await tick({
      config: { ...config, repositories: ["example-org/broken", "example-org/app"] },
      github: gh.api,
      mode: "primary",
      dryRun: false,
      now: at("2026-11-03T08:00:10Z"),
    });
    expect(status.repositories[0]).toMatchObject({ ok: false, error: "GET /repos/example-org/broken → 401: Bad credentials" });
    expect(status.repositories[1]!.schedules[0]!.outcome).toBe("dispatched");
    expect(status).toMatchObject({ ok: false, errors: 1 });
  });

  it("reports missing and disabled definitions without dispatching", async () => {
    const gh = fakeGitHub({
      "example-org/none": {},
      "example-org/missing": { schedules: { schemaVersion: 1, schedules: [nightly] }, workflowState: null },
      "example-org/disabled": { schedules: { schemaVersion: 1, schedules: [nightly] }, workflowState: "disabled_manually" },
      "example-org/unnamed": { schedules: { schemaVersion: 1, schedules: [nightly] }, workflowSource: "on: workflow_dispatch\n" },
      "example-org/history": {
        schedules: { schemaVersion: 1, schedules: [nightly, { ...nightly, id: "second" }] },
        fail: { runs: new GitHubError("GET runs: history truncated at 1000 of 1200", null, false) },
      },
    });
    const status = await tick({
      config: { ...config, repositories: Object.keys({ "example-org/none": 0, "example-org/missing": 0, "example-org/disabled": 0, "example-org/unnamed": 0, "example-org/history": 0 }) },
      github: gh.api,
      mode: "primary",
      dryRun: false,
      now: at("2026-11-03T08:00:10Z"),
    });
    expect(gh.dispatches).toHaveLength(0);
    const [none, missing, disabled, unnamed, history] = status.repositories;
    expect(none).toMatchObject({ ok: false, error: ".morpheus/schedules.json is missing on main" });
    expect(missing!.schedules[0]).toMatchObject({ outcome: "error", error: "workflow nightly.yml does not exist" });
    expect(disabled!.schedules[0]).toMatchObject({ outcome: "skipped", reason: "workflow is disabled_manually", dueAt: "2026-11-03T08:00:00Z" });
    expect(unnamed!.schedules[0]!.error).toMatch(/run-name suffix/);
    expect(history!.schedules.map(s => s.outcome)).toEqual(["error", "error"]);
    expect(status.errors).toBe(5);
  });

  it("plans without dispatching on a dry run", async () => {
    const gh = fakeGitHub({ "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] } } });
    const status = await tick({ config, github: gh.api, mode: "primary", dryRun: true, now: at("2026-11-03T08:00:10Z") });
    expect(gh.dispatches).toHaveLength(0);
    expect(gh.runReads).toHaveLength(1);
    expect(status.repositories[0]!.schedules[0]).toMatchObject({ outcome: "planned", dueAt: "2026-11-03T08:00:00Z" });
  });
});

describe("backup tick", () => {
  it("leaves a slot to the primary until it is a full grace overdue", async () => {
    const gh = fakeGitHub({
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] }, runs: [run(6, "nightly", "2026-11-02T08:00:00Z")] },
    });
    const early = await tick({ config, github: gh.api, mode: "backup", dryRun: false, now: at("2026-11-03T08:29:59Z") });
    expect(gh.dispatches).toHaveLength(0);
    expect(early.repositories[0]!.schedules[0]).toMatchObject({ outcome: "waiting", dueAt: "2026-11-03T08:00:00Z" });
    await tick({ config, github: gh.api, mode: "backup", dryRun: false, now: at("2026-11-03T08:30:00Z") });
    expect(gh.dispatches.map(d => d.inputs["scheduled-for"])).toEqual(["2026-11-03T08:00:00Z"]);
  });

  it("stays quiet when the primary accepted the slot", async () => {
    const gh = fakeGitHub({
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] }, runs: [run(7, "nightly", "2026-11-03T08:00:00Z")] },
    });
    await tick({ config, github: gh.api, mode: "backup", dryRun: false, now: at("2026-11-03T08:45:00Z") });
    expect(gh.dispatches).toHaveLength(0);
  });

  it("notices a dead primary even when the cadence is shorter than the grace", async () => {
    const dead = fakeGitHub({
      "example-org/app": { schedules: { schemaVersion: 1, schedules: [every5] }, runs: [run(1, "sync", "2026-11-03T07:25:00Z")] },
    });
    await tick({ config, github: dead.api, mode: "backup", dryRun: false, now: at("2026-11-03T08:01:00Z") });
    // The latest slot, not the 07:30 slot that was first missed.
    expect(dead.dispatches.map(d => d.inputs["scheduled-for"])).toEqual(["2026-11-03T08:00:00Z"]);
  });

  it("coalesces an older miss when a newer occurrence was accepted", async () => {
    const healthy = fakeGitHub({
      "example-org/app": {
        schedules: { schemaVersion: 1, schedules: [every5] },
        // 07:30 (the past-grace slot) was missed; 07:35 onward ran.
        runs: [run(2, "sync", "2026-11-03T07:35:00Z"), run(3, "sync", "2026-11-03T07:55:00Z")],
      },
    });
    const status = await tick({ config, github: healthy.api, mode: "backup", dryRun: false, now: at("2026-11-03T08:01:00Z") });
    expect(healthy.dispatches).toHaveLength(0);
    expect(status.repositories[0]!.schedules[0]).toMatchObject({ outcome: "waiting", dueAt: "2026-11-03T08:00:00Z" });
  });
});

describe("GitHub client", () => {
  const respond = (status: number, body: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status });

  it("fails on truncated history instead of returning a partial list", async () => {
    const pages = [{ total_count: 150, workflow_runs: Array.from({ length: 100 }, (_, i) => ({ id: i })) }, { total_count: 150, workflow_runs: [] }];
    const gh = createGitHub("t", { fetch: async () => respond(200, pages.shift()) });
    await expect(gh.runs("example-org/app", "nightly.yml", new Date())).rejects.toThrow("history truncated at 100 of 150");
  });

  it("reads every page and stops at the total", async () => {
    const urls: string[] = [];
    const pages = [
      { total_count: 101, workflow_runs: Array.from({ length: 100 }, (_, i) => ({ id: i })) },
      { total_count: 101, workflow_runs: [{ id: 100 }] },
    ];
    const gh = createGitHub("t", { fetch: async url => (urls.push(String(url)), respond(200, pages.shift())) });
    expect(await gh.runs("example-org/app", "nightly.yml", new Date("2026-11-03T07:00:00Z"))).toHaveLength(101);
    expect(urls).toHaveLength(2);
    expect(urls[0]).toContain("created=%3E%3D2026-11-03T07%3A00%3A00.000Z");
  });

  it("separates uncertain dispatch outcomes from definite refusals", async () => {
    const outcome = async (fetchImpl: typeof fetch) =>
      createGitHub("secret-token", { fetch: fetchImpl }).dispatch("example-org/app", "nightly.yml", "main", {}).catch(e => e);
    expect(await outcome(async () => respond(200, { workflow_run_id: 5, html_url: "u" }))).toEqual({ runId: 5, runUrl: "u" });
    const timeout = await outcome(async () => {
      throw new DOMException("timed out", "TimeoutError");
    });
    expect(timeout).toMatchObject({ uncertain: true, status: null });
    expect(await outcome(async () => respond(204, undefined))).toMatchObject({ uncertain: true });
    expect(await outcome(async () => respond(502, {}))).toMatchObject({ uncertain: true, status: 502 });
    const refused = await outcome(async () => respond(422, { message: "Unexpected inputs provided" }));
    expect(refused).toMatchObject({ uncertain: false, status: 422 });
    expect(String(refused.message)).not.toContain("secret-token");
  });

  it("reports an unreadable repository as an error, not an empty registry", async () => {
    const gh = createGitHub("t", { fetch: async () => respond(404, { message: "Not Found" }) });
    await expect(gh.defaultBranch("example-org/app")).rejects.toMatchObject({ status: 404 });
  });
});

describe("credentials", () => {
  it("uses the named gh account without the ambient token, and refuses when none is available", async () => {
    let seenEnv: NodeJS.ProcessEnv = {};
    const token = await resolveToken(
      { ...config, githubAccount: "example-bot" },
      { env: { GH_TOKEN: "ambient" }, ghToken: async (account, env) => ((seenEnv = env), account === "example-bot" ? "named\n" : "") },
    );
    expect(token).toBe("named");
    expect(seenEnv).not.toHaveProperty("GH_TOKEN");
    expect(await resolveToken(config, { env: { GH_TOKEN: "backup" } })).toBe("backup");
    await expect(resolveToken(config, { env: {} })).rejects.toThrow("no GitHub credential");
    await expect(resolveToken({ ...config, githubAccount: "x" }, { env: {}, ghToken: async () => " " })).rejects.toThrow("no token");
  });
});

describe("status and lock", () => {
  const base = (observedAt: string, extra: Partial<SchedulerStatus> = {}): SchedulerStatus => ({
    schemaVersion: 1,
    instanceId: "h",
    schedulerVersion: "1.0.0",
    mode: "primary",
    dryRun: false,
    observedAt,
    tick: { startedAt: observedAt, finishedAt: observedAt },
    ok: true,
    errors: 0,
    repositories: [],
    ...extra,
  });

  it("is healthy only while the last tick is fresh and error-free", () => {
    const now = new Date("2026-11-03T08:03:00Z");
    expect(health(base("2026-11-03T08:00:00Z"), now).healthy).toBe(true);
    expect(health(base("2026-11-03T07:59:59Z"), now)).toEqual({ healthy: false, reasons: ["last tick finished 181s ago"] });
    expect(health(base("2026-11-03T07:45:00Z", { mode: "backup" }), now).healthy).toBe(true);
    expect(health(null, now).healthy).toBe(false);
    const failing = base("2026-11-03T08:02:00Z", { repositories: [{ repository: "example-org/app", ok: false, error: "boom", schedules: [] }] });
    expect(health(failing, now).reasons).toEqual(["example-org/app: boom"]);
  });

  it("refuses an overlapping tick", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scheduler-lock-"));
    const path = join(dir, "status.json");
    let inner: unknown;
    await withLock(path, async () => {
      inner = await withLock(path, async () => "ran").catch(e => (e as Error).message);
    });
    expect(inner).toBe(`another tick holds ${path}.lock`);
    expect(await withLock(path, async () => "after")).toBe("after");
  });

  it("tick writes an atomic status file that the next tick reads back", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scheduler-cli-"));
    const configPath = join(dir, "host.json");
    await writeFile(configPath, JSON.stringify(config));
    const gh = fakeGitHub({ "example-org/app": { schedules: { schemaVersion: 1, schedules: [nightly] } } });
    const deps = { env: { GH_TOKEN: "t" }, github: () => gh.api, log: () => {}, now: at("2026-11-03T08:00:10Z") };
    expect(await runScheduler(["tick", "--config", configPath], deps)).toBe(0);
    expect(await runScheduler(["tick", "--config", configPath], { ...deps, now: at("2026-11-03T08:01:10Z") })).toBe(0);
    expect(gh.dispatches).toHaveLength(1);
    const written = JSON.parse(await readFile(join(dir, "scheduler-status.json"), "utf8")) as SchedulerStatus;
    expect(written.tick).toEqual({ startedAt: "2026-11-03T08:01:10Z", finishedAt: "2026-11-03T08:01:10Z" });
    expect(written.repositories[0]!.schedules[0]).toMatchObject({ outcome: "accepted", runId: 9000 });
    expect(JSON.stringify(written)).not.toContain('"t"');
  });
});

describe("receiver admission", () => {
  const suffix = runNameSuffix("nightly", "2026-11-03T08:00:00Z");
  const step = (name: string, conclusion: string | null, status = "completed") => ({ name, status, conclusion });
  function receiver(runs: Array<Run & { jobs: Job[] }>, current: Run & { jobs: Job[] }) {
    const all = [current, ...runs];
    const api = {
      async run(_repo: string, id: number) {
        return all.find(r => r.id === id)!;
      },
      async jobs(_repo: string, id: number) {
        return all.find(r => r.id === id)!.jobs;
      },
      async runs() {
        return all;
      },
    } as unknown as GitHubApi;
    return api;
  }
  const current = (jobs: Job[] = [{ id: 1, run_attempt: 1, steps: [step("Scheduler guard", null, "in_progress")] }]) => ({
    id: 100,
    display_title: `Nightly${suffix}`,
    html_url: "",
    created_at: "2026-11-03T08:00:05Z",
    workflow_id: 77,
    jobs,
  });
  const input = { schedulerId: "nightly", scheduledFor: "2026-11-03T08:00:00Z", repository: "example-org/app", runId: 100, runAttempt: 1 };
  const other = (id: number, steps: Job["steps"], title = `Nightly${suffix}`) => ({
    id,
    display_title: title,
    html_url: "",
    created_at: "2026-11-03T08:00:01Z",
    jobs: [{ id: id * 10, steps }],
  });

  it("admits a manual run and validates scheduler inputs", async () => {
    expect(await admit({ ...input, schedulerId: "", scheduledFor: "" }, null)).toMatchObject({ admitted: true });
    await expect(admit({ ...input, scheduledFor: "" }, null)).rejects.toThrow("supplied together");
    await expect(admit({ ...input, schedulerId: "Bad_Id" }, receiver([], current()))).rejects.toThrow("invalid scheduler-id");
    await expect(admit({ ...input, scheduledFor: "2026-11-03 08:00" }, receiver([], current()))).rejects.toThrow("UTC instant");
    await expect(admit({ ...input, scheduledFor: "2026-11-03T09:00:00Z" }, receiver([], current()))).rejects.toThrow("run's name");
  });

  it("admits the first run and only runs whose earlier duplicates never passed admission", async () => {
    expect(await admit(input, receiver([], current()))).toMatchObject({ admitted: true });
    const neverStarted = other(90, []);
    const turnedAway = other(91, [step("Scheduler guard", "success"), step(ADMISSION_STEP, "skipped")]);
    const otherSlot = other(92, [step(ADMISSION_STEP, "success")], `Nightly${runNameSuffix("nightly", "2026-11-02T08:00:00Z")}`);
    expect(await admit(input, receiver([neverStarted, turnedAway, otherSlot], current()))).toMatchObject({ admitted: true });
  });

  it("turns away a duplicate of an admitted run, even one whose later work failed", async () => {
    const admittedThenFailed = other(93, [step(ADMISSION_STEP, "success"), step("Deploy", "failure")]);
    expect(await admit(input, receiver([admittedThenFailed], current()))).toEqual({
      admitted: false,
      reason: "run 93 was already admitted for this occurrence",
      duplicateOf: 93,
    });
  });

  it("turns away a re-run of an attempt that was admitted", async () => {
    const jobs = [
      { id: 1, run_attempt: 1, steps: [step(ADMISSION_STEP, "success")] },
      { id: 2, run_attempt: 2, steps: [step("Scheduler guard", null, "in_progress")] },
    ];
    expect(await admit({ ...input, runAttempt: 2 }, receiver([], current(jobs)))).toMatchObject({ admitted: false, duplicateOf: 100 });
  });

  it("refuses a guard step that carries the marker's name", async () => {
    const jobs = [{ id: 1, run_attempt: 1, steps: [step(ADMISSION_STEP, null, "in_progress")] }];
    await expect(admit(input, receiver([], current(jobs)))).rejects.toThrow("must not be named");
  });

  it("writes the decision to GITHUB_OUTPUT and exits successfully when not admitted", async () => {
    const dir = await mkdtemp(join(tmpdir(), "scheduler-admit-"));
    const output = join(dir, "out");
    await writeFile(output, "");
    const api = receiver([other(93, [step(ADMISSION_STEP, "success")])], current());
    const env = { GITHUB_ACTIONS: "true", GITHUB_OUTPUT: output, GITHUB_REPOSITORY: "example-org/app", GITHUB_RUN_ID: "100", GITHUB_TOKEN: "t" };
    const code = await runScheduler(["admit", "--scheduler-id", "nightly", "--scheduled-for", "2026-11-03T08:00:00Z"], {
      env,
      github: () => api,
      log: () => {},
    });
    expect(code).toBe(0);
    expect(await readFile(output, "utf8")).toBe("admitted=false\n");
  });
});

describe("shipped scheduler files", () => {
  const root = join(import.meta.dirname, "..");

  it("registers no Morpheus schedules: the hourly heartbeat was deliberately disabled", async () => {
    const registry = JSON.parse(await readFile(join(root, ".morpheus/schedules.json"), "utf8"));
    expect(schedulesFileSchema.parse(registry)).toEqual({ schemaVersion: 1, schedules: [] });
  });

  it("the admission action installs only the locked production tree and passes inputs as data", async () => {
    const { load } = await import("js-yaml");
    const action = load(await readFile(join(root, ".github/actions/scheduler-admit/action.yml"), "utf8")) as {
      runs: { steps: Array<{ id?: string; run?: string; env?: Record<string, string> }> };
    };
    const runs = action.runs.steps.filter(step => step.run);
    expect(runs[0]!.run).toBe("npx --yes pnpm@11.9.0 install --prod --frozen-lockfile --ignore-scripts");
    for (const step of runs) expect(step.run).not.toContain("${{");
    const guard = action.runs.steps.find(step => step.id === "guard")!;
    expect(guard.env).toMatchObject({ SCHEDULER_ID: "${{ inputs.scheduler-id }}", SCHEDULED_FOR: "${{ inputs.scheduled-for }}" });
    expect(guard.run).toContain("scheduler admit");
  });
});
