import { describe, expect, it } from "vitest";
import { applyPostResumeAcceptance, after, postResumeAcceptance, postResumeExecutionFingerprint, releasePostResumeExecution } from "../../src/cd/state.js";
import { hash } from "../../src/cd/schema.js";
import { GitHubStore } from "../../src/cd/store.js";
import { FakeGitHub } from "./fake-github.js";
import { now } from "./fixtures.js";
import { optionalFixture } from "./post-resume-fixtures.js";
async function setup() {
  const f = optionalFixture(), api = new FakeGitHub(), store = new GitHubStore(api, f.cfg); await store.initialize(now, "epoch");
  await store.transact("seed", "synthetic-current-baseline", now, state => { Object.assign(state, { ...f.before, transitions: state.transitions }); return null; }); api.calls = [];
  return { ...f, api, store };
}
describe("normal closed post-resume origin API", () => {
  it("uses one normal CAS journal, exact read-only replay, and refuses a changed payload under the stable purpose", async () => {
    const f = await setup(), result = await applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, () => after(now, 0.001));
    const before = await f.store.read(); expect(result.replayed).toBe(false); expect(result.result.kind).toBe("post-resume-origin-v1"); expect(result.result).not.toHaveProperty("fenceBinding");
    expect(before.state.intents[result.result.intentId]!.attempts).toEqual([]); f.api.calls = [];
    const replay = await applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, () => after(now, 20));
    expect(replay.replayed).toBe(true); expect(replay.result).toEqual(result.result); expect(f.api.calls.filter(call => call.method !== "GET")).toEqual([]);
    await expect(applyPostResumeAcceptance(f.store, f.cfg, "staging", { ...f.origin, sourceReviewRef: "synthetic:different-review" }, f.qualification, () => now)).rejects.toThrow("exact original payload");
    expect((await f.store.read()).state).toEqual(before.state);
  });
  it("deduplicates concurrent origin writers without a second supplemental intent or purpose", async () => {
    const f = await setup(), results = await Promise.all([1, 2].map(() => applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, () => now)));
    expect(results.map(result => result.replayed).sort()).toEqual([false, true]); const state = (await f.store.read()).state;
    expect(Object.keys(state.postResumeAcceptances!)).toHaveLength(1); expect(Object.keys(state.intents)).toEqual([f.intentId]);
  });
  it.each([-1, 0, 1])("origin five-minute plan boundary at %+d ms", async delta => {
    const f = await setup(), clock = () => new Date(Date.parse(now) + 300_000 + delta).toISOString();
    if (delta <= 0) expect((await applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, clock)).replayed).toBe(false);
    else { await expect(applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, clock)).rejects.toThrow(); expect(Object.keys((await f.store.read()).state.postResumeAcceptances ?? {})).toEqual([]); }
  });
  it("does not let exact replay bypass current configuration identity", async () => {
    const f = await setup(); await applyPostResumeAcceptance(f.store, f.cfg, "staging", f.origin, f.qualification, () => now);
    await expect(applyPostResumeAcceptance(f.store, { ...f.cfg, deadlines: { ...f.cfg.deadlines, wakeMinutes: 99 } }, "staging", f.origin, f.qualification, () => now)).rejects.toThrow("readback differs");
  });
  it.each([-1, 0, 1])("execution-release evidence expiry at %+d ms", delta => {
    const f = optionalFixture(true); f.attempt.workflowTerminalAt = now; f.attempt.quiescence = { kind: "host-terminated", ref: "synthetic:exact-owned-quiescence", observedAt: now };
    const proof = { fingerprint: postResumeExecutionFingerprint(f.state, f.identity), qualifiedAt: now, expiresAt: after(now, 1), quiescenceDigest: hash(f.attempt.quiescence), authorityClosureDigest: hash("closed-actors"), evidenceRef: "synthetic:current-authority-closure" };
    const clock = new Date(Date.parse(proof.expiresAt) + delta).toISOString();
    if (delta < 0) { releasePostResumeExecution(f.state, f.identity, proof, clock); expect(Object.keys(postResumeAcceptance(f.state, f.state.intents[f.intentId]!)!.releases)).toEqual([f.attemptId]); }
    else expect(() => releasePostResumeExecution(f.state, f.identity, proof, clock)).toThrow("expired or changed");
  });
});
