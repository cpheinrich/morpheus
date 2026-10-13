# Record why the iOS test-result verifier stays app-specific — MO-26-09-28-19.13.59

Resolves #305's open question with a decision entry; root confirmed no user decision was needed.

## Review record

Independent small-risk review of recording why Evo's iOS test-result verifier stays app-specific beside the shared nightly admission core. The reviewer verified each factual claim against the core, Evo's verify-results.mjs and known-skips file, and the Lakina and Kairos checkouts, and validated the roadmap files. It raised one minor finding, the reason naming only the skip check, fixed by naming the verifier's Evo-specific targets, scope split, nightly-only suite and inventory digest, and one incidental pre-existing usage typo in the core's comment, deferred to MO-26-09-28-19.16.37 so the vendored digest changes only with the next core refresh.

```morpheus-review
{
  "version": 2,
  "base": "dce6bce55ff2672bc22f30a1fb50ecd93f7ce210",
  "reviewed": "b52e711269bd673b842eee3fe431316a9ed2b907",
  "covered": "247e09753126df4753fa33773e00f43ed5eb90ff",
  "authorSession": "13749f2d-ae1e-40b5-8930-44ed54b327a3",
  "reviewerSession": "aae2543c7335e2e14",
  "risk": "small",
  "elapsedMinutes": 0.9127333333333333,
  "timing": {
    "source": "runner",
    "durationMs": 54764,
    "evidence": "Agent tool result usage.duration_ms for the independent review invocation: 54764."
  },
  "outcome": "complete",
  "summary": "Independent small-risk review of recording why Evo's iOS test-result verifier stays app-specific beside the shared nightly admission core. The reviewer verified each factual claim against the core, Evo's verify-results.mjs and known-skips file, and the Lakina and Kairos checkouts, and validated the roadmap files. It raised one minor finding, the reason naming only the skip check, fixed by naming the verifier's Evo-specific targets, scope split, nightly-only suite and inventory digest, and one incidental pre-existing usage typo in the core's comment, deferred to MO-26-09-28-19.16.37 so the vendored digest changes only with the next core refresh.",
  "findings": [
    {
      "id": "DEC-R1",
      "severity": "minor",
      "disposition": "fixed",
      "paths": [
        ".agent/decisions.md"
      ],
      "description": "The recorded reason named only the known-skips check, although the verifier also hardcodes Evo's test targets, scope split, nightly-only suite and UI inventory digest, so a later app adding a known-skips file would look like the lift trigger.",
      "response": "The entry now names those Evo-specific parts, and the lift trigger reads: when a second app needs its results verified against an enumeration of its tests."
    },
    {
      "id": "DEC-R2",
      "severity": "incidental",
      "disposition": "deferred",
      "roadmap": "MO-26-09-28-19.16.37",
      "paths": [
        "src/ios/nightly-core.ts"
      ],
      "description": "Pre-existing: the core's header comment gives the usage as nightly-core --write <file>; the CLI takes a positional write|check.",
      "response": "Deferred to MO-26-09-28-19.16.37: the comment is compiled into the vendored copies, so it is corrected with the next core change and a refresh of both apps' copies."
    }
  ]
}
```
