# Share the nightly iOS release admission core — MO-26-09-28-18.48.33

Extracted the host-side nightly TestFlight admission and upload-evidence logic from darwin-health/evo #307/#309 into `src/ios/nightly-core.ts`, added `morpheus ios nightly-core write|check`, and adopted it in darwin-health/evo#314 and cpheinrich/lakinacapital#439. Kairos needs no change while its release runs from GitHub-hosted cron.

## Review record

Independent normal-risk review of extracting Evo's nightly TestFlight admission and upload-evidence logic into src/ios/nightly-core.ts with a vendoring command. The reviewer compared every core function line by line with Evo's origin/main policy.mjs and api.mjs and found no behaviour change, confirmed dist/ is in sync, and round-tripped write and check on a vendored copy. It found one minor defect, the nightly-core help lines splitting changed-swift from its description, fixed by moving them below it, and one incidental note on the claim's reconciliation of the merged #304 item, kept as intended bookkeeping.

```morpheus-review
{
  "version": 2,
  "base": "84cb9150e140046c5cc1fbdc018d797382486d8b",
  "reviewed": "07462faff4fd093aae1d00cbf335508c770741c5",
  "covered": "7b23facf74d8393b04b4fa5f02f116bdc7962524",
  "authorSession": "13749f2d-ae1e-40b5-8930-44ed54b327a3",
  "reviewerSession": "afb4d6700b06b50ce",
  "risk": "normal",
  "elapsedMinutes": 1.1117166666666667,
  "timing": {
    "source": "runner",
    "durationMs": 66703,
    "evidence": "Agent tool result usage.duration_ms for the independent review invocation: 66703."
  },
  "outcome": "complete",
  "summary": "Independent normal-risk review of extracting Evo's nightly TestFlight admission and upload-evidence logic into src/ios/nightly-core.ts with a vendoring command. The reviewer compared every core function line by line with Evo's origin/main policy.mjs and api.mjs and found no behaviour change, confirmed dist/ is in sync, and round-tripped write and check on a vendored copy. It found one minor defect, the nightly-core help lines splitting changed-swift from its description, fixed by moving them below it, and one incidental note on the claim's reconciliation of the merged #304 item, kept as intended bookkeeping.",
  "findings": [
    {
      "id": "MO-R1",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        "src/cli/help.ts",
        "dist/cli/help.js",
        "dist/cli/help.d.ts"
      ],
      "description": "The two nightly-core help lines were inserted between the changed-swift usage line and its description, so changed-swift appeared undescribed and nightly-core appeared to carry changed-swift's text.",
      "response": "Moved the nightly-core usage and description below the last changed-swift description line and recompiled; morpheus --help now shows each command with its own description, and tests/cli passes 150/150."
    },
    {
      "id": "MO-R2",
      "severity": "incidental",
      "disposition": "disputed",
      "paths": [
        "hq/product/roadmap/MO-26-09-28-18.35.26-remove-ios-visual-qa-publisher.md"
      ],
      "description": "The branch marks another task's roadmap item shipped with prs [304].",
      "response": "morpheus pm claim wrote this when claiming, reconciling the item against PR #304, which merged before this branch was cut. It is correct bookkeeping, so it stays."
    }
  ]
}
```
