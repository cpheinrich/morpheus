---
roadmap: MO-26-11-09-11.56.14
tags: [engineering, devops]
---
# Discover context tools across execution hosts

## Outcome and scope

A personal Codex MCP registration did not reach collaborators, other clients or other devices. Explicit project setup now adds portable Claude Code, Codex and Cursor MCP configuration and compact context discovery guidance. Every startup brief cues discovery independently of pilot enrollment. New scaffolds include the guidance; existing authored instructions remain unchanged by init. Explicit context install appends guidance, preserves unrelated settings/TOML comments, and reports conflicting/disabled entries, malformed files and symlinks rather than replacing them. Morpheus's own project configuration is adopted here, including its existing MCP read/prompt hooks.

The [runbook](../../docs/runbooks/context-search.md#desktop-phone-and-cloud-boundaries) and [architecture](../../architecture.md#710-context-freshness) distinguish configuration, live discovery, successful calls, project source freshness, host runtime/trust, and standalone cloud/mobile connections. Phone SSH/remote-control sessions use their executing host; standalone cloud clients need separately authorized connectors. No remote service, daemon, credential copy or private-data endpoint is added. Reused the existing smol-toml dependency for lossless-by-append TOML validation, native JSON/filesystem primitives and existing repair reporting; no new generic package is needed.

## Verification

- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`: passed.
- Focused setup/startup/scaffold/MCP tests: 126 passed across 5 files. Final guidance/budget and setup tests: 23 passed across 2 files. Workflow-expression tests: 7 passed after installing the repository's checksum-verified actionlint 1.7.12 prerequisite.
- One full local `pnpm test`: 148 files passed; 4,275 tests passed, 3 skipped, 8 failed across 2 files. Two instruction-budget failures were corrected by shortening guidance/onboarding without increasing limits, and their full test file passes. Six workflow-expression failures were the missing actionlint binary; that full test file now passes. No second full local run; CI verifies the final integration.
- `morpheus complexity check`: passes with advisory warning only, CCN limit 15. Existing scaffoldInstructions cognitive score 16 is advisory; no policy threshold/exclusion changed.
- New regression cases cover all three client configs, byte-idempotence, unrelated settings and comments, authored instructions, read-only checks, malformed/disabled/conflicting entries, and leaf/parent symlink preservation. The non-pilot startup regression checks the actual emitted reminder.

## Device qualification (separate from shared source delivery)

Authorized operator setup on the Air and Studio registered Codex and Claude Code user-level servers and explicit-project Claude Desktop servers, preserving other settings. MCP SDK clients launched the actual desktop commands and obtained five tools plus successful cited ripgrep searches for Evo/Darwin/Morpheus on the Air and Evo/Morpheus on the Studio. This proves transport/retrieval against each launch checkout, not current-trunk freshness, native app restart/reload, phone pairing, or account-level cloud connectivity. Studio initially lacked ripgrep; installed official 15.2.0 arm64 with upstream SHA-256 verification, then its searches passed. Both hosts' copied Morpheus installations were updated to reviewed main before qualification. No credentials or other user's configuration were copied.

The Studio's initial SSH timeout was caused by the Air's stopped Tailscale connection. Reconnecting it restored SSH. Studio power settings also had one-minute automatic sleep; authorized readiness setup changed sleep to zero while leaving display sleep ten minutes. Subsequent SSH succeeded. These local operational changes are not portable source defaults.

## Evidence limits and prior attempts

The first task claim could not push to upstream under the active account; its Morpheus-created claim commit was temporarily pushed to the user's existing fork. After the user granted push access, that same task branch was pushed to upstream and tracks it. No feature branch was hand-created.

Codebase-memory Tier 2 was attempted: native MCP list_projects could not start its daemon within 30 seconds, so there is no verified project/generation or coverage result. The supported installer then refused activation because other active sessions could not be stopped safely. Those sessions were preserved; source reads of session install/startup, init templates, context MCP and focused tests supplied the bounded fallback. No graph completeness claim is made. Context MCP search was used to retrieve prior setup/Factory records.

Standalone cloud/mobile connections remain an explicit operator acceptance boundary. Local stdio cannot configure their account-level connectors; no claim is made that every end user's device is already configured by a source change. Existing projects receive setup through explicit reviewed context-install adoption, and installed CLIs receive the new startup cue on update.

## Independent review

Independent review cleared portable context setup, file preservation, startup discovery and documented host/mobile boundaries with no findings.

Reviewer `/root/context_reviewer` independently ran setup/session tests: 43 passed in 3 files; no full-suite rerun. Source fallback only; no live device or pairing repetition. PR: [#671](https://github.com/cpheinrich/morpheus/pull/671).

```morpheus-review
{
  "version": 2,
  "base": "6899d7cb0fd6b58c4e2ae17b52d45b42372782fe",
  "reviewed": "17d4dd76f2026d3e89a5306cce77d5348555c029",
  "covered": "17d4dd76f2026d3e89a5306cce77d5348555c029",
  "authorSession": "01a1c1db-6eeb-78d3-b3a5-dd1ba899c698",
  "reviewerSession": "/root/context_reviewer",
  "risk": "normal",
  "elapsedMinutes": 1.7333333333333334,
  "timing": {
    "source": "clock",
    "durationMs": 104000,
    "evidence": "clock.curr_time immediately before spawn: 2026-11-09 20:09:03 UTC; reading after reviewer final: 2026-11-09 20:10:47 UTC. Runner returned /root/context_reviewer; no workload estimate."
  },
  "outcome": "complete",
  "summary": "Independent review cleared portable context setup, file preservation, startup discovery and documented host/mobile boundaries with no findings.",
  "findings": []
}
```
