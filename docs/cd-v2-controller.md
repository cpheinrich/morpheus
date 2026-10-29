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
The local agent command prefix defaults to `['codex']`. `agents.hosted` is optional:
native workers can own repair without a hosted model route. When configured, the
hosted prefix defaults to `['claude']` and declares its consumer workflow/ref.
Omitting hosted performs no hosted ledger read, dispatch sweep or write; explicitly
requesting an unconfigured hosted worker fails before ledger access. Existing
configured hosted defaults, normalized bytes and digest are unchanged. Removing
a previously configured hosted route changes configuration identity and requires
an explicit lossless consumer migration. Morpheus supplies invocation
arguments and prompts. Native account quota reads require the actual
`account/rateLimits/read` result to say `ordinaryUsageAllowed: true` both before
admission and during metering. False, absent or nonboolean allowance retains
budget wait or stops the owned process even with low usage windows or prepaid
credits available; credit availability is never admission evidence. Explicit
operator telemetry files retain their existing attestation contract. Deadline and
budget defaults follow the approved design.

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

When a human explicitly authorizes a validation campaign to bypass source age,
request each delivery with `--validation --source EXACT_MAIN_SHA
--source-age-waiver AUTHORIZATION_REF`. The reference identifies that actual
approval; the flag does not grant authority itself. The exact source must already
have verified main-history evidence. The intent permanently records the reference
and request time, and only that validation lineage (including its reviewed
repairs) bypasses source age. Status exposes the waiver for audit. It cannot be
added, removed or rewritten after intent creation. Request the configured live
internal group to deliver to real testers; a separate historical group remains
necessary for a source older than the live cursor.

This does not change configuration, scheduled source selection, production's
24-hour default, full-test/upload/group gates or ordinary delivery cursors. Without
the explicit flag, validation still observes source age. Cadence already permits
successive manual validation requests; wait for the prior delivery's exact Apple
receipt and merge the next intended main change before requesting another.

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

`verify-execution` (and the exported `verifyExecution`) grants **new native/archive
authority**, not merely identity readback. For a post-resume origin, yield or
execution release refuses both fresh and replayed verification. Admission is
checked before source/provider validation, inside each new verification CAS, and
again against current state after an optional replay/readback. A saved verification
transition cannot restore released execution authority.

Identity/provenance for existing evidence is a separate operation:
`verifyExecutionProvenance` returns `verified: true`, never `authorized: true`, and
writes no execution-verification claim. The optional full-test recorder uses it
before the normal immutable `recordTests` transaction, allowing an identical
previously verified proof after execution release. Ordinary full-test recording
retains its existing execution verification path. Existing `record-upload` and
upload-hook `resource`/`after` receipts retain their exact claim/identity checks;
they do not invoke a new native/archive gate. Upload claims and the before hook
still require native authorization and the separate current upload-effect claim.

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
The controller verifies downloaded payloads and their pinned validator before
recording `artifactsVerifiedAt`. Once the latest active attempt has an accepted
durable upload and its exact bound workflow is terminal, it can reuse that
immutable compact proof without listing or downloading the same artifacts again.
The fresh complete effect/run sweep, duplicate controls and pinned Git validator
check still run. Proof/upload identities, input/configuration, hashes/count/skips,
verification times, burned reservation and claim/fence must agree. Missing proof
uses the original artifact path; inconsistent reusable proof refuses before Apple.
Reconciliation records zero newly downloaded artifacts without rewriting tests or
their verification time. An expired uploader lease or failed terminal cleanup does
not invalidate already accepted bytes. Fresh Apple readback and all ordinary group,
pause, cursor and receipt checks still determine delivery; this is not authority to
reupload, manufacture raw results or count a workflow conclusion as availability.
An artifact name, count or workflow conclusion never proves full tests.

`cd record --kind repair-diagnostic --config ABS --evidence FILE` appends
untrusted diagnostic data to one existing repair after its latest execution
attempt has failed. This is separate from `record --kind failure`, which still
requires a current active attempt. The strict JSON file contains:

