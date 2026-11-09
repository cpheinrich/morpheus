---
roadmap: MO-26-11-07-23.29.54
tags: [engineering, devops, infrastructure]
---

The approved phase runs fleet work beside the existing local path. Keep the
existing tools and use an explicit fleet placement choice. The controller binds
the task to the exact committed SHA and maps its owned run to the cloud task.
The service can authorize exact commits for a Git-enrolled project. The
supervisor fetches from the operator-configured bare mirror's origin. The
execution account can read the mirror and creates an attempt-specific checkout.
A clarification resumes that checkout. The supervisor holds the upstream
credential outside the executor account. No new package is needed for this Git
or Factory-specific boundary.

Factory package tests passed 171 cases, including Git source selection, checkout
isolation, continuation and local target validation. Both Firestore emulator
tests passed, including new source admission and idempotent submission. Typecheck,
compile, PM index and complexity passed. The intended Studio supervisor and
execution accounts proved the private Git credential and read-only mirror access
using a previously merged commit. The live standard-tool rollout is the next
acceptance step and belongs to the controller.

Independent review found three issues in restart recovery, checkout ownership and inspection reporting. The follow-up verified that a restart during Git preparation settles a task that never launched, another root cannot authorize the selected checkout, and fleet inspection reports unknown eligibility and quota. Nineteen focused tests and a local executor fixture passed independently. No substantive findings remain.

```morpheus-review
{
  "version": 2,
  "base": "80717b63522050e265b95eee73abe16d58787246",
  "reviewed": "7d8df7e47a888cc624e88ca7cf590d4e99cae94b",
  "covered": "f38cfbfe44e4ab80f607a1bc244982ca775d3389",
  "authorSession": "01a1b6a4-7fb9-78c3-bc46-b774525be5bf",
  "reviewerSession": "/root/fleet_checkout_review",
  "risk": "high",
  "elapsedMinutes": 3.1356166666666665,
  "timing": {
    "source": "clock",
    "durationMs": 188137,
    "evidence": "Controller measured /root/fleet_checkout_review from 2026-11-08T07:36:08.270Z to 2026-11-08T07:39:16.407Z around the review invocation and observed verdict."
  },
  "outcome": "complete",
  "summary": "Independent review found three issues in restart recovery, checkout ownership and inspection reporting. The follow-up verified that a restart during Git preparation settles a task that never launched, another root cannot authorize the selected checkout, and fleet inspection reports unknown eligibility and quota. Nineteen focused tests and a local executor fixture passed independently. No substantive findings remain.",
  "findings": [
    {
      "id": "FLEET-01",
      "severity": "substantive",
      "description": "A restart during source preparation could leave a running journal with no gateway-worker admission and retain the only slot.",
      "paths": [
        "plugins/factory/src/fleet-runner.mjs",
        "plugins/factory/src/fleet-execution.mjs",
        "plugins/factory/scripts/fleet-executor.mjs"
      ],
      "disposition": "fixed",
      "response": "Persist a preparation phase and run the checkout-only executor before journaling model launch. A restart regression proves no guardian recovery or launch is attempted."
    },
    {
      "id": "FLEET-02",
      "severity": "substantive",
      "description": "The anchor repository check did not enforce ownership of the selected linked checkout.",
      "paths": [
        "plugins/factory/scripts/fleet-delegate.mjs",
        "plugins/factory/scripts/fleet-mcp.mjs",
        "plugins/factory/src/service.mjs"
      ],
      "disposition": "fixed",
      "response": "Forward the exact checkout through inspection and submission and consult the canonical checkout registry. A fixture rejects a checkout owned by a different root."
    },
    {
      "id": "FLEET-03",
      "severity": "substantive",
      "description": "Fleet inspection appeared to confirm a usable route based on local source checks alone.",
      "paths": [
        "plugins/factory/scripts/fleet-delegate.mjs",
        "plugins/factory/scripts/tool-contract.mjs"
      ],
      "disposition": "fixed",
      "response": "Report pending admission, unknown availability and null quota until the checks run. A focused test verifies that an offline endpoint does not turn source preflight into a route confirmation."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/fleet_checkout_review",
      "commit": "f38cfbfe44e4ab80f607a1bc244982ca775d3389",
      "outcome": "cleared",
      "elapsedMinutes": 1.2821833333333332,
      "timing": {
        "source": "clock",
        "durationMs": 76931,
        "evidence": "Controller measured /root/fleet_checkout_review from 2026-11-08T07:39:43.923Z to 2026-11-08T07:41:00.854Z around the review invocation and observed verdict."
      },
      "summary": "All three findings cleared. Nineteen focused tests and a separate executor preparation, launch, artifact and recovery probe passed."
    }
  ]
}
```
