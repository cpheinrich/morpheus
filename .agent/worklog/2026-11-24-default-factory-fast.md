---
roadmap: MO-26-11-24-23.36.49
tags: [engineering, devops, factory]
---

# Default Codex Factory workers to Fast

The local Factory launcher accepted an explicit Fast request for its enrolled
Codex worker. A fresh bounded run completed, and the gateway usage entry
matched the model, request window, and token counts. The gateway recorded the
Fast request as priority processing through the OpenAI subscription route.
This qualified the existing override before changing the default.

The shared rollout covers the enrolled Factory projects. Claude stays at
Standard. The operator rollout record tracks host upgrades, effective speed
probes, and activation prerequisites.

The controller matched the private implementation patch to its Fleet
receipt and verified it against the published source before applying it.
The first focused pass ran 101 tests across local gateways, reverse
delegation, Fleet workspace and source binding, and the unattended launcher.
Four additional Factory distribution tests passed. Typecheck, compilation,
and PM indexes passed. The complexity check passed with an advisory on
the existing Fleet controller dispatch function.

Existing standalone Codex jobs also use the shared gateway worker.
Their private configuration can select Fast for a fresh job. A continuation
retains its original speed and session home, and legacy jobs default to
Standard. The controller matched the supplemental patch to its independent
Fleet execution receipt before applying it.

## Review corrections

The independent review found three speed-intent defects. Local continuations
now read speed from the matching Codex session. Fleet rejects a conflicting
reply speed before posting an answer, and a conflicting stable-ID retry
returns HTTP 409 so the client can report the error without retrying. Six
controller-run focused tests cover the corrections.

The follow-up identified a Fast session that could lose its saved speed when
recent run history was trimmed. The bridge now records the speed with the
confirmed Codex session. The regression reproduces history trimming before
resuming the original session, with the worker default reset to Standard.

CI exercised an older run record with no selection object. The author
restored the Standard fallback for that record. The separate artifact
transport job reported a missing fixture immediately after upload. A later
download returned both expected files and their exact digests.

## Governing records

- [Gateway binding and speed isolation](./2026-11-07-bind-factory-gateway-workers.md)
- [Earlier Codex worker default update](./2026-11-17-upgrade-factory-codex-default.md)

## Independent review

The initial review found three mismatches between requested and effective speed. The first follow-up verified those fixes and found that trimmed history could still change the speed of a resumed primary session. A second follow-up cleared durable session speed. The final focused review cleared the older record fallback discovered by CI. The code review covers the exact candidate. Live activation requires a separate subscription-credit decision.

