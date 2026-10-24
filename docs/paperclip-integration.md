# Explicit Morpheus / Paperclip execution linkage

This opt-in bridge links one Git roadmap item to any number of Paperclip execution
jobs. Git owns intent, source and acceptance references, final issue IDs and verified
evidence. Paperclip owns live task/run status, scheduling and its dashboard. A `done`
job never closes a roadmap item or substitutes for a PR, independent review, CI or
merge. Source implementation and synthetic tests do not qualify real project dispatch.

## Record and failure contract

Run the reviewed Morpheus checkout's `scripts/paperclip-bridge/cli.ts` with `pnpm exec
tsx`. It reuses Morpheus's roadmap parser and branch-ID parser. No shared PM schema or
CLI grammar changes, scheduler, provider login, enrollment or model invocation are added.

`prepare` reads an active claimed roadmap branch and committed source files. Only the
operator-selected task file is copied into the job description. The full roadmap and
other project Markdown are linked at immutable Git URLs. Each job records repository,
roadmap ID/path, job key, branch, source SHA, acceptance path/digest, selected instructions,
controller URL and exact company/project/assignee UUIDs. A different job key creates a
second child execution record under the same roadmap parent.

The roadmap's default `acceptance` uses Morpheus's existing `qa/acceptance/` convention
(a bare filename or a path beginning `qa/`). An explicit CLI `--acceptance` remains a
repository-relative path. Both must resolve to regular committed source files.

The deterministic operation ID hashes repository + roadmap ID + job key. Reusing that
identity with different immutable inputs is refused after an attempt. Do not recycle job
keys. Git files live at `.agent/paperclip/<roadmap-ID>/<job>.json`; commit them through
the task's normal branch. The first submission requires the complete prepared record
already committed. Linked records and evidence return through a reviewed commit.

Before POST, the operator writes an exclusive operation lock and durable journal under
the repository's common Git directory, `morpheus-paperclip/<operation-ID>.json`. Worktrees
of the same repository share this journal. The POST uses upstream issue-create
`idempotencyKey`, then GET reads the exact returned issue ID and compares the immutable
description, title, company, project, assignee and parent. A returned ID whose readback
fails is retained for observation. An unknown POST outcome is never automatically resent:
inspect upstream, then `link --issue <observed UUID>` performs exact readback. An absent
search result is insufficient evidence to repost. Keep the journal and use one operator
clone; disconnected clones do not share its claim. Upstream retention means its key
alone is not a permanent duplicate-prevention guarantee. Manual wakeup idempotency is
separate and failed in the pilot.

`status` returns current upstream status without writing it into Git. `reconcile` requires
a committed operator evidence receipt and committed regular evidence files whose hashes
match. It checks exact issue/source identity and `done` or `blocked` status, then records
that receipt. The operator must inspect evidence contents before attesting them: hashing
bytes cannot determine semantic correctness. The bridge never fetches worker comments
as acceptance, edits roadmap status, creates PRs, merges code or closes issues. A blocked
receipt requires concrete `needs`; use normal `morpheus pm block` separately when the
parent item is actually blocked. A new result requires a new job instead of rewriting
an accepted verification.

Transport has a ten-second bound, refuses redirects and credential-bearing URLs, uses
HTTPS or loopback HTTP, and emits fixed errors without provider response bodies. Supply
the token by environment-variable **name**, never a literal argument, task file or Git
record. Keep its source file and the owner credentials outside all model workspaces.
This is an operator boundary, not an OS sandbox against an operator's own account.

## Pinned upstream authentication findings

These findings were checked against installed `paperclipai`, `@paperclipai/server` and
`@paperclipai/shared` **2026.1012.0**, including the CLI source map. The corresponding
[tagged source](https://github.com/paperclipai/paperclip/tree/v2026.1012.0) is the upstream
reference; recheck after an upgrade.

| Pinned source | Finding |
|---|---|
| `server/src/middleware/auth.ts`, `actorMiddleware` | `local_trusted` grants an implicit instance-admin board actor without a token. `authenticated` starts with no actor. A loopback reverse tunnel does not narrow local-trusted authority. |
| `server/src/config.ts`, `auth/better-auth.ts` | Authenticated/private supports loopback. Explicit public base URL enters trusted origins; allowed hostnames also add actual listen-port variants. Email/password sign-in is enabled without required email verification. |
| `cli/src/commands/auth-bootstrap-ceo.ts` | Bootstrap reads **file config** deployment mode, requires the database running, refuses an existing instance admin unless forced, and writes a private invite URL to stdout. Never use `--force` for routine migration. |
| `server/src/routes/access.ts` | A signed-in local operator accepts a bootstrap invite with `{requestType:"human"}`. Named board keys belong to that user; `requestedCompanyId` is not a key authority scope. |
| `packages/shared/src/validators/agent.ts`, `server/src/services/authorization.ts` | `task_bridge` keys require a project or parent boundary, restrict assignment and allow only assigned or bridge-created issue reads/writes. Peer-agent/runtime/secret/company/project APIs and `agents:create` are denied. `skill_test` keys scope one harness issue. Standard run JWTs are not inherently own-issue-only. |
| `server/src/services/issues.ts` | Issue creation has a database-locked idempotency key and retention cleanup. This is distinct from wakeup keys and is reinforced by the bridge's durable no-repost journal. |

The bridge verifies anonymous rejection on the company-agents route and requires
`/agents/me` to report a `task_bridge` token for exactly the intended project and allowed
assignee. These checks do **not** qualify worker run-token isolation. Keep the operator
bridge token out of worker environments. Probe actual worker credentials separately;
if standard tokens can read peers or change runtime configuration, retain artifact-only
workers with controller-owned API writes and independently proved network denial, or
use a supported narrower credential. Do not infer a guarantee from the token's name.

## Reversible authentication rollout on the existing controller

The existing controller uses port 3100, company/history in its existing database and
LaunchAgent `ing.paperclip.paperclipai`. Air forwards that board to
`http://127.0.0.1:33100`. Keep both identities and paths. Do not publish a local-trusted
board on Tailscale or leave a second reachable local-trusted admin endpoint while
experimental workers run. The old pilot remains paused until the applicable boundary
is proved. A browser login screen is expected after authentication is enabled.

