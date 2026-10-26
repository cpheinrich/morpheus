---
date: 2026-10-24
roadmap: MO-26-10-24-23.43.56
agent: codex
---

# Web preview ownership survives display renames

Issue #494 came from the final cpheinrich QA cleanup: the manifest name changed while its temporary checkout root did not. `webKey` already followed the checkout/dev directory, but `webContext` put both session.json and the launchd label beneath the name-derived namespace. `stopWeb` then looked at the new empty location and printed Stopped unconditionally. The operator had already identified and stopped the original supervisor/dev processes before implementation.

New sessions use a stable web cache/launchd namespace. Bounded legacy discovery reads only directories for the same checkout/dev key; stored canonical root and dev directory must agree, and a registered job must name Node, the web supervisor and the exact state-file argument. Foreign/malformed/symlinked records, active legacy locks, unknown inspection errors or multiple registrations refuse before arbitrary bootout. Health includes the checkout root, not only upstream/port. A live legacy lease stays at its original path; status reports its real log. Start stops a verified old registration before creating the stable one. Stop confirms job/PID disappearance and absence of the overlay and any spawned dev TCP listener before removing state; absence and unconfirmed shutdown do not claim termination. Unhealthy or stalled listeners count as live and retain their record. Colliding legacy/stable launchd labels resolve by their actual registered state-file argument rather than directory enumeration.

No generic manager or dependency was introduced. The registry's `launchctl` 1.1.1 is old (modified 2022-06-19) and has four direct native/legacy dependencies; it does not supply the ownership protocol. Existing Run and native filesystem/launchd primitives fit this domain boundary.

Validation: `pnpm typecheck`, `pnpm lint`, `pnpm compile`, `pnpm morpheus pm index`, `git diff --check`; focused `pnpm exec vitest run tests/qa-web-lifecycle.test.ts tests/qa-web-readiness.test.ts tests/qa-web.test.ts tests/qa-preview.test.ts` — 109 passed after the review fixes. Scope includes the changed web lifecycle, readiness consumers and shared iOS preview helpers. Three isolated cases run real test-owned web-supervisor/dev subprocesses and HTTP listeners through start, rename, status, legacy-to-stable restart and stop, asserting original/current PIDs and listener disappearance. Launchctl is simulated in those tests; only their fixture subprocesses receive signals. Other regressions cover different checkout keys, copied foreign state, wrong argv, ambiguity, malformed/symlinked/locked state, invalid PID, missing state, inspection/bootout failure, surviving registration and answering/unverified listeners.

Read-only platform verification inspected the already-stopped original launchd registration: it remained registered without a PID, and macOS printed exactly three arguments (node, web-supervisor.js, original legacy session.json), matching the parser. No bootout, signal, restart, browser navigation or other mutation was sent to that registration, any user preview/responder, website file, or installed CLI. No screenshots were taken: process/state ownership is validated by the lifecycle assertions, not rendered pixels.

Graph evidence is Tier 2, project Users-chrisheinrich-code-morpheus generation 2026-10-25T06:34:54Z. Exact webContext/stopWeb/dispatchWebPreview/launchPlist snippets established the old namespace and control path. Coverage of existing preview, CLI, readiness/test and runbook paths recorded no gap (best effort); worktree changes/new lifecycle test use direct source and execution. No graph-completeness claim is made.

Initial independent review by `/root/morpheus_web_pin_fix/preview_ownership_review` of `22e86c0e5bcbbd5d1a51b63f0013593fcf89db3a` was blocked on three substantive findings: OWN-1, an empty legacy directory could shadow a stable session sharing its launchd label; OWN-2, HTTP 500 orphan dev services were mistaken for absence; OWN-3, a registered job without a PID could be booted out while its spawned dev service remained, yet stop claimed success. Measured from 2026-10-25T06:59:40.826Z to 2026-10-25T07:01:39.098Z, 118272ms (1.9712 minutes), within the high-risk initial ceiling.

Response: group candidate records by label and select the registered owner from the exact state-file argv; probe TCP presence separately from HTTP readiness before orphan cleanup and after bootout. Connection errors other than refusal and probe timeouts retain evidence. Added real isolated HTTP 200/500 surviving-dev regressions, a live raw-TCP orphan, empty-directory collision and a complete legacy-to-stable restart where the labels collide. The test harness waits on its own ephemeral listeners and tracks every spawned child. Typecheck, lint, compile and all 109 focused tests pass. No user process or installed CLI was changed. Same-reviewer verification cleared all three findings at `1b61d4baf7e14e550f19c30287b14d9afcc39d47`, independently reran all 109 focused tests and inspected source, generated output, docs and regressions. Follow-up measured from 2026-10-25T07:08:37.358Z to 2026-10-25T07:09:17.454Z, 40096ms, within the 15-minute high-risk follow-up ceiling. No remaining findings.

