import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cd } from "../../src/cd/cli.js";
import { canonical } from "../../src/cd/schema.js";
import { repairDiagnosticSchema } from "../../src/cd/repair-diagnostic.js";
import { GhApi, GitHubStore } from "../../src/cd/store.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now } from "./fixtures.js";
import { diagnosticFixture } from "./repair-diagnostic-fixtures.js";

const directories: string[] = [];
beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(GhApi.prototype, "request").mockRejectedValue(new Error("Unexpected provider request")); vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Unexpected fetch"); })); });
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const fixture = diagnosticFixture(), cfg = config(), api = new FakeGitHub(), store = new GitHubStore(api, cfg);
  await store.initialize(now, "epoch"); await store.transact("seed", "synthetic-fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
  const directory = await mkdtemp(join(tmpdir(), "cd-repair-diagnostic-")); directories.push(directory);
  const configPath = join(directory, "config.json"), evidencePath = join(directory, "evidence.json");
  await writeFile(configPath, JSON.stringify(cfg)); await writeFile(evidencePath, JSON.stringify(fixture.input));
  vi.spyOn(GhApi.prototype, "request").mockImplementation(<T>(method: string, path: string, body?: unknown) => api.request<T>(method, path, body)); api.calls = [];
  return { ...fixture, api, store, directory, configPath, evidencePath, argv: ["record", "--kind", "repair-diagnostic", "--config", configPath, "--evidence", evidencePath] };
}

