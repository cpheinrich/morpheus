# Factory

General-purpose agent delegation: either Claude Code or Codex can coordinate, and it fans
out to workers — native Claude/Codex, or pooled subscriptions behind a sub2api gateway.
A persistent Codex task can coordinate Claude Code, and a Claude Code session can
coordinate Codex (see [Claude coordinating Codex](#claude-coordinating-codex)). This package is optional and **off
by default**. Cloning Morpheus, installing its CLI, and scaffolding projects do not install
or activate it.

## Status: experimental, off unless this machine opts in

- **Repository-owned status.** `release` in `src/config.mjs` marks Factory `experimental`
  with default mode `off`. The plugin manifests say so, and `bridge.mjs doctor` reports
  `factory: { status, mode, enabled }` for this machine.
- **Personal installs only.** `node scripts/install.mjs` is the only installer. On the machine
  it runs on, it registers `factory@personal` in your own Codex personal marketplace and
  `factory@factory-local` at Claude Code user scope. Nothing distributes it: `morpheus init`,
  the device bootstrap, `self install`/`self update`/`self ensure`, session start and cloning
  a repository never install, register or enable it (Morpheus's
  `tests/factory-distribution.test.ts` holds this). An install on one machine does nothing
  for another machine or person.
- **Installing is not enabling.** The one switch is `mode` in this machine's private
  `~/.local/share/factory/config.json`. With no file it is `off`, and the hooks exit without
  output or starting the service. `bridge.mjs enable manual|automatic` opts in and `disable`
  opts out. A reinstall or update never writes that file, except to carry an old
  `codex-claude` install's settings to a machine that has none, so a saved choice, on or off,
  survives.
- **The coordinator stays the manager.** Codex in the usual setup, or Claude Code when it holds
  the conversation, decides when to call the provider-neutral `factory_*` tools, writes a
  self-contained brief, supervises the run and verifies the result. Hooks never dispatch user
  prompts. `manual` and the legacy `automatic` value both mean model-directed delegation; the
  latter remains accepted so an installed machine does not need a settings migration.

## Where things live

- **Source, instructions, tests:** `plugins/factory/` in Morpheus. Edit this package
  and submit a reviewed Morpheus PR to change its behavior.
- **Installed source copy:** `~/plugins/factory/`, registered in your
  personal marketplace. Codex additionally maintains its own plugin cache. These are copies,
  not links to your working tree; installing an update is explicit.
- **Personal settings and bridge records:** `~/.local/share/factory/` (0700 directory,
  0600 files). `FACTORY_HOME` relocates this for testing or a separate installation.
- **Claude conversations and memories:** Claude's native store, normally `~/.claude/`.
  The bridge records the session id per Codex task and worktree; it does not merge stores.
- Nothing about your subscription, selected executor, machine paths or conversation content
  belongs in the Morpheus repository.

## Install on each execution host

Prerequisites: macOS, Node 22+, Python 3, pnpm 11, both CLIs on PATH, Codex signed in and
Claude Code signed in with `claude auth login` using your subscription. Include
`~/.local/bin` and `/opt/homebrew/bin` in the host's environment when needed.

From this package directory, explicitly run:

```sh
node scripts/install.mjs
```

The installer copies the package, installs its locked dependencies, tests it, verifies the
installed MCP servers against their exact tool-name contracts and identical provider-neutral
Factory schemas, checks that neither hook manifest dispatches prompts, and uses Codex's
bundled plugin-creator helper to register it in the personal marketplace. A contract error
lists the missing, unexpected, and observed tool names. It
preserves other marketplace entries. The helper is looked for under
`~/.codex/.tmp/plugins/.agents/skills/plugin-creator/` and the older
`~/.codex/skills/.system/plugin-creator/`; if it is elsewhere, set `CODEX_PLUGIN_CREATOR`
to its `create_basic_plugin.py` path. Installation does not choose manual or automatic
mode. Finish existing delegated runs before updating the package; restart the bridge after
an update so it loads the new source.

**Migrating from `codex-claude`** (this package's name until 2026-10-31) is part of the same
run. When the installer finds the old install it carries the old settings into
`~/.local/share/factory/config.json` (mode, limits, model and effort maps, project modes;
not `threshold`, which reversed its meaning from percent remaining to percent used and
returns to its default), restores the Claude status line the old recorder had chained,
uninstalls the old Claude plugin and marketplace, removes the old Codex plugin and its
personal-marketplace entry, and deletes `~/plugins/codex-claude`. It prints each step. It
leaves `~/.local/share/codex-claude` (old run records, safe to delete once no session that
used the old plugin is open) and the inert `hooks.state` lines for the old plugin in
`~/.codex/config.toml`, which Codex owns while it runs.

Start a new Codex task to load the installed skill/tools. Review and trust the plugin hooks
through `/hooks`; installing a plugin does not itself trust hooks. On each execution host,
start the local Codex service if needed:

```sh
codex app-server daemon start
node ~/plugins/factory/scripts/bridge.mjs doctor
node ~/plugins/factory/scripts/bridge.mjs enable manual
```

`enable automatic` is a compatibility alias for the same model-directed behavior. `disable` is a master off switch and
stops active delegated runs, retaining conversations. Disabling/uninstalling the plugin
in Codex removes its tools/hooks; existing normal workers expire when their owner lease
stops. Explicit background workers must be stopped before uninstalling.

The mode is personal to this host, not to Morpheus projects or colleagues. A project's
mode can be set under `projects` using the canonical project key returned by `inspect`.
A project or task `off` takes precedence over executor overrides. Global `off` takes
precedence over everything. No daemon is started by an off-mode hook.

## Everyday use

Ask Codex naturally:

- “Use Claude for this task.”
- “Use Codex for this task.”
- “Use the Factory for this larger implementation.”
- “Keep this quick answer local.”
- “Stop Claude.”
- “Show Claude's live output.”

When the root calls `factory_delegate`, Factory selects a pooled gateway while its account is below the threshold
(**90% used** by default), picking the gateway with the most headroom; once every gateway
is at or above the threshold the other provider's native subscription is used. **A gateway of the
coordinator's own provider counts:** it is a separate subscription reached as an API, so a
Claude session can hand work to the Claude behind a gateway and a Codex task to the Codex
behind one. The only route never taken is the coordinator's own native login, which would
be circular. An explicit executor request (“use Claude”, `operation`) prefers that
provider's gateway when one is below the threshold. With no eligible gateway, the other
provider's native subscription is used; asking for the coordinator's own provider with no such
gateway is refused because handing work to the root's own native login would be circular. This is subscription usage, not a token count for a single chat.
The coordinator still consumes its own allowance while supervising. Missing/stale usage is
reported as unknown and never treated as headroom. Existing saved thresholds are preserved
when updating the plugin; change one with `bridge.mjs config`.
Routing hooks do not replace the desktop's model engine or forcibly preempt a running
generation.

## Model-directed delegation

Both root agents discover the same six tools: `factory_inspect`, `factory_delegate`,
`factory_status`, `factory_wait`, `factory_answer` and `factory_stop`. Root identity is injected
by the MCP host, so a model cannot invent another chat's identity. Codex's per-request
`_meta.threadId` takes precedence over the legacy `CODEX_THREAD_ID` environment fallback:
desktop MCP connections may be shared or outlive the chat that launched them. A missing or
malformed identity still refuses delegation. Every run-control operation
also verifies that the run belongs to that root session.

- **Judgment and user precedence.** An explicit request to use the Factory requires delegation;
  an explicit request to keep work local prohibits it. Otherwise the root uses its normal
  sub-agent judgment: quick interactive work stays local, while a bounded larger chunk may be
  delegated. There is no separate classifier.
- **Sticky primary worker.** The first successful primary launch pins executor and gateway for
  the root session. Later gateway order or quota changes never silently switch it. An unavailable,
  removed, changed-provider or over-threshold pinned gateway refuses until it is eligible again;
  a different provider requires a new root session. Provider conversations remain scoped to one
  canonical checkout so repository instructions never leak across worktrees.
- **Fresh work.** `fresh:true` starts a separate conversation on the pinned route and never
  replaces the primary saved session. It can run concurrently only in another isolated worktree;
  one writer per checkout and `maxConcurrent` still apply.
- **Manager contract.** The root sends a self-contained brief, waits, handles only routine
  reversible clarification itself, sends authorization/spending/publishing/material decisions to
  the user, and independently verifies the result. Codex `needs_input` resumes through
  `factory_delegate` with the originating `runId`; a live Claude question uses `factory_answer`.
- **Edit guard and recursion.** While an owned worker is active, `PreToolUse` refuses the root's
  native edit tools in that checkout (Claude Code `Edit`, `Write`, `MultiEdit`, `NotebookEdit`;
  Codex `apply_patch`). Shell commands are not inspected, so this is an accidental-race guard,
  not a sandbox. Workers run with `FACTORY_DELEGATED=1`; hooks exit and MCP delegation refuses.

## Gateway mode

To delegate to pooled subscriptions behind a sub2api gateway, add a `gateways` list to the
config. Each entry names a provider, the gateway origin, and a key reference — never a raw
key:

```json
{
  "gateways": [
    { "name": "claude", "provider": "claude", "baseUrl": "http://gateway:8080", "keyRef": "env:FACTORY_CLAUDE_KEY" },
    { "name": "codex", "provider": "codex", "baseUrl": "http://gateway:8080", "keyRef": "secret:factory/codex" }
  ]
}
```

`keyRef` is `env:NAME` (an environment variable), `secret:path` (a 0600 file) or
`exec:/path/to/command arg…` (a command run without a shell, split on whitespace, whose
trimmed stdout is the value), resolved at spawn time and never logged. The `exec:` form is
how a credentials manager stays the single source of truth, for example
`exec:/opt/homebrew/bin/darwin-env get FACTORY_CLAUDE_KEY`; give the command an absolute
path, since the bridge service inherits the PATH of whichever session started it.

Quota is read from the gateway's admin API (`GET /api/v1/admin/accounts`) with an admin
login. Configure it as references too:

```json
{
  "admin": {
    "emailRef": "exec:/opt/homebrew/bin/darwin-env get FACTORY_ADMIN_EMAIL",
    "passwordRef": "exec:/opt/homebrew/bin/darwin-env get FACTORY_ADMIN_PASSWORD"
  }
}
```

Without `admin`, the service falls back to `FACTORY_ADMIN_EMAIL` and
`FACTORY_ADMIN_PASSWORD` in its own environment. That environment is the one of the
Claude or Codex session that first started the service, which is rarely the shell that
exported them (a desktop-app session exports nothing), so `env:` references and the env
fallback usually mean "quota unknown, routing native". `bridge.mjs doctor` shows each
gateway's `usedPercent`, whether it is below the threshold, whether its `keyRef` resolves,
and where the admin login came from, so a misconfiguration is visible before a delegation
is attempted.

When a gateway is selected, the bridge sets the provider overrides instead of stripping
them and skips the native sign-in check. Native mode is unchanged: it still strips
overrides and requires a `claude.ai`/ChatGPT sign-in. **A saved `claude.ai` login defeats
the Claude gateway:** with both present, the Claude CLI was observed to keep using the
saved login and fail with `401 Invalid API key` against the gateway token (and to take
over two minutes doing it), although the documented precedence says the token wins. On a
host that delegates Claude work through a gateway, run `claude auth logout`; `doctor` notes
the combination.

The selected model and effort are mapped independently at each Claude launch:

| Codex selection | Claude alias |
|---|---|
| GPT-6 Astra / GPT-5.6 Sol / GPT-5.5 | opus |
| GPT-5.6 Terra | sonnet |
| GPT-5.6 Luna | haiku |

Low/medium/high/xhigh map to their matching effort values; minimal/none map to low;
max/ultra map to max. These are configurable approximations, not claims of equivalence.
Explicit model/effort overrides take precedence, then `modelMap`.

A Codex model missing from `modelMap` — Codex ships new ones faster than this table changes;
`gpt-6.1-sol` once blocked every delegation until the user was asked to pick a Claude model —
uses `modelFallback`, default `opus`. That family alias follows whatever the installed Claude
CLI resolves it to, so no model choice is asked for. The run's `selection` (and
`claude_inspect`'s preview) records `source` (`override`, `mapped` or `fallback`), the Codex
`codexModel`, and for a fallback a `reason`, so the coordinator can report what ran. Set
`modelFallback` to another fixed model or family alias (`fable`, `sonnet`, a full id) to
change it, or to `null` to refuse unmapped models with a message naming the setting. It is
not a retry: authentication, rate-limit, permission and transport failures are reported as
they are, and an explicit model the CLI rejects still fails that run. Unsupported effort
values still fail visibly.

Any explicit model is passed through to `claude --model`: a family alias (`opus`, `sonnet`,
`haiku`, `fable`) or a full id such as `claude-fable-5-1`, from an override or from
`modelMap`. The Claude CLI is the authority on what the subscription can run: an id it does
not recognize fails that run at the first request with the CLI's own error, at no cost, and
the bridge reports it as a failed run rather than guessing a substitute. Moving aliases
(`best`, `latest`, `default`, `newest`, `auto`) are refused because they could select a
paid-credit-only model without anyone choosing it. There is no fixed allowlist: a model
released after this plugin needs no configuration change. A saved `subscriptionModels` list
from an earlier release still parses but no longer restricts anything; `doctor` says so.

Configuration is a validated JSON document. Read it with `bridge.mjs config`, edit a copy,
and apply it with `bridge.mjs config -` with `{"value": <complete configuration>}` on stdin.
Do not edit settings while a second writer is updating them. Unknown settings are rejected.

## Claude coordinating Codex

The installer also registers a Claude Code plugin (`claude-plugin/`, marketplace
`factory-local`) with a `delegate-to-codex` skill, the same `factory_*` contract (plus legacy
`codex_*` compatibility tools) and hooks, and sets a
recorder status line. Skip that half with `node scripts/install.mjs --codex-only`. The same
`mode`, `threshold` and `projects` settings govern both directions; `bridge.mjs disable` stops
both. Start a new Claude session after installing, and review its hooks.

- **Allowance.** Claude Code gives its five-hour and weekly subscription windows only to the
  status line command. `bridge.mjs statusline install` points the status line at
  `scripts/claude-statusline.mjs`, which records the windows to `claude-usage.json` and prints
  `5h N% · 7d N%`; an existing status line is kept and run through it instead
  (`statusline uninstall` restores it). A snapshot older than 20 minutes, or one with an
  expired window, is unknown and never triggers a handoff. Surfaces that do not run a status
  line (headless `-p`, possibly the desktop app) therefore stay unknown until an interactive
  terminal session records one; manual delegation still works.
- **Settings source.** Hooks record the session's working directory and permission mode from
  Claude's own hook input, its effort from `CLAUDE_EFFORT`, and its model from the latest
  assistant reply in the transcript. Until a hook has run, delegation refuses.
- **Model and effort.** `codexModelMap` maps the Claude family (fable/opus/sonnet/haiku) to an
  approved `codexModels` entry; `codexEffortMap` maps effort. Unmapped values use Codex's own
  configured default rather than a guess.
- **Permissions, never widened.** `bypassPermissions` → Codex full access
  (`--dangerously-bypass-approvals-and-sandbox`). `auto` and `acceptEdits` → the
  `workspace-write` sandbox with approvals off (writes inside the checkout, plus a linked
  worktree's Git directory; no network). `default` and `plan` → `read-only`: `default` asks
  before each edit, and Codex exec cannot ask. Any other mode refuses. Under
  `workspace-write` Codex may be unable to push or reach the network; Claude does those steps.
- **Execution.** Each handoff runs `codex exec --json` under the same guardian lease, output
  cap and run limit as Claude workers, with the prompt on stdin. The saved Codex session id is
  resumed per working directory with `codex exec resume`. Codex cannot ask mid-run, so a
  question arrives as a `needs_input` result and is answered with `factory_delegate` and
  that result's `runId`, `replySource` (`root` or `user`) and `replyReason`, within the
  same supervision budget.
  One Claude session may run multiple Codex delegations concurrently when each uses a
  different worktree. A second writer in the same working directory is refused with the
  owning run id; the global `maxConcurrent` limit still applies. `factory_inspect` lists all
  active runs and the five most recent terminal runs. Pass `runId` to wait, status or stop.
- **Subscription only.** The bridge requires `codex login status` to report a ChatGPT
  sign-in and strips `OPENAI_*`/`CODEX_API_KEY` from the worker. Paid Codex credits cannot be
  detected from `exec` output; manage that in your ChatGPT account.
- **No loops.** Both workers run with `FACTORY_DELEGATED=1`; the hooks of either plugin
  then do nothing and both MCP servers refuse to start a further delegation.

### Same-provider workers behind a gateway

When routing picks the coordinator's own provider behind a gateway, `factory_delegate`
launches that worker; the run's
`executor` and `gateway` fields say what ran.

- **A Claude worker for a Claude session** runs `claude -p` with the gateway's base URL and
  token, the session's own model and effort, and the session's own permission mode, so it is
  never wider than the coordinator. It can ask live questions; the coordinator answers them
  with `factory_answer` (`source: root` for a routine clarification, `user` to attest a real
  answer).
- **A Codex worker for a Codex task** runs `codex exec` against the gateway with the task's own
  model and effort. Its sandbox follows the task's approval policy: never-approve full access
  maps to full access, on-request to read-only.
- **Sessions are kept per checkout on the pinned route.** A root session pins executor and
  gateway once; its primary provider conversation is keyed by canonical checkout. It never
  resumes across worktrees, another gateway, or native login. A `needs_input` reply must use the
  route and run it came from.
- **Credentials stay out of the worker.** It gets only the provider's own variables; every
  variable a configured `keyRef`, `emailRef` or `passwordRef` names is removed from its
  environment, along with `FACTORY_ADMIN_*`.
- **No shared memory.** Memory sharing exports the other agent's store, so a same-provider
  worker receives none.

## Remote pool workers through Paperclip

The Codex conversation can also coordinate **remote** Claude Code and Codex workers registered
as Paperclip pool agents. Design and rationale: Morpheus
[`docs/paperclip-interactive-bridge.md`](../../docs/paperclip-interactive-bridge.md). Tools are
`pool_*` (or `bridge.mjs pool.<operation> -` with JSON on stdin when the current Codex task loaded
an older tool list): `profiles`, `start`, `status`, `wait`, `logs`, `answer`, `followup`, `stop`,
`reattach`, `reconcile`, and `recover`.

- **Shape.** One Paperclip issue is one pool conversation; each provider turn is one Paperclip
  run. Turn 1 is the issue; each follow-up is an issue comment (`resume: true`). Paperclip's
  `process` adapter runs `scripts/pool-runner.mjs` on the controller host, which claims the
  journaled turn, reserves the profile's account, and runs `scripts/pool-remote.mjs` on the
  worker over SSH (`BatchMode`, `StrictHostKeyChecking`). The host side uses this package's
  guardian, provider arguments, auth checks and event folding.
- **Ownership.** The runner's SSH stdin is the remote lease. The desktop bridge never renews it,
  so closing Codex or restarting this bridge ends nothing; `pool_reattach` resumes from the
  persisted conversation id and Paperclip log cursor. Losing the runner or SSH stops the remote
  turn; a turn whose end is not proven keeps its account reserved and workspace quarantined
  until the host proves it ended (checked automatically before the next admission). If SSH failed before the host ever admitted the turn, the
  host's reconcile writes an exclusive tombstone for that run id once it is reachable again,
  so the reservation clears and a late copy of the envelope is refused instead of launched.
- **Questions and follow-ups.** Remote Claude asks live through its permission-control stream;
  `pool_answer` follows the same rules as `claude_answer` (stale ids refused, tool permission
  needs `source: user`, autonomous replies capped by `maxSupervisionReplies`). Codex reports
  `needs_input` at the end of a turn. Follow-ups resume the same native session at a turn
  boundary only; there is no mid-turn steering, and a follow-up during an active turn is refused.
- **Admission.** `start`, `followup` and `reattach` with `retry` pass the bridge's usual gate
  for the *calling* Codex task (its id is required; the CLI supplies `CODEX_THREAD_ID`): not
  while the bridge is draining or delegation is off globally, for that task or for its project;
  only with readable live task settings; and never wider than that task's sandbox — a read-only
  task may use only `plan`/`read-only` profiles, a workspace-write or full-access task any
  profile. Unknown sandboxes or approval policies refuse. Another session may continue a
  conversation under its own authority, but not once the conversation's original task or
  project is off. `answer` needs the caller's task id and the same off checks, without a live
  snapshot; `status`, `wait`, `logs` and plain `reattach` are observation and need neither.
  Delegated workers cannot start, follow up, answer, recover or retry (CLI and MCP).
- **Paperclip disposition.** Each finished turn leaves one comment attributed to its run and an
  issue status (`done` for a completed turn, `blocked` for needs_input, refusal, failure, stop or
  loss), so Paperclip queues no missing-comment or disposition-repair runs. `done` is operational
  status only, sent once. A wake that launches nothing writes nothing to Paperclip. A follow-up
  waits until the previous status update is confirmed (or the turn's end is proven when none was
  attempted); an unconfirmed one is never re-sent, and the conversation waits or is replaced.
  Follow-ups are sent with `resume: true`. A turn runs only once Paperclip holds its exact
  submission marker. After a cancel that killed the runner, status keeps the original unknown
  termination and adds `hostTermination` once `pool.reconcile` proves the host turn ended.
- **After a stop.** A committed follow-up may be parked behind Paperclip's effective no-replay
  hold, even when its active recovery-action projection is empty. `reattach` reports that hold;
  `reconcile` proves host termination, and `recover` (with the current task id) releases only
  `legacy_execution_requires_reconciliation` for this conversation's exact worker and proven
  turn. It uses Paperclip's supported evidence API, describes possible effects as mixed, and
  continues the saved request. Foreign no-op runs, other holds and unknown termination return
  an operator-required diagnostic. No old prompt is reposted and no task success is inferred.
- **Duplicates.** Intent is journaled before any Paperclip write. An unknown creation outcome is
  never reposted automatically; `pool_reattach` observes it by an issue/comment marker, and
  `retry: true` resends with the same idempotency key / request id. Every turn has one atomic
  claim, so duplicate or recovery wakes exit without contacting a provider.
- **Credentials.** No Paperclip key, provider key, provider home or memory travels to the worker.
  The host checks its own sign-in (`claude auth status` / `codex login status`) and refuses
  otherwise. No full-access permission is offered: Claude `default`/`acceptEdits`/`plan`, Codex
  `read-only`/`workspace-write`.
- **Quota.** The host admits a turn only on a fresh read from its operator-configured native quota
  command (`{observedAt, windows: [{id, usedPercent, resetsAt}]}`, e.g. the Paperclip pilot's
  `quota.mjs` for Codex) below `stopAt` for every window, and stops it at `hardAt` or on unknown
  telemetry. Missing configured windows and duplicate window IDs refuse. No command configured
  means refused. This bridge never reads a Claude OAuth token.

Operator setup (controller and coordinator must be the same host and user in this version):

1. `~/.local/share/factory/pool.json` (0600): `controller` (`baseUrl`, `companyId`,
   optional `projectId`, `tokenFile` — a 0600 board token file outside every workspace) and
   `profiles.<name>` (`provider`, `agentId`, `account`, `host` {`transport` ssh|local, `target`,
   `node`, `bridge`, `hostConfig`}, `workspace`, `model`, `effort`, `permission`).
2. On the worker, install this package and stage `<bridge home>/pool-host.json` (0600, outside
   every workspace): `hostId`, `path`, `graceSeconds`, `maxRunSeconds`, `quota.<provider>` and
   `profiles.<name>` exactly as printed by `bridge.mjs pool-host-entry <name>`. Each workspace
   belongs to one profile, and workspaces may not contain one another. The host file and every
   workspace must be written as their canonical real paths on the host (for example
   `/private/var/…`, not `/var/…`; no symlinked workspace), and the bridge state directory must
   not overlap any workspace; anything else refuses rather than getting a second writer lock.
3. Register the Paperclip agent from `bridge.mjs pool-agent-config <name>` and put its id in the
   profile. Changing any bound field changes the binding digest: existing conversations refuse
   rather than move.

Status reports `requested` (model/effort passed to the CLI), `observed` (only what the provider
stream names: Claude's init event model; Codex exec reports none, and neither reports effort, so
those stay `unknown`) and provider-reported token `usage`, which is not subscription quota.

Runner exit codes (the Paperclip run result): 0 turn ended with verified termination, 75 refused
before any provider process, 78 binding/configuration refused, 124 stopped with verified
termination, 125 termination unknown.

## Sessions, output and supervision

Each Codex task remains a normal saved Codex conversation. The plugin associates its
working directory with a saved Claude session id and resumes it on subsequent handoffs.
It does not create a native Claude model choice inside Codex or import Claude messages as
native assistant turns. Progress and results arrive as tools and Codex commentary; a
read-only loopback viewer can display streamed text in the Codex browser panel. Claude's
own transcript retention still applies: a session deleted by Claude cannot be resumed.

For an unloaded Codex desktop task, the bridge validates active turn metadata from its
rollout, including `.jsonl.zst` compression on Node 22.15+. Earlier Node 22 releases can
read plain rollouts and report a clear runtime requirement for compressed ones. Completed, stale or restricted
turns still refuse. An unavailable rollout reports a task-metadata error; reopen that task
and send a message rather than substituting another session. `bridge.mjs doctor` reads
gateway quota independently, so healthy quota does not prove a task can delegate.

The working directory defaults to the Codex turn's actual directory. An explicit alternate
worktree must share the same canonical Git repository. Changing worktrees selects that
worktree's saved Claude conversation. Codex must wait for the Claude writer to stop before
editing the same files. The bridge prevents overlapping Claude runs per directory, limits
concurrency to two, and never replays a task automatically after a crash.

In the reverse direction, a Claude session can own multiple concurrent Codex runs in
different worktrees. Native Codex session ids, `needs_input` resumes and supervision counts
remain keyed by working directory. The bridge never permits two active writers in the same
working directory, even when both belong to that Claude session.

Claude questions return through its permission-control stream. Codex may answer routine,
reversible clarifications with a recorded reason; substantive product decisions, new
permissions, sending, publishing, spending, and destructive operations still need the user.
A tool permission is not interchangeable with a clarification. The `source: user` field
is the coordinating agent's attestation to an actual user answer, not an independent
approval UI. Structured/prose `needs_input` results resume the same conversation with its
`runId`, `replySource` and `replyReason`. Autonomous supervision is capped at eight replies by default. A genuine user answer
remains allowed at the limit and resets that autonomous budget; its audit record is retained.

Full-access/never-approval Codex turns launch Claude with `bypassPermissions`.
Full-access/on-request turns use Claude's default prompts. Restricted or unknown
sandboxes are refused in this release; there is no prompt-based sandbox emulation.
Business/repository approval rules remain part of the handoff even under full access.

## Subscription billing

The bridge verifies Claude's local authentication is `claude.ai`/`firstParty`, removes
API/provider overrides from the child environment, and rejects provider overrides in known
Claude settings files. It does not read or copy authentication tokens. There is no API-key
fallback. A reported paid-overage event stops the run. **Disable Claude extra usage in your
account if you require a hard subscription-only spending boundary:** the CLI does not
expose an atomic per-run “no overage” switch, and detecting an event cannot undo usage
already incurred. The CLI's reported dollar cost is a list-price estimate, not proof that
an API charge occurred.

## Memory sharing

Native project instruction loading remains unchanged. To enable cross-agent reads, set
`memorySharing: true` and explicitly select relevant Markdown files in
`memorySources[canonicalProjectKey].codex` and `.claude`. No whole-store scan or automatic
cross-project synchronization occurs. Each read returns at most 12 files/16,000 characters
with provenance; symlinks escaping an owner's memory store are rejected.

Sharing requires Codex's native memories to be enabled globally and for the task. Unknown
controls suppress sharing. Claude's disable environment flag or a disabled setting also
suppresses sharing. Custom Claude memory roots must be declared in its settings and files
still explicitly selected. These are read-only exports: each agent writes its own memory
through its normal workflow. With full filesystem access, ownership instructions are not
an OS write barrier. The plugin never joins the stores or rewrites AGENTS.md/CLAUDE.md.

## Cleanup and recovery

Saved chats are disk records, not idle model processes. A run has one guardian and one
Claude process group. Polling `wait` renews the owner lease; status/viewer reads do not.
After 60 seconds without an owner by default, the guardian interrupts Claude, escalates to
terminate/kill if needed, and removes descendants remaining in its owned process group.
A hard two-hour run limit and 16 MiB combined output cap apply by default. Output parsing
and displayed progress are bounded. Completed runs leave the in-memory map; the shared
bridge exits after five idle minutes.

Normal interruption and SessionEnd hooks request a stop. A Codex crash or service crash
is covered by the guardian lease. On recovery the bridge checks saved process identities
before signaling an orphan; it never kills every `claude` process or trusts a PID alone.
Unrecognized ownership blocks a replacement run. Programs that intentionally detach into
new sessions are outside process-group ownership; don't ask workers to launch persistent
servers/daemons without a separately managed lifecycle.

Background mode is opt-in for each run and survives lost leases, but still has time/output
limits and an explicit stop operation. Machine shutdown ends live processes; saved native
Claude conversations survive. Bridge records/logs contain task content, remain local and
private, and can be removed once no run is active; deleting logs does not delete native
Claude chats. There is no cross-machine history synchronization.

## Remote and compatibility boundaries

Install and enable on the machine actually executing the Codex task. Its Claude login,
filesystem and memory stores are used. Authentication on your laptop does not authenticate
the Mac mini. The remote chat displays tool progress normally; the optional loopback viewer
requires a forwarded port to open locally. No inbound network port is opened; its control
socket is local and private. Only an explicitly configured pool profile makes outbound SSH
connections, from the Paperclip-owned runner (see Remote pool workers).

Loaded tasks use the public app-server settings response. Detached desktop tasks use only
the active turn fields required by the bridge and validate that contract before delegating;
new Codex versions remain compatible while the contract is intact and fail closed when it
changes. Per-task memory control similarly checks the database schema before making a
read-only `state_5.sqlite` query because the public read response omits it. Run doctor after
updates. A reinstalled client replaces an idle earlier bridge service automatically and
refuses the upgrade while that service still owns Claude work.
Claude stream/question/resume protocol was tested with the installed Claude Code CLI.
Windows is unsupported. Linux exercises portable tests in CI but is not a desktop support
claim. A host missing authentication is reported; the plugin never copies another host's login.

## Development

```sh
pnpm install --ignore-workspace --frozen-lockfile
pnpm check
pnpm test
```

Tests use fake subprocesses and local fixtures; they do not spend model allowance. Live
subscription smoke checks are explicit and recorded in the task worklog. Dependencies:
standard MCP SDK for transport/schema compatibility, `ws` for the local app-server socket,
and Zod for validated settings/tool inputs. No Morpheus runtime dependency.

Protocol references: [Codex hooks](https://learn.chatgpt.com/docs/hooks),
[Codex memories](https://learn.chatgpt.com/docs/customization/memories),
[Claude headless mode](https://code.claude.com/docs/en/headless), and
[Claude memory](https://code.claude.com/docs/en/memory).

### Explicit unattended Codex gateway worker

A trusted host service can invoke a bounded worker without a desktop conversation:

```sh
node plugins/factory/scripts/gateway-worker.mjs --config /private/service/job.json --admission-id CALLER_UUID < /private/service/prompt.txt
node plugins/factory/scripts/gateway-worker.mjs --status ADMISSION_ID
node plugins/factory/scripts/gateway-worker.mjs --config /private/service/job.json --admission-id NEW_CALLER_UUID --resume ADMISSION_ID < /private/service/continuation.txt
```

This separate opt-in entry point currently supports **Codex through one explicitly
configured gateway**. It does not inspect a desktop identity, native account, quota or
Paperclip. Desktop permission admission and routing remain separate. No installer,
launchd job or consumer policy is added. The operator must authorize the service job
and its permissions; possession of a private configuration is its local authority.

Create an owner-only (`0600`) JSON file **outside every checkout**, in a trusted
operator-controlled directory. All fields are required; unknown fields are refused:

```json
{
  "version": 1,
  "jobId": "repair-worker",
  "cwd": "/absolute/claimed-worktree",
  "gateway": {
    "name": "existing-pool",
    "provider": "codex",
    "baseUrl": "https://gateway.example.invalid",
    "keyRef": "env:SERVICE_GATEWAY_KEY"
  },
  "model": "gpt-6.1-sol",
  "effort": "medium",
  "sandbox": "workspace-write",
  "approvalPolicy": "never",
  "maxRunSeconds": 3600,
  "maxLogBytes": 1048576
}
```

`cwd` must name the already claimed isolated checkout. The runner canonicalizes it;
claim lifecycle and independent review are the consumer's responsibility. Independent
review jobs need a distinct `jobId`, isolated checkout and native session. Sandbox is
exactly `read-only`, `workspace-write` or explicitly authorized `danger-full-access`.
Only `never` approval is supported; other modes refuse rather than widen. Prompts arrive
on stdin (up to 1 MiB), and the existing noninteractive handoff preserves repository
requirements, review gates and the prohibition on recursive Factory delegation.

The key resolver supports the existing `env:`, `secret:` and `exec:` references. The
key is passed only in the provider environment, never argv or the job record. A minimal
child environment and per-binding isolated `CODEX_HOME` prevent inherited desktop
identity, native login or provider configuration from selecting another billing path.
Provider, URL, API-key environment source, model and effort are pinned on every turn;
credential or gateway failure produces evidence without native or paid-vendor fallback.
Known key values are redacted from guardian stdout/stderr across read boundaries before
writing logs. Operator-controlled credential commands and agent commands still run as
the authorized OS user; this is process ownership, not a security boundary against that
user or a full-access worker. Keep service config/state out of agent-editable paths.

State is under `$FACTORY_HOME/unattended` (default `~/.local/share/factory/unattended`),
which must be private and outside the checkout. All callers on the host must use the
same Factory home. Do not point desktop, Paperclip or other author processes at this
service-owned claimed checkout while it is in use: this lock serializes unattended
jobs, not independent tools or desktop processes. The result contains `admissionId`,
`binding.jobId`, canonical checkout/gateway/model/permission binding, native `sessionId`,
`resultPath`, `terminationVerified`, exit code and the provider's structured `result`.
The consumer must generate and durably save a fresh UUID for each intended invocation
**before calling the CLI**, passing it as `--admission-id`. If the consumer dies before
receiving stdout, that saved ID is sufficient for `--status` or a same-ID retry; no
filesystem discovery is needed. The runner exclusively reserves the admission directory
before credentials or worker launch. Repeating an ID returns its existing evidence for
the same binding and never spawns again; a different binding refuses. If a crash left
incomplete reservation evidence, replay refuses rather than reclaiming the ID. Do not
invent a replacement ID for an operation whose effect is unknown. Omitting the flag
keeps an autogenerated ID for interactive callers that can retain the returned report;
unattended consumers must provide their own durable ID. A continuation uses a **new**
caller UUID and `--resume` with the earlier admission ID.

Admission evidence is persisted before worker spawn. The guardian holds a kernel lock
for that canonical checkout, and a durable pointer names the exact admitted run. Two
jobs cannot write there together. Rejected admission returns `needs_input` without
launching a provider.

The CLI process is the service owner and renews its guardian lease. There is no desktop
owner lease. If the actual service process dies, the guardian expires that lease, kills
its owned descendants and retains events/process evidence. Deadline and output limits
also stop owned descendants and retain the native session. `--status` reconstructs a checkpoint
from those files after restart without a provider call. Continue only with the previous
admission ID, a verified terminated session and an identical binding, including job,
checkout, gateway credential reference, model and permissions. A changed workspace or
route never resumes that session. No automatic retry or continuation is performed.

For unattended runs, each provider receives a unique inherited run marker. The guardian
combines a full same-user process census with parent/start-identity tracking, so ordinary
`start_new_session`/`setsid` tools remain owned after their launcher exits. Cleanup signals
individual descendants after rechecking their start identities and requires an empty
verified census before releasing admission. An unreadable census or ambiguous identity
keeps admission held. Process environments are inspected in memory and never logged by
this census. Like the existing full-access contract, this cannot contain a user or tool
that deliberately discards ownership metadata and evades observation; use OS-enforced
isolation for untrusted processes. Merely detaching a tool does not discard its marker.

A dead guardian or missing/corrupt process evidence leaves the workspace held with
`needs_input`, even when its PID is gone. An operator must independently reconcile that
exact worker group and descendants before repairing the retained evidence; deleting a
lock or retrying under another Factory home is not recovery. The runner intentionally
does not guess termination or kill a possibly unrelated reused PID. Normal verified
cleanup admits the next invocation. Logs, prompt and native session/checkpoint files
remain private for consumer investigation; apply the service's retention policy there.

JSON is the CLI's only non-help output. A worker failure exits 1; completed and
`needs_input` reports exit 0, so consumers **must inspect the result**, not the exit code
alone. Pre-admission errors use `{ outcome, summary, evidence, question }`; admitted
runs wrap that report in `result` with the correlation fields above. A completed worker
turn is never proof of delivery or consumer acceptance. Authenticated gateway smoke,
installed runtime verification and actual delivery receipts remain separate rollout
requirements; fake-provider lifecycle tests establish none of them.
