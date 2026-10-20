# Internal beta readiness — MO-26-10-20-11.22.50

Evo delivery strategy4 encountered a valid processed build whose beta detail was
UNKNOWN. The controller posted internal group membership and Apple returned404.
Later reads of the same identity showed READY_FOR_BETA_TESTING. The precise
provider cause remains unknown, but the missing readiness gate is independently
confirmed by author and fresh diagnosis `/root/apple_diagnosis`.

## Change

Wait for READY_FOR_BETA_TESTING or IN_BETA_TESTING before group claim/assignment.
Retain accepted bytes and the existing bounded processing diagnosis. No blanket
404 retry, new dependency, receipt/test relaxation, or consumer runtime change.
Consumer operational recovery and runtime adoption are separate from source merge.

## Validation

New regressions failed four cases on unmodified source: three non-ready states
still assigned and prolonged unreadiness did not request diagnosis. Then
`node node_modules/vitest/vitest.mjs run tests/cd/controller.test.ts tests/cd/state.test.ts tests/cd/adapters.test.ts`
passed113 tests, zero failures/skips. Scope covers controller, state/receipt
invariants and Apple adapter. Tests prove no early POST, later same-build
promotion, exact membership readback, no replacement dispatch and bounded diagnosis.
Typecheck and committed-dist compilation run separately. No full-suite local rerun.

CI reservation: Evo ledger evo-apple-readiness-s4-20261020 ($5 maximum); preserve
until actual billing permits settlement. Upstream issue#437. This is new bounded
review scope; no prior Evo review turns are reused or reset.

## Independent review

Independent exact-head review cleared the internal beta readiness guard with no findings. Accepted-upload ownership, bounded diagnosis and exact receipt validation remain unchanged.

```morpheus-review
{
  "version": 2,
  "base": "7264abeef43d91dc3f974cf0c15df308de4fdf91",
  "reviewed": "47a3f175f8c598cf88496606eb485315686b2734",
  "covered": "47a3f175f8c598cf88496606eb485315686b2734",
  "authorSession": "01a15a89-e633-7bd0-80bc-df0dd4d7f1ac",
  "reviewerSession": "/root/beta_readiness_reviewer",
  "risk": "high",
  "elapsedMinutes": 1.3833333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 83000,
    "evidence": "Author clock before spawn2026-10-20T18:26:19Z and after receipt of completed review2026-10-20T18:27:42Z; includes tools and wait."
  },
  "outcome": "complete",
  "summary": "Independent exact-head review cleared the internal beta readiness guard with no findings. Accepted-upload ownership, bounded diagnosis and exact receipt validation remain unchanged.",
  "findings": []
}
```
