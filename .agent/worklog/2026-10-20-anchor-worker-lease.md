---
roadmap: MO-26-10-20-07.44.41
---
# Anchor worker leases after quota admission

This source-only task resolves PR #435's deferred minor finding F3 from actual
merged base `24ba8b1a909bbe994d46b3d8a1b5abdf96f53276`. The timeout diagnosis
remains private at `/tmp/evo-native-quota-timeout-diagnosis-01a1572f.md`, SHA-256
`fc52e7fc9309ffd15e308eba286ab5c94e06dc15c067b58de4c368b8b0d327c8`.
No native account/model probe, app-source edit, runtime/host installation or live
service, worker, guardian, lease, session, provider or state mutation occurred.

Each CAS transition recomputes a fresh post-admission clock for ownership checks,
lease expiry and invocation start. Measured quota must still qualify there and
immediately before spawn after the claim acknowledgment and awaited setup. The
returned lease must name this invocation/fence and have strictly more time than
the configured agent duration. Failure uses only existing fenced unstarted
cleanup; a replacement owner is preserved. Claims are never renewed or extended.
Transaction event timestamps retain request-time semantics. Original task,
source, slot, debt, deadline policy and cursors are preserved.

The lease remains `agentMinutes + 2`, guardian execution stays 45 minutes by
default, quota TTL stays five minutes and monitoring stays nonoverlapping every
30 seconds. Claim writes/acknowledgments and subsequent process setup/teardown
consume that margin. This change supplies no universal completion/quiescence
wall-clock bound and does not repair pre-existing guardian cleanup behavior.
Source landing does not authorize adoption in the frozen consumer runtime; that
requires a separate quiet-host operational review.

The new tests use repair state prepared through real domain transitions, GitHubStore CAS,
nonforce single-parent FakeGitHub writes, the synthetic native login/model ABI
and the unchanged real Python guardian. Only Date is virtual. Quota latency is
modeled in the fake reader; additional login/admission elapsed time is injected
at the claim boundary, and read/write/conflict/ACK delays at actual API edges.
The 45-minute boundary case reads the actual guardian argv and advances virtual
worker time; it is not a real 45-minute execution/timeout or native-host proof.
Tests assert exact start/expiry/event times, protected state identity, equality
boundaries, resets/staleness, CAS retries/replay, competing owners and absence of
spawn on refusal. The initial typecheck caught optional snapshot-time typing and
incorrect state-field assertions; those were corrected before final checks.

Validation: `pnpm typecheck` passed. The focused command
`pnpm exec vitest run tests/cd/native-worker.test.ts tests/cd/worker.test.ts`
passed all 72 tests in two files (15.91 seconds). This covers the changed worker
and its direct native/direct-worker callers; no local full suite was run because
CD is outside designated shared core. `pnpm compile`, `pnpm morpheus pm index`
and `git diff --check` passed; only worker JS/map are regenerated.

All ten targeted mutations were killed by relevant assertion failures, not
transform errors: original early anchor, cached CAS clock, claim quota guard,
self/other expiry equality, post-ACK quota guard, execution-headroom equality,
returned owner/fence guard, fenced error cleanup and lease margin. Private
results: `/tmp/worker-lease-mutants-01a1591a.json`, SHA-256
`83d841e7659d1629b1d64007eaf32455fcf725413b89f879364c80c375b3a0e1`; failure logs are
retained beside it. The source was restored before final checks. Quota-reader
TS/Python, model guardian, schema, package/lock and configuration are unchanged.
Both model guardian copies retain SHA-256
`f140e2a4d022e24de4d6df6a743e19ae0df918e3979957f074adfbcfe1104d77`.

The nearest graph is primary `Users-chrisheinrich-code-morpheus`, ready with
8,318 nodes / 24,599 edges; its supplied 14:06:34 generation predates merged D.
Verify-tier positive runWorker/caller/callee evidence and path coverage have no
recorded gaps for the relevant files, but do not establish completeness/current
source. Exact D/task source is authoritative; the new worktree has no own index.
No reindex, global CLI/config or device change was performed for this task.

The PR stays draft, auto-merge off and unmerged until the root source gate.
Fresh independent source review cleared the exact source head; final CI is pending.


The collaboration runner had no free session slot (including a pending host
session). The existing delegation bridge was inspected: its old completed quota
review belongs to another worktree and was not resumed. Codex had 71% allowance,
above the user's 30% routing threshold. One fresh native Codex CLI read-only
session used `--ignore-user-config`; actual new thread
`01a159fc-ece2-73b2-a2af-fd43feeb38a8` reviewed only this task. The reviewer did not
spawn subagents, rerun unchanged tests, edit files or perform live effects. MCP
startup warnings did not prevent the review. GitHub was inaccessible inside its
read-only sandbox, so it inspected the saved PR body/metadata and source packet;
the author performs the final actual GitHub readback. There was one high-risk
initial turn, no findings or follow-ups, with 30-minute ceiling and measured
101,071 ms including startup/tools/completion (not the reviewer's estimate).

Fresh native Codex source review cleared the worker lease correction with no findings. The reviewer inspected CAS retries/replay, quota expiry, returned lease headroom, fenced cleanup, generated output and all ten mutation logs. Final CI and quiet-host runtime adoption remain separate gates.

```morpheus-review
{
  "version": 2,
  "base": "24ba8b1a909bbe994d46b3d8a1b5abdf96f53276",
  "reviewed": "4aaac171d3819c78bc50c48ed11dee97998391f2",
  "covered": "4aaac171d3819c78bc50c48ed11dee97998391f2",
  "authorSession": "01a1591a-d9b3-7890-b35a-93c8ae2a15d7",
  "reviewerSession": "01a159fc-ece2-73b2-a2af-fd43feeb38a8",
  "risk": "high",
  "elapsedMinutes": 1.6845166666666667,
  "timing": {
    "source": "clock",
    "durationMs": 101071,
    "evidence": "Fresh native Codex CLI invocation, thread 01a159fc-ece2-73b2-a2af-fd43feeb38a8, captured startedAt 2026-10-20T15:45:09.691810Z and endedAt 2026-10-20T15:46:50.762898Z; measured 101071 ms including startup, tools and completion. Private timing /tmp/worker-lease-review-native-01a1591a.timing.json; exit 0."
  },
  "outcome": "complete",
  "summary": "Fresh native Codex source review cleared the worker lease correction with no findings. The reviewer inspected CAS retries/replay, quota expiry, returned lease headroom, fenced cleanup, generated output and all ten mutation logs. Final CI and quiet-host runtime adoption remain separate gates.",
  "findings": []
}
```
