# Bounded artifact snapshots

The artifact helper snapshots source-owned files before an uploader sees them. It does
not upload, authenticate, change test results, or authorize a delivery. An over-limit,
missing mandatory, changing, linked, or otherwise uncertain source fails admission;
there is no truncated artifact and no retry of the same staging leaf.

## Channels and integration

| Channel | Selected payload | Maximum stored ZIP envelope | Retention |
|---|---|---:|---:|
| `native-screenshots` | This invocation's Screenshots tree | 1 GiB | 14 days |
| `native-complete-evidence` | Direct Results JSON/text and complete Logs tree | 1 GiB | 30 days |
| `native-failure-evidence` | Complete Results and Logs trees | 1 GiB | 14 days |
| `qualified-tests` | Complete `cd-v2-evidence`, including all nine required files | 1 GiB | 90 days |
| `upload-acceptance-resource` | Only this invocation's accepted/resource JSON | 1 GiB | 90 days |
| `fault-audit` | Direct allowlisted audit JSON files | 1 GiB | 14 days |

These are independent per-initiated-candidate limits, not a shared six-channel quota.
The helper implements all six roles; this Morpheus change connects the three native
workflow roles and the composite action's receipt role. Consumer-owned qualified-test
and fault-audit uploaders must adopt the same helper in a separately reviewed consumer
change. Their qualification step must read the staged evidence before recording tests.

`ios-ci.yml` exports attachments and Firebase diagnostics before staging all selected
native roles. Its barrier requires every selected stage to succeed before any native
upload. Each upload also requires its own successful, admitted, nonempty stage, even
on `always()` and `failure()` branches. Optional EMPTY stages upload nothing. Complete
test evidence is mandatory, but its existence never proves PASS, zero skips, complete
inventory, or the correct delivery identity; normal evidence qualification still does.

`artifact-stage-ref` selects a separate credential-free sparse helper checkout. A durable
CD execution requires an exact lowercase 40-character reviewed commit. The existing
`actions-ref`, native scripts, signing scripts and controller policy are independent;
consumer adoption must bind their actual coherent source revisions. Ordinary callers
retain the repository's established `main` default.

The upload composite snapshots returned accepted/resource outputs before artifact
publication. A later staging or storage failure cannot undo an Apple upload. Keep that
outcome uncertain and reconcile it normally; never reupload merely to obtain a receipt.
The actual provider-call environment explicitly binds `PROCESSING_TIMEOUT_SECONDS=1200`
and `PROCESSING_POLL_SECONDS=30`, preserving the normal defaults while excluding inherited
positive overrides. The shell's deadline uses wall time: **41 polls is not a hard bound**
under clock rollback. Provider job deadlines and later cost/recovery accounting remain
separate requirements. Signing locks, asccli, hooks and distribution semantics are unchanged.

## Byte argument and writer boundary

For exact stable regular-file bytes R, complete UTF-8 relative-name bytes P and file
count N, admission requires:

```
B = 2R + 4P + 4096N + 1048576 <= 1073741824
N <= 32768; P <= 33554432; individual path <= 4096 bytes; depth <= 64
```

The scan also stops after 65,536 entries and checks a 120-second monotonic deadline.
It refuses symlinks, hardlinks, foreign owners, devices, FIFOs, ambiguous case/Unicode
names and unsupported ZIP paths. It opens each file without following links, checks
fd/path identity before and after copying, reselects the complete source, then independently
verifies the snapshot's whole census, sizes and SHA-256 values. Private files become
0400 and directories 0500. Every run/attempt/channel uses an exclusive leaf. Receipt staging additionally appends
SHA-256 of the validated canonical receipt directory: the existing action producer
already owns a distinct directory per invocation, including two apps in one job.
Changing receipt/resource output availability never changes that invocation identity.
A successful or refused invocation remains spent; a distinct normal invocation has its
own snapshot. There is no arbitrary caller namespace or retry override. Other channels
and the CI trace role retain their original leaf semantics. A genuinely absent optional
audit directory is EMPTY, while a dangling audit-root link is refused and stays spent. This is a detached snapshot of trusted source-owned
writers, not isolation from malicious code with the same UID. A blocked filesystem
syscall cannot be forcibly interrupted by these deadline checks.

