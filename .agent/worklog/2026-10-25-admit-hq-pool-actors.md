---
tags: [engineering, devops]
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
  suite passed7/7. The final run after preserving exact prompt whitespace also passed7/7.
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