```morpheus-review
{
  "version": 2,
  "base": "ad6a186d2ac4060455bc80c3f1a0a52cccdf0f0b",
  "reviewed": "487ad4c522121832d7b5217aeefc3bdf88adcba7",
  "covered": "72dea1c1ad2cc105f39e00af5a38d8bf5e6ffda0",
  "authorSession": "01a211a1-b26a-72a2-bacf-35e4f06a5ac5",
  "reviewerSession": "01a211c1-e601-79f2-8dcc-354b5c6f66bb",
  "risk": "high",
  "elapsedMinutes": 9.014516666666667,
  "timing": {
    "source": "runner",
    "durationMs": 540871,
    "evidence": "Factory guardian monotonic duration for the initial review, including termination verified by a subsequent owned-process census."
  },
  "outcome": "complete",
  "summary": "The initial review found three mismatches between requested and effective speed. The first follow-up verified those fixes and found that trimmed history could still change the speed of a resumed primary session. A second follow-up cleared durable session speed. The final focused review cleared the older record fallback discovered by CI. The code review covers the exact candidate. Live activation requires a separate subscription-credit decision.",
  "contextRead": [
    "AGENTS.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-11-07-bind-factory-gateway-workers.md",
    ".agent/worklog/2026-11-07-run-factory-workers-remotely.md",
    ".agent/worklog/2026-11-17-upgrade-factory-codex-default.md",
    ".agent/worklog/2026-11-24-default-factory-fast.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-13-23.33.48-default-factory-fleet.md",
    "hq/product/roadmap/MO-26-11-24-23.36.49-default-factory-fast.md",
    "plugins/factory/README.md",
    "qa/acceptance/MO-26-11-24-23.36.49.md"
  ],
  "findings": [
    {
      "id": "F-01",
      "severity": "substantive",
      "description": "Implicit replies could apply a new default to an existing local Codex session.",
      "paths": [
        "plugins/factory/src/service.mjs",
        "plugins/factory/tests/gateway-workers.test.mjs"
      ],
      "disposition": "fixed",
      "response": "Both controller paths use the resumed session’s matching saved speed. Tests verify the exact resumed thread and tier as well as a fresh worker taking the new default."
    },
    {
      "id": "F-02",
      "severity": "substantive",
      "description": "A Fleet reply requesting Standard could silently continue an admitted Fast task.",
      "paths": [
        "plugins/factory/scripts/fleet-delegate.mjs",
        "plugins/factory/tests/fleet-source.test.mjs",
        "plugins/factory/README.md"
      ],
      "disposition": "fixed",
      "response": "The controller refuses a conflicting explicit speed before it posts the answer. Omitted and matching speeds continue the admitted run."
    },
    {
      "id": "F-03",
      "severity": "substantive",
      "description": "A contradictory speed on a stable Fleet message ID returned a retryable server error.",
      "paths": [
        "plugins/factory/src/fleet-api.mjs",
        "plugins/factory/tests/fleet-client.test.mjs",
        "plugins/factory/tests/fleet-workspace.test.mjs"
      ],
      "disposition": "fixed",
      "response": "A speed conflict returns HTTP 409 before mutation. Regressions verify both directions, the original admission, and one client attempt."
    },
    {
      "id": "F-04",
      "severity": "substantive",
      "turn": 2,
      "description": "Trimming recent run history could lose a saved Fast speed while retaining the underlying primary Codex session.",
      "paths": [
        "plugins/factory/src/service.mjs",
        "plugins/factory/tests/gateway-workers.test.mjs"
      ],
      "disposition": "fixed",
      "response": "The bridge saves speed with the confirmed primary Codex session and consults it when history is missing. The targeted test trims history and resets the default before resuming the original Fast session."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a211d7-cb6d-7a03-93f7-e6ab2c187665",
      "commit": "7387e9fa5d27ba0d0a69bba884be2e3b9868e38f",
      "outcome": "blocked",
      "blockedOn": [
        "F-04"
      ],
      "elapsedMinutes": 5.438516666666667,
      "timing": {
        "source": "runner",
        "durationMs": 326311,
        "evidence": "Factory guardian monotonic duration through verified cleanup for the first independent follow-up."
      },
      "handoff": {
        "reason": "Fleet cannot resume a completed review task. A fresh reviewer received the exact corrected commit, findings and author evidence.",
        "findings": [
          "F-01",
          "F-02",
          "F-03"
        ]
      },
      "summary": "Verified F-01 through F-03 and blocked on F-04 because display history was shorter than the lifetime of the saved provider session."
    },
    {
      "reviewerSession": "01a211e1-a6bb-7f73-b7b0-fc5d08adf094",
      "commit": "1043cbe33457d4e661ee0721c70b24a211f1743a",
      "outcome": "cleared",
      "elapsedMinutes": 3.096233333333333,
      "timing": {
        "source": "runner",
        "durationMs": 185774,
        "evidence": "Factory guardian monotonic duration through verified cleanup for the retained-speed review."
      },
      "handoff": {
        "reason": "Fleet cannot resume a completed review. The fresh reviewer received the earlier findings and the exact retained-speed correction.",
        "findings": [
          "F-01",
          "F-02",
          "F-03",
          "F-04"
        ]
      },
      "summary": "Cleared F-04 with independent focused tests on both root paths and found no new material issue."
    },
    {
      "reviewerSession": "01a211e5-c660-74f2-b406-8d13cbb46764",
      "commit": "72dea1c1ad2cc105f39e00af5a38d8bf5e6ffda0",
      "outcome": "cleared",
      "elapsedMinutes": 2.3197666666666668,
      "timing": {
        "source": "runner",
        "durationMs": 139186,
        "evidence": "Factory guardian monotonic duration through verified cleanup for the legacy metadata correction review."
      },
      "scopeReason": "CI exercised a legacy run missing the selection object. This late one-line source correction restores Standard without changing the resolved findings.",
      "handoff": {
        "reason": "Fleet cannot resume a completed reviewer. The new session received all four findings, prior clearance, the exact late correction and focused CI evidence.",
        "findings": [
          "F-01",
          "F-02",
          "F-03",
          "F-04"
        ]
      },
      "summary": "Cleared the exact legacy-record fallback. The independent reviewer ran the CI failure case successfully and verified that explicit Fast is still preserved."
    }
  ]
}
```
