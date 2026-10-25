---
tags: [engineering, devops, infrastructure]
roadmap: MO-26-10-25-03.51.24
agent: codex
---

# Authenticated HQ actor admission

The bounded task adds HQ admission inside the existing Manager-owned Pool. The parent
owns the outbound Firebase transport separately. This branch changes only the Pool seam,
its direct tests, the contract/acceptance and task records. One explicit company and the
MBP controller are the supported v1 deployment. No real provider starts, credentials,
cloud state or installed plugin were changed.

Implementation reserves at most10 Codex weekly percentage points from the shared22% used
baseline, with a20-minute initial scope and parent-approved10-minute extension. Source
completion observed24% used on2026-10-25; other shared activity is included in that delta.
Parent separately reserved at most5 points for independent review/delivery, under the
shared hard75% used ceiling with earlier admission stops. No Claude, API overage or reset.

The owner-installed mode-600 mapping pins connector/company, controller origin and
Paperclip project, complete parsed profile and canonical repository. Every local HQ
method checks it. A narrow actor context enters the existing Pool rather than fabricating
Codex tasks or snapshots. It preserves native quota, reservation and permission checks.
The single Pool serializes desktop/HQ turn allocation by profile. Actor kind determines
reply source; agent replies require a reason and cannot approve tool permissions.

A command receipt journals operation UUID, exact canonical payload hash, actor, mapping
and conversation before work; its allocated turn is persisted before an external effect.
Retries observe the same intent and never repost an unknown outcome. A changed payload,
including prompt whitespace, refuses. Receipt states and native work states are separate;
stop requested does not imply stopped. Status/log projections explicitly omit native
session, host and account metadata. Arbitrary provider text in allowed question/progress/
summary fields remains intentional user content.

The operation journal is command identity within the existing Pool home, not another
runner/account ownership ledger. This is domain-specific authorization and effect policy
using existing Zod, Node crypto/files and Pool primitives; no generic module or runtime
dependency was introduced. The small-choice PR rationale is to reuse those existing
primitives rather than introduce a separate coordinator or retry framework.

## Discovery and dead ends

Tier2 graph project `Users-chrisheinrich-code-morpheus`, generation2026-10-25T09:31:59Z,
reported ready and matching coverage/no recorded gap for pool, service, pool-config and
pool-store. Search located Pool/Manager but supplied no method call chains. Trace/snippet
and later coverage calls failed `Transport closed`; exact source fallback covered the
changed modules and relevant runner/host/store/fixtures/tests. New files are outside that
recorded generation. No exhaustive graph-completeness claim is made.

The new worktree initially lacked dependencies. The first HQ test attempt refused missing
Zod; a workspace install restored root dependencies but not the excluded plugin's ws.
A frozen offline plugin install with `--ignore-workspace` restored its cached dependencies.
No lockfiles changed. The first running HQ suite then found a fixture naming collision
(`pool` config versus Pool object); corrected the fixture alias. Four other tests already
passed. Replaced an artificial allocation-set assertion with an actual blocked start race.

## Validation

- `node --test plugins/codex-claude/tests/pool-hq.test.mjs plugins/codex-claude/tests/pool.test.mjs`
  passed16/16 at that checkpoint:5 dedicated HQ tests plus11 existing desktop Pool tests.
  Existing Pool tests use fixture executables only.
- Added actual desktop/HQ admission-race and pre-submission failure cases; dedicated HQ
  suite passed7/7. The run after preserving exact prompt whitespace also passed7/7.
  Parent then requested the mixed desktop/HQ follow-up race explicitly; added it before
  independent review. The final dedicated suite passed8/8.
- `node --test plugins/codex-claude/tests/pool-hq.test.mjs plugins/codex-claude/tests/manager.test.mjs plugins/codex-claude/tests/pool-units.test.mjs plugins/codex-claude/tests/pool-review.test.mjs plugins/codex-claude/tests/pool-protocol.test.mjs`
  passed45/45, covering the directly affected Manager and Pool policy/protocol dependents.
- `node plugins/codex-claude/scripts/check.mjs`, `pnpm typecheck`, `pnpm compile`,
  `pnpm morpheus pm index` and `git diff --check` passed. Compile/index produced no changes.
