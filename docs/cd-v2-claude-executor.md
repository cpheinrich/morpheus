# CD V2 Claude subscription repair executor

Roadmap: MO-26-10-29-14.02.58. Design version 2, revised after an independent design critique
(Appendix C lists every critique item and what changed).

## The ask

A consumer wants CD V2 repair work to run on an operator's own native Claude Code sign-in (a
claude.ai Pro or Max subscription) on a registered Mac, without Codex and without any API key, OAuth
token export, new OAuth scope or paid usage. Today the local executor is hard-wired to Codex
(`codex app-server` quota read, ChatGPT login check, `codex exec`), and Claude exists only as the
hosted executor, whose quota readback needs an exported `CLAUDE_CODE_OAUTH_TOKEN` with
`user:profile`. The first consumer is Evo, whose repair intents are stuck because its only native
worker cannot read quota.

## Design in one paragraph

Add an optional third executor, `agents.claude`, selected explicitly per host with
`cd worker --executor claude`. Codex remains the default `local` executor and its code paths,
arguments and ledger bytes do not change. Every Claude process the worker starts first sends the
CLI's `initialize` control request and refuses to continue unless the CLI is a build Morpheus has
analysed and the session is the bound claude.ai account with no API key or third-party provider.
Plan usage comes from the CLI's own `get_usage` control request (the CLI fetches it with its own
native sign-in; Morpheus never sees a token). Admission requires a reading that is fresh according
to the analysed build's code, below the existing 80 % line, covering the configured model family's
own weekly window, with paid extra usage switched off at the account. The repair prompt is sent only
after those checks pass, to one bounded `claude -p` session with no MCP servers, no settings files
and no scheduling or remote-trigger tools. Results go through the existing worker transitions, so
`verifyRepair` and `adoptRepair` still decide whether anything is adopted.

## Constraints this must satisfy

- **Same principal, no new authority.** Use the operator's existing native sign-in on that Mac. No
  token is read, exported, copied or printed by Morpheus; no new OAuth scope or App is requested.
- **No paid fallback.** Admission requires the account's extra (paid) usage to be disabled. The CLI
  cannot disable overage per invocation (decision of 2026-09-25), so the account setting is the
  hard boundary; the reader checks it on every reading and the run stops if the provider signals
  that paid usage would be allowed.
- **Unknown is a wait.** An unanalysed CLI build, missing, stale, malformed or seeded telemetry, a
  missing model-family window, a different account or provider, or a changed protocol all produce
  the existing budget waits. Never assume capacity.
- **Codex unchanged.** The default executor, its configuration digest and its ledger shape stay
  byte-identical. A config without `agents.claude` hashes exactly as before.
- **Outcomes only through existing owners.** Claim, session checkpoint, usage meter, completion,
  `verifyRepair`/`adoptRepair` and blocker-proof assessment are reused unchanged.

## Executor selection

