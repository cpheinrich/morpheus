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

The collaboration runner refused a fresh reviewer because its session capacity
was full. A fresh native read-only Codex CLI session then failed at startup with
an unsupported configured model, before any reviewer source/tool turn. The
explicitly authorized fresh Opus subscription fallback used the existing
codex-claude bridge: run `729eabd8-6883-48bb-b813-58e5f4674bc2`, fresh reviewer
session `55b0730d-841b-4834-8e84-fa136b89ddf9`. No billing/auth/config was changed.
The reviewer performed one high-risk initial source review, including isolated
synthetic Darwin process experiments, and returned conditional clearance C1.
Its runner result reports `duration_ms: 605201`; there was no follow-up turn.

Fresh Opus subscription review conditionally cleared the quota reader. F2's substantive supervisor-death orphan and F1's minor Darwin permission polling were fixed under C1 with a real process regression and two additional killed mutants; F3's minor lease-anchor margin is deferred to MO-26-10-20-07.44.41. Final focused checks pass; native foreground behavior and runtime adoption remain separate operational gates.

F2 was a real source defect: two private roots from this author's interrupted or
mutated offline fixtures had survived their supervisors. Fresh PID, parent,
group, birth and exact task/fixture argv checks confirmed each was the sole
member of its own synthetic group; only those two roots were removed. No live
worker/model guardian/service was signalled. The corrected private leader checks
its supervisor before launching and while polling, then kills its own live
group if orphaned. The required real test kills only its new synthetic supervisor
and confirms group absence within one second. Restoring the infinite loop
causes that test to fail. F1 now polls post-reap EPERM until the existing two-second
bound, with unit cases for eventual absence and persistent permission response.

C1 evidence: typecheck passed; the same four focused files passed 75 tests
(seven Python syscall cases inside the process fixture); compile and PM index
passed. Source/dist reader helpers compare equal. Both model guardian copies
retain SHA-256 `f140e2a4d022e24de4d6df6a743e19ae0df918e3979957f074adfbcfe1104d77`.
`pgrep -f 'quota-reader.py --group'` returned exit 1 with no output after the
focused run. The two additional killed mutants are retained privately at
`/tmp/quota-reader-review-mutants-01a1591a.json`, SHA-256
`f8599f281db6092ed653c78baf7e2db026b0950f1749e559ae82216a1d8648b9`.
Changes follow C1's exact source/generated/test/documentation paths, plus the
new deferred-finding roadmap item permitted by the review runbook. The TypeScript
deadlines, model guardian, policy TTL, existing leases and live runtime stay as
reviewed.

```morpheus-review
{
  "version": 2,
  "base": "c90de86caffefc47857388e92b8441ad216edd96",
  "reviewed": "939c933b3fdbafbd7eff5fca1b3ffd1d5186f821",
  "covered": "c09cc0e7c2df6aee94e8b6d0d38b8904c3a830be",
  "authorSession": "01a1591a-d9b3-7890-b35a-93c8ae2a15d7",
  "reviewerSession": "claude-code/55b0730d-841b-4834-8e84-fa136b89ddf9",
  "risk": "high",
  "elapsedMinutes": 10.086683333333333,
  "timing": {
    "source": "runner",
    "durationMs": 605201,
    "evidence": "Claude Code result event for reviewer session 55b0730d-841b-4834-8e84-fa136b89ddf9, bridge run 729eabd8-6883-48bb-b813-58e5f4674bc2: duration_ms=605201. Retained at /tmp/morpheus-quota-review-full-result-01a1591a.json."
  },
  "outcome": "complete",
  "summary": "Fresh Opus subscription review conditionally cleared the quota reader. F2's substantive supervisor-death orphan and F1's minor Darwin permission polling were fixed under C1 with a real process regression and two additional killed mutants; F3's minor lease-anchor margin is deferred to MO-26-10-20-07.44.41. Final focused checks pass; native foreground behavior and runtime adoption remain separate operational gates.",
  "findings": [
    {
      "id": "QR-F2",
      "severity": "substantive",
      "description": "Reviewer F2: the private leader ignored TERM and waited forever if its supervisor died before final group KILL, including the parent fuse or interrupted offline fixtures.",
      "paths": [
        "src/cd/quota-reader.py",
        "src/cd/quota-reader.ts"
      ],
      "disposition": "fixed",
      "response": "Applied C1 only: retain the supervisor PID before the configured reader, poll while parent identity matches, and self-KILL the still-live private group on orphaning. Two old roots were positively verified as this task's sole-member synthetic fixture roots before removal. Added the real supervisor-death regression and documented the behavior; no live service/model guardian or TypeScript deadline changed.",
      "condition": {
        "paths": [
          "src/cd/quota-reader.py",
          "dist/cd/quota-reader.py",
          "tests/cd/quota-reader-process.test.ts",
          "tests/cd/quota-reader.test.ts",
          "docs/cd-v2-controller.md",
          "architecture.md",
          ".agent/worklog/2026-10-20-bound-quota-reader.md"
        ],
        "evidence": "C1: capture getppid before reader start; poll only while it matches, then os.killpg(0,SIGKILL) while root remains live. Preserve cleanup signal order/bounds, main bounds, TS constants and guardian. Real offline supervisor SIGKILL must yield group ESRCH within1s; restoring while True must fail. Run typecheck, four focused files, compile, source/dist py cmp, guardian SHA f140e2a4..., and pgrep -f quota-reader.py --group must return no roots after removing the two verified existing synthetic roots. F1 post-reap EPERM polling may be fixed within these paths with eventual-absence and persistent-EPERM-at2s cases."
      },
      "conditionMet": "PASS: new real offline supervisor-death test confirms ESRCH within1s; restored while True mutant fails, and post-reap permission mutant fails. Final four focused files pass75tests including7Python syscall cases; typecheck/compile/pmindex/diffcheck pass. src/dist quota-reader.py cmp exits0; both guarded-run.py SHA256 remain f140e2a4d022e24de4d6df6a743e19ae0df918e3979957f074adfbcfe1104d77; pgrep exits1 with no output. No signal-order/main/TS/guardian changes. Additional mutant JSON SHA f8599f281db6092ed653c78baf7e2db026b0950f1749e559ae82216a1d8648b9."
    },
    {
      "id": "QR-F1",
      "severity": "minor",
      "description": "Reviewer F1: Darwin post-reap killpg(0) can report EPERM for zombie-only members; returning unknown immediately can create a spurious admission or metering failure.",
      "paths": [
        "src/cd/quota-reader.py"
      ],
      "disposition": "fixed",
      "response": "Under C1, catch PermissionError only in the observation-after-reap branch and poll within the existing2s deadline. Unit cases prove EPERM then absence succeeds, while persistent EPERM refuses exactlyat2s with only TERM/KILL real signals. Before-reap permission failure remains unknown."
    },
    {
      "id": "QR-F3",
      "severity": "minor",
      "description": "Reviewer F3: lease anchoring before admission consumes more of the existing guardian-to-lease margin when quota startup approaches60s; a loaded timeout completion may lose its ownership fence.",
      "paths": [
        "src/cd/worker.ts"
      ],
      "disposition": "deferred",
      "roadmap": "MO-26-10-20-07.44.41",
      "response": "Filed a named P2 follow-up for a separately claimed lease-anchor/CAS regression. The current repair preserves the reviewed worker/lease/guardian policy and adds no deadline grace. Exact runtime adoption remains held for quiet-host operational review; this source clearance does not certify the worst-case completion margin."
    }
  ]
}
```
