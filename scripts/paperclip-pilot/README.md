# Paperclip pilot

An opt-in, two-host execution pilot. Pinned Paperclip `2026.1012.0` owns the queue, run
lifecycle, sessions, Codex JSONL parser and dashboard. These scripts only bind each Paperclip
agent to one host, admit runs on measured subscription quota, bound and prove the end of every
model process, and report state. Morpheus keeps claims, review, CI and merge. Nothing here
dispatches work automatically or touches a consumer repository. Design and rationale:
[`docs/paperclip-pilot-design.md`](../../docs/paperclip-pilot-design.md);
architecture boundary: [`architecture.md` §7.14](../../architecture.md).

| File | Runs on | Role |
|---|---|---|
| `pilot.mjs` | controller | Operator CLI: launcher, enroll, stage, health, status, stop, remove, nonce tasks |
| `worker.py` | controller | Paperclip `codex_local` command. Resolves agent → host, reserves the account, relays one turn |
| `supervisor.py` | each host | Foreground run owner: binding, quota admission, slot, deadline, cleanup, receipt |
| `quota.mjs` | each host | One fresh read through Morpheus's `nativeQuota` (`dist/cd/quota-reader.js`) |
| `worker-instructions.md` | each host | Installed as the workspace `AGENTS.md`; neutral, no project lessons |
| `inventory.example.json` | — | Shape of the private inventory. Placeholders only |

The real inventory is private and operator-owned: `~/.local/share/morpheus-paperclip/inventory.json`
(or `MORPHEUS_PAPERCLIP_INVENTORY`), mode 600, never in a workspace or this repository.

## Command interface

Every `pilot.mjs` command is read-only unless `--apply` is given.

```sh
P="node scripts/paperclip-pilot/pilot.mjs"     # --inventory PATH to override
$P launcher --apply              # write the launcher named by inventory.launcher (Paperclip's adapter command)
$P enroll [--apply]              # find/create the company; create or adopt one agent per host;
                                 # refuse binding drift; restrict hire/skill/assign permissions
$P stage HOST [--apply] [--replace-instructions]
                                 # create the controller cwd and host workspace, install AGENTS.md,
                                 # copy supervisor.py + quota.mjs, write the host config (with the
                                 # AGENTS.md digest). A different AGENTS.md is kept and exits 1.
$P agent-config HOST             # the exact agent creation body
$P host-config HOST              # the exact host config
$P test-environment HOST         # Paperclip's executable/cwd check only — not readiness
$P health [--hosts]              # controller health; host status (remote only with --hosts)
$P status [HOST...]              # slots, quarantine, last receipts, account reservations
$P list                          # company agents with their bound host
$P nonce-task HOST [--apply]     # one artifact task with a fresh nonce
$P verify-artifact HOST REL NONCE  # read the artifact back on the host; exit 0 only on an exact match
$P create-task HOST TITLE FILE [--apply]   # a bounded task (e.g. a rendered evaluation prompt)
$P stop HOST [--apply]           # pause the agent: no new runs
$P resume HOST [--apply]
$P cancel-run RUN_ID [--apply]   # Paperclip run cancellation; the host stops on stdin EOF
$P reconcile                     # re-check held account reservations against host receipts
$P remove HOST [--apply]         # terminate the agent (history kept), retire its id, unbind it
```

Setup order: write the inventory → `launcher --apply` → `enroll --apply` → `stage HOST --apply`
for each host → `health --hosts` → `nonce-task HOST --apply` → `verify-artifact`. Enrollment
must precede staging because the host config carries the agent id. Re-running any step is safe.

`worker.py` is invoked by Paperclip as `LAUNCHER exec --json … -` with the prompt on stdin.
`supervisor.py --config HOST.json (run | status | reconcile RUN_UUID)`.
`quota.mjs --reader /abs/dist/cd/quota-reader.js --codex /abs/codex` prints
`{observedAt, source, windows:[{id, usedPercent, resetsAt}]}` or a fixed category and exit 1.

Exit codes: the model's own code after a verified end; `75` refused before any model process
(binding, arguments, instructions digest, slot, quota, account reservation); `78` configuration
or binding refused; `124` stopped (deadline, cancel, controller connection lost, signal, meter)
with termination verified; `125` termination unknown — the slot is quarantined. The last stderr
line is `MORPHEUS_PAPERCLIP_RECEIPT {…}`; full receipts are in the host's `stateDir/receipts/`.

## What each run guarantees

- **Binding.** `PAPERCLIP_AGENT_ID` must match exactly one inventory host; the envelope's host and
  agent must match the host config. Model, effort, workspace-write sandbox and stdin prompt are
  enforced; bypass, profile, provider, `-C`, `--search` and any other override are refused, not
  dropped. Enrollment never edits a drifted agent: remove it and enroll a new one. Never repoint
  or resume an agent across hosts.
