---
owner: cpheinrich
date: 2026-11-06
agents:
  - codex
previous: .agent/inbox-archive/2026-11-06-1426-cpheinrich.md
---
# Inbox — 2026-11-06

Visual planning guidance and the authorized consumer rollout are complete. The implementation
PRs merged after independent review and green CI; active working copies were preserved.
Unreplied items below are carried forward unchanged. The previous exchange is
[archived](../../.agent/inbox-archive/2026-11-06-1426-cpheinrich.md).

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

## ✅ 4. Visual planning rollout complete · `codex`

Merged [PR633](https://github.com/cpheinrich/morpheus/pull/633) and completed the authorized
consumer rollout with independent clearance and passing CI. Useful relationship diagrams now
belong early in planning; trivial edits need none, and no approval pause or merge gate was added.
The [canonical guide](../../.agents/skills/visual-design/SKILL.md) remains centrally refinable
and is available through `morpheus skills guide visual-design`. No action is needed for this rollout.