The uploader remains `actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a`,
with `archive: true`, `compression-level: 0`, `overwrite: false`, original names and layouts.
Its inspected bundle SHA-256 is
`eea594941d8ee535974e0fbc03bbdf567f3abc78194f224b93f2df9a887ee2e9`.
The exact bundle contains @actions/artifact 6.2.0, archiver 7.0.1, zip-stream 6.0.1
and compress-commons 6.0.2. Level zero selects STORE; fixed headers, descriptors and
ZIP64 extras are conservatively bounded by `R + 176N + 2P + 128`, dominated by B.
No custom ZIP writer or nested archive is introduced. The preimplementation offline
qualification emitted the pinned ZIP code and independently checked names, bytes and
CRCs, including an actual 536,344,562-byte payload whose STORE ZIP was 536,344,690 bytes
and whose admission expression was exactly 1 GiB. Changing the uploader or its format
requires a new source/byte qualification, not an assumed compression ratio.

The `qa-browser` failure-only diagnostic role uses the same core through a fixed
hash-bound wrapper: 64 MiB, one day, fixed `test-results/` source, and only a returned
failed `qa_tests` step. It is never native qualification. Original trace writers cannot
grow the detached payload after admission. Returned Actions step completion and trusted
runner code are the writer boundary; this does not attest that every browser descendant
has disappeared. A same-UID adversary is outside the snapshot guarantee.

## CI and acceptance limits

The `artifact-abi` job has a ten-minute ceiling per Python 3.9/3.14 leg, disables its
new uv cache, selects actual Node 24, runs focused filesystem/environment tests, and
uploads a distinct fixed synthetic fixture through the exact Node 24 upload action.
Each initiated fixture's envelope is at most 2 MiB and retention is one day. A pinned
archive-compatible normal downloader (`d3f86a106a0bac45b974a628896c90dbdf5c8093`,
whose action metadata declares Node 20)
then extracts it; Python compares the complete file set and exact independently known
bytes. The fixture is never called a native test result. The downloaded action does not
retain the raw ZIP central directory: CI byte readback is end-to-end compatibility
proof; the independent offline pinned-emitter check supplies ZIP-format/CRC evidence.
Actual Actions Node 24/runtime compatibility is established only by passing job evidence.
The initial source CI run40057543540 passed both Python3.9.25/3.14.9 transport legs
with Node24.21.0; its runner also reported that Node20-declared actions were forced
to Node24. This is the observed runner behavior, not a claim those action manifests
changed. The complete PR CI and independent review still gate source acceptance.

No source-byte cap alone establishes a complete bill. Account for **every initiated
candidate**, including failed/unknown finalization, against applicable logical storage
and retention contracts. GitHub artifact expiry and Azure uncommitted-block cleanup
are provider contract premises, not a claim about physical replicas. Unmatched orphan
retention or account settings remain an explicit financial qualification requirement.
Public compute eligibility does not make artifact storage free. Cache/settings,
consumer source CI, preview triggers and recovery calls require their own bounded
funding and operational approval. This change does not raise a runtime budget limit.

## Focused checks

Run `python3 -I -S -B tests/artifacts/test_stage.py`, `test_ci_trace.py`,
`test_processing_environment.py` and `test_abi_fixture.py` (each with the same prefix).
`tests/artifact-workflows.test.ts` exercises parsed upload conditions and the real
native shell barrier. `test_stage_mutants.py` and `test_trace_mutants.py` deliberately
break in-memory source and require the targeted tests to fail; they are author checks,
not a mutation-score CI gate. Use Python 3.9 and 3.14 for ABI qualification. Local Python
passes do not substitute for the actual Node 24 Actions job or consumer native evidence.
