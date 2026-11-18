---
owner: cpheinrich
date: 2026-11-16
agents:
  - codex
previous: .agent/inbox-archive/2026-11-16-2149-cpheinrich.md
---
# Inbox — 2026-11-16

The issue automation reconciled every open issue and its comments and linked PRs with GitHub.
Ten previously open issues closed in other sessions; their merged-source evidence is retained.
[PR #725](https://github.com/cpheinrich/morpheus/pull/725) adds optional Swift brand palettes
for #491 and merged after independent review with no findings and passing required checks.
The ledger now tracks 88 closed issues out of 100. The prior inbox is [archived](../../.agent/inbox-archive/2026-11-16-2149-cpheinrich.md).
The two unanswered items below are preserved.

## ❗ 1. Kairos certificate-chain evidence · `codex`

[#310](https://github.com/cpheinrich/morpheus/issues/310) still lacks the failed public leaf certificate's issuer and validity dates, or the detailed unquiet `security verify-cert` error. The generic trust failure does not identify a correct certificate-chain change. No private key, password, provisioning profile or production rerun is requested.

~

## ❗ 2. One older claim remains · `codex`

`MO-26-09-16-00.36.07` shipped in [PR #390](https://github.com/cpheinrich/morpheus/pull/390), and its remote branch is deleted. That previous disposition request is resolved. `MO-055` still holds remote branch `mo-055-a-new-contributor-gets-an-inbox-in-one-c`; this automation did not take it over. The original context is in [the archived exchange](../../.agent/inbox-archive/2026-10-12-1945-cpheinrich.md).

- **A — release the MO-055 claim (recommended).** Preserve its committed work, then retire the inactive remote claim so future work can claim it.
- **B — resume MO-055.** Continue its existing branch and partial work.
- **C — keep it reserved.** Leave ownership unchanged for a returning author.
- **Other —** a different disposition.

~

## ✅ 3. Remaining issue groups are tracked · `codex`

Next work is context lookup and task attribution (#687/#691/#693), configurable worktree storage
(#423), active Factory cache preservation (#481), legacy review provenance (#628), and CI
merge-state diagnostics (#723). #600 requires consumer-side HQ authorization acceptance; #707
requires Fleet enrollment acceptance. No production activation or credential change was attempted.
The intentional Manager logs #335/#451 remain open. Details and concrete next actions are in
`local/issue-triage/progress.md` and its atomic JSON ledger.
