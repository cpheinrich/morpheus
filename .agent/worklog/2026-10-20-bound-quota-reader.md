---
roadmap: MO-26-10-20-07.06.38
---
# Bound native quota reader startup and cleanup

The source-only diagnosis is preserved privately at
`/tmp/evo-native-quota-timeout-diagnosis-01a1572f.md`, SHA-256
`fc52e7fc9309ffd15e308eba286ab5c94e06dc15c067b58de4c368b8b0d327c8`.
It found repeated successful low-usage measurements followed by generic timeouts,
not evidence of capacity exhaustion. The 10-second caller bound included native
version checking and two complete shim config-reader lifecycles before the actual
quota server. Internal phase latency was not retained, so load/startup attribution
remains an inference. No live quota/model probe was made.

The implementation retains fresh explicit ordinary eligibility, the five-minute
TTL and the 30-second nonoverlap/checkpoint rule. Active read is bounded to 60
seconds, with final RPC at most 10 seconds within it. Stderr is consumed and
discarded; diagnostics contain fixed phase and elapsed time only. Success waits
for reader cleanup and completion-time freshness/expiry validation. Failure
checkpoints immediately, without waiting for cleanup grace.

The existing model guardian is unchanged. Reusing it would not provide a small
global cleanup bound: repeated census retry limits and last-census fallback are
different semantics. A quota-only supervisor instead retains an unreaped private
group leader through the last signal. Darwin synthetic fixtures exposed EPERM
when signalling a zombie-only group after TERM; the private leader therefore
stays live through TERM and is killed by the final group KILL. Configured reader
children retain normal signal behavior. Only the new reader foreground group is
targeted; no census or process-name sweep occurs. Cleanup is two seconds, with a
three-second parent fuse; uncertain identity/cleanup never supplies quota.
The trusted configured reader must not detach from that session.

Initial tests caught a malformed delayed-protocol fixture and JSON whitespace
coupling in the control channel. The fixture was corrected and the bounded
supervisor-only control status is parsed structurally. The initial test process
was stopped after that fixture error; no live worker was signalled.

Task claim used its own author session and worktree. The required exact-worktree
graph check reported a missing index/stale global CLI receipt. Per the explicit
source-only scope, no global CLI/device bootstrap was performed. Verified primary
graph evidence and exact source were used; no completeness claim is made for the
new helper. No consumer/runtime installation, native app edits, live account/
model/provider request, or host/service/lease/session/state mutation was made.

Validation: `pnpm typecheck` passed. The focused command
`pnpm exec vitest run tests/cd/native-worker.test.ts tests/cd/quota-reader.test.ts tests/cd/quota-reader-process.test.ts tests/cd/worker.test.ts`
passed all 74 tests in four files, including five Python syscall cases in the
reader-process fixture. The real offline configured-chain cases exercise a
10.2-second startup, two MiB of stderr backpressure, and an exited reader with
a foreground descendant while an unrelated synthetic model group stays alive.
No native account or model was invoked. `pnpm compile` passed and copies the
new helper through the existing Python build-copy rule.

Eleven targeted guard mutations were killed: startup and RPC bounds, strict
ordinary allowance, stderr draining, completion-time clock, cleanup confirmation,
deadline equality before timer delivery, meter nonoverlap, unreaped root
reservation, cleanup bound and PGID identity. The private result is
`/tmp/quota-reader-mutants-01a1591a.json`. Tests assert exact values and transitions;
the process fixture deliberately rejects uncertain/reused groups without another
real signal. No full suite was run locally because this is scoped CD code.

The source PR remains draft with auto-merge off pending its fresh independent
review, final CI and the separately held root source merge gate. Source clearance
will not establish native-binary foreground behavior or authorize adoption in
the frozen worker runtime; that requires later quiet-host operational review.
