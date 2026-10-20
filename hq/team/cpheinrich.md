---
owner: cpheinrich
date: 2026-10-19
agents:
  - codex
previous: .agent/inbox-archive/2026-10-19-1239-cpheinrich.md
---
# Inbox — 2026-10-19

The issue-maintenance automation reconciled all open issues and the issues closed since its October 12 run. GitHub confirms **38 of 41 tracked issues closed**. Thirteen fixes landed in other sessions; their merge commits are on current main and their remote branches are deleted. Three issues remain open. The material change is that #248 now has implementation PR #414 and needs an additional review turn, so the older policy-choice prompt has been replaced. This run made no production release or credential changes.

## ✅ 1. Thirteen intervening issue fixes verified · `codex`

Verified merged PRs [#390](https://github.com/cpheinrich/morpheus/pull/390), [#392](https://github.com/cpheinrich/morpheus/pull/392), [#395](https://github.com/cpheinrich/morpheus/pull/395), [#396](https://github.com/cpheinrich/morpheus/pull/396), [#402](https://github.com/cpheinrich/morpheus/pull/402), [#404](https://github.com/cpheinrich/morpheus/pull/404), [#405](https://github.com/cpheinrich/morpheus/pull/405), [#406](https://github.com/cpheinrich/morpheus/pull/406), [#407](https://github.com/cpheinrich/morpheus/pull/407), [#408](https://github.com/cpheinrich/morpheus/pull/408), [#409](https://github.com/cpheinrich/morpheus/pull/409), [#410](https://github.com/cpheinrich/morpheus/pull/410), and [#413](https://github.com/cpheinrich/morpheus/pull/413). They cover worktree cleanup, iOS workflow isolation and evidence, QA capture and recovery, review deferral bookkeeping, incident closure, and first HQ sign-in. The automation ledger preserves each issue's PR, review coverage SHA, final check snapshot and closure evidence.

## ❗ 2. One further review turn for PR #414 · `codex`

[#248](https://github.com/cpheinrich/morpheus/issues/248) now has draft [PR #414](https://github.com/cpheinrich/morpheus/pull/414). Its worklog records approval of the human-override policy and three independent review turns clearing the implementation through `249285c`. The final test-only correction `74290f6` updates the scaffold expectation for the already-reviewed comment-revocation workflow. Its build/test jobs pass, but that correction is outside review coverage. Current-main `verifyReviewRecord` reproduces the coverage refusal. GitHub also reports a conflict with current main; the existing author must integrate trunk before final validation. The PR remains draft with auto-merge off.

The [independent-review runbook](../../docs/runbooks/independent-review.md) requires explicit authorization for each extra same-reviewer turn and says: “Never infer approval from a merge request or manufacture it.” This is the existing PR request, consolidated here; it is not a request to decide the policy again.

- **A — authorize one additional same-reviewer turn (recommended).** Resume the original author and reviewer for the test correction, then merge only after review validation and required final-head checks pass.
- **B — keep the PR draft.** Preserve the implementation and defer the additional review.
- **C — decline the override feature.** Record that maintainer decision before closing the draft and issue.
- **Other —** a different disposition.

~

## ❗ 3. Kairos certificate-chain evidence · `codex`

[#310](https://github.com/cpheinrich/morpheus/issues/310) remains open. Its failed Actions run shows an imported identity and a generic trust-check failure, but does not reveal the public leaf certificate issuer or the detailed verification error. Please send the failed public certificate's issuer and validity dates, or the unquiet security verify-cert error. No private key, password, provisioning profile or production rerun is needed.

~

## ❗ 4. One older claim remains · `codex`

`MO-26-09-16-00.36.07` shipped in [PR #390](https://github.com/cpheinrich/morpheus/pull/390), and its remote branch is deleted. That previous disposition request is resolved. `MO-055` still holds remote branch `mo-055-a-new-contributor-gets-an-inbox-in-one-c`; this automation did not take it over. The original context is in [the archived exchange](../../.agent/inbox-archive/2026-10-12-1945-cpheinrich.md).

- **A — release the MO-055 claim (recommended).** Preserve its committed work, then retire the inactive remote claim so future work can claim it.
- **B — resume MO-055.** Continue its existing branch and partial work.
- **C — keep it reserved.** Leave ownership unchanged for a returning author.
- **Other —** a different disposition.

~

## ✅ 5. GitHub Manager log stays open · `codex`

[#335](https://github.com/cpheinrich/morpheus/issues/335) is the persistent manager audit log, not a defect to close.

## ❗ 6. Blocked: Prove live hosted provider admission · `claude` · [MO-26-10-19-21.10.52](../product/roadmap/MO-26-10-19-21.10.52-prove-hosted-provider-admission.md)

**MO-26-10-19-21.10.52 — Prove live hosted provider admission** is stopped and holding its branch.

**What I need:**

An Anthropic-supported Max subscription credential or quota export that returns fresh shared and matching Opus utilization/reset windows in the hosted runner; the current setup-token receives HTTP 403 requiring user:profile. Preserve fail-closed admission and prohibit auth-store copying or paid fallback.

I stopped rather than guessing — a plausible guess here costs more to find later than this
question costs to answer.

~
