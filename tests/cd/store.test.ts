import { describe, expect, it } from "vitest";
import { GitHubStore, pages, type GitHubApi } from "../../src/cd/store.js";
import { FakeGitHub } from "./fake-github.js";
import { config, now, prepared } from "./fixtures.js";
import { claimUpload } from "../../src/cd/state.js";

describe("GitHub single-parent CAS ledger", () => {
  it("initializes once, protects both refs and retains an independent recovery marker", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch");
    expect(api.refs.get("heads/morpheus-cd-state")).toBe(api.refs.get("heads/morpheus-cd-state-backup")); expect(api.refs.has("tags/morpheus-cd-state-initialized")).toBe(true);
    expect(api.calls.filter(call => call.method === "PUT").map(call => call.body)).toEqual([1, 2].map(() => ({ required_status_checks: null, enforce_admins: true, required_pull_request_reviews: null, restrictions: null, allow_force_pushes: false, allow_deletions: false })));
    api.refs.delete("heads/morpheus-cd-state"); await expect(store.read()).rejects.toThrow("missing"); await expect(store.initialize(now, "other")).rejects.toThrow("already exists");
  });
  it("rejects concurrent siblings and recomputes pure transitions without lost work", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch"); let evaluations = 0;
    const add = (id: string) => store.transact(id, "add", now, state => { evaluations++; state.fences.count = (state.fences.count ?? 0) + 1; return state.fences.count; });
    await Promise.all([add("one"), add("two")]); const snapshot = await store.read();
    expect(snapshot.state.fences.count).toBe(2); expect(Object.keys(snapshot.state.transitions).sort()).toEqual(["initialize-epoch", "one", "two"]); expect(evaluations).toBe(3);
    const writes = api.calls.filter(call => call.method === "POST" && call.path.endsWith("git/commits")).slice(1); expect(writes.every(call => (call.body as { parents: string[] }).parents.length === 1)).toBe(true);
    expect(Object.keys(api.trees.get(snapshot.tree)!).sort()).toEqual(["events/initialize-epoch.json", "events/one.json", "events/two.json", "state.json"]);
  });
  it("finds lost acknowledgment even after another writer advances the head", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch");
    api.loseNextAcknowledgment = true; api.afterLostAcknowledgment = async () => { await store.transact("later", "later", now, state => { state.fences.later = 1; return "later"; }); };
    const result = await store.transact("first", "first", now, state => { state.fences.first = 1; return "first"; });
    expect(result.result).toBe("first"); expect(result.replayed).toBe(false); expect(result.state.fences).toEqual({ first: 1, later: 1 });
    const replay = await store.transact("first", "ignored", now, () => { throw new Error("must not re-evaluate an applied transition"); }); expect(replay.replayed).toBe(true); expect(replay.result).toBe("first");
  });
  it("authorizes exactly one of simultaneous identical upload claim IDs", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch"); const fixture = prepared();
    await store.transact("seed", "fixture", now, state => { Object.assign(state, { ...fixture.state, transitions: state.transitions }); return null; });
    let externalCalls = 0;
    const caller = async () => { const result = await store.transact(`upload-claim-${fixture.attemptId}`, "claim-upload", now, state => claimUpload(state, config(), fixture.upload, now)); if (!result.replayed) externalCalls++; return result; };
    const results = await Promise.all([caller(), caller()]); expect(externalCalls).toBe(1); expect(results.map(result => result.replayed).sort()).toEqual([false, true]);
    expect((await store.read()).state.transitions[`upload-claim-${fixture.attemptId}`]!.owner).toMatch(/^[a-f0-9-]{36}$/);
  });
  it("does not execute side effects inside a failed pure transition", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch"); const before = api.refs.get("heads/morpheus-cd-state");
    await expect(store.transact("refused", "refused", now, state => { state.fences.changed = 1; throw new Error("invariant"); })).rejects.toThrow("invariant"); expect(api.refs.get("heads/morpheus-cd-state")).toBe(before); expect((await store.read()).state.fences).toEqual({});
  });
  it("reads and updates actual state JSON larger than the Contents API 1 MiB limit", async () => {
    const api = new FakeGitHub(), store = new GitHubStore(api, config()); await store.initialize(now, "epoch");
    const large = "x".repeat(1_100_000); await store.transact("large-evidence-reference", "large", now, () => large);
    const snapshot = await store.read(); expect(snapshot.state.transitions["large-evidence-reference"]!.result).toHaveLength(1_100_000); expect(Buffer.byteLength(JSON.stringify(snapshot.state))).toBeGreaterThan(1_048_576);
    await store.transact("after-large", "after", now, state => { state.fences.after = 1; return null; }); expect((await store.read()).state.fences.after).toBe(1); expect(api.calls.some(call => call.path.includes("contents/state.json"))).toBe(false);
  });
  it("follows every page instead of mistaking the first hundred for absence", async () => {
    const calls: string[] = [], api: GitHubApi = { async request<T>(_method: string, path: string): Promise<T> { calls.push(path); return (path.endsWith("page=1") ? Array.from({ length: 100 }, (_, id) => ({ id })) : [{ id: 100 }]) as T; } };
    expect((await pages<{ id: number }>(api, "repos/example/app/pulls?state=closed")).at(-1)).toEqual({ id: 100 }); expect(calls).toHaveLength(2);
  });
});
