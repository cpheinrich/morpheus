# CD V2 controller

`morpheus cd` implements the [CD V2 contract](cd-pipeline-v2.md). Its package API
is `morpheus-kit/cd`; its consumer configuration is `.morpheus/cd.json`.
The controller and provider adapters are reusable. A consumer owns app identities,
schemes, native settings, protected environments and backend compatibility hooks.

## Configuration and initialization

`cd config --config PATH` validates configuration without contacting a provider.
The exported `configSchema` is the same validator used by every command. It
normalizes defaults before calculating the canonical SHA-256 configuration digest.
Changing `mode` between `observe` and `active` preserves that identity. Other
configuration changes require an explicit ledger migration; they never reset work.

Required configuration declares:

- `schemaVersion: 1`, `repository: owner/repo`, `inputs` as Git pathspecs, and
  the main, state and trusted control refs;
- `channels.staging` with `schedule: {kind: "six-hour"}`, and production with
  `schedule: {kind: "daily", hourUtc: 18}` and `minimumAgeHours: 24` or greater;
- each channel's decimal `appId`, `bundleId`, marketing `version`, configured
  `internalGroupId` and protected GitHub `environment`;
- `apple` with `issuerIdEnv`, `keyIdEnv`, and `privateKeyPathEnv`: names of
  runtime credential references, never credential values.

Optional declarations include channel schemes/configurations, `native` settings,
`execution.localRunner`, `execution.hostedRunner`, at most two native reservations,
repository-relative backend `hooks`, `tests.allowedSkips`, and agent executors.
The local agent command prefix defaults to `['codex']`; the hosted prefix defaults
to `['claude']` and declares its consumer workflow/ref. Morpheus supplies invocation
arguments and prompts. Deadline and budget defaults follow the approved design.

`cd init --config PATH` explicitly initializes the state branch, its secondary
backup branch and an initialization tag. It protects both branches against force
and deletion, including administrator bypass. Initialization requires the named
repository's branch-administration authority. A missing initialized branch, tag
or backup is an incident; normal reads and ticks never create an empty queue.
Do not run `init` again to recover deleted state.

State commits have exactly the observed head as their sole parent. Every
transaction has both a stable effect ID and a random invocation owner recorded in
state/events. Conflicting callers reload and recompute. Lost acknowledgment
authorizes only the invocation whose owner actually committed; an identical
same-effect caller never receives a second authorization. Git blob reads avoid
the Contents API's 1 MiB encoding limit. Complete native test payloads remain in
hashed Actions artifacts; the hot state holds their verified compact proof.

## Reconciliation and evidence

`cd tick --config PATH` evaluates UTC obligations, dispatches exact attempts,
observes Actions and Apple, and schedules durable repair work. `--observe`, or
configuration `mode: "observe"`, computes decisions without writes or effects.
Initialize before observing. Both GitHub and host wakeups use this command.
For a consumer's macOS host, Morpheus provides separate launchd tick and local
worker templates; see [the host integration runbook](cd-v2-host-macos.md).
`cd status` reports outstanding deadlines, oldest debt, next action, receipts,
repair work, pauses and actual budget records.

Source selection uses first-parent main history. A PR merge timestamp is accepted
only for its exact merged main commit; other sources age from persisted first
observation. Author dates never qualify. Native Git object inventories define
input digests. Execution verification checks exact checkout, main reachability,
tracked modifications and untracked files under the declared inputs. Generated
ignored build/dependency caches remain the isolated native runner's responsibility.

`cd request --channel staging|production [--source SHA] --validation` creates a
distinct manual intent. Cadence is bypassed; production source age is retained.
An older binary requires `--group` matching the channel's separate configured
`validationGroupId`. Ordinary group promotion is checked against the live source
cursor, including later completions. Manual validation never advances the
operational delivery cursor.

The consumer delivery workflow accepts these dispatch inputs:

```
intent-id, attempt-id, dispatch-effect-id, source-sha, control-sha,
channel, runner-lane, reserved-build-number, app-input-digest,
configuration-digest
```

Its run name includes the exact dispatch effect token. It checks out trusted
control/config separately from app source and calls
`cd verify-execution --config ABS --source-dir ABS` before native work and archive.
The CLI reads identity from `MORPHEUS_CD_INTENT_ID`, `ATTEMPT_ID`,
`DISPATCH_EFFECT_ID`, `SOURCE_SHA`, `CONTROL_SHA` under the same prefix, plus
`GITHUB_RUN_ID`/`GITHUB_RUN_ATTEMPT`. Optional dispatched digest environment
variables use `MORPHEUS_CD_APP_INPUT_DIGEST` and `CONFIGURATION_DIGEST`.

GitHub's dispatch API rejects a raw commit SHA as its `ref`. The adapter creates
or reads `morpheus-cd-control-<controlSha>` as a lightweight tag, verifies its exact
commit target, and dispatches that tag. It never overwrites an existing tag or
retargets a retry when the configured control branch advances. Keep this owned
tag namespace intact for durable execution and audit; conflicting targets fail
closed before dispatch. The run still must report the recorded control SHA.