describe("public repair-diagnostic command", () => {
  it("runs the actual parser, bounded file reader, normal store and verified content event", async () => {
    const f = await setup(); await f.store.transact("large-prior-note", "synthetic-prior-note", now, () => "x".repeat(100_000));
    const before = await f.store.read(); expect(await cd(f.argv, {})).toBe(0);
    const output = JSON.parse(vi.mocked(console.log).mock.calls.at(-1)![0] as string), final = await f.store.read();
    const parsed = repairDiagnosticSchema.parse(JSON.parse(await readFile(f.evidencePath, "utf8")));
    const golden = createHash("sha256").update(canonical(parsed), "utf8").digest("hex");
    expect(output.result).toEqual({ workId: f.workId, taskDigest: f.input.taskDigest, intentId: f.intentId, attemptId: f.attemptId, diagnosticId: golden });
    expect(output.replayed).toBe(false); expect(output.targetCurrent).toBe(true); expect(output.verifiedReadbackHead).toBe(final.head);
    expect(Object.keys(output).sort()).toEqual(["eventId", "eventOwner", "head", "replayed", "result", "targetCurrent", "verifiedReadbackHead"]);
    expect(output.eventId).toBe(`repair-diagnostic-${golden}`); expect(output.eventOwner).toBe(final.state.transitions[output.eventId]!.owner); expect(Buffer.byteLength(JSON.stringify(output))).toBeLessThan(2048);
    const expected = structuredClone(before.state); expected.agents[f.workId]!.evidence.push(canonical(f.input)); expected.transitions = final.state.transitions;
    expect(final.state).toEqual(expected); expect(fetch).not.toHaveBeenCalled(); expect(f.api.calls.every(call => /\/git\//.test(call.path))).toBe(true);
  });
  it.each([["--source", "a".repeat(40)], ["--maximum-micros", "1"], ["--executor", "local"], ["--work-id", "other"], ["--invocation-id", "other"], ["--source-dir", "/tmp"], ["--help"]])("refuses incompatible flags before effects: %s", async (...extra) => {
    const f = await setup(); await expect(cd([...f.argv, ...extra], {})).rejects.toThrow(/Repair diagnostic/); expect(f.api.calls).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["worker", "tick", "init", "github-token", "status"])("requires the explicit record command before the %s route", async command => {
    const f = await setup(); await expect(cd([command, ...f.argv.slice(1)], {})).rejects.toThrow("explicit record command"); expect(f.api.calls).toEqual([]);
  });
  it.each(["stdin", "empty", "too-large", "invalid-json", "invalid-utf8", "unknown-field", "funding"])("refuses bounded input failure %s before provider access", async kind => {
    const f = await setup(), argv = [...f.argv];
    if (kind === "stdin") argv[argv.indexOf("--evidence") + 1] = "-";
    if (kind === "empty") await writeFile(f.evidencePath, "");
    if (kind === "too-large") await writeFile(f.evidencePath, " ".repeat(16_385));
    if (kind === "invalid-json") await writeFile(f.evidencePath, "{invalid JSON");
    if (kind === "invalid-utf8") await writeFile(f.evidencePath, Buffer.from([0xff]));
    if (kind === "unknown-field") await writeFile(f.evidencePath, JSON.stringify({ ...f.input, instruction: "start worker" }));
    if (kind === "funding") await writeFile(f.evidencePath, JSON.stringify({ ...f.input, maximumMicros: 1 }));
    await expect(cd(argv, {})).rejects.toThrow(); expect(f.api.calls).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it("admits an actual 16384-byte file and refuses the next byte before provider access", async () => {
    const f = await setup(), json = JSON.stringify(f.input), text = json + " ".repeat(16_384 - Buffer.byteLength(json));
    expect(Buffer.byteLength(text)).toBe(16_384); await writeFile(f.evidencePath, text); expect(await cd(f.argv, {})).toBe(0);
    f.api.calls = []; await writeFile(f.evidencePath, text + " ");
    await expect(cd(f.argv, {})).rejects.toThrow("1..16384 bytes"); expect(f.api.calls).toEqual([]);
  });
  it.skipIf(process.platform === "win32")("rejects an unopened FIFO through the compiled CLI without blocking or provider calls", async () => {
    const f = await setup(), fifo = join(f.directory, "diagnostic.fifo"), marker = join(f.directory, "provider-called");
    execFileSync("mkfifo", [fifo]);
    await writeFile(join(f.directory, "gh"), '#!/bin/sh\nprintf provider > "$RD_PROVIDER_SENTINEL"\nexit 97\n', { mode: 0o700 });
    const argv = [...f.argv]; argv[argv.indexOf("--evidence") + 1] = fifo;
    const child = spawn(process.execPath, [fileURLToPath(new URL("../../dist/cli/index.js", import.meta.url)), "cd", ...argv], { env: { ...process.env, PATH: f.directory, RD_PROVIDER_SENTINEL: marker }, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "", deadlineHit = false;
    child.stdout.on("data", bytes => { stdout += String(bytes); }); child.stderr.on("data", bytes => { stderr += String(bytes); });
    const deadline = setTimeout(() => { deadlineHit = true; child.kill("SIGTERM"); }, 2000);
    const fuse = setTimeout(() => child.kill("SIGKILL"), 3000);
    const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => { child.once("error", reject); child.once("close", (code, signal) => resolve({ code, signal })); }).finally(() => { clearTimeout(deadline); clearTimeout(fuse); });
    expect(result).toEqual({ code: 1, signal: null }); expect(deadlineHit).toBe(false); expect(stdout).toBe("");
    expect(stderr).toContain("Repair diagnostic file must contain 1..16384 bytes");
    await expect(readFile(marker)).rejects.toMatchObject({ code: "ENOENT" });
  }, 5000);
  it.each(["failure", "quiescence"])("preserves normal %s refusal for a failed attempt", async kind => {
    const f = await setup(), argv = [...f.argv], before = await f.store.read(); argv[argv.indexOf("--kind") + 1] = kind;
    const { diagnostic: _diagnostic, workId: _workId, taskDigest: _taskDigest, ...identity } = f.input;
    await writeFile(f.evidencePath, JSON.stringify({ ...identity, kind: "host-terminated", ref: "synthetic termination evidence", processGroupAbsent: true, executorTerminated: true }));
    f.api.calls = []; await expect(cd(argv, {})).rejects.toThrow("Attempt is no longer current"); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]); expect((await f.store.read()).state).toEqual(before.state);
  });
});