- No full root suite was run: shared core was untouched; CI owns full-suite verification.

Remaining limits: source seam only; backend authorization/revocation, deployed connector,
real provider execution, live restart adoption and multiple companies are not qualified.
Some exceptions remain conservatively unknown even before effects; an observation miss
requires operator diagnosis and does not authorize a repost. Independent review/CI/merge
are pending in this checkpoint.


## Initial independent review and corrections

Reviewer `/root/hq_pool_actor/hq_actor_reviewer` reviewed97e8377ee18ea3acc36593526d9fae2ca2cdc3aa
at high risk. Measured clock boundaries1792926361366 through1792926641195ms give279829ms,
including all tool execution/waits. It returned complete but blocked, no conditions:
HQ-PIN-001 (substantive) found queued native launches only checked the reduced desktop
binding; HQ-REPO-002 (substantive) found remote worker paths were resolved on the controller.
Parent authorized the necessary narrow runner-hook ownership extension.

Corrections share the same mapping verifier between HQ commands and native runner admission,
validate the captured controller/profile as well as current config before host/account effects,
and require an explicit controller-local `repository` separate from the pinned worker workspace.
The mapping digest includes both local repository path and identity. Fake-only drift probes cover
node/ssh executables, company/project/controller URL, owner reinstallation, and a captured-profile
race during upstream lookup; all host-spawn attempts are intercepted. SSH admission covers a
worker workspace absent from the controller. Same-reviewer follow-up remains required.

Correction validation: the six-file focused command (`pool-hq`, `pool`, `pool-protocol`,
`pool-review`, `pool-units`, `manager`) passed66/66 after both fixes. A final positive
intercept test then confirmed an unchanged HQ pin reaches exactly its pinned host executable
without launching a provider; the dedicated HQ suite passed18/18 including seven drift
subtests. Plugin syntax, typecheck, compile, PM index and whitespace checks passed again.
No generated output changed. These results precede the same-reviewer follow-up.


## Independent review clearance

Independent high-risk review found HQ-PIN-001 and HQ-REPO-002; the author added full queued-run pin checks and a separate controller-local repository mapping, cleared by the same reviewer at3d2980f. A late integration UUID case issue was corrected with exact-ID-hashed journal filenames and cleared by that reviewer at1f267e6. Fake/intercepted validation passed; deployed Firebase and real provider qualification remain separate.

The initial turn was complete but blocked with two substantive findings and no conditions. The same reviewer follow-up was complete and cleared, independently running18/18 HQ tests. Initial elapsed time was279829ms; follow-up elapsed time was65713ms. Final-head CI and protected merge remain required.