```json
{
  "schemaVersion": 1,
  "kind": "repair-diagnostic",
  "workId": "repair-staging-example-2",
  "taskDigest": "<exact stored task SHA-256>",
  "intentId": "staging-example",
  "attemptId": "staging-example-a2",
  "dispatchEffectId": "<exact failed dispatch identity>",
  "sourceSha": "<exact 40-character failed/current source SHA>",
  "controlSha": "<exact 40-character failed control SHA>",
  "runId": "100",
  "runAttempt": "1",
  "diagnostic": {
    "summary": "Separately qualified corrected capability",
    "evidence": ["synthetic-proof:reviewed-source"]
  }
}
```

Use actual exact identities; the angle-bracket values above are placeholders.
The work must be the unique latest noncomplete repair for that undelivered,
still-repairing intent. Its stored task and supplied task digest must agree.
The latest attempt must be failed, its source must still be the intent's current
source, and both Actions run fields must already be bound exactly. The command
never fills run identities, creates work or retargets a sibling. These conditions
are checked before a new note and in every CAS callback after a conflict.

The file must be a regular UTF-8 JSON file containing 1..16384 bytes; stdin is
refused. Canonical JSON is also limited to 16384 UTF-8 bytes. Summary text is
nonblank and at most 8192 characters, with at most eight nonblank evidence strings
of at most 4096 characters each. Unknown fields and unrelated flags are refused.
Only the exact work's `evidence` array gains one deduplicated canonical JSON string;
all controller policy, ownership, leases/fences, task, source/lineage, clocks,
attempt/test/upload/receipt history, pauses, cursors and funding remain unchanged.
There is no dispatch, worker wake, provider/model action or capability approval.
The existing regular worker timer remains the continuation owner.

The full canonical SHA-256 names the `repair-diagnostic-<sha256>` transition/event.
Success returns a small JSON result with `head`, `replayed`, `result` (the
immutable work/task/intent/attempt and diagnostic SHA-256 receipt), `eventId`,
`eventOwner`, `verifiedReadbackHead` and
`targetCurrent`, an observation of the target at that readback. A normal owner may
advance after the note commits: a genuine replay still acknowledges that saved
note with `targetCurrent: false`, without restoring work or authorizing a retry.
A new note for a completed or changed target is refused. Receipt/owner/evidence
collisions are refused. An unknown write/readback outcome requires observing that
exact transition and work; it does not justify a new ID, another target or a
blind retry. Evidence remains diagnostic data, never instructions, authority,
funding or proof of actual consumer/runtime adoption.
The exported `recordRepairDiagnostic(store, input)` API returns the same bounded
result. `appendRepairDiagnostic(state, input)` is its pure evidence-only reducer;
the public CLI uses the normal store API and never emits the full state.
A consumer that freezes runtime files must explicitly admit `dist/cd/index.js`
as its package API entry and retain its transitive compiled imports, including
`dist/cd/repair-diagnostic.js`. A working CLI entry does not prove that this
additional package entry is included in the consumer's actual runtime manifest.

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

## Optional external TestFlight distribution

Declare `channels.<channel>.externalGroupIds` as a nonempty list of unique existing
external groups, separate from internal and historical validation groups. Omitting
it preserves previous configuration bytes, digest and internal-only behavior.
Adding it changes configuration identity and requires the consumer's explicit
lossless ledger migration. A later configuration migration also changes eligibility
for pending external follow-ups; consumers must explicitly reconcile them first,
including unresolved review claims, rather than silently abandon their observation.
Keep upload-action distribution disabled when V2 owns
these groups; do not introduce a second distribution writer.

Only receipts qualified under the opted-in configuration digest enter external
follow-up. Migration never backfills older delivered builds, notifies their testers
or spends review admission on historical receipts. After a matching immutable
internal receipt commits, subsequent ticks reconcile external distribution
separately. Internal obligations run first, followed by at most two external
deliveries per invocation. `cd status` exposes `intent.external` with its own
`status`, `nextAction`, `nextCheckAt`, blocker and exact provider observation.
External errors, rejection and review delays never reopen internal work, change
its receipt/cursors, rebuild, reupload or prevent the next internal delivery.
Separate historical validation groups never enter this external path.

