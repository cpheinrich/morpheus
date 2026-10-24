import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cd } from "../../src/cd/cli.js";
import { run } from "../../src/cli/run.js";
import { githubToken, probeGitHubToken } from "../../src/cd/github-token.js";
import { credentials } from "../../src/credentials/index.js";
import { dispatch } from "../../src/cli/dispatch.js";
import { execFile, execFileSync, exec, execSync, spawn, spawnSync, fork } from "node:child_process";
import { hash } from "../../src/cd/schema.js";
import { GhApi } from "../../src/cd/store.js";
import { financeFixture } from "./source-finance-fixtures.js";
import { now } from "./fixtures.js";

vi.mock("../../src/cd/github-token.js", () => ({ githubToken: vi.fn(() => { throw new Error("Unexpected token route"); }), probeGitHubToken: vi.fn(() => { throw new Error("Unexpected token probe"); }) }));
vi.mock("../../src/credentials/index.js", () => ({ credentials: vi.fn(() => { throw new Error("Unexpected credentials route"); }) }));
vi.mock("../../src/cli/dispatch.js", () => ({ dispatch: vi.fn(() => { throw new Error("Unexpected non-CD dispatch"); }) }));
vi.mock("node:child_process", async importOriginal => ({ ...await importOriginal<typeof import("node:child_process")>(), execFile: vi.fn(() => { throw new Error("Unexpected execFile"); }), execFileSync: vi.fn(() => { throw new Error("Unexpected execFileSync"); }), exec: vi.fn(() => { throw new Error("Unexpected exec"); }), execSync: vi.fn(() => { throw new Error("Unexpected execSync"); }), spawn: vi.fn(() => { throw new Error("Unexpected spawn"); }), spawnSync: vi.fn(() => { throw new Error("Unexpected spawnSync"); }), fork: vi.fn(() => { throw new Error("Unexpected fork"); }) }));

