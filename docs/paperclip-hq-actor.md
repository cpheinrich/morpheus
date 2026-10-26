# Authenticated HQ actors in the existing worker pool

`MO-26-10-25-03.51.24` adds a local admission facade to the existing `codex-claude`
Manager-owned Pool. The outbound Firebase connector supplies a freshly verified actor;
this facade does not authenticate browser requests. It uses the existing private Unix
socket (mode 600), existing Pool home, conversations, native runner and account
reservations. It adds no HTTP listener, provider login, worker, scheduler or second Pool.
The Firebase connector and deployed authorization boundary are separate integration work.

V1 deliberately supports one installed company and controller on the MacBook Pro. A
company identifier in a request is never enough to select another controller. Every
method, including status, logs, wait, plain reattach and operation recovery, validates the
same owner-installed mapping. Desktop Pool methods retain their existing Codex admission.
HQ calls have `threadId: null` and an actual actor record; no synthetic Codex task or
snapshot stands in for authorization.

## Owner-installed mapping

The existing bridge home contains `hq.json`, a mode-600 regular file owned by the
controller user. Its strict shape is:

```json
{
  "version": 1,
  "connectorId": "the-installed-outbound-connector",
  "companyId": "the-explicit-company-uuid",
  "controller": {
    "baseUrl": "the-exact-existing-pool-base-url",
    "companyId": "the-same-company-uuid",
    "projectId": null
  },
  "profiles": {
    "installed-profile-name": {
      "repository": "the-canonical-controller-local-repository-or-workspace",
      "project": "its-canonical-Git-common-directory-or-non-Git-workspace",
      "profileSha256": "the-64-character-profile-digest"
    }
  }
}
```

`projectId` must be the configured Paperclip project UUID when present. The complete
controller tuple must match `pool.json`. Use exported `hqProfileDigest(profile)` from
`plugins/codex-claude/src/pool-hq.mjs` on the profile returned by `loadPool()`; it hashes
canonical sorted-key JSON of the entire parsed profile, including host executables,
account, provider, model, effort, permission and workspace. `projectIdentity(repository)`
supplies the controller-local repository identity. `repository` is independent of the
worker profile workspace: an SSH workspace may exist only on its worker host. Configuration examples above contain placeholders,
not an installation command or live target.

The mapping digest additionally pins connector, company, controller, profile name and
repository. Existing HQ conversations and operation receipts retain that digest and
refuse a changed mapping. Profile selection is by installed name only; request schemas
reject model, effort, permission, host, account, workspace, retry and source overrides.
Global/project delegation switches and bridge draining still prevent admission. Queued
HQ runs revalidate this same full mapping and their captured execution configuration
before account reservation, reconciliation or host execution; changing or reinstalling
the mapping cannot authorize an older queued intent. The native runner continues to enforce existing fresh subscription quota, host binding,
permission, account reservation and termination checks.

## Local connector contract

Call only `hq.<action>` on the existing `/rpc` Unix-socket endpoint. Common fields are
`connectorId`, `companyId`, and `actor: { uid, role: "admin", kind: "user" | "agent" }`.
These are assertions by the trusted owner-installed connector after backend verification,
not browser-controlled authorization fields. The backend must revalidate the live role
and disabled state before applying a command. The local socket remains a trusted-user
perimeter, not cryptographic proof that Firebase created the payload.

| Action | Additional fields |
| --- | --- |
| `profiles` | none |
| `start` | UUID `operationId`, `profile`, bounded `prompt` |
| `followup` | UUID `operationId`, `conversationId`, bounded `prompt`, optional `reason` |
| `answer` | UUID `operationId`, `conversationId`, `questionId`, optional `answers`, `allow`, `reason` |
| `stop` | UUID `operationId`, `conversationId` |
| `status`, `reattach` | `conversationId` |
| `wait` | `conversationId`, optional `seconds` from 0 through 30 |
| `logs` | `conversationId`, optional bounded `turn`, `offset`, `limitBytes` |
| `operation` | UUID `operationId` |

The facade cannot forward arbitrary Manager methods such as config, override, shutdown,
reconcile or recovery. It cannot read desktop conversations. Current local reads require
admin just like writes; broader employee projections belong to the authenticated backend.

Actor kind determines the recorded reply source. An agent follows the existing bounded
Codex clarification path and cannot approve tool permissions; a user reply records the
verified UID and uses the user path. Browser `source` values cannot claim user approval.
Start/follow-up intents and answer/stop controls retain actor and operation identity.

## Receipts, observation and completion

Before an external Paperclip effect, a durable operation journal under the existing
`pool/hq-operations/` directory binds operation UUID, canonical request hash, actor,
company, mapping digest, conversation and allocated turn. A follow-up may have a null
turn until allocation; the exact turn is persisted before its comment can be posted.
Journal filenames hash the exact operation UUID, preserving distinct upper/lowercase
IDs even on case-insensitive controller filesystems. The receipt retains the original
ID. These are command receipts, not another native ownership or reservation ledger.

Repeating the same operation UUID and payload observes the existing intent. A changed
payload refuses. Unknown outcomes and observation misses never repost. Plain reattach
is observation only, and HQ exposes no retry override. If the process fails before an
effect, recovery may remain unknown even when no upstream record is visible; v1 requires
operator diagnosis instead of assuming absence proves non-delivery. Desktop and HQ
starts/follow-ups share the same in-process profile allocation guard.

Mutations return `{ operation, work }`. The receipt states `prepared`, `applying`,
`receipted`, `unknown` describe command handling. `receipted` means the local method
returned; inspect `work.submission`, `work.state`, `work.terminal` and `work.termination`
for separate upstream/native evidence. A stop receipt can report `stopRequested: true`
with `terminal: false` and `stopped: false`. `stopped: true` requires an interrupted or
cancelled state and verified/not-started termination. A completed native turn does not
mean it was stopped. Neither receipt nor native terminal state advances Git acceptance.

HQ status uses an explicit field allowlist. Native session IDs, worker/account identity,
controller paths, raw native events and arbitrary upstream error strings are omitted.
Question input, progress and result summary are intentional user content, so they may
contain text authored by the provider. Logs expose bounded event classifications only.

## Validation and limits

The dedicated tests use fake Paperclip with no provider starts; queued-launch drift
probes intercept every host-spawn attempt. They cover actor/company
checks on all methods, profile/controller drift, strict overrides, journal-before-effect,
unknown/restart recovery, changed payload, honest controls, permission refusal, actual
concurrent desktop/HQ admission, stop versus completion, and projection filtering.
Existing Pool regressions use fixture provider binaries and exercise desktop behavior.
This source seam does not qualify deployed Firebase authorization, real native launches,
controller restarts during a running provider, or multiple companies/controllers.