- **Credentials.** The model environment is built from nothing plus `PAPERCLIP_*`. `CODEX_HOME`,
  provider keys and session files never move; each host uses its own existing Codex login. The
  run token travels only inside the stdin envelope — never argv, logs, receipts or the prompt.
- **Quota.** Before launch the host reads its own account through `nativeQuota` (which already
  requires `ordinaryUsageAllowed`). Every reported window needs a configured limit; stale,
  undated, failed or unrecognised telemetry refuses. A run is admitted only while
  `used + (other in-flight runs × reservePp) < stopAt` for every window, and a running meter stops
  it at `hardAt` or on an unknown read. Provider telemetry lags, so this narrows overshoot; it
  cannot make it zero — keep `hardAt` below the real ceiling. **Window ids carry no duration**: the
  native accounts here report only `primary`, and it is the weekly window. Configure every id with
  the conservative weekly limits.
- **Accounts.** Reservations are atomic per inventory `accountId` (a controller-side flock).
  Give hosts that share a real account the same `accountId`; distinct ids (the example's `controller-native`
  and `second-native`) are counted independently. A reservation whose run cannot be shown finished stays
  held until `reconcile` proves it.
- **Termination.** Each model process carries a run-owner marker; cleanup freezes, terminates and
  kills exactly the census-identified processes and passes only when a later census finds none.
  The slot lock is inherited by the model, so a crashed supervisor cannot free a slot under a live
  model. A slot whose last run cannot be shown ended is quarantined until a census proves it.
  A process that scrubs its environment escapes the census — a stated limit, not a guarantee.
- **Instructions.** The host config carries the digest of the staged `AGENTS.md`; a run refuses
  if the model-writable workspace copy changed.
- **Attribution.** Receipts record run, host, account, `requested` model/effort and
  `observed: unknown` — `codex exec --json` does not name the model that served the turn, so it
  is never inferred from the request.

## Operating rules

- **Trust boundary.** The reverse tunnel (`127.0.0.1:<tunnelPort>` on the remote → controller
  `127.0.0.1:3100`, `ExitOnForwardFailure=yes`) exists only while a run is live, but it reaches the
  **local-trusted board**, not a token-scoped endpoint: anyone acting as the remote user can use it.
  It is limited to the two authorized hosts and accounts and to dedicated artifact and evaluation
  tasks. Do not extend it to another machine or account, or dispatch real project work through
  it, before an authenticated, private-network deployment of Paperclip is qualified.
- **Acceptance.** A worker's `done` comment, a zero exit or a green run is not acceptance. The
  operator reads the artifact back (`verify-artifact`) and the host receipt.
- **No blind retry of manual wakeups.** Paperclip's wakeup idempotency key did not prevent
  duplicate synthetic runs in the pilot. After an uncertain wakeup, read the agent's runs and
  issues first; never resend.
- **Controller restart.** Upstream's process adapter did not adopt an in-flight run after a hot
  restart and left it shown as running. After any controller restart, run `status` and
  `reconcile`, and cancel stale runs explicitly; the host side has already stopped on stdin EOF.
- **`test-environment`** checks only that the launcher is executable and the cwd exists, because
  the command's basename is not `codex`. A real nonce task is the readiness probe. Paperclip's
  test-drive asks for an API key even for Codex; do not use it for enrollment.

## Stop and remove

Pause: `stop HOST --apply`. Cancel a live run: `cancel-run RUN_ID --apply` (the host stops on
EOF). Retire an agent: `remove HOST --apply`, then a fresh `enroll --apply` creates a new id.
Teardown: stop the Paperclip controller process, then delete `~/.local/share/morpheus-paperclip/`
on the controller and the staged `host/`, `host-state/` and workspace directories on each host.
No other state exists; Codex logins and sessions on each host are untouched.

## Capability matrix

| Capability | Status |
|---|---|
| Bounded artifact task on each host through Paperclip | Second host qualified by a nonce artifact read back; controller host blocked on model/subscription selection (pending) |
| Credentials and sessions stay host-local | By construction; fixture-tested |
| Quota admission and running meter on native telemetry | Fixture-tested; live reads only on enrolled hosts |
| Deadline, cancel, stdin-loss and crash cleanup with proof | Fixture-tested with sleeping processes |
| Cross-host slot and account contention | Per-account flock; no distributed scheduler |
| Controller restart adoption | **Not qualified** — upstream leaves a stale running run |
| Wakeup idempotency | **Not qualified** — duplicates observed |
| Served model/effort attribution | **Unknown** — requested only |
| Cross-account failover or mid-task migration | **Not qualified**; never implied |
| Simulator, Xcode or CI resources on the hosts | **Not qualified**; out of scope |
| Consumer repository coding tasks | **Not enabled**; needs workspace sync and review integration |
| Untrusted hosts or a non-loopback board | **Not allowed** until authenticated deployment |