const directories: string[] = [];
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(now); vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(GhApi.prototype, "request").mockRejectedValue(new Error("Unexpected provider route")); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected fetch"); })); });
afterEach(async () => { vi.restoreAllMocks(); vi.clearAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
function expectNoExternalEffects() {
  for (const route of [githubToken, probeGitHubToken, credentials, dispatch, execFile, execFileSync, exec, execSync, spawn, spawnSync, fork, fetch]) expect(route).not.toHaveBeenCalled();
}
async function setup(amount = 17_000_000, ceiling = 275_000_000) {
  const f = await financeFixture(amount, ceiling), directory = await mkdtemp(join(tmpdir(), "cd-source-finance-")); directories.push(directory);
  const configPath = join(directory, "config.json"), grantPath = join(directory, "grant.json"), requestPath = join(directory, "request.json");
  await Promise.all([writeFile(configPath, JSON.stringify(f.cfg)), writeFile(grantPath, JSON.stringify(f.grant)), writeFile(requestPath, JSON.stringify(f.request))]);
  const apiSpy = vi.spyOn(GhApi.prototype, "request").mockImplementation(<T>(method: string, path: string, body?: unknown) => f.api.request<T>(method, path, body));
  const argv = ["budget", "--operation", "reserve", "--config", configPath, "--id", f.input.reservationId, "--request", requestPath, "--maximum-micros", String(amount), "--authority", grantPath, "--authority-digest", f.input.approvedGrantDigest];
  return { ...f, directory, configPath, grantPath, requestPath, apiSpy, argv };
}
const pair = ["--authority", "/missing-grant.json", "--authority-digest", "a".repeat(64)];

describe("public CD source grant grammar and file inputs", () => {
  it.each([[17_000_000, 275_000_000], [65_000_000, 325_000_000]])("executes actual parser/config/files/store for generic amount %i and ceiling %i", async (amount, ceiling) => {
    const f = await setup(amount, ceiling); expect(await run(["cd", ...f.argv])).toBe(0);
    const state = (await f.store.read()).state, transition = state.transitions[`budget-reserve-${f.input.reservationId}`]!.result;
    const output = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0] as string);
    expect(output.result).toEqual(transition); expect(output.result.maximumMicros).toBe(amount); expect(output.result.envelope.authority.grant.totalCeilingMicros).toBe(ceiling);
    expect(output.verifiedReadbackHead).toBe((await f.store.read()).head); expect(f.apiSpy).toHaveBeenCalled();
    expect(state.budget.reservations[f.input.reservationId]).toEqual({ digest: hash(output.result.envelope), maximumMicros: amount, status: "reserved" });
    expect(state.budget.spentMicros).toBe(240_000_000);
  });
  it.each([[], ["--help"], ["config"], ["init"], ["tick"], ["quota"], ["request"], ["status"], ["verify-execution"], ["claim-upload"], ["record-upload"], ["upload-hook"], ["record"], ["worker"], ["github-token"], ["github-token", "--revoke"], ["budget", "--help"], ["budget", "extra"]].map(command => ({ command })))("rejects authority before early exits or effects for $command", async ({ command }) => {
    const spy = vi.spyOn(GhApi.prototype, "request");
    await expect(cd([...command, ...pair, "--config", "/missing-config.json", "--operation", "reserve"], {})).rejects.toThrow("only valid for explicit budget reserve");
    expect(spy).not.toHaveBeenCalled(); expect(console.log).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each([["--authority", "/missing"], ["--authority-digest", "a".repeat(64)]].map(flag => ({ flag })))("requires the complete pair before help/token paths: $flag", async ({ flag }) => {
    await expect(cd(["github-token", "--help", "--revoke", ...flag], {})).rejects.toThrow("both --authority and --authority-digest"); expect(console.log).not.toHaveBeenCalled(); expect(GhApi.prototype.request).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each([["--help"], ["credentials", "--help"], ["config"], ["pm", "claim", "fake-item"], ["init"]].map(command => ({ command })))("rejects authority before non-CD public CLI paths: $command", async ({ command }) => {
    await expect(run([...command, ...pair])).rejects.toThrow("only valid for cd budget reserve"); expect(console.log).not.toHaveBeenCalled();
    await expect(run([...command, "--authority=/missing"])).rejects.toThrow("only valid for cd budget reserve");
    await expect(run([...command, `--authority-digest=${"a".repeat(64)}`])).rejects.toThrow("only valid for cd budget reserve");
    expect(GhApi.prototype.request).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each([["--operation", "settle"], ["--help"], ["--actual-micros", "1"], ["--source", "a".repeat(40)], ["--executor", "local"]].map(extra => ({ extra })))("refuses a source flag on incompatible budget invocation $extra", async ({ extra }) => {
    const f = await setup(); await expect(cd([...f.argv, ...extra], {})).rejects.toThrow("Reviewed source"); expect(f.apiSpy).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each(["grant", "request"])("requires a finite %s JSON file rather than stdin", async name => {
    const f = await setup(), argv = [...f.argv]; argv[argv.indexOf(name === "grant" ? "--authority" : "--request") + 1] = "-";
    await expect(cd(argv, {})).rejects.toThrow("require JSON files"); expect(f.apiSpy).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
  it.each(["syntax", "digest", "request-drift", "unknown-grant-field", "native-config-cap"])("refuses actual file/config input %s without ledger writes", async kind => {
    const f = await setup();
    if (kind === "syntax") await writeFile(f.grantPath, "{invalid JSON");
    if (kind === "digest") await writeFile(f.grantPath, JSON.stringify({ ...f.grant, grantId: "changed-before-load" }));
    if (kind === "request-drift") await writeFile(f.requestPath, JSON.stringify({ ...f.request, fullCiMax: 999 }));
    if (kind === "unknown-grant-field") await writeFile(f.grantPath, JSON.stringify({ ...f.grant, privateBypass: true }));
    if (kind === "native-config-cap") await writeFile(f.configPath, JSON.stringify({ ...f.cfg, budget: { ...f.cfg.budget, togetherLimitUsd: 251 } }));
    await expect(cd(f.argv, {})).rejects.toThrow(); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]); expectNoExternalEffects();
  });
  it("uses the original pinned file snapshots when files drift during provider reads", async () => {
    const f = await setup(), original = f.api.request.bind(f.api); let first = true;
    f.api.request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
      if (first) {
        first = false;
        await Promise.all([writeFile(f.grantPath, JSON.stringify({ ...f.grant, maximumMicros: 1 })), writeFile(f.requestPath, JSON.stringify({ ...f.request, fullCiMax: 999 })), writeFile(f.configPath, JSON.stringify({ ...f.cfg, repository: "other/repository" }))]);
      }
      return original<T>(method, path, body);
    };
    expect(await cd(f.argv, {})).toBe(0);
    const output = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0] as string);
    expect(output.result.envelope.request).toEqual(f.request); expect(output.result.envelope.authority.grant).toEqual(f.grant);
    expect(JSON.parse(await readFile(f.requestPath, "utf8")).fullCiMax).toBe(999);
    expect(f.api.calls.every(call => call.path.startsWith("repos/example/app/"))).toBe(true);
  });
  it("retains native reserve and settlement behavior with authority flags absent", async () => {
    const f = await setup(), request = { ordinary: "native request without source schema" };
    await writeFile(f.requestPath, JSON.stringify(request));
    const argv = ["budget", "--config", f.configPath, "--id", "native-fixture", "--operation", "reserve", "--request", f.requestPath, "--maximum-micros", "1000000"];
    expect(await cd(argv, {})).toBe(0);
    expect((await f.store.read()).state.budget.reservations["native-fixture"]).toEqual({ digest: hash(request), maximumMicros: 1_000_000, status: "reserved" });
    expect(await cd(["budget", "--config", f.configPath, "--id", "native-fixture", "--operation", "settle", "--actual-micros", "23"], {})).toBe(0);
    expect((await f.store.read()).state.budget.reservations["native-fixture"]).toEqual({ digest: hash(request), maximumMicros: 1_000_000, status: "settled", actualMicros: 23 });
    expect((await f.store.read()).state.budget.spentMicros).toBe(240_000_023);
  });
  it("retains help and configuration early exits when authority flags are absent", async () => {
    const f = await setup(); expect(await cd(["--help"], {})).toBe(0); expect(await cd(["config", "--config", f.configPath], {})).toBe(0); expect(f.apiSpy).not.toHaveBeenCalled();
  });
  it("preserves native JSON-input error precedence with authority absent", async () => {
    const f = await setup(); await writeFile(f.requestPath, "{invalid JSON");
    await expect(cd(["budget", "--operation", "reserve", "--config", f.configPath, "--id", "native-fixture", "--request", f.requestPath], {})).rejects.toBeInstanceOf(SyntaxError);
    expect(f.apiSpy).not.toHaveBeenCalled(); expectNoExternalEffects();
  });
});