`cd record --kind tests --evidence FILE` validates full native evidence. Common
identity is joined to `scope: "full"`, both digests, `inventory: {ids, sha256}`,
one actual result per inventory ID, payload artifacts and a pinned validator.
The inventory hash is SHA-256 of `JSON.stringify([...ids].sort())`. Every result
passes, except explicitly configured known skips. Payload names/hashes refer to
actual sibling files packaged beside the evidence JSON. The validator defaults
to its exact `controlSha` bytes; `validator.revision: "source"` is explicit.
The controller repeats downloaded-payload and pinned-validator verification.
An artifact name, count or workflow conclusion never proves full tests.

## Upload and internal completion

The reusable upload hook is:

```
node tooling/dist/cli/index.js cd upload-hook --phase before|resource|after --config ABS
```

It reads the common identity plus `IPA_SHA256`, `MARKETING_VERSION`,
`BUILD_NUMBER`, `ASC_APP_ID`. Resource/after phases read `UPLOAD_RECEIPT_PATH`.
The before phase verifies the exact run/source/configuration, actual internal
group ownership/members and disabled automatic all-build distribution. It then
atomically persists IPA identity and the irreversible operation claim.
Exit 0 permits a new upload; exit 3 means safe skip, including existing claims.
Other nonzero results refuse the operation. A lease timeout never releases it.
`claim-upload` and `record-upload` expose the same JSON evidence boundaries.

The resource phase persists `uploadId` as uncertainty immediately. Only an
explicit accepted receipt establishes transport acceptance. `FAILED`/`INVALID`
resources atomically enqueue repair, including diagnostic codes. The controller
also reads the exact upload resource and app/version/build independently, and
imports actual `ios-upload-acceptance-*` artifacts even if only `resource.json`
survived a hook failure. It never repeats archive/upload to fix distribution.

Internal completion requires the exact VALID build, installable internal beta
state, the configured internal group and its actual members. It joins the
provider identity to trusted source/control/run, IPA and full-test evidence.
Receipt and operational cursor commit together. Group operations are reserved;
late retired binaries are observed and never promoted or credited.

An absent uncertain upload is observed repeatedly. Replacement requires terminal
workflow plus actual executor/process/VM quiescence, then the configured bounded
observation window. `cd record --kind quiescence --evidence FILE` accepts explicit
trusted host/provider evidence: common identity, `kind: host-terminated` or
`hosted-terminated`, `ref`, `processGroupAbsent: true`, `executorTerminated: true`.
It is an evidence boundary, not a command that terminates a machine. Never supply
those booleans from terminal GitHub status or lease expiry alone.

## Repair execution and capacity

`cd worker --executor local|hosted --config ABS --source-dir ABS` owns a due repair
task. Hosted dispatch supplies `--work-id`, `--invocation-id`, `--task-digest` from
the immutable ledger task. The workflow inputs also include intent and strategy.
Visibility sweeps precede bounded dispatch retry; duplicate invocations cannot
start a second model session. Checkpoints retain actual runtime session IDs,
usage, evidence and review provenance. The owned process guardian stops descendants
on timeout or parent loss. Code repairs must return a merged PR whose exact head
passes Morpheus's independent review validator and live checks. Infrastructure
repairs may complete from direct evidence without inventing a code PR; pre-upload
retry still requires executor quiescence. Accepted/uncertain binaries continue
provider reconciliation under their original identity.

Native capacity, provider outages and rate limits are durable retryable waits.
They do not manufacture a repair defect. Real/unknown failures own durable agent
work, and two independent strategies precede technical human escalation. Explicit
operator pause records are honored by admission and promotion; issues are never
an arbitrary command-execution surface.

`cd quota --executor local|hosted` makes a no-model telemetry probe. Codex uses
`account/rateLimits/read`. A configured `MORPHEUS_CD_QUOTA_FILE` or executor
`quotaFile` supplies actual `{observedAt, source, windows:[{id,usedPercent,resetsAt}]}`.
Hosted Claude can read its authorized OAuth usage endpoint with five-minute cache
and 429 backoff. Unknown/stale metrics retain a budget wait. New subscription work
requires usage below 80%; owned invocations are monitored and stopped at the
90% threshold or lost telemetry. Sampling does not control other simultaneous
account sessions; actual campaign usage must verify the user's reserve.

`cd github-token` uses the existing Claude GitHub App's official OIDC exchange
inside a reviewed default-branch Actions workflow. It masks the token and writes
only to `GITHUB_OUTPUT`. `--probe` uses the scoped token to create/read/delete an
owned disposable workflow-only branch without dispatching it. `--revoke` revokes
that installation token. Requested permissions and actual provider grants are
reported separately. These probes require actual hosted acceptance; local fake
responses do not establish working credentials.

`cd budget --operation reserve|settle` exposes replay-safe paid request reservations
in integer microdollars. Request identity and maximum liability are immutable;
timeouts retain liability and settled tombstones prevent duplicate charging.
Together admission cannot exceed the configured ceiling, at most $250. The
controller has no implicit paid-provider fallback. Operational acceptance must
include any task spend incurred before ledger initialization.

Focused tests cover protocol counterexamples and actual local Git, ES256 signing,
receipt producer and artifact bytes. They do not count
as TestFlight deliveries. The eight real deliveries and normal scheduled-path
proof remain consumer acceptance work under the approved design.
