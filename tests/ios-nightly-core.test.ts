import { describe, expect, it } from "vitest";
import {
  admit, initialState, lastUpload, localTime, periodOf, reconcile, schedule, uncertainUpload,
  type AdmissionConfig, type AdmissionDeps, type Job, type Run, type State,
} from "../src/ios/nightly-core.js";
import { check, run as vendorRun, vendored } from "../src/ios/nightly-vendor.js";

// Ported from darwin-health/evo qa/ios-nightly.test.mjs, where this behaviour
// was first built (#307, #309); the core must keep every one of these.
const NAMES = { job: "Upload TestFlight build", step: "Archive, sign, verify, and upload to TestFlight" };
const CONFIG: AdmissionConfig = {
  zone: "America/Los_Angeles",
  window: { start: 365, end: 660 },
  title: (nonce) => `iOS TestFlight release · ${nonce}`,
};
const now = "2026-09-28T13:05:00Z";
const run = (overrides: Partial<Run> = {}): Run => ({
  id: 123, run_attempt: 1, created_at: now, updated_at: "2026-09-28T14:10:00Z",
  head_sha: "old", status: "completed", conclusion: "success", ...overrides,
});

function harness() {
  const state: State = initialState("2026-09-28T12:00:00Z");
  const snapshots: State[] = [];
  const calls: string[] = [];
  const deps: AdmissionDeps = {
    hasIncident: async () => false, main: async () => "new", lastUpload: async () => ({ ...run(), head_sha: "baseline" }),
    uncertainUpload: async () => null, changes: async () => ({ changed: true }),
    dispatch: async () => { calls.push("dispatch"); },
  };
  return {
    state, snapshots, calls, deps, now, runs: [] as Run[], config: CONFIG,
    save: () => { snapshots.push(structuredClone(state)); },
  };
}

const uploadJob = (attempt: number, state: string, completedAt?: string): Job => ({
  name: NAMES.job, run_attempt: attempt, completed_at: completedAt,
  conclusion: state === "uploaded" ? "success" : state === "skipped" ? "skipped" : "failure",
  steps: state === "skipped" ? [{ name: NAMES.step, conclusion: "skipped", started_at: null, completed_at: null }]
    : [{ name: NAMES.step, conclusion: state === "uploaded" ? "success" : "failure", started_at: completedAt, completed_at: completedAt }],
});
const jobsFrom = (byRun: Record<number, Job[]>) => async (r: Run) => byRun[r.id] ?? [];

