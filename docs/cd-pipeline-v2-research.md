# Morpheus agentic CD v2: architecture research appendix

Research date: 2026-10-18. This is an external-source research and design recommendation, not an audit of the Morpheus/Evo implementation. Public documentation, release metadata, and selected source files were read; no packages were installed or executed. Repository-specific facts below were supplied by the parent task. No credentials were read. Release versions are observations at this date, not floating-version installation recommendations.

## Decision and required outcome

Recommend a small, deterministic Morpheus controller with an authoritative GitHub state branch, short GitHub-hosted reconciliation jobs, and supervised Mac executors. Reuse the existing two-slot Tart dispatcher and existing agent/bot capabilities. Local SQLite may be a disposable index/cache, but should not be the sole source of pending delivery or repair intent. Do not adopt Temporal or gh-aw as a prerequisite for v2. Borrow their durable execution and constrained-effect patterns.

The accepted delivery boundary is **production-configured Evo available to the configured internal TestFlight group**, never public App Store distribution. Validation requires eight real Apple end-to-end lineages, four staging and four production, spanning historical failure cases and injected faults. Retries and successive repairs remain within their original lineage. Simulations test mechanics but do not count as deliveries.

The existing resources are a Mac with two Tart VM slots, GitHub administration for Evo/Morpheus, Apple access and valid signing material, local agents, and an authorized Together.ai fallback capped at $250 for the task. These resources establish a plausible implementation route, not proof that an unattended cold boot or hosted fallback already works.

## Smallest adequate execution topology

1. **Morpheus control code:** a versioned library/CLI with pure scheduling, transition validation, evidence checking, budget accounting, and project adapters. Prefer the repository's existing language; a Python standard-library implementation can avoid an added orchestration package. Evo config supplies repository/app identities, relevant paths, build command, production configuration, TestFlight group, and schedules.
2. **GitHub state branch:** append-only events plus a compact derived snapshot. Store source/pipeline/config identities, due slots, lineages, attempt ownership, operation intents, receipts, repair PR state, budget reservations, and pause provenance. Do not store credentials, raw model transcripts, or large build artifacts here.
3. **Hosted reconciler:** a short Linux job on schedule and explicit events. It reads authoritative state and external evidence, creates missing due work, resolves completed/failed/uncertain operations, and starts eligible deterministic or agent work. It does useful work when the Mac is absent: Apple processing/group reconciliation, GitHub check/review/merge reconciliation, and remotely executable diagnosis/repair/review if its model access is configured.
4. **Mac worker:** a launchd-supervised process or periodic worker that claims persisted tasks, invokes the existing VM dispatcher, runs local agents, and records evidence. Closing Codex must not stop this process. Bootstrap and restart behavior are tested explicitly.
5. **One shared effect protocol:** every executor uses the same IDs, state transitions, resource accounting, and final evidence predicates. Neither a model's “done” message nor a green control job marks a delivery successful.

This topology is an engineering recommendation, not a claim that GitHub supplies a general transactional database. Its small workload makes Git useful, provided the CAS and recovery rules below are enforced and tested.

## Durable state and exact failure semantics

