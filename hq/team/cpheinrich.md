---
owner: cpheinrich
date: 2026-10-24
agents:
  - codex
previous: .agent/inbox-archive/2026-10-24-2106-cpheinrich.md
---
# Inbox — 2026-10-24

The mini's native Claude login now works through a terminal-only sudo/GUI-audit-session route. Real remote Claude passed streaming, a live question and answer, remembered follow-ups, active coordinator reconnect, native-worker stop and bridge recovery. Remote Codex had already passed its real qualification. Your terminal-first preference is saved on both Macs and in merged host-setup PR11. Morpheus PR475 remains WIP/draft solely for the original reviewer's final completion-documentation pass; its account is below your40%-remaining floor, so a bounded exception was requested in chat. All test workers are paused and reservations clear. Three older unreplied items remain unchanged below.

## ✅ 1. Terminal/sudo preference retained across hosts · `codex`

Saved in both code-root AGENTS.md files and the reusable host guidance template in [merged host-setup PR11](https://github.com/cpheinrich/agent-host-setup/pull/11). Agents should try supported terminal commands and already-authorized noninteractive sudo before a blocking UI flow. The record includes the exact working command: enter Zoe's existing GUI audit session, then restore her uid/home before launching Node or a model. No credential copy or long-lived token was needed.

## ✅ 2. Actual remote Claude validation complete · `codex`

[PR475](https://github.com/cpheinrich/morpheus/pull/475) records conversation7821461c-c371-4231-b8a3-211e4a15954a, exact native session/run identities and independent SSH nonce/blue/phase4 recovered readbacks. A native CLI and MCP child were stopped while waiting for an unapproved Bash permission; the proposed sleep never ran, so this does not claim stopping a running Claude shell command. Logout/reboot readiness is untested. Integrated plugin tests95/95 and build/test CI pass. The stale login request is resolved; no further mini authentication step is requested.

## ❗ 3. Bounded final-review budget for PR475 · `codex`

The source is independently cleared; four completion Markdown files now record actual acceptance and its limits. The [review runbook](../../docs/runbooks/independent-review.md) requires returning to the same reviewer for finalization. Its main-Claude account reports61% weekly used/39% remaining, below your40% floor. No further call was admitted. A one-point exception was requested in chat; this item is the durable copy of that same request, not a second approval.

- **A — allow up to one additional weekly point (recommended).** Only the same reviewer's bounded five-minute finalization, down to38% remaining; then normal validation, CI and merge.
- **B — retain the40% floor.** Keep the PR draft until that account again has sufficient allowance.
- **C — reserve up to two additional points for that same one turn.** Down to37% remaining, providing extra headroom for rounded/shared-account telemetry; no extra review loop or implementation scope.
- **Other —** a different budget or timing.

~

## ❗ 4. One further review turn for PR #414 · `codex`

[#248](https://github.com/cpheinrich/morpheus/issues/248) now has draft [PR #414](https://github.com/cpheinrich/morpheus/pull/414). Its worklog records approval of the human-override policy and three independent review turns clearing the implementation through `249285c`. The final test-only correction `74290f6` updates the scaffold expectation for the already-reviewed comment-revocation workflow. Its build/test jobs pass, but that correction is outside review coverage. Current-main `verifyReviewRecord` reproduces the coverage refusal. GitHub also reports a conflict with current main; the existing author must integrate trunk before final validation. The PR remains draft with auto-merge off.

The [independent-review runbook](../../docs/runbooks/independent-review.md) requires explicit authorization for each extra same-reviewer turn and says: “Never infer approval from a merge request or manufacture it.” This is the existing PR request, consolidated here; it is not a request to decide the policy again.

- **A — authorize one additional same-reviewer turn (recommended).** Resume the original author and reviewer for the test correction, then merge only after review validation and required final-head checks pass.
- **B — keep the PR draft.** Preserve the implementation and defer the additional review.
- **C — decline the override feature.** Record that maintainer decision before closing the draft and issue.
- **Other —** a different disposition.

~

## ❗ 5. Kairos certificate-chain evidence · `codex`

[#310](https://github.com/cpheinrich/morpheus/issues/310) remains open. Its failed Actions run shows an imported identity and a generic trust-check failure, but does not reveal the public leaf certificate issuer or the detailed verification error. Please send the failed public certificate's issuer and validity dates, or the unquiet security verify-cert error. No private key, password, provisioning profile or production rerun is needed.

~

## ❗ 6. One older claim remains · `codex`

`MO-26-09-16-00.36.07` shipped in [PR #390](https://github.com/cpheinrich/morpheus/pull/390), and its remote branch is deleted. That previous disposition request is resolved. `MO-055` still holds remote branch `mo-055-a-new-contributor-gets-an-inbox-in-one-c`; this automation did not take it over. The original context is in [the archived exchange](../../.agent/inbox-archive/2026-10-12-1945-cpheinrich.md).

- **A — release the MO-055 claim (recommended).** Preserve its committed work, then retire the inactive remote claim so future work can claim it.
- **B — resume MO-055.** Continue its existing branch and partial work.
- **C — keep it reserved.** Leave ownership unchanged for a returning author.
- **Other —** a different disposition.

~