`scripts/paperclip-bridge/auth-rollout.py` stages private candidate config and LaunchAgent
files without changing the service. It adds a generated `BETTER_AUTH_SECRET` outside
workspaces, preserves the database/instance/program command, binds authenticated/private
to loopback 3100, trusts Air's explicit 33100 origin and the allowed 3100 host variants.
It prints no secret. Use a fresh private directory; snapshots cannot be overwritten.

The pinned CLI rewrites a local explicit base URL's port to the actual listen port.
Therefore the helper also persists `BETTER_AUTH_TRUSTED_ORIGINS=http://127.0.0.1:33100`;
the config field alone is insufficient for Air's forwarded origin. Better Auth signup
probes use that origin. Board ownership/key API requests use origin 3100 to match their
actual request Host, satisfying the board CSRF guard. Air's browser has matching Host
and Origin 33100 and must be checked separately through the real forward.

```sh
AUTH_SCRIPT=/absolute/reviewed/morpheus/scripts/paperclip-bridge/auth-rollout.py
AUTH_STATE="$HOME/.local/share/morpheus-paperclip/auth-rollout-2026-10-23"
python3 "$AUTH_SCRIPT" stage \
  --config "$HOME/.local/share/morpheus-paperclip/instance/instances/default/config.json" \
  --plist "$HOME/Library/LaunchAgents/ing.paperclip.paperclipai.plist" \
  --private-dir "$AUTH_STATE"
```

Before apply: verify installed package version is 2026.1012.0; pause all agents; disable
timers; prove no running/queued runs, empty per-host slots and reservations, and save a
normal private upstream database backup. The helper's `--drained` is an operator
attestation to those checks, not a substitute for them. The existing service owns the
database lifecycle. Apply reloads the same LaunchAgent with `bootout`/`bootstrap`, because
`kickstart` alone does not reload plist environment variables.

```sh
python3 "$AUTH_SCRIPT" apply --private-dir "$AUTH_STATE" --apply --drained
# Wait for the existing controller to become healthy; do not repeat apply blindly.
python3 "$AUTH_SCRIPT" claim-migrated --private-dir "$AUTH_STATE" --apply --drained
```

An existing local-trusted instance has a synthetic `local-board` administrator. Pinned
upstream supplies a native board-claim challenge only when that is the sole admin. The
`claim-migrated` command privately reads the latest challenge from the existing service
log, verifies its `available` status, and uses native signup/board-claim. Upstream replaces
that placeholder admin and grants the new owner access to existing companies. It never
forces a bootstrap invite past an existing owner. Its separate `claim-migrated-started`
journal permits inspecting a prior bootstrap refusal without overwriting that record.

For a fresh instance with **no** admin, use `bootstrap` instead; it captures CLI output
privately and accepts the first-owner invite. Both flows create a generated **local operator** identity
at `localhost.invalid` without sending email, save password/session privately, accept
the native ownership claim and create a named board key. They then disable sign-up
persistently and reload. They do not touch Codex/Claude provider logins. Inspect the
private state after any failure; `owner-started` deliberately refuses blind repeats.
An existing owner requires that owner's normal sign-in instead. Never paste invite URLs,
passwords, cookies or tokens into chat, Git, logs or model prompts. The private directory
contains credentials and backups and must remain mode 700 with mode 600 files.

