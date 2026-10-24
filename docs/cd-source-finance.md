# Reviewed source publication reservations

`morpheus cd budget --operation reserve` accepts an explicit reviewed source grant:

```text
morpheus cd budget --operation reserve --config NATIVE_CONFIG \
  --id SOURCE_CI_ID --request REVIEWED_REQUEST_JSON --maximum-micros APPROVED_AMOUNT \
  --authority REVIEWED_GRANT_JSON --authority-digest APPROVED_CANONICAL_GRANT_SHA256
```

These are placeholders, not an approved invocation. Obtain independent financial review
of the actual human record, grant, request, target, liability and exact invocation before use.
The approved digest is `hash(parsedGrant)` using `morpheus-kit/cd`'s existing canonical
hash function; it is not the raw file hash. Recalculating a digest after changing an input
does not approve that change.

Both authority flags are required together and belong only to explicit `cd budget reserve`.
They are rejected before help, token, credential or other command paths. Only the reserve
arguments shown above and `--json` are accepted with authority. The grant and request must
be JSON files; stdin and a caller-selected clock are unavailable. With both flags absent,
the existing native reserve/settle path is unchanged.

## Grant and request contracts

Both documents reject unknown or missing fields. All amounts and counts are nonnegative
safe integers; amount and ceiling must be positive, and the amount cannot exceed the ceiling.
There is no shared engagement amount, total ceiling, repository, epoch or human-evidence
constant. The exact independently reviewed values belong in each grant.

The grant contains:

| Field | Required value |
|---|---|
| `version`, `kind`, `purpose` | `1`, `reviewed-source-financial-authority`, `source-ci-publication` |
| `grantId` | Nonempty identifier using letters, digits, `_ . : -`, at most 160 characters |
| `humanEvidenceSha256` | SHA-256 reference to the actual human approval evidence |
| `repository` | Exact `owner/repository`, matching the supplied native config, request and ledger |
| `epoch` | Existing ledger epoch, using the same identifier alphabet and length bound |
| `configurationDigest` | Both the stored ledger digest and independently calculated digest of the parsed supplied native config |
| `reservationId` | Exact CLI `--id`, in the reserved `source-ci-` namespace; at most 160 characters |
| `requestDigest` | Canonical hash of the complete base request before wrapping it |
| `maximumMicros` | Exact CLI `--maximum-micros` |
| `totalCeilingMicros` | Reviewed aggregate ceiling for settled spend plus every reserved liability |
| `issuedAt`, `expiresAt` | Canonical UTC millisecond timestamps; `issued <= now < expires`, with a positive window of at most 30 minutes |

The source request contains exactly these fields:

```text
version: 1
kind: source-ci-publication
repository: exact owner/repository
taskId: exact source task identifier
branch: exact source branch
fullCiMax: reviewed finite count
metadataCiMax: reviewed finite count
gitBranchPreviewsMax: reviewed finite count
productionDeploymentsMax: reviewed finite count
budgetTransactionsMax: 1
nativeEffects: false
paidModelFallback: false
previewSettingsEffects: false
```

Task identifiers use the same bounded identifier alphabet as `grantId`. Branches are
nonempty strings of letters, digits, `_ . / -`, at most 240 characters. Request counts
describe the reviewed finite source family. This command does not dispatch jobs, enforce
provider billing limits or automate publication counters. The operator must qualify the
actual CI/deployment/artifact closure and preconsume its bounded events separately.

## Admission, replay and evidence

The CLI reads each input file once. Strict parsing copies and recursively freezes the
native configuration, grant and request before the first provider read. Later file or
caller-object changes cannot replace those snapshots. This is input integrity, not a
filesystem isolation or same-user security boundary.

The normal owner-bound `GitHubStore` performs nonforce, single-parent CAS updates. The
source path checks the actual repository, epoch, both configuration digests, current clock,
settled tombstones and complete safe-integer liability sum before `transact`, whose replay
path otherwise bypasses its callback. Every callback checks again against fresh state and
time after asynchronous reads and CAS conflicts. Expiry is an admission deadline; it is
not a promise that provider acknowledgments finish within the grant window. A delayed
replay is checked again at final readback.

The reservation digest is the canonical hash of this immutable envelope:

```text
{ version: 1, kind: reviewed-source-reservation,
  request: COMPLETE_BASE_REQUEST,
  authority: { grant: COMPLETE_GRANT, digest: APPROVED_CANONICAL_GRANT_SHA256 } }
```

The paid object retains the existing `{digest, maximumMicros, status: "reserved"}` shape.
The normal transaction result and event retain the complete receipt:
`{version: 1, kind: "reviewed-source-reservation-receipt", id, maximumMicros,
requestDigest: ENVELOPE_HASH, envelope: COMPLETE_ENVELOPE}`. Final readback requires that
exact paid object, complete receipt and normal transaction owner. Output also names the
`verifiedReadbackHead`. An ordinary or ownerless legacy transition cannot acquire source
authority. A settled reservation cannot be reopened or relabelled. Missing or contradictory
readback is failure, with any accepted liability still held; do not blindly retry or invent
a settlement.

The native configuration schema, ordinary paid reservation admission, controller,
epoch and stored configuration digest remain unchanged. A source reservation may take
aggregate liability above the configured ordinary paid ceiling, at most $250. The
unchanged `reservePaid` and ordinary `cd budget reserve` guard refuses new paid
reservations that would exceed it; exact old reserved paid identities still replay.
This dollar guard does not gate local delivery intent creation, attempt planning or
dispatch; their other existing controls still apply. This administrative source grant
itself authorizes no native operation, model fallback, host change or deployment.

## Trust and local verification

A grant JSON and hash pin are operator attestation and input integrity. They do not
authenticate a human, prove a review, establish provider prices or constrain a privileged
caller who can change all approval inputs and credentials. Human evidence, exact reviewed
invocation and real operational authority remain external review obligations. Normal
public source, credentials and account routes remain required.

`dist/cd/source-finance.js` exports `prepareReviewedSourceReservation(config, input)` and
`applyReviewedSourceReservation(state, prepared, observedAt)` as the pure snapshot and
transition seams for in-memory compatibility checks. The latter changes only the passed
state and returns the full receipt; it performs no provider write and supplies no independent
authority. The actual CLI uses `reserveReviewedSource(api, config, input)`, owns its fresh
clock, and requires normal CAS plus final readback. No CLI flag or environment value can
replace that clock. These seams do not replace operational acceptance of an actual grant.

The focused tests use fictional identities and in-memory GitHub CAS behavior. CLI tests
exercise the real public router, config parser and temporary JSON files, with provider,
token, credential, child-process and fetch routes blocked or replaced by fakes. They do not
reserve actual money or prove live provider permissions, costs or publication acceptance.
