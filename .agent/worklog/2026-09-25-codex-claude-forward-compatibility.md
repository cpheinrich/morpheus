# codex-claude forward compatibility

## Problem

The first install on Codex Desktop 0.157 failed during `doctor` and `inspect` because the
detached-task transcript and memory adapters accepted only two exact 0.154 version strings.
The current runtime retained every field and database column the adapters use.

## Work

- Replaced transcript version gating with validation of the active turn settings contract,
  freshness, and unrestricted permission invariants.
- Replaced memory version gating with a read-only schema check for `threads.memory_mode`.
- Added future-version and missing-contract regression coverage.
- Updated the documented compatibility boundary.
- Preserved structured `claude auth status` output on a nonzero exit so an expired login is
  reported as an actionable `claude auth login` requirement rather than a generic command
  failure.
- Resolved independent Claude review findings by revalidating persisted process identities,
  rejecting starts while the bridge drains for replacement, and exercising both successful
  and refused client-side replacement flows.
- Follow-up review found and resolved the inverse start/shutdown race by rejecting shutdown
  while delegation preflight is busy. It also hardened concurrent replacement: a departed
  service is accepted and an already-started current service is used immediately.
- The formal high-risk review found that pre-handshake services could not receive the new
  shutdown RPC and that a failed `ps` probe was indistinguishable from a confirmed-dead
  process. Legacy services now idle out behind a persisted socket-identity marker that avoids
  resetting their timer, while inconclusive process identity checks refuse replacement.

## Verification

- `pnpm check`
- `pnpm test` — 32 tests passed
- Installed the branch package and ran `doctor` against the active Codex Desktop task;
  transcript settings and Claude Max authentication were detected.
- Ran `inspect` against the active task; unrestricted settings and explicit Claude routing
  were returned successfully.
- Reinstalled while the idle bridge was running, then ran `inspect` again; the installation
  handshake retired the stale service and the new service answered successfully.

## Independent review

Claude's independent high-risk review cleared commit fbef754bc70530ffd3aeaba7b06cc13d00cb3bbf after two substantive findings were fixed and a same-session metadata correction confirmed exact coverage.

```morpheus-review
{
  "version": 1,
  "base": "59eedf1af445db6f587aa0822aedff52e88dae2a",
  "reviewed": "7f11976f28d6f3cd8741e9cdab5e6634ba8834a3",
  "covered": "fbef754bc70530ffd3aeaba7b06cc13d00cb3bbf",
  "authorSession": "01a0d9f2-c3cd-7e42-af09-aaa4b869fb76",
  "reviewerSession": "claude-code/5f7a929c-1cd2-44f0-b7df-71525cf60132",
  "risk": "high",
  "elapsedMinutes": 32,
  "extensionReason": "Process supervision, authentication, and self-upgrade behavior required tracing interacting failure paths beyond the initial high-risk review budget.",
  "outcome": "complete",
  "summary": "Claude's independent high-risk review cleared commit fbef754bc70530ffd3aeaba7b06cc13d00cb3bbf after two substantive findings were fixed and a same-session metadata correction confirmed exact coverage.",
  "findings": [
    {
      "id": "F1",
      "severity": "substantive",
      "description": "A bridge predating the shutdown RPC could enter a retry loop that continually reset its idle timer and prevented first-upgrade replacement.",
      "paths": [
        "plugins/codex-claude/src/client.mjs",
        "plugins/codex-claude/tests/client.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Persist the legacy socket identity and cooldown so repeated calls do not contact the old service; tested that the second call issues no ping."
    },
    {
      "id": "F2",
      "severity": "substantive",
      "description": "A transient process identity probe failure was indistinguishable from a confirmed-absent process and could allow replacement while owned work remained live.",
      "paths": [
        "plugins/codex-claude/src/processes.mjs",
        "plugins/codex-claude/src/service.mjs",
        "plugins/codex-claude/tests/processes.test.mjs",
        "plugins/codex-claude/tests/manager.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Distinguish alive, absent, and unknown identity states; refuse replacement on unknown and cover the fail-closed branch in focused tests."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "claude-code/5f7a929c-1cd2-44f0-b7df-71525cf60132",
      "commit": "fbef754bc70530ffd3aeaba7b06cc13d00cb3bbf",
      "outcome": "cleared",
      "elapsedMinutes": 14,
      "summary": "Verified the legacy idle-out marker and three-state process ownership checks resolve F1 and F2 without regressions."
    },
    {
      "reviewerSession": "claude-code/5f7a929c-1cd2-44f0-b7df-71525cf60132",
      "commit": "fbef754bc70530ffd3aeaba7b06cc13d00cb3bbf",
      "scopeReason": "Correct the author-supplied full-SHA transcription while preserving the exact incremental diff already reviewed and cleared.",
      "outcome": "cleared",
      "elapsedMinutes": 2,
      "summary": "Confirmed the prior clearance covers the actual full commit SHA and no code changed during the metadata correction."
    }
  ]
}
```
