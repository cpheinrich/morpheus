import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cd } from "../../src/cd/cli.js";
import { GhApi, GitHubStore } from "../../src/cd/store.js";
import { FakeGitHub } from "./fake-github.js";
import { config, source } from "./fixtures.js";

const directories: string[] = [];
afterEach(async () => { vi.restoreAllMocks(); await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true }))); });
async function setup() {
  const cfg = config(), api = new FakeGitHub(), store = new GitHubStore(api, cfg), now = new Date().toISOString();
  await store.initialize(now, "epoch");
  await store.transact("source", "source", now, state => { state.sources = [source("a", 0, now)]; return null; });
  vi.spyOn(GhApi.prototype, "request").mockImplementation(api.request.bind(api));
  vi.spyOn(console, "log").mockImplementation(() => {});
  const directory = await mkdtemp(join(tmpdir(), "cd-request-")); directories.push(directory);
  const path = join(directory, "cd.json"); await writeFile(path, JSON.stringify(cfg));
  return { api, store, argv: ["request", "--config", path, "--channel", "production"] };
}
describe("explicit source-age waiver requests", () => {
  it("persists the human authorization and exact verified source without changing cadence", async () => {
    const { store, argv } = await setup(), authorization = "codex://threads/approved-campaign";
    expect(await cd([...argv, "--validation", "--source", "a".repeat(40), "--source-age-waiver", authorization])).toBe(0);
    const state = (await store.read()).state, intent = Object.values(state.intents)[0]!;
    expect(intent.source).toBe("a".repeat(40)); expect(intent.state).toBe("pending"); expect(intent.validation).toBe(true);
    expect(intent.sourceAgeWaiver).toEqual({ authorizationRef: authorization, grantedAt: intent.createdAt });
    expect(state.evaluatedSlots).toEqual({}); expect(state.cursors).toEqual({});
  });
  it.each([
    ["--source", "a".repeat(40)], ["--validation"],
    ["--validation", "--source", "f".repeat(40)],
  ])("refuses an unscoped or unverified request before ledger mutation: %j", async (...flags) => {
    const { store, argv } = await setup(), before = await store.read();
    await expect(cd([...argv, ...flags, "--source-age-waiver", "codex://threads/approved-campaign"])).rejects.toThrow();
    expect((await store.read()).head).toBe(before.head); expect((await store.read()).state.intents).toEqual({});
  });
  it("retains production age for validation without an explicit waiver", async () => {
    const { store, argv } = await setup(); await cd([...argv, "--validation", "--source", "a".repeat(40)]);
    const intent = Object.values((await store.read()).state.intents)[0]!;
    expect(intent.state).toBe("waiting"); expect(intent.sourceAgeWaiver).toBeUndefined();
    expect(Date.parse(intent.eligibleAt!) - Date.parse(intent.selectedMainEnteredAt)).toBe(24 * 60 * 60 * 1000);
  });
});
