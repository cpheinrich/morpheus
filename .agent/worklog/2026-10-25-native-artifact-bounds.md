# MO-26-10-25-03.13.21 — bounded optional native diagnostics

Evo delivery staging-20261020000000000 run40168456839 succeeded at test execution
but screenshot admission exceeded the stored-byte bound. That artifact failure
then selected full failure evidence, which also exceeded the bound. The existing
all-selected barrier correctly refused publication. Independent diagnosis and
strategy analysis confirmed mandatory metadata already admitted (27 files,
4,750,712 raw bytes,10,663,804 stored upper bound).

Repair confines deterministic whole-file selection to optional screenshot/failure
channels, reports all omissions in the bounded payload, preserves atomic result
bundles and full source-census mutation checks, and captures native failure before
artifact staging. Mandatory qualification and uploader limits remain unchanged.
This is domain-specific extension of the existing stdlib staging implementation.

Funding independently checked against the native ledger: paidId
`evo-ordinary-native-artifact-upstream-20261025`, digest
`a724709d48ea9ada23aabc082a84a13c233e04e9234fe64cd161cf4412b6c35b`,
maximum10,000,000micros, reserved. Covers this upstream repair cycle only,
at most7fullCI+4metadataCI groups. Consumer has separate reservation.
No deployment, full CD qualification, or receipt is asserted.

Focused validation: `python3 tests/artifacts/test_stage.py`:23 passing,
including oversize omission, mandatory rejection, atomic bundles, omitted-file
mutation and report-only accounting. Independent source review pending.

Independent exact-head review by /root/upstream_reviewer cleared with no findings. Reviewer independently ran23 stage and7 trace tests plus small-cap bundle/accounting probes. Author workflow7tests,11mutants, TypeScript noEmit and build compilation passed. pnpm wrapper stalled before tests and was stopped; installed binaries completed directly. Required CI remains separate.

Independent exact-head review cleared with no findings; bounded optional selection, report accounting, atomic bundles, source mutation and mandatory controls verified.

```morpheus-review
{
  "version": 2,
  "base": "b0906f2ed944105689333eac1525a583065316a1",
  "reviewed": "ab6e320afd7b11ac76362915ca7ff15ebb85b881",
  "covered": "ab6e320afd7b11ac76362915ca7ff15ebb85b881",
  "authorSession": "01a1723d-7050-7000-82bb-ecf55bc63117",
  "reviewerSession": "/root/upstream_reviewer",
  "risk": "high",
  "elapsedMinutes": 1.6166666666666667,
  "timing": {
    "source": "clock",
    "durationMs": 97000,
    "evidence": "Author clock before spawn 2026-10-25T10:19:24Z and after returned review 2026-10-25T10:21:01Z; reviewer independent readings10:19:41Z\u201310:20:40Z."
  },
  "outcome": "complete",
  "summary": "Independent exact-head review cleared with no findings; bounded optional selection, report accounting, atomic bundles, source mutation and mandatory controls verified.",
  "findings": []
}
```