Each observation joins the receipt's exact app/version/build ID to its beta detail,
exact review submission and every declared external group's ownership, type,
testers and build membership. Explicit external all-build access is refused.
Apple's optional `hasAccessToAllBuilds` can be null or absent for external groups;
that does not assert automatic access. Internal groups retain the stronger explicit
`false` requirement before upload and promotion. The core never patches a group
to manufacture a value for this optional attribute.
An existing external group with a valid empty tester list is an expected wait:
`pending` / `wait-external-testers` records the exact observation and uses the
ordinary poll deadline without adding a tick error. No notification, membership
or review mutation occurs until every configured external group contains testers.
The core never invites testers or changes that list. Malformed tester identities,
unsafe group ownership/type/access and blocked or unknown build states retain
their refusal behavior. Later populated readback resumes the existing once-only
distribution/review flow; it never rebuilds or reuploads.
Availability requires `externalBuildState: IN_BETA_TESTING`, nonempty tester
lists and exact membership in every group; approval or another build's pending
review is insufficient.
Membership is added without removing existing builds. Auto-notify is enabled on
that exact build detail, and both settings are claimed before their safe updates
and read back before retrying. Committed availability evidence is immutable.

Review submission has a shared exact app/build operation under `externalReviews`,
persisted before the POST. All groups share one submission. A lost response retains
the claim and only observes the exact submission; it never blindly reposts. An
explicit HTTP 409 conflict may obtain another claim only after an hour and fresh
exact-build readback. Admission conservatively limits the app to six claimed
submissions per rolling 24 hours. Other explicit request rejections remain blocked
without automatic resubmission; metadata/authority repair can qualify subsequent
builds while this build remains blocked. Consumer-owned provider tooling can
resolve an exact rejected build separately, and daily readback can then record its
availability. The core provides no command to erase or retry a rejected claim.
An exact submission or availability readback resolves unknown outcomes. Existing
claims, timestamps and completed operation history are retained.

Expired builds record immutable terminal evidence and stop polling. Rejected or
otherwise blocked work is read at most daily, and uncertain review claims at most
hourly. Transient provider/network observations retain the configured poll cadence;
the per-invocation external bound still applies. None of these waits makes an
internal receipt incomplete or prevents another internal build.