Independent high-risk review found three ownership/stop-confirmation defects. The author fixed colliding legacy labels and replaced readiness-based absence with bounded TCP listener checks; the same reviewer cleared all three findings and independently passed 109 focused tests. No remaining findings or user-service mutations.

Final head fc62219 CI passed all checks except Chromium token-rich capture exceeded the existing 120 ms freeze bound (25/26 browser cases passed). This was the separate reviewed PR495 performance fix, merged upstream as ead6c3013f24062436572c785cd0443f38be08ec. Integrated that trunk in d69bdcbe2d1cfa027fafa1b4146f667bcdba0b74; retained both full appended decisions when resolving their sole conflict. No capture code was authored in this task. Final integrated CI follows.

```morpheus-review
{
  "version": 2,
  "base": "fc7678e6cea4d7442c994173e1ae6e0fb2c311b5",
  "reviewed": "22e86c0e5bcbbd5d1a51b63f0013593fcf89db3a",
  "covered": "1b61d4baf7e14e550f19c30287b14d9afcc39d47",
  "authorSession": "01a17121-d469-73a1-b304-3d770aabf560",
  "reviewerSession": "/root/morpheus_web_pin_fix/preview_ownership_review",
  "risk": "high",
  "elapsedMinutes": 1.9712,
  "timing": {
    "source": "clock",
    "durationMs": 118272,
    "evidence": "Author clock readings around initial invocation of /root/morpheus_web_pin_fix/preview_ownership_review: 2026-10-25T06:59:40.826Z to 2026-10-25T07:01:39.098Z (1792911580826 to 1792911699098), including tools and waits."
  },
  "outcome": "complete",
  "summary": "Independent high-risk review found three ownership/stop-confirmation defects. The author fixed colliding legacy labels and replaced readiness-based absence with bounded TCP listener checks; the same reviewer cleared all three findings and independently passed 109 focused tests. No remaining findings or user-service mutations.",
  "findings": [
    {
      "id": "OWN-1",
      "severity": "substantive",
      "description": "An empty legacy morpheus.qa directory could overwrite the stable candidate sharing its launchd target and hide a verifiable stable session.",
      "paths": [
        "src/qa/preview/web.ts",
        "tests/qa-web-lifecycle.test.ts"
      ],
      "disposition": "fixed",
      "response": "Group candidate state records per target and select the owner by its actual registered state-file argument. Empty-directory regression and a real legacy-to-stable lifecycle with colliding labels pass; same reviewer cleared."
    },
    {
      "id": "OWN-2",
      "severity": "substantive",
      "description": "Readiness excluded HTTP 500, so an unregistered preview with free overlay but a live unhealthy spawned dev server could lose its state.",
      "paths": [
        "src/qa/preview/web.ts",
        "tests/qa-web-lifecycle.test.ts"
      ],
      "disposition": "fixed",
      "response": "Use bounded TCP listener-presence probes, independent of HTTP readiness, before inactive cleanup. HTTP 500 and raw TCP regressions retain state without bootout; non-refusal errors/timeouts retain evidence. Same reviewer cleared."
    },
    {
      "id": "OWN-3",
      "severity": "substantive",
      "description": "After bootout a registered supervisor without a PID could leave a spawned dev server listening while stop claimed success and removed state.",
      "paths": [
        "src/qa/preview/web.ts",
        "tests/qa-web-lifecycle.test.ts"
      ],
      "disposition": "fixed",
      "response": "Require both overlay and any spawned dev listener to disappear after job/PID shutdown. A real HTTP 200 survivor rejects successful stop and preserves state; same reviewer cleared."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_web_pin_fix/preview_ownership_review",
      "commit": "1b61d4baf7e14e550f19c30287b14d9afcc39d47",
      "outcome": "cleared",
      "elapsedMinutes": 0.6682666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 40096,
        "evidence": "Author clock readings around the same-reviewer follow-up: 2026-10-25T07:08:37.358Z to 2026-10-25T07:09:17.454Z (1792912117358 to 1792912157454), including tools and waits."
      },
      "summary": "Cleared OWN-1, OWN-2 and OWN-3 after inspecting source, generated output, docs and regressions. Independently ran all four focused suites: 109 tests passed; diff checks passed. No remaining findings or user services modified."
    }
  ],
  "trunkIntegrations": [
    {
      "commit": "d69bdcbe2d1cfa027fafa1b4146f667bcdba0b74",
      "reason": "Merged reviewed PR495 trunk ead6c301 after CI exposed its known token-rich browser freeze limit. Resolved only the append conflict in .agent/decisions.md by retaining both complete decision entries; no capture or lifecycle source was hand-edited."
    }
  ]
}
```