Air's browser does not inherit the controller's operator session cookie. Open the existing
`http://127.0.0.1:33100` tunnel and use the native email/password sign-in with the local
operator identity saved in `owner-credentials.private.json` in the controller's private auth
directory. The authorized operator retrieves those fields over the existing SSH connection
to the controller, directly into their private terminal; credential output never belongs in
chat, Git or a model workspace. The device handoff supplies the exact SSH retrieval command.
The experiment controller temporarily seals that vault mode 000 while models run, so retrieval
waits for the operator to reopen it after those runs terminate.

For a signup interruption before a session exists, `resume-claim-migrated` reuses the saved
identity/password and signs in, without creating another identity. Only after the operator
proves a prior signup was rejected **before** user creation (for example, observed 403
`INVALID_ORIGIN` from the pre-handler guard) may that explicit resume also receive
`--signup-rejected-before-create`. It then reuses the exact saved signup input. It reads
the latest native challenge after a restart and retains original journals. A session or
board-key file indicates later effects may have occurred and prevents this replay route;
inspect exact native ownership/key state instead. No resume is needed after successful
owner/key creation.

Restore, only after pausing/draining again:

```sh
python3 "$AUTH_SCRIPT" restore --private-dir "$AUTH_STATE" --apply --drained
```

Restore puts back original config/plist and reloads; it preserves database history and
any newly created local owner. It also restores the old trust policy: workers must stay
paused until the network boundary is safe again. Partial service reloads require local
inspection before another action. No automatic database rollback or owner deletion occurs.

## Exact caller probes before consumer work

Use the real existing company/project/agent IDs and private token files. Requests below
are API paths relative to `http://127.0.0.1:3100`; store response bodies privately and
print only status, IDs and fixed boolean results. Repeat the anonymous probes from the
actual worker network route, including any reverse tunnel. A dashboard HTML 200 is not
an authenticated API proof.

| Caller and request | Required result |
|---|---|
| Anonymous GET `/api/companies/<company>/agents` and GET a known `/api/issues/<issue>` | 401 or 403; no board data |
| Anonymous POST valid process-agent body to `/api/companies/<company>/agents` | 401 or 403; board census proves no new agent |
| Owner session POST `/api/auth/sign-in/email` with `Origin: http://127.0.0.1:33100`, then owner GET `/api/cli-auth/me` | Successful sign-in/session; expected owner ID and instance-admin true. Also verify API access through 3100 and browser login through Air's forward. |
| Board POST `/api/agents/<bridge-agent>/keys` with `{name,scope:{kind:"task_bridge",projectId,allowedAssigneeAgentIds:[workerId]}}` | 201; store returned token privately. This is a Paperclip control-plane key, not a provider account. |
| Bridge GET `/api/agents/me` | Exact company/keyScope and planned assignee restriction |
| Bridge GET its bridge-created issue; GET an unrelated known issue | 200 for exact own linkage; 403/404 for unrelated issue |
| Bridge GET `/api/agents/<peer>`, GET `/api/companies/<company>/secrets` | 403/404; no peer config or secret data |
| Bridge POST `/api/companies/<company>/agents` with valid `{name,role:"engineer",adapterType:"process",adapterConfig:{command:"/usr/bin/true"},runtimeConfig:{heartbeat:{enabled:false}}}` | 403; board census unchanged. Unexpected creation is a failed isolation probe: keep paused and retire that exact probe agent with owner authority. |
| Actual worker run token on own issue, unrelated issue, peer-agent/config/secrets routes and valid process-agent POST | Own required access succeeds; other authority denied. If it fails, do not widen consumer dispatch. |

Assignment probes need a real positive control: the exact target assignee must be
invokable with no pending work before probing known real wrong-project or wrong-assignee
targets. A paused assignee returns 409 before the scope check and proves neither denial.
Restore the intended pause state after probes. For a real submission, resume only the exact
bounded assignee when its operator monitor is ready; issue assignment is the dispatch trigger.
Never add a manual wakeup after submission. The bridge conservatively retains any failed
POST as uncertain instead of silently buying another attempt.

Also prove the *actual executor's* sandbox boundary for hidden evidence: outside-workspace
read/chmod canaries, network calls to old board 3100 and database 54329, and any alternate
reachable endpoints. A similarly named sandbox profile is insufficient. Standard run
tokens, native model execution, controller restart adoption, cross-host failover and
simulator/CI ownership remain separate capabilities until empirically qualified.

## Qualified snapshot increment