Use a private, isolated Git object store for state operations. Read state at head H, validate it, construct one child commit with parent H, and publish only if the remote still equals H. Git documents the exact expected-value form `--force-with-lease=<ref>:<expect>`; do not rely on implicit remote-tracking refs that background fetch can change. The controller must independently require the new commit to be a single-parent descendant, so the lease mechanism never authorizes history replacement. On conflict, fetch and recompute the transition; never merge conflicting JSON snapshots mechanically. [Git push semantics](https://git-scm.com/docs/git-push)

Protect the branch against deletion/history rewriting and check an installation/state identity. A missing previously initialized branch is a recovery incident, not a new empty queue. Preserve request IDs across compaction; keep events/evidence needed to establish old external effects. Keep a second recoverable copy of the branch, but do not allow that copy to become a competing writer automatically.

| Interruption | Required recovery behavior |
| --- | --- |
| Crash before durable intent | No side effect is permitted. Recompute the task. |
| Crash after intent, before external call | Reconcile the operation identity; absence of a receipt does not prove the call never happened. |
| Crash after successful call, before receipt | Query the actual service using the persisted operation identity. Do not allocate a new upload/build/PR merely because the local command failed. |
| Lost Git push response | Fetch remote state and look for the exact request ID before retrying the same transition. |
| Two controllers claim one task | Only one CAS wins. The loser performs no external effect. |
| Worker heartbeat disappears | Mark ownership uncertain. Expiry alone is not proof that an old process or VM stopped. |
| Old worker returns after reassignment | Its ownership epoch cannot write new state or obtain new effect authorization. Reconcile any effect already in flight. |
| GitHub is unavailable | Persist local diagnostics; stop starting effects whose authoritative intent cannot be committed. Reconcile after recovery. |
| Apple processing is slow | Persist a timed waiting state; release the build slot and poll later. Do not spend model turns diagnosing an ordinary wait. |
| Agent exceeds time/quota | Preserve its branch and attempt record; retain uncertain spend reservations; schedule an allowed fresh continuation or durable budget pause. |

**Fencing caveat:** a ledger lease cannot retract an Apple or GitHub request already accepted. Before reassigning a mutation, verify termination/quiescence or reconcile its externally unique identity. Independent PR branches and uniquely allocated app/version/build identities narrow the ambiguity. Do not claim exactly-once arbitrary external writes.

Separate `slot reserved`, `worker launched`, `artifact produced`, `upload attempted`, `Apple build found`, `internal group available`, and `delivered`. A job can fail after completing a useful external action. Conversely, success of a dispatcher proves only dispatch.

## Scheduler and backlog semantics

GitHub explicitly documents that scheduled runs may be delayed or dropped under load, run from the default branch, and can be disabled after 60 days of inactivity in public repositories. Its shortest schedule interval is five minutes. Therefore schedule invocations are wakeups, not delivery records or reliable wall-clock alarms. Use off-hour minutes and compute due slots from persisted state. A local periodic worker provides another wakeup path while GitHub remains reachable. [GitHub scheduled events](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule)

GitHub's default concurrency group retains only one pending run; a newer run replaces that pending run. `queue: max` allows up to 100 pending runs, still a finite queue. It cannot be combined with `cancel-in-progress: true`. Ordering is not guaranteed by dispatch time. Use concurrency to limit redundant reconcilers, while all actual work remains in the ledger. [GitHub concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency)

Self-hosted jobs wait for an online matching runner but expire after 24 hours queued. A run also has a finite overall lifetime. Reconcile expired jobs and reissue eligible work from the ledger; do not leave a multi-day repair or 24-hour age wait embodied only in a sleeping Actions job. Runner software also needs regular updates; GitHub documents refusing jobs to runners that miss its update window. [Self-hosted runner routing](https://docs.github.com/en/actions/reference/runners/self-hosted-runners), [Actions limits](https://docs.github.com/en/enterprise-cloud%40latest/actions/reference/limits)

Recommended project semantics:

- **Staging:** each six-hour slot evaluates relevant changes since the last verified delivered baseline, including shared code, pinned dependencies, build inputs, and configuration. Persist chosen work before dispatch. A failed delivery remains pending even when the next six-hour window contains no new commits. Newer due work may explicitly cover older undelivered changes, but original incidents and acceptance lineages must not disappear through implicit coalescing.
- **Production:** each daily slot selects an eligible protected-main SHA and records it immutably. Do not skip solely because yesterday selected the same SHA. Record missed daily slots and apply a documented catch-up policy; never silently pretend a missed slot ran.
- **Age:** use a trustworthy protected-main arrival timestamp for the exact app SHA, not a forgeable author date. For historic SHAs, use verifiable merge/event evidence or a conservative recorded first-seen time. New app repairs must age; orchestration repairs can operate on already eligible app inputs. Changes to dependency resolution, generated app code, or production configuration are not merely orchestration.
- **Repair wait:** a known-bad eligible SHA is quarantined. A new repaired SHA waiting to age is a durable waiting state, not a reason to rerun the same failing build or ask for an age exception.
- **Historical tests:** use already eligible historical source and real Apple upload paths. Put novel app-code repairs primarily in staging cases; production fault cases can target transport, control, and runner failures or historically repaired commits. A fake clock must never make a genuinely young production app SHA eligible for a real counted delivery.

## Autonomous repair, review, merge, and verification

The agent loop should be an explicit persistent state machine:

`failure evidence -> diagnosis -> candidate PR -> deterministic checks -> fresh review -> resolve findings -> merge -> verify main -> retry original delivery -> reconcile Apple -> delivered`

The controller handles clocks, budgets, app identities, source selection, slot limits, allowed transitions, checks, review binding, merges, and success predicates. Agents explain failures, design patches, implement them, review them, and propose additional experiments. Their inputs include immutable log/artifact references and exact source/config versions; logs are evidence, not authority to change project or stop policy.

Bind every review to the exact PR head SHA and validation evidence. Any new commit invalidates the old review for merge. A fresh reviewer receives the requirements, candidate diff, relevant source, and test evidence rather than the author's persuasive transcript. Use the existing authorized bot identities consistently and record which actor performed each operation.

GitHub's merge API accepts an expected head `sha`; asynchronous merge acceptance and queue admission do not prove a merge occurred. Persist the request/result identity, confirm actual merged state and resulting main SHA, and validate that main result before retrying delivery. For lost acknowledgments, query the existing PR rather than creating another repair. [GitHub merge API](https://docs.github.com/en/rest/pulls/pulls#merge-a-pull-request)

Do not assume bot-created PRs automatically run CI. Current GitHub documentation says `GITHUB_TOKEN` pushes do not trigger new workflows; certain PR events create approval-required runs. Explicit `workflow_dispatch`/`repository_dispatch` still create runs, and App/PAT credentials can trigger workflows automatically. Use the already authorized appropriate bot credential or an explicit validated dispatch route. This is an implementation choice, not a new routine human approval gate. [Workflow triggering](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow)

Default repair escalation should require several independently evidenced approaches, not three identical reruns. Record hypotheses, changes, outcomes, and remaining blockers. Independent diagnosis, different reproduction, and an alternate patch can count; transport retries cannot. Budget exhaustion, unavailable physical hardware, or an actual authorization denial can prevent another attempt and must be recorded honestly. Do not manufacture failed attempts merely to satisfy a numeric threshold.

## Apple evidence and eight-run acceptance

Apple distinguishes processing/upload outcomes from a build ready for internal distribution. Internal groups can receive builds automatically or manually. Readiness should bind app ID, version/build number, production/staging configuration identity, selected SHA, artifact digest, processing status, and configured group membership. Store the API observations and timestamps sufficient to repeat the check; do not infer installability from transporter exit code. A real device installation smoke test is useful evidence beyond server status where an unattended test device route exists. [Apple build statuses](https://developer.apple.com/help/app-store-connect/reference/app-uploads/app-build-statuses), [Internal testers](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers)

Preallocate build identity in the ledger before packaging/upload, and tie each identity to immutable artifact bytes. A transport timeout preserves that allocation until reconciled. Never “fix” uncertainty by allocating a fresh build number and counting the replacement twice. A terminally invalid binary may require a new attempt/build number, still within the same lineage.

For the acceptance report, list eight immutable lineages in execution order, four per channel, with source selection/age evidence, injected failure, all repair attempts and PRs, final Apple build ID, group evidence, and final result. Keep failures visible inside successful repaired lineages. Skips and dry runs are not successes; abandoned terminal failures cannot be omitted from a claimed consecutive streak.

## Host failure, session exit, and the actual fallback

Apple documents launchd `KeepAlive` for a service that must remain running. Use supported launchd supervision, not a background command attached to the current Codex session. Test process kill, worker restart, login/logout as applicable, and reboot. Identify whether the executor is a login agent or boot daemon; signing/keychain access after reboot must be tested rather than inferred from a successful interactive signing check. [Apple launchd guide](https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html)

The hosted fallback must demonstrate an actual state transition while the Mac worker is deliberately stopped: query Apple, settle an existing upload, reconcile a repair PR, start a permitted remote diagnosis/review, or enqueue a recoverable command. Posting an issue that says “Mac offline” does not satisfy this requirement.

For a practical off-host repair route, run a short Linux repair/review job against a fresh checkout, with a persisted attempt ID and the existing authorized model provider. If the existing gh-manager/GitHub App can mint an installation token in Actions, scope that token to the required repositories and operations; otherwise use the already authorized bot route the parent has verified. Merely having credentials in the Mac's local configuration is insufficient: the hosted job must be able to obtain its credentials while the Mac is stopped. This research did not inspect gh-manager or establish that its App key is already available in Actions. Make that a bounded prototype check, not a new account requirement. Hosted code repair/review can proceed without Xcode; merge remains gated on the required Mac validation and exact reviewed head. A separate lightweight local supervisor should detect stalled progress, terminate an identified hung process group safely, and restart the worker; KeepAlive alone detects exit, not an agent that stays alive forever.

There is no evidence that GitHub can power-cycle this Mac or that another signing-capable macOS host is authorized and configured. Total Mac hardware/network loss therefore preserves work and permits non-Mac progress, but pauses iOS compilation/signing. The two Tart slots share one physical failure domain. A remote recovery tunnel, second Mac, or paid hosted macOS build route would be additional infrastructure, not a property of an orchestration library. Do not claim uninterrupted delivery through permanent Mac loss.

## Package and platform comparison

Latest-release and last-push metadata were read directly from the public GitHub API on 2026-10-18. Recent pushes show activity, not a reliability guarantee. Documentation can describe changes newer than a pinned release; adoption would require testing the exact selected version.

| Candidate | Verified release/activity | Added runtime/operational footprint | Assessment |
| --- | --- | --- | --- |
| Small Morpheus controller | New first-party code using existing tooling | Git/GitHub, current language runtime, existing launchd/Tart/agents; optional standard-library SQLite cache | Recommended for this bounded workload. Must earn durability through explicit invariants and failure tests. |
| GitHub Agentic Workflows | [v0.92.0](https://github.com/github/gh-aw/releases/tag/v0.92.0), 2026-10-15; public repo pushed 2026-10-18 | CLI compiler, generated lock workflows, pinned runtime actions, chosen agent, Node runtime, default AWF sandbox | Maintained and useful, but not necessary for v2. Consider later for standardized hosted agent execution. |
| Temporal | [Server v1.32.1](https://github.com/temporalio/temporal/releases/tag/v1.32.1), 2026-10-08; [Python SDK 1.34.0](https://github.com/temporalio/sdk-python/releases/tag/1.34.0), 2026-09-30; both recently pushed | Service plus persistence store or Temporal Cloud, workers, SDK, deployment/versioning operations | Strong durable execution; reject as initial dependency because this task does not require a new workflow service. |
| Litestream | [v0.5.17](https://github.com/benbjohnson/litestream/releases/tag/v0.5.17), 2026-08-31; pushed 2026-10-16 | Separate replication daemon, remote destination and credentials, restore procedure | Maintained backup option; does not supply remote scheduling, single-writer election, or exactly-once effects. |
| JalapenoLabs self-repair | [v0.2.1](https://github.com/JalapenoLabs/self-repair/releases/tag/v0.2.1), 2026-04-06; last push 2026-04-09 | Node >=20; seven runtime dependencies including Claude agent SDK, Codex SDK, Octokit; provider credentials | Real implemented CI repair reference. No recent maintenance evidence; insufficient delivery lifecycle. Do not adopt. |
| ai-ci-healer | [v1.0.0](https://github.com/mariorazo97/ai-ci-healer/releases/tag/v1.0.0), 2025-11-27; last push same day | Node >=20; Actions core/GitHub dependencies; model provider | Its inspected entrypoint generates and posts suggestions, rather than completing repair/review/merge/delivery. Reject as an execution engine. |

### What gh-aw contributes and what it cannot remove

Its official CI Doctor workflow performs failure investigation and issues/comments; that is useful evidence collection, not an entire repair-to-delivery loop. Agents normally run read-only and publish validated safe outputs. The default agent timeout is 20 minutes. [CI Doctor](https://github.github.com/gh-aw/gallery/ci-failure-investigation/), [Rate controls](https://github.github.com/gh-aw/reference/rate-limiting-controls/)

Its supported self-hosted runtime requires Linux and Docker; macOS/Windows are not supported for that route. A macOS-compatible CLI does not imply a macOS-compatible AWF job. Adoption would introduce a hosted Linux agent plane alongside the Mac builder. [Self-hosted runners](https://github.github.com/gh-aw/reference/self-hosted-runners/), [Runtime selection](https://github.github.com/gh-aw/reference/agent-runtimes/)

The current work queue already models claims, reservations, completion versus independently verified delivery, and reconciliation. Defaults are concurrency 16 and three attempts. A missing queue branch can lose prior identities/evidence. Its docs explicitly retain uncertain native writes rather than blindly replaying them; some backing issue/comment creation ambiguities remain pending indefinitely because automatic safe fence-clearing is unimplemented. These are valuable design lessons, not a reason to assume our simpler ledger can ignore the same uncertainty. [Work queue reference](https://github.github.com/gh-aw/reference/work-queue/)

### What Temporal contributes and what it cannot remove

Temporal requires deterministic orchestration and puts nondeterministic LLM/tool operations in activities. Workflow-code changes can break replay, so upgrades need replay/versioning tests. An activity can complete its external action and crash before reporting completion; it will then run again. We must still supply idempotent operations or service reconciliation. [Durability/determinism](https://learn.temporal.io/tutorials/go/background-check/durable-execution/), [Activity idempotency](https://docs.temporal.io/activity-definition)

Production requires workers and a production service, self-hosted or Cloud; the single-binary development server is not evidence of a production deployment. Self-hosting adds persistent infrastructure, upgrades, monitoring and restoration duties. Cloud adds a separate service/account/cost decision. [Production deployment](https://docs.temporal.io/production-deployment), [Production readiness](https://docs.temporal.io/self-hosted-guide/production-checklist)

The inspected Python SDK manifest requires Python >=3.10, Nexus RPC, protobuf, typing extensions/types, and dateutil on older Python; agent integrations are optional extras. This is not an excessive client footprint by itself—the larger cost here is operating the service and preserving workflow compatibility. [SDK manifest](https://github.com/temporalio/sdk-python/blob/main/pyproject.toml)

### Why SQLite plus backup is the weaker authoritative option

SQLite WAL is robust for local transactions, but requires processes sharing the database to be on the same host. A live WAL database is not safely backed up by copying only its main file; use SQLite's supported backup mechanism or a suitable replication tool. [SQLite WAL](https://sqlite.org/wal.html), [Backup API](https://sqlite.org/backup.html)

Litestream continuously replicates WAL data asynchronously. Its documentation identifies a data-loss window and warns that multiple applications writing replicas into the same destination can make restoration impossible. Therefore it does not make a host-local controller active/active or guarantee that the latest external-effect intent survived host loss. [How Litestream works](https://litestream.io/how-it-works/), [Caveats](https://litestream.io/tips/)

A local-primary alternative would need: an externally durable intent before each side effect; restoration from a transactionally consistent snapshot; a remote ownership/fencing authority before promotion; and reconciliation of unreplicated operations. With GitHub already available for all of these, a Git-authoritative ledger is simpler than reconciling two competing authorities. SQLite remains useful as a rebuildable index, log buffer, and local worker checkpoint cache.

### Source inspection of real self-healing CI

`self-repair`'s own validation workflow gathers deterministic failure evidence before invoking its agent and uses raw step `outcome` values because `continue-on-error` can obscure failures in API conclusions. It prevents recursive repair on `self-repair/*` branches and sets a 15-minute repair timeout. Those are concrete implementation choices to learn from; excluding repair branches also prevents the persistent layered repair behavior we need. [Actual workflow](https://github.com/JalapenoLabs/self-repair/blob/main/.github/workflows/validate.yml)

Its action defaults to fetching/installing `self-repair@latest`, permits up to 50 turns per engine invocation, and may mutate a PR branch directly. Its library documents dropping excess concurrency requests and repairing only simple cases. These are insufficient durability/acceptance guarantees. Pin reviewed code if borrowing anything; prefer reusing the decomposition rather than its runtime. [Action source](https://github.com/JalapenoLabs/self-repair/blob/main/action.yml), [Package dependencies](https://github.com/JalapenoLabs/self-repair/blob/main/package.json), [Project behavior](https://github.com/JalapenoLabs/self-repair)

The inspected `ai-ci-healer` entrypoint fetches logs, analyzes them, gets a model suggestion, applies a confidence threshold, optionally posts a comment, and sets outputs. It contains no patch/test/merge/delivery loop. Its package metadata and release history do not justify treating it as a maintained autonomous repair supervisor. [Entrypoint](https://github.com/mariorazo97/ai-ci-healer/blob/main/src/index.ts), [Manifest](https://github.com/mariorazo97/ai-ci-healer/blob/main/package.json)

## Resource ceilings and unattended operation

Reserve the worst-case cost of a bounded Together call before starting it using the authoritative ledger; settle from reported usage afterward. Unknown outcomes retain reservations until reconciled. Enforce the $250 total task ceiling across both local and hosted agents, not separately per executor. Disable unbounded SDK retries and hidden cross-provider fallbacks that bypass accounting. Preserve the user's quota reserve; persist a budget wait instead of losing pending work.

A hosted fallback requires model credentials available to its runner; credentials existing only on the unavailable Mac cannot help it. Configure an already authorized provider route and verify a bounded invocation before claiming fallback works. No new provider account is inherently required. Exact model/provider availability and cost should be recorded rather than silently substituting models.

Hosted scheduler jobs can consume GitHub minutes even when they only poll. Current billing documentation says self-hosted runs and standard hosted runs for public repositories are free, while private repositories draw on plan quotas and then incur charges. Use a modest external heartbeat plus event-triggered active reconciliation, inspect actual usage, and configure the existing billing limits rather than presuming unlimited free polling. The $250 Together allowance is not automatically a budget for a new paid orchestration service. [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)

## Prototype tests required before committing to the design

These are recommended discriminating tests, not claims that they have run:

1. Kill the controller before intent, after intent, after upload acceptance, and after receipt construction. Verify one lineage, stable build identity, and eventual Apple reconciliation.
2. Run two reconcilers concurrently against the same due slot; force a Git CAS conflict and a lost push response. Verify no lost event or duplicated effect authorization.
3. Stop the Mac worker, execute the hosted reconciler, and prove a useful external state transition. Restart the worker without reopening Codex and resume the original task.
4. Reboot in the intended unattended service context; prove dispatcher, agents, signing access, and durable state recover. Do not replace this with a process-only restart test.
5. Expire an ownership lease while its old worker remains alive; verify that the new worker cannot duplicate an upload or exceed two VM slots.
6. Inject a failed historical staging build, create a repair PR, receive a fresh review with findings, patch again, merge the final exact head, verify main, and finish the original delivery. Confirm CI really runs for bot-created PRs.
7. Drop scheduled wakeups and simulate an expired queued Actions job. Verify outstanding staging changes and production slots remain represented and recoverable.
8. Consume reserved budget to just below the cap; launch competing agents. Verify the cap holds globally and pending work resumes only with available budget.
9. Change the control implementation while a repair/upload is pending. Verify old schema/operation IDs remain understood or are migrated explicitly.
10. Complete and independently re-read the eight actual Apple delivery records, four per channel. Separate deterministic simulation results, fault evidence, and actual delivery receipts in the acceptance report.

The recommendation should be reconsidered if this prototype cannot safely resolve its operation ambiguities, if workload/concurrency grows substantially, or if multiple physical execution sites become a requirement. At that point Temporal or gh-aw may be worth their operational cost. Neither eliminates the need for app-specific evidence, budget limits, safe merge predicates, or hardware capacity.
