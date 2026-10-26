import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFile, spawn } from "node:child_process";
import { githubToken, probeGitHubToken } from "../../src/cd/github-token.js";
import { cd } from "../../src/cd/cli.js";
import { GhApi } from "../../src/cd/store.js";
import { hash } from "../../src/cd/schema.js";
import { financeFixture } from "./source-finance-fixtures.js";
import { now } from "./fixtures.js";

vi.mock("../../src/cd/github-token.js", () => ({ githubToken: vi.fn(() => { throw new Error("Unexpected token route"); }), probeGitHubToken: vi.fn(() => { throw new Error("Unexpected token probe"); }) }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof import("node:child_process")>(), execFile: vi.fn(() => { throw new Error("Unexpected child"); }), spawn: vi.fn(() => { throw new Error("Unexpected spawn"); }) }));
const dirs: string[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(GhApi.prototype, "request").mockRejectedValue(new Error("Unexpected provider route")); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected fetch"); })); });
afterEach(async () => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); await Promise.all(dirs.splice(0).map(p => rm(p, { recursive: true, force: true }))); });
async function setup() {
  const f = await financeFixture(1, 350_000_000, state => { state.budget.spentMicros = 44_232_828; state.budget.reservations.legacy = { digest: hash("unknown"), maximumMicros: 238_515_115, status: "reserved" }; });
  const dir = await mkdtemp(join(tmpdir(), "cd-spending-policy-")); dirs.push(dir); const config = join(dir, "config.json"), request = join(dir, "request.json");
  await writeFile(config, JSON.stringify(f.cfg)); await writeFile(request, JSON.stringify({ purpose: "production Firebase rollout and repair CI" }));
  vi.spyOn(GhApi.prototype, "request").mockImplementation(<T>(method: string, path: string, body?: unknown) => f.api.request<T>(method, path, body));
  const argv = ["budget", "--operation", "spend-as-needed", "--config", config, "--campaign", "fixture-campaign", "--cap-micros", "350000000", "--authorization-ref", "human:fixture-no-holds"];
  return { ...f, config, request, argv };
}
describe("audited spending policy CLI", () => {
  it("opts in through normal CAS, reports zero holds and reserves/replays the original request", async () => {
    const f = await setup(), before = (await f.store.read()).state;
    expect(await cd(f.argv, {})).toBe(0); const first = (await f.store.read()).state;
    expect(first.budget.reservations).toEqual(before.budget.reservations); expect(first.budget.spentMicros).toBe(44_232_828);
    expect(Object.values(first.transitions).at(-1)?.result).toEqual(first.budget.spendingPolicy);
    const { transitions: actualTransitions, ...actualRest } = first, { transitions: oldTransitions, ...oldRest } = before;
    expect(actualRest).toEqual({ ...oldRest, budget: { ...before.budget, spendingPolicy: first.budget.spendingPolicy } });
    expect(Object.keys(actualTransitions)).toHaveLength(Object.keys(oldTransitions).length + 1);
    expect(first.configurationDigest).toBe(before.configurationDigest); expect(first.epoch).toBe(before.epoch);
    expect(await cd(f.argv, {})).toBe(0); expect((await f.store.read()).state).toEqual(first);
    const reserve = ["budget", "--operation", "reserve", "--config", f.config, "--id", "original-mixed", "--request", f.request, "--maximum-micros", "5000000"];
    expect(await cd(reserve, {})).toBe(0); const reserved = (await f.store.read()).state;
    expect(reserved.budget.reservations["original-mixed"]).toEqual({ digest: hash({ purpose: "production Firebase rollout and repair CI" }), maximumMicros: 5_000_000, status: "reserved" });
    expect(await cd(reserve, {})).toBe(0); expect((await f.store.read()).state).toEqual(reserved);
    expect(await cd(["status", "--config", f.config], {})).toBe(0);
    const output = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0] as string);
    expect(output.budgetStatus).toMatchObject({ mode: "spend-as-needed", internalHeldMicros: 0, remainingMicros: 305_767_172, unsettledOperationCount: 2, remainingIsProviderBalance: false });
  });
  it.each([["status"], ["github-token"], ["worker"], ["budget", "--help"], ["budget", "--operation", "reserve"], ["budget", "--operation", "settle"]].map(command => ({ command })))("rejects policy flags on incompatible command $command before provider reads", async ({ command }) => {
    await expect(cd([...command, "--campaign", "fixture", "--config", "/missing"], {})).rejects.toThrow("only valid for explicit budget spend-as-needed"); expect(GhApi.prototype.request).not.toHaveBeenCalled();
    for (const effect of [githubToken, probeGitHubToken, execFile, spawn, fetch]) expect(effect).not.toHaveBeenCalled();
  });
  it.each(["0", "-1", "1.5", "9007199254740992", "NaN"])("rejects invalid cap %s before ledger actions", async value => {
    const f = await setup(); const args = [...f.argv]; args[args.indexOf("--cap-micros") + 1] = value;
    await expect(cd(args, {})).rejects.toThrow(); expect(f.api.calls).toEqual([]);
  });
  it("does not allow extra operation inputs to widen the opt-in", async () => {
    const f = await setup(); await expect(cd([...f.argv, "--id", "unexpected"], {})).rejects.toThrow("does not accept --id"); expect(f.api.calls).toEqual([]);
    await expect(cd([...f.argv, "--authority", "/missing", "--authority-digest", "a".repeat(64)], {})).rejects.toThrow("Reviewed source authority"); expect(f.api.calls).toEqual([]);
  });
});