```morpheus-review
{
  "version": 2,
  "base": "2b102e3e3ee86276ad69a342eece2e52e01d8bb1",
  "reviewed": "97e8377ee18ea3acc36593526d9fae2ca2cdc3aa",
  "covered": "1f267e62970df98db0dd357a437feea84398b8fd",
  "authorSession": "01a172b1-1515-7ee2-8891-5dc8f3499665",
  "reviewerSession": "/root/hq_pool_actor/hq_actor_reviewer",
  "risk": "high",
  "elapsedMinutes": 4.6638166666666665,
  "timing": {
    "source": "clock",
    "durationMs": 279829,
    "evidence": "Observed clock around initial invocation /root/hq_pool_actor/hq_actor_reviewer: start 1792926361366ms (2026-10-25T11:06:01.366Z), final response observed 1792926641195ms (2026-10-25T11:10:41.195Z)."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review found HQ-PIN-001 and HQ-REPO-002; the author added full queued-run pin checks and a separate controller-local repository mapping, cleared by the same reviewer at3d2980f. A late integration UUID case issue was corrected with exact-ID-hashed journal filenames and cleared by that reviewer at1f267e6. Fake/intercepted validation passed; deployed Firebase and real provider qualification remain separate.",
  "findings": [
    {
      "id": "HQ-PIN-001",
      "severity": "substantive",
      "description": "Queued HQ turns reached the native runner with only the reduced desktop digest, allowing changed executable or controller pins to reach host launch.",
      "paths": [
        "plugins/codex-claude/src/pool-hq.mjs",
        "plugins/codex-claude/src/pool.mjs",
        "plugins/codex-claude/src/pool-runner.mjs",
        "plugins/codex-claude/tests/pool-hq.test.mjs"
      ],
      "disposition": "fixed",
      "response": "A shared full-mapping verifier now checks current and captured execution bindings at command effects and queued native admission before account/reconciliation/host effects. Seven intercepted drift/race probes prove zero host calls and reservations; the same reviewer cleared the correction."
    },
    {
      "id": "HQ-REPO-002",
      "severity": "substantive",
      "description": "HQ authorization resolved the worker workspace on the controller, rejecting SSH profiles whose workspace exists only on the worker.",
      "paths": [
        "plugins/codex-claude/src/pool-hq.mjs",
        "plugins/codex-claude/tests/pool-hq.test.mjs",
        "docs/paperclip-hq-actor.md"
      ],
      "disposition": "fixed",
      "response": "Owner mappings now require a canonical controller-local repository path and its project identity separately from the fully pinned worker profile. An SSH profile with an absent controller-side worker path enqueues and reads successfully; the same reviewer cleared source and documentation."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/hq_pool_actor/hq_actor_reviewer",
      "commit": "3d2980f57a1197d54ed7d92f697209b38008511c",
      "outcome": "cleared",
      "elapsedMinutes": 1.0952166666666667,
      "timing": {
        "source": "clock",
        "durationMs": 65713,
        "evidence": "Observed clock around same-reviewer follow-up: start 1792926883588ms (2026-10-25T11:14:43.588Z), final response observed 1792926949301ms (2026-10-25T11:15:49.301Z)."
      },
      "summary": "Both substantive findings fixed; the reviewer independently passed18/18 dedicated HQ tests and cleared the corrections and related documentation, with no new findings."
    },
    {
      "reviewerSession": "/root/hq_pool_actor/hq_actor_reviewer",
      "commit": "1f267e62970df98db0dd357a437feea84398b8fd",
      "outcome": "cleared",
      "elapsedMinutes": 0.83535,
      "timing": {
        "source": "clock",
        "durationMs": 50121,
        "evidence": "Observed clock around the third ordinary same-reviewer invocation: start 1792927623406ms (2026-10-25T11:27:03.406Z), final response observed 1792927673527ms (2026-10-25T11:27:53.527Z). The earlier capacity-refused launch started no review turn and is excluded."
      },
      "scopeReason": "Late integration review found case-sensitive cloud operation IDs aliasing raw UUID journal filenames on the case-insensitive Mac; this turn covers only the bounded journal identity correction and associated tests, documentation and worklog.",
      "summary": "Cleared exact-ID-hashed operation journal filenames while preserving original receipt IDs and recovery behavior. The reviewer independently passed the focused UUID regression1/1, including case-folded path inequality and independent replay. Earlier substantive findings remain fixed; no new findings."
    }
  ]
}
```


## Late integration UUID correction

Before merge, the parent transport's independent review identified that case-sensitive cloud
command IDs can be uppercase UUIDs while the Mac filesystem aliases raw uppercase/lowercase
UUID filenames. HQ accepted both spellings through Zod but used raw filenames. Changed operation
filenames to SHA-256 of the exact accepted ID while preserving body identity. A focused test
creates both case variants as distinct intents, reads/retries each identity, and checks distinct
filenames. No HQ source was deployed or live command journal created before this correction.
This spends the remaining same-reviewer ordinary late-correction turn after its earlier clearance;
there is no replacement reviewer and no scope expansion beyond operation identity.


The third ordinary same-reviewer turn cleared the late UUID correction after50,121ms. The first attempted launch was refused by shared agent capacity before it started; the existing reviewer resumed when the slot was released. Final dedicated HQ validation passed19/19; the added filesystem-case-folding assertion then passed its focused UUID test1/1. No review turn or timing was fabricated for the refused launch. Parent explicitly reallocated an additional3 Codex points at30% shared used for this last turn and normal CI/merge delivery.