The existing company `4925919d-5666-4a4e-b4c5-b59cc0176eee` was preserved through native
authenticated/private ownership migration. The controller proved anonymous rejection and
seven scoped API denials, then submitted each committed intent exactly once. Both jobs pin
`6ca59e8fedd3ee2552adfd3a365946049b3a4aef` and the original snapshot acceptance reference.
Their independently inspected artifacts, controller proof and hashed receipts are committed
under [the roadmap evidence directory](../.agent/paperclip/MO-26-10-23-00.15.26/evidence/).

| Job | Exact issue | Successful native run |
|---|---|---|
| `inspect-lineage` | `9ec1fa46-eb0f-4704-8382-615ad6a11b46` | `121f768d-a45b-480f-a5d1-e9a2057452ef` |
| `inspect-tests` | `ef2c23bf-0d44-4591-9405-afd4e4398ff0` | `0c34fd38-e907-4cc7-80c5-f933a4808020` |

The controller checked distinct nonces, artifact schemas/digests, all four source observations,
unchanged inventories of 1,835 source files and symlinks, and verified native termination.
Only the controller marked the issues done; bridge reconciliation then exact-read both issues
and recorded the previously committed receipts. Neither job changed roadmap status.

Both calls used the controller's native subscription, CLI 0.163.0, with requested
`gpt-6.1-sol` / `xhigh`; serving model and effort remain unknown because native JSON did
not report them. Raw input/cache/output tokens were 373456/318208/4030 for lineage and
339877/281216/3689 for tests. These counts are provider telemetry, not a price or estimate.
The tests observation led to two additional denial-before-POST regressions for `parentIssueId`
and `parentIssueIds`; the implementation already rejected those scopes. Author validation
also corrected default acceptance-path resolution to reuse the existing PM convention.
The original artifacts and source SHA remain unchanged after these improvements.

This establishes real read-only snapshot dispatch and evidence reconciliation. Standard worker
tokens are not thereby scoped, and consumer source authoring, protected per-host delivery,
simulator/CI ownership, restart adoption and failover remain unqualified in
[MO-26-10-23-19.45.05](../hq/product/roadmap/MO-26-10-23-19.45.05-qualify-paperclip-consumers.md).

## Running one low-risk repository task after qualification

Claim the consumer roadmap item with normal `morpheus pm claim`, follow its `WORK IN`,
read records and refresh/claim there. The operator owns one claimed worktree. Decompose
read-only research, implementation and result verification into distinct job keys when
needed; do not run concurrent authors in that worktree. Commit a bounded task file and
explicit acceptance file before preparing a job. Validate the exact worker/host/workspace
binding from owner authority before submission; the pilot artifact workspace is not
automatically a consumer checkout.

In this example `BRIDGE` is the absolute reviewed CLI path, `TASK_REPO` the actual claimed
checkout, and IDs come from the existing instance. No placeholder credential is accepted.

```sh
pnpm exec tsx "$BRIDGE" prepare --repo "$TASK_REPO" --roadmap "$ROADMAP_ID" \
  --job implement-fix --task qa/task.md --acceptance qa/acceptance/fix.md \
  --title 'Bounded repository fix' --api http://127.0.0.1:3100 \
  --company "$COMPANY_ID" --project "$PROJECT_ID" --agent "$AGENT_ID" --apply
# Inspect and commit .agent/paperclip/<roadmap-ID>/implement-fix.json first.
# Operator injects MORPHEUS_PAPERCLIP_BRIDGE_TOKEN privately, without echoing it.
pnpm exec tsx "$BRIDGE" submit --repo "$TASK_REPO" --record "$JOB_RECORD" \
  --token-env MORPHEUS_PAPERCLIP_BRIDGE_TOKEN --apply
pnpm exec tsx "$BRIDGE" status --repo "$TASK_REPO" --record "$JOB_RECORD" \
  --token-env MORPHEUS_PAPERCLIP_BRIDGE_TOKEN
```

After a lost POST response, inspect the original task/run and partial artifacts, then use
`link --issue "$OBSERVED_ISSUE_ID"` with the same record/token and `--apply`. This never
POSTs. After independent result inspection, commit a receipt shaped as:

```json
{
  "issueId": "actual issue UUID",
  "sourceSha": "the job's exact original 40-character SHA",
  "outcome": "result",
  "summary": "What the operator independently checked",
  "evidence": [{"path": "qa/result.txt", "sha256": "actual SHA-256 of committed bytes"}]
}
```

For `outcome: "blocked"`, add non-empty `needs` and require upstream `blocked` status.
Run `reconcile --evidence qa/receipt.json --apply`, inspect the resulting linkage diff,
and continue the normal focused tests, worklog, draft PR, fresh independent reviewer,
review record, CI and protected merge. Only that delivery and caller-visible acceptance
can finish the parent item. Run one real low-risk protected delivery per qualified host
before claiming multi-host consumer execution. Source tests do not establish that result.