describe("daily admission", () => {
  it("a main advance cannot queue a second automated run, whatever the first one did", async () => {
    for (const status of ["in_progress", "queued", "completed"]) for (const conclusion of ["success", "failure", "cancelled"]) {
      const h = harness(); h.runs = [run({ status, conclusion })]; await schedule(h);
      expect(h.calls).toEqual([]); expect(h.state.days["2026-09-28"]?.status).toBe("observed");
    }
  });

  it("the reservation survives a lost dispatch response and a restart", async () => {
    const h = harness(); h.deps.dispatch = async () => { h.calls.push("dispatch"); throw Error("response lost"); };
    await expect(schedule(h)).rejects.toThrow(/response lost/);
    const restart = { ...h, state: structuredClone(h.snapshots.at(-1)!) };
    await schedule(restart); expect(h.calls).toEqual(["dispatch"]);
    expect(h.snapshots.at(-1)!.days["2026-09-28"]?.status).toBe("reserved");
  });

  it("no watched changes consumes the day without a workflow, even if main changes later", async () => {
    const h = harness(); h.deps.changes = async () => ({ changed: false }); await schedule(h);
    h.deps.changes = async () => ({ changed: true }); await schedule(h);
    expect(h.calls).toEqual([]); expect(h.state.days["2026-09-28"]?.status).toBe("no-changes");
  });

  it("the next local day permits one new run; UTC midnight and DST do not reset the allowance", async () => {
    const h = harness(); await schedule(h); await schedule(h); expect(h.calls).toHaveLength(1);
    h.now = "2026-09-29T13:05:00Z"; await schedule(h); expect(h.calls).toHaveLength(2);
    expect(localTime("2026-09-29T00:30:00Z", CONFIG.zone).day).toBe("2026-09-28");
    expect(localTime("2026-11-01T09:30:00Z", CONFIG.zone).minute).toBe(90);
    expect(localTime("2026-03-08T10:05:00Z", CONFIG.zone).minute).toBe(185);
  });

  it("classifies existing runs by local date, not a UTC string prefix", async () => {
    const h = harness(); h.runs = [run({ created_at: "2026-09-28T00:30:00Z" })]; await schedule(h);
    expect(h.calls).toHaveLength(1);
  });

  it("an open incident, an active earlier run, or being outside the window cannot dispatch", async () => {
    const h = harness(); h.deps.hasIncident = async () => true; await schedule(h); expect(h.calls).toHaveLength(0);
    h.deps.hasIncident = async () => false; h.runs = [run({ created_at: "2026-09-27T23:00:00Z", status: "in_progress" })];
    await schedule(h); expect(h.calls).toHaveLength(0);
    h.runs = []; h.now = "2026-09-28T18:00:00Z"; await schedule(h); expect(h.calls).toHaveLength(0);
  });

  it("works without an incident hook", async () => {
    const h = harness(); delete h.deps.hasIncident; await schedule(h); expect(h.calls).toEqual(["dispatch"]);
  });

  it("each app chooses its own window", async () => {
    // Lakina's window opens two hours before Evo's: 04:05 Pacific is 11:05 UTC.
    const h = harness(); h.config = { ...CONFIG, window: { start: 245, end: 540 } }; h.now = "2026-09-28T11:05:00Z";
    await schedule(h); expect(h.calls).toEqual(["dispatch"]);
  });

  it("a main advance between reservation and dispatch reconciles by daily identity", async () => {
    const h = harness(); await schedule(h);
    const moved = run({ head_sha: "different", display_title: "iOS TestFlight release · 2026-09-28" });
    reconcile(h.state, [moved], "2026-09-28T15:00:00Z", CONFIG);
    expect(h.state.days["2026-09-28"]).toMatchObject({ run: moved.id, actualSha: "different" });
  });

  it("an unresolved reservation cannot dispatch again, and duplicate identities fail closed", async () => {
    const h = harness(); await schedule(h);
    expect(() => reconcile(h.state, [], "2026-09-28T15:00:00Z", CONFIG)).toThrow(/unknown/);
    await schedule(h); expect(h.calls).toHaveLength(1);
    expect(() => reconcile(h.state, [
      run({ display_title: "iOS TestFlight release · 2026-09-28" }),
      run({ id: 124, display_title: "iOS TestFlight release · 2026-09-28" }),
    ], now, CONFIG)).toThrow(/Multiple/);
  });

  it("an unresolved uncertain upload refuses every cycle instead of consuming a day", async () => {
    const h = harness(); h.runs = [run({ id: 160, conclusion: "failure", created_at: "2026-09-27T13:00:00Z" })];
    h.deps.uncertainUpload = async () => ({ state: "uncertain", run: run({ id: 160 }), attempt: 1, at: "2026-09-27T14:05:00Z", time: 0 });
    for (const tick of ["2026-09-28T13:05:00Z", "2026-09-28T13:10:00Z", "2026-09-29T13:05:00Z"]) {
      await expect(admit({ ...h, now: tick })).rejects.toThrow(/whether that build reached App Store Connect is unknown/);
    }
    expect(h.calls).toEqual([]); expect(h.state.days).toEqual({});
    h.deps.uncertainUpload = async () => null;
    await admit(h); expect(h.calls).toEqual(["dispatch"]);
  });

  it("an unaccompanied queued release still has the default four-hour ceiling", async () => {
    const h = harness(); h.runs = [run({ status: "queued", created_at: "2026-09-28T08:00:00Z" })];
    await expect(admit(h)).rejects.toThrow(/240 minutes/);
  });

  it("uses the configured runtime ceiling at its exact boundary", async () => {
    const h = harness(); h.config = { ...CONFIG, runTimeoutMinutes: 360 };
    h.runs = [run({ status: "in_progress", created_at: "2026-09-28T06:00:00Z", run_started_at: "2026-09-28T07:05:00Z" })];
    await admit(h);
    expect(h.calls).toEqual([]);
    expect(h.state.days).toEqual({}); // Created on the prior Pacific day; still blocks this slot.
    h.now = "2026-09-28T13:05:00.001Z";
    await expect(admit(h)).rejects.toThrow(/Run 123.*360 minutes/);
  });

  it("ages a running retry from its current start rather than original creation", async () => {
    const h = harness();
    h.runs = [run({ status: "in_progress", run_attempt: 2, created_at: "2026-09-26T08:00:00Z", run_started_at: "2026-09-28T12:00:00Z" })];
    await admit(h);
    expect(h.calls).toEqual([]); expect(h.state.days).toEqual({});
  });

  it.each(["queued", "pending", "requested"])("treats %s behind a running release as waiting, without masking a stuck runner", async (status) => {
    const h = harness();
    h.runs = [run({ id: 124, status, created_at: "2026-09-27T08:00:00Z" }), run({ status: "in_progress", created_at: "2026-09-28T12:00:00Z" })];
    await admit(h);
    expect(h.calls).toEqual([]);
    h.runs[1]!.created_at = "2026-09-28T08:00:00Z";
    await expect(admit(h)).rejects.toThrow(/Run 123.*240 minutes/);
    h.runs.pop();
    await expect(admit(h)).rejects.toThrow(/Run 124.*240 minutes/);
  });

  it.each([0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("refuses an invalid runtime ceiling %s before dispatch", async (runTimeoutMinutes) => {
    const h = harness(); h.config = { ...CONFIG, runTimeoutMinutes };
    await expect(admit(h)).rejects.toThrow(/runTimeoutMinutes must be a positive safe integer/);
    expect(h.calls).toEqual([]); expect(h.snapshots).toEqual([]);
  });

  it("refuses unavailable active-run timing instead of silently calling it healthy", async () => {
    const h = harness(); h.runs = [run({ status: "in_progress", run_started_at: "invalid" })];
    await expect(admit(h)).rejects.toThrow(/Cannot determine the age of release run 123/);
    expect(h.calls).toEqual([]); expect(h.snapshots).toEqual([]);
  });
});

describe("slot admission", () => {
  // Four six-hour slots a day; admission opens five minutes into each and
  // closes five hours in, so a two-hour release never overlaps the next slot.
  const SLOTS: AdmissionConfig = { ...CONFIG, slotMinutes: 360, window: { start: 5, end: 300 } };

  it("keys periods by local slot start and leaves day-long periods unchanged", () => {
    expect(periodOf("2026-09-28T13:05:00Z", SLOTS)).toEqual({ key: "2026-09-28T0600", minute: 5 });
    expect(periodOf("2026-09-28T19:30:00Z", SLOTS)).toEqual({ key: "2026-09-28T1200", minute: 30 });
    expect(periodOf("2026-09-29T06:59:00Z", SLOTS)).toEqual({ key: "2026-09-28T1800", minute: 359 });
    expect(periodOf("2026-09-28T13:05:00Z", CONFIG)).toEqual({ key: "2026-09-28", minute: 365 });
    // Config the core cannot honour fails closed rather than quietly becoming a day.
    expect(() => periodOf("2026-09-28T13:05:00Z", { ...SLOTS, slotMinutes: 500 })).toThrow(/divisor of 1440/);
    expect(() => periodOf("2026-09-28T13:05:00Z", { ...SLOTS, slotMinutes: 350 })).toThrow(/divisor of 1440/);
    expect(() => periodOf("2026-09-28T13:05:00Z", { ...SLOTS, window: { start: 5, end: 360 } })).not.toThrow();
    expect(() => periodOf("2026-09-28T13:05:00Z", { ...SLOTS, window: { start: 5, end: 361 } })).toThrow(/must not exceed slotMinutes/);
  });

  it("admits one automated release per slot and records each slot's outcome", async () => {
    const h = harness(); h.config = SLOTS;
    await schedule(h); await schedule(h);
    expect(h.calls).toEqual(["dispatch"]);
    expect(h.state.days["2026-09-28T0600"]?.status).toBe("dispatched");
    expect(h.state.days["2026-09-28T0600"]?.nonce).toBe("2026-09-28T0600");
    // The dispatched run is still in flight at the next slot: no second release.
    h.runs = [run({ created_at: "2026-09-28T13:06:00Z", status: "in_progress", conclusion: null, display_title: "iOS TestFlight release · 2026-09-28T0600" })];
    h.now = "2026-09-28T19:05:00Z"; await schedule(h);
    expect(h.calls).toEqual(["dispatch"]); expect(h.state.days["2026-09-28T1200"]).toBeUndefined();
    // Once it completes, the 12:00 slot admits its own release.
    h.runs[0] = run({ ...h.runs[0], status: "completed", conclusion: "success" });
    h.now = "2026-09-28T19:10:00Z"; await schedule(h);
    expect(h.calls).toEqual(["dispatch", "dispatch"]);
    expect(h.state.days["2026-09-28T1200"]?.status).toBe("dispatched");
    // A manual release inside a slot satisfies that slot; unchanged main spends one.
    h.runs.push(run({ id: 9, created_at: "2026-09-29T01:30:00Z", display_title: "manual" }));
    h.now = "2026-09-29T01:35:00Z"; await schedule(h);
    expect(h.state.days["2026-09-28T1800"]).toEqual({ status: "observed", run: 9 });
    h.deps.changes = async () => ({ changed: false });
    h.now = "2026-09-29T07:05:00Z"; await schedule(h);
    expect(h.state.days["2026-09-29T0000"]?.status).toBe("no-changes");
    expect(h.calls).toEqual(["dispatch", "dispatch"]);
  });

  it("an open incident spends no slot, so the next slot retries after it resolves", async () => {
    const h = harness(); h.config = SLOTS; h.deps.hasIncident = async () => true;
    await schedule(h);
    expect(h.calls).toEqual([]); expect(h.state.days["2026-09-28T0600"]).toBeUndefined();
    h.deps.hasIncident = async () => false; h.now = "2026-09-28T19:05:00Z"; await schedule(h);
    expect(h.calls).toEqual(["dispatch"]); expect(h.state.days["2026-09-28T1200"]?.status).toBe("dispatched");
    // Outside a slot's window nothing is admitted either.
    h.now = "2026-09-29T00:30:00Z"; await schedule(h);
    expect(h.calls).toEqual(["dispatch"]); expect(h.state.days["2026-09-28T1800"]).toBeUndefined();
  });

  it("reconciles a slot reservation by its own run title", () => {
    const state = initialState("2026-09-28T12:00:00Z");
    state.days["2026-09-28T1200"] = { status: "dispatched", sha: "new", nonce: "2026-09-28T1200", at: "2026-09-28T19:05:00Z" };
    const moved = run({ id: 77, head_sha: "different", display_title: "iOS TestFlight release · 2026-09-28T1200" });
    reconcile(state, [moved], "2026-09-28T19:20:00Z", SLOTS);
    expect(state.days["2026-09-28T1200"]?.run).toBe(77);
  });
});

describe("upload evidence", () => {
  it("ignores successful no-op and test-only runs", async () => {
    const jobs = jobsFrom({ 120: [uploadJob(1, "uploaded", "2026-09-27T14:05:00Z")], 123: [uploadJob(1, "skipped")] });
    const runs = [run(), run({ id: 120, updated_at: "2026-09-27T14:10:00Z" })];
    expect((await lastUpload(runs, jobs, NAMES))!.id).toBe(120);
    expect(await lastUpload(runs, jobs, NAMES, Date.parse("2026-09-27T13:00:00Z"))).toBeNull();
  });

  it("a failed rerun cannot erase the upload its own earlier attempt completed", async () => {
    const jobs = jobsFrom({
      130: [uploadJob(1, "uploaded", "2026-09-27T14:05:00Z"), uploadJob(2, "skipped")],
      120: [uploadJob(1, "uploaded", "2026-09-20T14:05:00Z")],
    });
    const runs = [run({ id: 130, run_attempt: 2, conclusion: "failure", head_sha: "shipped", updated_at: "2026-09-27T20:00:00Z" }),
      run({ id: 120, head_sha: "older", updated_at: "2026-09-20T14:10:00Z" })];
    const baseline = await lastUpload(runs, jobs, NAMES);
    expect(baseline).toMatchObject({ head_sha: "shipped", uploadAttempt: 1 });
    expect(await uncertainUpload(runs, jobs, NAMES)).toBeNull();
  });

  it("orders by upload completion, not by when a run last changed", async () => {
    const jobs = jobsFrom({
      140: [uploadJob(1, "uploaded", "2026-09-25T09:00:00Z"), uploadJob(2, "uploaded", "2026-09-25T09:00:00Z"),
        { name: "notify", run_attempt: 2, conclusion: "success", completed_at: "2026-09-27T23:00:00Z", steps: [] }],
      141: [uploadJob(1, "uploaded", "2026-09-25T16:00:00Z")],
    });
    const runs = [run({ id: 140, head_sha: "older", run_attempt: 2, updated_at: "2026-09-27T23:00:00Z" }),
      run({ id: 141, head_sha: "newer", updated_at: "2026-09-25T16:10:00Z" })];
    expect((await lastUpload(runs, jobs, NAMES))!.head_sha).toBe("newer");
  });

  it("a confirmed upload survives the same run failing overall afterwards", async () => {
    const jobs = jobsFrom({ 123: [uploadJob(1, "uploaded", "2026-09-28T14:05:00Z"),
      { name: "notify", run_attempt: 1, conclusion: "failure", steps: [{ name: "Post release note", conclusion: "failure" }] }] });
    const runs = [run({ conclusion: "failure" })];
    expect((await lastUpload(runs, jobs, NAMES))!.id).toBe(123);
    expect(await uncertainUpload(runs, jobs, NAMES)).toBeNull();
  });

  it("an upload that failed after starting is uncertain until a later one is confirmed", async () => {
    const runs = [run({ conclusion: "failure" })];
    const jobs = jobsFrom({ 123: [uploadJob(1, "uncertain", "2026-09-28T14:05:00Z")] });
    expect((await uncertainUpload(runs, jobs, NAMES))!.run.id).toBe(123);
    expect(await lastUpload(runs, jobs, NAMES)).toBeNull();
    const resolved = jobsFrom({ 123: [uploadJob(1, "uncertain", "2026-09-28T14:05:00Z")], 124: [uploadJob(1, "uploaded", "2026-09-28T16:05:00Z")] });
    expect(await uncertainUpload([...runs, run({ id: 124, updated_at: "2026-09-28T16:10:00Z" })], resolved, NAMES)).toBeNull();
  });

  it("a pre-upload gate that skipped the upload step is not uncertain", async () => {
    const jobs = jobsFrom({ 123: [{ name: NAMES.job, run_attempt: 1, conclusion: "failure", steps: [
      { name: "Require configuration", conclusion: "failure", started_at: "2026-09-28T14:00:00Z", completed_at: "2026-09-28T14:01:00Z" },
      { name: NAMES.step, conclusion: "skipped", started_at: null, completed_at: null }] }] });
    expect(await uncertainUpload([run({ conclusion: "failure" })], jobs, NAMES)).toBeNull();
  });

  it("each app names its own upload job and step", async () => {
    const lakina = { job: "upload", step: "Archive, sign, verify and upload internally" };
    const jobs = jobsFrom({ 123: [{ name: "upload", run_attempt: 1, conclusion: "success", completed_at: "2026-09-28T14:05:00Z",
      steps: [{ name: lakina.step, conclusion: "success", started_at: "2026-09-28T14:00:00Z", completed_at: "2026-09-28T14:05:00Z" }] }] });
    expect((await lastUpload([run()], jobs, lakina))!.id).toBe(123);
    expect(await lastUpload([run()], jobs, NAMES)).toBeNull();
  });
});

describe("vendoring", () => {
  const body = "export const core = 1;\n";

  it("records a digest and tells current, outdated, edited and foreign files apart", () => {
    const file = vendored(body);
    expect(check(file, body)).toBe("current");
    expect(check(file, "export const core = 2;\n")).toBe("outdated");
    expect(check(file.replace("core = 1", "core = 3"), body)).toBe("edited");
    expect(check(body, body)).toBe("not-vendored");
  });

  it("refuses an unknown action or a missing file argument", () => {
    expect(vendorRun("print", "x", () => body)).toBe(1);
    expect(vendorRun("write", undefined, () => body)).toBe(1);
  });
});