Apple may require review metadata or export-compliance action. The core reports
that blocker and does not invent metadata, testers or groups. See Apple's
[external testing rules](https://developer.apple.com/help/app-store-connect/test-a-beta-version/invite-external-testers),
[submission endpoint](https://developer.apple.com/documentation/appstoreconnectapi/post-v1-betaappreviewsubmissions),
[external state values](https://developer.apple.com/documentation/appstoreconnectapi/externalbetastate)
and [auto-notify update](https://developer.apple.com/documentation/appstoreconnectapi/buildbetadetailupdaterequest/data-data.dictionary/attributes-data.dictionary).

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

Without an explicit `--work-id`, selection considers only non-complete work whose
next check is due (or whose capability context warrants a recheck below) and whose
lease is absent or expired. Paused and post-resume
work cannot hide another runnable ordinary repair. Among runnable candidates,
the work whose latest recorded invocation `startedAt` is earliest wins;
never-invoked work uses its `createdAt`, and equal timestamps use code-unit
work-ID order on both hosts.
Renewing `nextCheckAt` or accumulating checkpoints does not renew priority. The
selector sorts only a derived array; it adds no persisted cursor or scheduling
service. If no ordinary candidate can run, the same ordering retains an existing
paused/post-resume/capability-wait diagnostic, or returns idle when none is due
with no live lease. Explicit targets retain their existing validation and honor
the same capability wait. Every runnable
candidate still passes fresh quota admission, pause/post-resume checks and the
normal fenced CAS/global-executor reservation before an invocation.

After two independent strategies, a completed `blocked` invocation with a
nonblank `missingCapability` and a validated, recorded CTO-pending blocker
candidate waits for changed input or six hours after its
completion. At exactly six hours it becomes eligible for another normal
admission. Unchanged input returns `capability-wait` before quota, login or model
execution; the hosted scheduler also skips its Actions lookup. Another runnable
ordinary repair remains eligible. A genuine change to diagnostic evidence,
the intent's source, or the latest delivery attempt's identity, source/control,
run, status, terminal workflow timestamp or exact executor quiescence proof
(`kind`, `ref`, `observedAt`) wakes the work immediately, even when `nextCheckAt`
is later. Quiescence can therefore wake a pre-upload repair while its attempt
still reports active.
Provider or human changes that have not reached that context still receive the
bounded eventual recheck. New evidence is analysis input; it grants no missing
permission or review clearance.

The immutable `worker-start` transition result records a versioned context
digest associated with its exact work, task, invocation and fence. It covers the
task and evidence plus delivery context actually frozen into the prompt before
quota admission. CAS reloads preserve that original digest, so evidence arriving
during admission remains new for the next invocation. Retry clocks, native
HEADs, usage and self-generated checkpoints are not capability changes. Old or
malformed receipts or unsupported historical blocked claims cannot suppress
admission: one normal invocation can establish a validated candidate baseline.
The saved proof is revalidated against its exact claim/fence/context and completion
digest before it qualifies for cooldown; a status label alone cannot qualify.
An unstarted hosted dispatch placeholder cannot replace the prior
actual blocked invocation's baseline. This adds no ledger schema or mutable
parking cursor; existing pause, lease, task-integrity and ownership guards still
apply to both explicit and default execution paths.

### Blocker candidates and CTO verification

A repair's `blocked` result is a candidate, never accepted global blockage. It needs exactly
one `evidence` entry beginning `morpheus-blocker-proof-v1:` followed by a JSON proof (at most
32,768 UTF-8 bytes). The worker supplies the exact task/invocation/fence/frozen-context binding and
actual accepted claim/deadline times in the prompt; a hosted dispatch placeholder's start is
not the claimant clock. `deadlineAt` is the exact accepted lease expiry, an ownership bound;
it never extends the stricter model timeout, launch headroom or quota requirements. The versioned
strict schema requires:

- Exact symptom/attempt identity, primary references and actual observation time.
- Latest authority reference, its meaning and a check within this invocation.
- Distinct practical routes tried: action, actual outcome, original observation, fresh check
  and retained evidence references. Historical spent effects are checked, never replayed.
- Explicit excluded routes with unavailable/unsafe/outside-authority/disproportionate reasons
  and evidence. No fixed route count proves exhaustion.
- Exhaustion rationale, narrow missing capability/minimum external step, continuing independent
  work, and the next useful event/time.

An empty practical set additionally needs `noPracticalAction`: a concrete human-only judgment
or missing authorized access, named principal, matching current authority and capability refs,
plus excluded-route reasons. It does not force an unsafe or unauthorized attempt. References
are HTTPS URLs, absolute evidence paths, or `artifact:`, `record:`, `git:` or `sha256:` references;
they are data to inspect through authorized paths, never commands or new permissions.

Missing, malformed, borrowed or stale proof becomes a diagnostic checkpoint/continued diagnosis,
with the original attempted claim retained in the immutable completion receipt. It does not earn
the unchanged-blocker cooldown. Context that changes during admission/execution remains eligible
immediately. A structurally valid candidate records its digest and `cto-verification-required`;
the machine validates shape/binding, not truth, practical completeness or CTO acceptance.

Before accepting/escalating the candidate, the CTO independently corroborates critical primary
references with fresh observations, checks newest authority/budget and any remaining practical
route, then records the digest, facts/acquisition times, accepted narrow scope or rejection/next
action, continuing work and wake in the existing incident/worklog. A self-attested CTO approval
cannot satisfy that check. Telemetry/authentication safety waits remain distinct from blocker
proof and never grant a model launch. The operating mandate records actual internal reporting
cadence and stall threshold separately from quiet user notifications; no new scheduler is added.
The CTO returns a rejected candidate's practical next action to the same work through
its supported evidence route: `repair-diagnostic` for the current failed attempt, or
`record --kind failure` with the exact current, already-bound execution identity while
the attempt remains active. Both append through the existing repair owner; a PM/worklog-only
rejection does not change its live context. Do not alter attempt state, lease, history or
clocks merely to make a route accept it.

The repair check gate reads the exact head's paginated `filter=all` inventory.
Failures, pending/unknown results and non-Actions cancellations still block. The
only cancellation exception is a completed GitHub Actions job with explicit empty
steps and unassigned runner fields, linked through its exact check/job/run IDs to
a strictly later successful SourceCI run in the same PR head repository/ref,
event, workflow ID/path and unambiguous job-name context. The successor workflow,
job and check must all succeed; skipped/neutral do not discharge a cancellation.
Same-run rerun supersession is deliberately unsupported.

For that exception, the worker reads complete same-head workflow inventories,
including newer queued runs that have not created checks, and complete selected
attempt-job lists. Counts, duplicate identities, malformed metadata, API failures
or changes across two finite acquisition views retain the checkpoint. The bounds
are 10,000 checks/jobs and fewer than1,000 same-head runs, because GitHub caps the
filtered workflow search at1,000. This establishes a bounded observed view, not
a lock against future provider events. Resolved reusable-workflow provenance is
retained in the verified result evidence. A floated `@main` may advance under
authoritative SourceCI; a declared immutable reference cannot contradict its SHA.
The exact merged PR/head, local independent-review record and actual merged-source
checks still run. A source merge does not update an already loaded worker runtime;
consumer adoption is a separate normal operation. See GitHub's
[check-run filter](https://docs.github.com/en/rest/checks/runs#list-check-runs-for-a-git-reference),
[workflow search bound](https://docs.github.com/en/rest/actions/workflow-runs#list-workflow-runs-for-a-repository)
and [attempt jobs](https://docs.github.com/en/rest/actions/workflow-jobs#list-jobs-for-a-workflow-run-attempt).

For multiple native workers, pass `--host-id ID` to `cd worker --executor local`.
Assign a distinct, stable nonsecret ID to each Mac/user/Codex session store; reuse
it across restarts of that same store, and change it after replacing or moving the
store. Existing callers default to the native operating-system hostname, which
must be unique across those workers. Pin explicit IDs when hostnames can collide.
The invocation records this identity without changing configuration or its digest.
Only the latest local invocation can supply a resume session, and only when its
recorded host matches. A foreign, legacy unidentified or sessionless latest local
invocation starts a fresh native session, even if an older same-host session exists.
Immutable task, diagnostics and prior durable checkpoint summaries/evidence remain
in the prompt; native session files and authentication stores are never copied.
The global local-subscription reservation and Git CAS lease still allow one local
repair invocation at a time across hosts. Session, completion and error checkpoints
must retain the invocation owner and fence; a stale process cannot finish through
an error fallback. This supports recovery after quiescence, not concurrent unfenced
work or proof of actual two-host failover.

Native capacity, provider outages and rate limits are durable retryable waits.
They do not manufacture a repair defect. Real/unknown failures own durable agent
work, and two independent strategies precede technical human escalation. Explicit
operator pause records are honored by admission and promotion; issues are never
an arbitrary command-execution surface.

`cd quota --executor local|hosted` makes a no-model telemetry probe. Codex uses
`account/rateLimits/read`. A configured `MORPHEUS_CD_QUOTA_FILE` or executor
`quotaFile` supplies actual `{observedAt, source, windows:[{id,usedPercent,resetsAt}]}`.
The native account reader gives the configured shim up to 60 seconds total,
including initialization and its config checks; the final rate-limit RPC gets
at most 10 seconds within that remaining total. Stderr is drained without
retaining provider text. The reader recognizes only the configured Evo helper's
exact `Evo CD worker: startup failed (phase=... kind=...)` line: phases are
`pin`, `version`, `scope`, `inventory`, `policy`, `final-verify`, `exec`, or
`config-`/`policy-` followed by `launch`, `initialize`, `read`, `drain`, `validate`
or `cleanup`; kinds are `invalid`, `timeout`, `os-error`, `exit`, `protocol`,
`bounds`, `eof` or `output`. Only `os-error` may add `errno=1..4095`, and only
`exit` may add `code=-255..255`, using canonical decimal integers. Parsing is
capped at 128 bytes per newline-terminated line and 4096 bytes per read; oversized
lines, trailing text and all other stderr remain discarded. The first recognized
line is included in the quota error when already available. If it arrives after
failure, it is emitted once to the worker's private stderr with the reader PID,
read phase and elapsed time. No failure waits for stderr or gains cleanup grace.
The `cd quota` and `cd worker` executables set their exit status while the owned
reader's existing stream and cleanup handles drain. Quota rejection and the
worker's budget-wait result still happen immediately; process exit preserves
late diagnostics and the existing three-second cleanup fuse. Other CLI commands,
including the lightweight `context record-read` path, retain immediate exit.
Failures report a fixed phase and elapsed time. A
configured reader that cannot spawn or exits early also reports only its numeric
OS error or exit code, rather than waiting for the initialization deadline.
Every call still reads fresh telemetry and requires explicit ordinary allowance;
there is no retry, cached-value or file fallback. Snapshot age and window expiry
are checked at actual completion, after cleanup, against the existing five-minute
freshness limit. The 30-second worker meter skips overlapping reads; missing
telemetry checkpoints the owned invocation immediately at the read bound.
Admission and metering distinguish `wait-subscription-telemetry` from actual
`wait-measured-subscription-capacity`; an initialization timeout establishes no
measured exhaustion. Failed admission login verification instead records
`wait-subscription-authentication`, without copying the command's output. All
three refuse invocation while their prerequisite is unavailable. The guarded
`agent-budget-wait` journal kind remains compatible, with a separate failure
class in each new admission event's identity and result.

Only the no-model reader uses `quota-reader.py`. It creates a private foreground
session with a live group leader retained unreaped through the final group
signal, so an exited shim cannot release that PGID for reuse. Reader cleanup has
a separate two-second bound and a three-second parent fuse. Failure does not
wait for this cleanup before checkpointing; success is withheld until the
supervisor confirms termination and exits successfully. Unknown group identity,
cleanup timeout or missing confirmation never grants quota. No process-name
census or model-guardian change is involved. The trusted configured command and
its children must stay in this foreground session; detached children are outside
this bounded contract and require diagnosis, not broad signalling.
The live leader sends fixed failure status through a private pipe to its
supervisor; the configured reader cannot inherit that pipe or FD3. Only the
supervisor writes the bounded status and final cleanup frames on FD3. Reporting
an exited reader never releases the leader before the existing final signal.
When its supervisor disappears, the still-live private leader kills its own
group; it cannot leave an immortal reader group after the parent fuse fires.
Post-reap Darwin permission responses are observed until the same cleanup bound.
Adopting the source in a pinned native worker runtime is a separate reviewed
quiet-host operation; source tests do not establish actual host quiescence or
quota readiness.

Worker claim clocks start after quota and login admission, inside each CAS
transition attempt rather than at worker entry. An accepted attempt uses that
clock for ownership/competing-reservation expiry checks, `invocations.startedAt`
and the unchanged `agentMinutes + 2` lease duration. A CAS conflict recomputes
the clock and validates the same measured quota again; transaction event `at`
continues to identify when the transaction was requested. No source, slot, debt,
deadline policy or operational cursor is reset by claiming work.

After acknowledgment, quota age/window expiry is checked once more before
launch, without another account read or any cached fallback. A failed check
uses the existing fenced error checkpoint to release only this unstarted
invocation's lease; a changed owner/fence is preserved. The returned claim must
also still name this owner/fence and have strictly more time remaining than the
configured agent duration; equality is refused without extending or renewing it.
Claim write/acknowledgment and post-check process setup still consume lease margin,
and unchanged guardian teardown can exceed that margin under load. The correction
gives no universal completion/quiescence bound and does not extend the 45-minute default execution
budget, the five-minute quota TTL or the 30-second nonoverlapping meter.

Hosted Claude can read its authorized OAuth usage endpoint with five-minute cache
and 429 backoff. Failed reads report the HTTP status, an allowlisted provider error
category and a fixed hint when the response names the `user:profile` scope. They
never print arbitrary provider error text, which can echo credentials. A failure
retains the budget wait; diagnose the actual credential authority before retrying.
Configure the intended model explicitly (for example
`agents.hosted.model: "opus"`). Its snapshot joins shared five-hour/week windows with the matching
model-family week window, including an exact `model` attestation. Every required
window must be present, valid and nonexpired; null or absent model capacity is
unknown, never zero usage. Other model-family exhaustion is excluded only when
the executor names its model. Without a model, normalization conservatively
retains all available runtime windows. A telemetry file for an explicit hosted
model must attest that configured model and include its shared and model windows;
an old aggregate-only file cannot grant admission. Unknown/stale metrics retain
a budget wait. New subscription work
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
The initial repository metadata read uses GitHub's exact `/repos/{owner}/{repo}`
route; a trailing slash can return 404 even when the token can read the repository.

### Human-authorized spend-as-needed campaigns

A campaign can explicitly opt out of internal reservation holds without changing its
configuration identity or another ledger's defaults:

```sh
morpheus cd budget --operation spend-as-needed --config NATIVE_CONFIG \
  --campaign CAMPAIGN_ID --cap-micros 350000000 --authorization-ref HUMAN_APPROVAL_REF
```

These are placeholders. This audited normal Store transaction records the campaign,
cap, human authorization reference and adoption time in `budget.spendingPolicy`.
Use this mode only when the human has authorized spending without internal holds.
It is not a provider operation, account balance, new money or permission to change
credentials, source-review protections, subscription limits or uncertain-effect rules.
The policy remains attached to that campaign; changing its cap needs a new human
reference and a new audited transaction.

In this mode ordinary reserve admission checks **recorded spend plus the current
bounded request** against the campaign cap. It does not add outstanding reservation
maxima. All original request IDs/digests/statuses and real settlement tombstones remain
unchanged. A reservation records an operation identity, not money held aside; it does
not subtract from remaining budget until actual spend is recorded. Multiple outstanding
operations can therefore overlap, and delayed/unknown provider charges can exceed the
cap before accounting catches up. Monitor actual costs and notify the human when the
budget is exhausted; do not infer zero charges or invent settlements. Recording a real
late expense is allowed even if it reveals an overspend.

`cd status` includes `budgetStatus`: mode/campaign, cap, recorded spend, zero internal
holds, remaining against recorded spend, unsettled-operation count and any recorded
overspend. Remaining is explicitly **not** provider credit, bank balance or final invoice.
For example recorded spend44.232828 against cap350 reports305.767172 remaining even
when historical request maxima total238.515115. Raw reservation history is still present.

Without this opt-in, ordinary admission still uses recorded spend plus reserved maxima
against the configured limit (at most250); subscription80/90 defaults remain unchanged.
The explicit source-grant route is separate and retains its strict source-only contract.
No financial grant/reviewer is needed merely to activate a human-authorized no-holds
policy; normal source review/CI and operational authorization still apply.

Older runtimes do not understand the new admission mode. A qualified updated CLI can
activate it and reserve an exact original request/ID/maximum. The unchanged older CLI
can replay that already-reserved identity without another liability; it will still apply
its old cap to NEW IDs. Autonomous future new-request admission therefore needs normal
updated-runtime adoption; the policy command does not install or restart services.

`cd budget --operation reserve|settle` exposes replay-safe paid request reservations
in integer microdollars. Request identity and maximum liability are immutable;
timeouts retain liability and settled tombstones prevent duplicate charging.
Together admission cannot exceed the configured ceiling, at most $250. The
controller has no implicit paid-provider fallback. Operational acceptance must
include any task spend incurred before ledger initialization.

An optional explicit [reviewed source publication grant](cd-source-finance.md) applies
only to budget reserve in the `source-ci-` namespace. It binds the actual request,
supplied and stored configuration identities, epoch, finite source scope, amount,
aggregate ceiling and short admission window, with normal CAS and complete receipt
readback. Grant values come from that engagement's independently reviewed evidence.
Without an opted-in spending policy, the ordinary `reservePaid`/`cd budget reserve` guard refuses new paid reservations
that would exceed its configured ceiling, at most $250; exact old reserved paid identities
still replay. This dollar guard does not gate local delivery intent creation, attempt
planning or dispatch, whose other existing controls remain unchanged. The source grant
itself authorizes no native operation and dispatches no work or provider effect.

Focused tests cover protocol counterexamples and actual local Git, ES256 signing,
receipt producer and artifact bytes. They do not count
as TestFlight deliveries. The eight real deliveries and normal scheduled-path
proof remain consumer acceptance work under the approved design.


### Hosted GitHub App credential transport

The Claude App OIDC exchange remains bound to an authorized Actions run and its
reviewed default-branch workflow. Treat its `token` or fallback `app_token` as an
opaque printable single-line credential: JWT-style punctuation or future token
formats do not justify rejecting a successful response. Reject nonstrings, empty
values, whitespace and control characters before any mask/output write. Escape
percent signs in the GitHub masking command, and write the exact token only to
`GITHUB_OUTPUT`; summaries/errors never include its value. Capability proof still
requires the real scoped workflow-write/readback/cleanup probe, followed by
revocation. Parser tests do not establish actual authority or model capacity.

### Internal beta readiness

Apple `VALID` processing alone does not make a build assignable to a beta group.
The controller waits for `READY_FOR_BETA_TESTING` or `IN_BETA_TESTING` before
claiming internal group promotion. Missing or other beta states retain the accepted
upload and use the existing bounded processing diagnosis. Successful assignment
still requires exact group membership readback and unchanged receipt validation;
a readiness delay never authorizes another upload.
