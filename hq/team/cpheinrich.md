---
owner: cpheinrich
date: 2026-11-09
agents:
  - codex
previous: .agent/inbox-archive/2026-11-09-1014-cpheinrich.md
---
# Inbox — 2026-11-09

The issue automation reconciled all open GitHub issues and preserved the completed ledger.
The retired Paperclip-pool request #585 is closed with merged retirement evidence. The legacy
web-layout fix (#666) and delivery-documentation correction (#667) passed independent review;
both remain open because the confirmed [GitHub Actions outage](https://stspg.io/7yw63xl9ztrv)
interrupted required checks. The automation will resume their review-to-merge loop after recovery.
Unreplied decisions below remain unchanged.
The prior inbox is [archived](../../.agent/inbox-archive/2026-11-09-1014-cpheinrich.md).

## ❗ 1. Kairos certificate-chain evidence · `codex`

[#310](https://github.com/cpheinrich/morpheus/issues/310) still lacks the failed public leaf certificate's issuer and validity dates, or the detailed unquiet `security verify-cert` error. The generic trust failure does not identify a correct certificate-chain change. No private key, password, provisioning profile or production rerun is requested.

~

## ❗ 2. Adopt the worktree-storage report · `codex`

[#423](https://github.com/cpheinrich/morpheus/issues/423) requests durable/configurable worktree storage after temporary-directory loss. Its reporter has CONTRIBUTOR association and read-only repository permission, so the repository's trusted-intake policy prevents implementing that request without maintainer adoption.

- **A — adopt the report for investigation (recommended).** Reproduce the loss and evaluate a durable root alongside missing-worktree recovery #430 before choosing a design.
- **B — retain temporary roots.** Investigate recovery under #430 while leaving storage policy unchanged.
- **C — defer #423.** Keep it open until a consumer provides more concrete requirements.
- **Other —** a different approach.

~

## ❗ 3. One older claim remains · `codex`

`MO-26-09-16-00.36.07` shipped in [PR #390](https://github.com/cpheinrich/morpheus/pull/390), and its remote branch is deleted. That previous disposition request is resolved. `MO-055` still holds remote branch `mo-055-a-new-contributor-gets-an-inbox-in-one-c`; this automation did not take it over. The original context is in [the archived exchange](../../.agent/inbox-archive/2026-10-12-1945-cpheinrich.md).

- **A — release the MO-055 claim (recommended).** Preserve its committed work, then retire the inactive remote claim so future work can claim it.
- **B — resume MO-055.** Continue its existing branch and partial work.
- **C — keep it reserved.** Leave ownership unchanged for a returning author.
- **Other —** a different disposition.

~

## ✅ 4. Issue-resolution progress · `codex`

[#585](https://github.com/cpheinrich/morpheus/issues/585) no longer applies after the authorized
Paperclip retirement in [#644](https://github.com/cpheinrich/morpheus/pull/644); current-source
retirement tests passed. [#666](https://github.com/cpheinrich/morpheus/pull/666) recognizes the
existing `web/` app without scaffolding a second site. [#667](https://github.com/cpheinrich/morpheus/pull/667)
labels the old watchdog migration proposal historical and points to the current release-owner guide.
The operational ledger retains every remaining issue, evidence and concrete next action. Next priorities
include HQ unauthorized-payload reproduction (#600), missing-worktree recovery (#430), required-CI
census (#616), native retry coverage (#618), and Factory/review tooling defects. Intentional Manager
logs #335/#451 remain open; separate audit PR holds remain intact.
