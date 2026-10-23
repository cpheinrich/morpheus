# Two-host Paperclip pilot — 2026-10-23

The bounded artifact/decision pilot works on the MacBook Pro and Zoe's Mac mini. It uses pinned
Paperclip 2026.1012.0 for assignment, queues, sessions, run records and dashboard, with a Morpheus
wrapper for native subscription admission and host process ownership. Both workers use their own
existing Codex login. No provider credentials or sessions were transferred between hosts.

## Live acceptance

| Check | Evidence / result |
|---|---|
| MacBook nonce | MOR-1, run `a58450fd-8097-4c29-ab0e-af61d42e844a`: succeeded; task done; exact file readback |
| Mac mini nonce | MOR-2, run `8b395579-6c12-43c6-84eb-514d4811ddcf`: succeeded; task done; exact remote file readback |
| Automatic placement | Two consecutive `create-task auto` assignments selected different hosts; runs `3ad2dd8e-40b4-43e4-879e-33236333ac4d` and `eda302a8-925d-41e1-8c64-7badab7a7be9` succeeded, with exact nonce readbacks |
| Historical decisions | 24/24 runs succeeded with done tasks, verified host termination and fresh sessions; all artifacts read back independently |
| Native allowance | Fresh account reads on both hosts before each run; one slot/account reservation per host; all reservations and slots clear at acceptance |
| Queue serialization | Three simultaneous no-model process-adapter runs completed serially without overlap |
| Remote interruption | Four actual SSH/macOS synthetic-tree drills passed: stdin loss, hard deadline, contention, supervisor SIGKILL followed by reconciliation; parent, detached child and grandchild identities checked absent |
| Dashboard | Opened and visually inspected the running dashboard, showing both real workers, task progress and completed run records |

The first MacBook launches failed because global Codex CLI 0.154.0 rejected the requested model.
A pilot-only install of CLI 0.163.0, matching the mini, fixed the failure. The global CLI was
preserved. Failures remain in the run history. Source fixtures also found and fixed a receipt
placeholder that hid orphans and a symlink-path entry guard that silently skipped verification.

The synthetic SSH drill used supervisor digest
`7633d4aed00c2987caeac1dd0dc1ee3414da46ab1c4d1b27807bca207069c0e3`.
It proves that process tree's containment on the actual host; it does not prove provider-side
cancellation. Detailed local evidence remains under `~/.local/share/morpheus-paperclip/evidence/`
and `drills/`. Host provisioning is recorded in
[agent-host-setup PR #10](https://github.com/cpheinrich/agent-host-setup/pull/10).

## Historical result

Independent review found two substantive gaps: quota reads inherited account overrides that the
model stripped, and the enrolled identity omitted remote route/account/workspace fields. Both
were corrected and regression-tested (54 focused tests). Quota admission and meter helpers now
use the same native environment as execution; registered fingerprints are checked before account
reservation and against the staged host configuration before quota launch.

Legacy agents were explicitly retired, preserving their history. New agents
`06e34c9a-684a-44d7-b1c8-fec1ce2b0bc1` and `91556fcd-b4ea-4a7e-8930-a9f4c7c94c52`
then completed fresh exact nonce tasks in runs `4189b965-ec4a-4bfc-9e88-ec37387a8987` and
`ba29727f-b9c7-480f-8b93-73cf1b47c3c8`. Both central task/run records and host termination
receipts passed; both were paused again with empty reservations and free, non-quarantined slots.
There are now30 verified real artifact/decision completions. The original historical result rows
below remain unchanged; repeating those decisions would add cost without testing either fix.

The [frozen result ledger](../qa/evals/agent-stack/pilot-results-2026-10-23.json) retains each
decision, evidence ids, run/task identity, prompt/output digests, requested model/effort,
termination and fresh-session evidence.

| Condition | Development | Execution holdout | Harmful choices |
|---|---:|---:|---:|
| Concise baseline | 7/7 | 5/5 | 0 |
| Role policy + tagged lessons | 7/7 | 5/5 | 0 |

There are no paired improvements or regressions. **No accuracy benefit is measurable here.**
This is a known-lesson delivery/regression screen, not evidence that the org design saves
iterations. The designers had read the incidents; the execution holdout is not blind. Both arms
received identical case evidence, neutral workspace instructions, the same requested
`gpt-6.1-sol`/`medium`, and fresh sessions. The serving model/effort are explicitly unknown
because the CLI stream does not attest them. No historical implementation was replayed.

## Limits and next qualification

- A live controller hot restart initially reported the real CLI adopted, but the CLI exited 101
  after producing its artifact. The upstream backstop marked run
  `376bcc43-4f4c-4a10-9b36-5d56288218f5` interrupted. A generic process-adapter drill was not
  adopted either. Pause and drain before maintenance; reconcile partial outcomes before retry.
- Repeating a manual wakeup with the same idempotency key created another synthetic run.
  An uncertain dispatch requires readback, never a blind resend.
- The loopback reverse tunnel reaches Paperclip's local-trusted board. This pilot is limited
  to the two authorized hosts and dedicated artifact/decision workspaces. Authenticated private
  deployment and scoped access must be qualified before consumer repository work.
- Native account grouping is explicit in the private inventory; automatic account identity
  deduplication, dynamic model optimization, cross-account continuation and simulator/CI
  capacity management are not qualified. Existing iOS VM infrastructure remains separate.
- Setup is one command for a configured host. Native sign-in, verified SSH, base development
  tools and the quota-reader runtime are prerequisites; new owners' subscriptions cannot be
  provisioned by copying another person's credentials.

Both workers were paused after acceptance, with timers disabled and no in-flight work. The
controller remains available for inspection. Use the [operator guide](../scripts/paperclip-pilot/README.md)
for setup, resuming bounded tasks, stopping and teardown. The next-ten-task prospective criteria
are in the [design](paperclip-pilot-design.md#what-to-measure-next).