- **Config.** `agents.claude` is optional and strict:
  `{ command: string[] (default ["claude"]), model: string, account: { email: string,
  subscription: "pro" | "max" } }`. `model` is a plain id of a known family (`opus`, `fable`,
  `sonnet`, `haiku`, optionally `claude-`-prefixed). Team and enterprise plans are refused: their
  extra usage is controlled by the organisation and was never examined. There is no `quotaFile`, and
  `MORPHEUS_CD_QUOTA_FILE` is refused for this executor. Consumers should point `command` at the
  absolute versioned binary (for example `~/.local/share/claude/versions/2.1.312`) so the CLI
  cannot move under the worker. An absent object leaves existing configurations hashing exactly as
  before (asserted against a fixed digest, not the same runtime's output).
- **Opt-in proof at run time.** The Claude worker refuses unless the ledger's
  `configurationDigest` equals its own configuration's digest. Older runtimes strip the unknown
  `agents.claude` key and would compute the pre-migration digest from a migrated file; a host on an
  older runtime must keep its own pinned pre-migration file (consumer wrappers already pin file
  digests).
- **Selection.** `cd worker --executor claude [--host-id ID]` and `cd quota --executor claude`.
  `--host-id` behaves as for `local`. Nothing selects Claude implicitly; `hosted` is untouched.
- **Separate subscription, separate reservation.** Invocations record `executor: "claude"`; the
  existing one-in-flight-invocation-per-executor rule gives the Claude subscription its own
  reservation, and telemetry lands in `budget.telemetry.claude`. Work leases still prevent two
  executors on one item.
- **Admission waits do not starve the other executor.** A Codex admission failure moves the shared
  work's `nextCheckAt` five minutes out, and the selector skips work that is not due, so a Claude
  worker waking just after a failing Codex worker would never see the work. For the Claude executor
  only, in both the plain worker and the held-aware worker entry: (a) work counts as due when a
  subscription admission wait is its latest event, meaning the intent's next action is one of
  `wait-subscription-telemetry`, `wait-measured-subscription-capacity` or
  `wait-subscription-authentication`, an `admission-wait-…` transition for that work exists, no
  invocation started or ended after the latest one, and no run or hosted dispatch is still open.
  In-run stops reuse those next-action strings but write no admission-wait transition, so a stopped
  Claude run (attestation, overage, meter) keeps its ordinary poll schedule. (b) Claude's own
  admission failure records the blocker and next action under an executor-scoped transition id,
  does not move `nextCheckAt` or the work state, and leaves the intent's status alone while another
  owner holds a live lease. The 5-minute launchd wake bounds retries. Codex keys and behaviour are
  unchanged.
- **Session resume** takes the latest `local` or `claude` invocation and resumes it only if it has the
  same executor and host ID. A newer checkpoint from the other native executor is foreign, so neither
  resumes an older session past newer progress; both receive the durable checkpoints as untrusted
  prompt context. Ledgers without `claude` invocations behave exactly as today. Claude sessions are
  also tied to the working directory; a changed `--source-dir` costs one invocation that reports no
  conversation found. An older runtime (M430 on a frozen host) looks only for `local` and could
  resume past a newer Claude checkpoint; that residual cannot be fixed in a runtime this does not ship.

## Native login and session binding

- **Pre-claim check (coarse):** `claude auth status --json` with the sanitized environment must show
  `loggedIn`, `authMethod: "claude.ai"`, `apiProvider: "firstParty"`, the bound email
  (case-insensitive, trimmed) and the bound `subscriptionType`. Failure is
  `wait-subscription-authentication`; stdout is parsed, never stored.
- **In-process binding (authoritative):** the critique showed `auth status` cannot see an API key
  injected through a settings file's `env` block. So every reader process and the run itself begin
  with an `initialize` control request, and continue only if the reply has `claude_code_version` in
  Morpheus's analysed-build list, `account.email` equal to the bound email, `account.apiProvider`
  `firstParty`, no `apiKeySource` or `tokenSource`, and `account.subscriptionType` equal to the
  bound plan's display name (`Claude Max`, `Claude Pro`). The repair prompt is written to the run's
  stdin only after this check, so a mismatch costs no model turn. The run's `system/init` event must
  still report `apiKeySource: "none"` as a backstop.
- **No settings files.** Both the reader and the run pass `--setting-sources ""`: no user, project or
  local settings, hooks, plugins or `env` blocks (the critique found an unreviewed, gitignored
  `.claude/settings.local.json` in the consumer checkout, and project settings come from the working
  tree the agent edits). The repository's `CLAUDE.md`/`AGENTS.md` still load as memory, so the agent
  keeps its instructions; the consumer's read and poll hooks do not run, and Morpheus context
  refresh falls back to its documented assertion mode.
- **Sanitized environment** (identical for the auth check, every reader and the run): remove every
  `ANTHROPIC_*`, `CLAUDE_CODE_*` and `CCR_*` variable and `AWS_BEARER_TOKEN_BEDROCK`, plus today's
  OpenAI/Codex deletions; keep `CLAUDE_CONFIG_DIR` (it selects which native sign-in is used, and the
  binding decides whether that is the bound one); set `DISABLE_AUTOUPDATER=1`.
- The `get_usage` `subscription_type` comes from the same local account data as `auth status`, so it
  is a consistency check, not a server confirmation; the server-facing confirmation is that the
  usage endpoint answered for that sign-in. The organisation id is not bound (the owner bound the
  email); it can be added later.

## Truthful quota for a Claude subscription

**What exists.** The `get_usage` SDK control request ("plan rate-limit utilization … for callers that
need only the plan rate limits, such as a usage meter") is answered without a model turn. Its reply
has `subscription_type`, `rate_limits_available` and `rate_limits`, which carries `five_hour` and
`seven_day` windows, the server's own `limits[]` list (`kind` `session`, `weekly_all`,
`weekly_scoped` with `scope.model.display_name`), `extra_usage` and other passthrough fields.
Measured on the target Mac: about 0.7-1.2 s, exit 0, session cost zero. The SDK wrapper is named
`usage_EXPERIMENTAL_MAY_CHANGE_DO_NOT_RELY_ON_THIS_API_YET`, so the executor accepts it only from
builds Morpheus has analysed.

**Freshness, according to the analysed build (2.1.312).** A persisted snapshot younger than 60 s is
returned without asking the endpoint; otherwise the endpoint is asked; on failure (including 429) the
CLI falls back to a "seeded" answer up to one hour old and strips `limits[]`. The reply carries no
fetch time, so freshness is a property of the analysed code, not a proof in the reply. That is why
the version allowlist is load-bearing: a new build is refused until someone re-reads that code and
adds it. Accepted answers are at most about a minute old; the ledger's `observedAt` is when Morpheus
read the value, up to 60 s after the CLI fetched it.

**Admission rules** (any failure is `wait-subscription-telemetry` with a fixed reason; provider text
never reaches the ledger):

1. Reader: a fresh temporary directory as cwd; `claude -p --input-format stream-json --output-format
   stream-json --verbose --no-session-persistence --strict-mcp-config --setting-sources "" --tools ""`
   under the existing `quota-reader.py` private-group supervisor, with the existing 60 s bound
   covering startup, both replies and cleanup proof. An error reply, a missing reply or an early exit
   is unknown.
2. `initialize` passes the binding above.
3. `get_usage`: `subscription_type` equals the bound plan; `rate_limits_available === true`;
   `rate_limits.extra_usage.is_enabled === false` (enabled or missing refuses as "paid extra usage
   enabled or unknown").
4. Windows come from `limits[]`, the server's own list: every entry not scoped to another model (so
   surface-scoped and unscoped entries are all counted), plus the configured family's entry. The
   `session`, `weekly_all` and family `weekly_scoped` entries must all be present: if the server lists
   no weekly window for the configured family, admission waits (the 2026-10-19 rule that unknown
   family capacity waits). On the target account today that means `fable` is admissible and `opus` is
   not.
5. Tripwire: the `session` and `weekly_all` entries must agree with `five_hour` and `seven_day`
   within one percentage point, so a change of scale or meaning in either fails closed.
6. Each window needs a finite percentage and a future reset. An entry at exactly 0 % with a null reset
   (an unused window; this shape is permitted by the schema but was not observed) counts as 0 % with
   a reset five minutes after the reading.
7. The windows become a `QuotaSnapshot` (source `Claude Code get_usage`) and the existing `quotaUsed`
   (maximum, 0-100, five-minute age bound) and 80/90 policy apply unchanged.

**During the run** the existing 30-second meter re-reads through the same reader, including the
identity binding, and stops the model on any failure, on 90 %, or if extra usage becomes enabled.
The run's own stream is also watched: a `rate_limit_event` whose `overageStatus` is `allowed` or
`allowed_warning` (the provider would now serve paid usage, signalled before any is used), or whose
`isUsingOverage`/`overageInUse` is true, stops the run at once. Residual exposure: readings can lag
about 60 s (CLI snapshot) plus 30 s (meter), so someone switching extra usage on and the account
passing 100 % inside that gap could spend credits before the stop. With the 90 % stop and the
provider's own pre-use signal this is small, and the setting is account-wide: if the operator turns
extra usage on for their own work, repair stops until it is off again.

A rate-limited usage endpoint makes the CLI return a seeded answer, which the reader refuses, and
the meter then stops a running repair (the existing Codex policy for failed meter reads). The CLI
shares one snapshot across processes on the machine, so the endpoint is asked about once a minute
at most; whether that is ever throttled is unmeasured.

**If `get_usage` changes or disappears:** a new build is refused by the allowlist before any field is
read; within an analysed build, an error reply or a failed rule waits. Nothing falls back to a file,
a token or an estimate.

## Invocation

- **Arguments:** `claude -p --input-format stream-json --output-format stream-json --verbose
  --permission-mode bypassPermissions --strict-mcp-config --setting-sources ""
  --disallowedTools RemoteTrigger,CronCreate,ScheduleWakeup,PushNotification --max-turns 50
  --json-schema <result schema> --model <model> [--resume <same-host session>]`, cwd the worker's
  `--source-dir`, under the existing `guarded-run.py` guardian with the configured `agentMinutes`
  timeout and orphan ownership. The worker writes `initialize`, checks the binding, then writes the
  prompt as one user message and closes stdin.
- **What bounds it:** no MCP servers at all (verified: without `--strict-mcp-config` the account's
  claude.ai connectors, including Gmail, Calendar and Drive, load; with it, none do); no settings
  files, hooks or plugins; no remote-trigger, cron, wake-up or push-notification tools (verified that
  the deny rules register under `bypassPermissions`; enforcement during a turn was not exercised);
  50 turns; the guardian's wall clock; the account, quota and overage checks; and the existing prompt
  contract (PR metadata and independent review authorized, external mail or chat not).
- **What does not bound it** (the consumer must authorize this explicitly): `bypassPermissions` lets
  the agent run any command as the operator's macOS user, with network. In particular it could start
  another `claude` (which would load the full user configuration, including the claude.ai connectors)
  or `claude --bg`, which may escape the guardian; run `codex`; write `~/.claude.json`, which holds
  both the CLI's usage snapshot and the account details `auth status` reports, so the meter and the
  coarse check do not hold against the agent they supervise; and use the operator's `gh` session,
  which can write the ledger branch directly. Codex's local executor has `workspace-write` filesystem
  confinement; this executor has none in version 1, because iOS repair needs Xcode, DerivedData and
  CoreSimulator outside the checkout and Claude Code's sandbox has not been qualified for that. A
  follow-up item qualifies sandboxing. Whether Claude's Bash and background tasks keep the guardian's
  `MORPHEUS_CD_AGENT_OWNER` marker must be checked on the device before enabling.
- **Output contract:** `--json-schema` with the existing `agentResultSchema`; the `result` event's
  `structured_output` is the result (the hosted path's existing parser). A code repair is adopted only
  if `verifyRepair` accepts a merged PR whose exact head carries a valid independent review record.

## Recording outcomes

Unchanged transitions: `claim-agent-invocation` (fenced lease, `executor: "claude"`,
`budget.telemetry.claude`), `agent-session-checkpoint`, `subscription-usage`, `agent-checkpoint` with
`verifyRepair`/`adoptRepair`, `completeOperationalRepair`, `repairWork` or a wait exactly as for
Codex, and `agent-error-checkpoint`. The only new id shape is the executor-scoped admission wait
(`admission-wait-claude-<kind>-<work>-<bucket>`, journal kind `agent-budget-wait`), which writes only
the intent's blocker and next action. No new operator commands or adoption paths.

## Consumer adoption

Separate consumer PR, migration and ops review; for Evo see the task's adoption proposal. In short:
recorded owner authorization (it reverses two recorded Evo decisions), an `agents.claude` config with
the versioned binary, a pinned `fable` model and the bound account, a closed exact-snapshot migration
operation, a Claude worker role and runtime manifest, a re-pinned tick config digest, a Pro worker
LaunchAgent (`ProcessType Interactive`) running `--executor claude`, and a device check of guardian
ownership before the first real run.

## Known limits

- Every Claude Code update needs a reviewed Morpheus change adding the build to the analysed list
  before the worker will run on it; until then the worker waits with a telemetry reason.
- Per-model windows the server does not list cannot be seen; a family with no listed weekly window
  is not admitted.
- Filesystem confinement is weaker than Codex's, and the agent can reach the files and sessions that
  supervise it (above).
- This executor does not change review continuation; a repair blocked on another PR's original
  reviewer stays blocked.

## Appendix A: evidence

- Operator-local probes (control requests only; no model turn): `get_usage` reply shape and timings;
  connectors with and without `--strict-mcp-config`; `initialize` reply keys
  (`claude_code_version` 2.1.312; `account` with `email`, `organization`, `subscriptionType`
  `"Claude Max"`, `apiProvider` `"firstParty"`); `list_permission_rules` showing the four deny rules
  with source `cliArg` under `bypassPermissions` and `--setting-sources ""`.
- One live run through the executor's protocol (Haiku, no tools; the only model turn spent on this
  design): `initialize` reply, then `system/init` with `apiKeySource: "none"`, no MCP servers and
  `bypassPermissions`, then a `rate_limit_event` with `overageStatus: "rejected"`
  (`org_level_disabled`), then a `result` carrying `structured_output`, in 2.5 s. `system/init`
  arrives before any model output in stream-json input mode, and a structured-output reply uses two
  turns of `--max-turns`.
- CLI 2.1.312 source excerpts: `x1n` (usage builder, strips `limits` when seeded), `ZHt`/`U` (60 s
  snapshot, one-hour seeded fallback), `cachedUsageUtilization` in `~/.claude.json`.
- `claude auth status --json` keys: `analyticsDisabled`, `apiProvider`, `authMethod`,
  `configDirectory`, `email`, `loggedIn`, `orgId`, `orgName`, `projectsDirectory`,
  `subscriptionType`. `system/init.apiKeySource` values: `ANTHROPIC_API_KEY`, `apiKeyHelper`,
  `/login managed key`, `none`, plus legacy values never emitted.

## Appendix B: tests

A synthetic `claude` executable implements `auth status`, `initialize`, `get_usage` and a
stream-json `-p` run. Cases: fixed config digest without `agents.claude`; Codex arguments and keys
unchanged; every admission rule failing closed; unanalysed version; wrong email, provider, API-key
source or plan in `initialize`, with no prompt written; quota-file refusal; ledger-digest opt-in
refusal; executor-scoped admission wait leaving `nextCheckAt` untouched; admission-wait work due for
Claude; separate reservation from `local`; same-host Claude resume only; `system/init` backstop and
overage events stopping the run; environment stripping; structured result through the existing
completion path.

## Appendix C: critique response

| Item | Severity | Change |
|---|---|---|
| C1 freshness rests on one unpinned build | blocking | `initialize` first; analysed-version allowlist; versioned binary; `DISABLE_AUTOUPDATER=1`; wording says "according to the analysed build" |
| C2 settings-file API key passes `auth status` | blocking | `--setting-sources ""` for reader and run; run binds identity via `initialize` before the prompt is sent; `system/init` kept as backstop |
| C3 executors starve each other | should-fix | executor-scoped Claude admission wait that does not move `nextCheckAt`; admission-wait work due for Claude |
| C4 model window rule | should-fix | windows from `limits[]`; session, weekly and family entries required |
| C5 bounds cover only the top process | should-fix | four tools disallowed; residual exposures listed for authorization |
| C6 incomplete environment denylist | should-fix | prefix stripping |
| C7 overage wording, team plans | should-fix | stop on `overageStatus` allowed; plans limited to pro/max; residual gap stated |
| C8 idle window with null reset | should-fix (unverified) | 0 % with null reset accepted with a synthetic reset |
| C9 quota file not refused | should-fix | refused for Claude |
| C10 usage-endpoint 429 stops runs | minor | kept the existing strict meter policy; documented |
| C11 `observedAt` semantics | minor | documented |
| C12 checks less independent than stated | minor | wording corrected; identity re-bound on every reader call; org id not bound |
| C13 reader underspecified | minor | flags, cwd and the single 60 s bound specified |
| C14 old runtimes drop the key | minor | documented; digest test uses a fixed hash |
| C15 resume tied to cwd | minor | accepted and documented |
| C16 guardian marker inheritance | question | device check before enabling, in the adoption steps |
