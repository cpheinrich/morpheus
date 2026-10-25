# Versioned Paperclip conversation closeouts

This optional operator prototype turns an explicitly frozen conversation input into
an immutable Git-reviewable snapshot. It does not replace Markdown inboxes or PM,
connect to Paperclip, change upstream status, commit files, or establish completion.
Review and commit its output through the ordinary claimed-task PR.

## Run against one exact target

From a reviewed Morpheus checkout, run the script with a repository-relative frozen
input and the exact expected source origin, company, issue and thread identity:

```sh
pnpm exec tsx scripts/paperclip-closeout/cli.ts \
  --repo . --snapshot local/closeout-input.json \
  --api http://127.0.0.1:3100 \
  --company 10000000-0000-4000-8000-000000000001 \
  --issue 10000000-0000-4000-8000-000000000002 \
  --thread 10000000-0000-4000-8000-000000000002
```

The IDs above are synthetic. Use the configured company and exact real identities;
the exporter rejects every mismatched target before writing a closeout. The example
uses an issue as its thread identity; a separate source thread must retain its own ID.
The output reports `path`, `snapshotId` and `created`. An identical repeat reports
the same path and digest with `created: false`.

`--repo` must be the Git repository root. Input and verified attachment files must
be regular files below that root, without symlink components. Source URLs require
HTTPS or loopback HTTP; credentials, query strings and fragments are refused.
Evidence/attachment references support those same URL forms or safe repository-relative
paths. A root `.git` component is reserved case-insensitively for input files,
attachment paths and repository-relative references, including `.GIT` and `.GiT` aliases.
Do not include tokens, private absolute paths or signed URLs in content. The
script rejects those shapes in paths/references; prose and structured JSON still
require human review before committing, especially in a public repository.

## Frozen-input contract

The schema in [export.ts](../scripts/paperclip-closeout/export.ts) is a normalized
operator contract, **not** an invented Paperclip API response. The operator obtains
the exact source data through an authorized existing acquisition mechanism, resolves
its source bounds and completeness, reviews the content, and writes one JSON input.
No credential is accepted by this exporter.

```json
{
  "version": 1,
  "source": {
    "baseUrl": "http://127.0.0.1:3100",
    "companyId": "10000000-0000-4000-8000-000000000001",
    "issueId": "10000000-0000-4000-8000-000000000002",
    "threadId": "10000000-0000-4000-8000-000000000002",
    "revision": "operator-capture-42",
    "cursor": null,
    "contract": "operator-frozen-v1",
    "complete": true
  },
  "issue": { "title": "Example", "description": null, "status": "done", "updatedAt": "2026-10-25T10:00:00Z" },
  "messages": [],
  "decisions": [],
  "acceptedAnswers": [],
  "validationEvidence": [],
  "attachments": []
}
```

All keys shown are required. Arrays may be empty when the frozen source has no such
records. Additional keys are refused rather than silently discarded.

| Collection | Required record fields |
| --- | --- |
| `messages` | UUID `id`, `author: {kind: user/agent/system, id}`, `body`, ISO `createdAt`, ISO `updatedAt` |
| `decisions` | `id`, `summary`, nonempty `sourceMessageIds` resolving to captured messages |
| `acceptedAnswers` | UUID `interactionId`, `kind`, ISO `acceptedAt`, `acceptedBy: {kind, id}`, `sourceMessageIds`, JSON `questions`, JSON `answers` |
| `validationEvidence` | `id`, `description`, `outcome: passed/failed/not-run`, `reference` |
| `attachments` | UUID `id`, `reference`; optional `declaredSha256`, optional repository-relative `localPath` |

Accepted answers are the operator's explicit acceptance claim. Preserve the exact
question and result structures and actor attribution; do not infer human acceptance
from ordinary prose, a worker's answer, or issue status. The exporter validates record
identities and captured message references, and retains JSON values without rewriting
them. It does not independently verify acceptance authority or evaluate test evidence.

`revision` and `cursor` are recorded operator declarations of the captured source
bounds. Use `cursor: null` when no source cursor exists. The export's `snapshotId` is
the independently computed SHA-256 identity of the exact canonical output bytes;
it is distinct from an upstream revision or cursor.

## Integrity and persistence

The exporter validates two complete reads of the frozen input around attachment
acquisition, then rereads every verified attachment. A source/body/status/cursor change
or byte change refuses publication. The freeze record explicitly says `atomic: false`:
matching observations detect observed churn and do not prove an upstream transaction,
operator completeness, or absence of changes that happened and reverted between reads.
Reordering a source array changes the snapshot; object-key order does not.

With `localPath`, the script hashes the actual bounded file bytes, checks any declared
hash, and publishes those bytes under `.agent/paperclip-closeouts/blobs/<sha256>.bin`.
The record retains only the safe source reference, digest, byte count and artifact path;
the private acquisition path is omitted. Without `localPath`, the record says
`verification: unverified` and retains a provider hash only as `declaredSha256`.
An unverified reference does not promise that remote content remains retrievable.

Snapshots are written to
`.agent/paperclip-closeouts/<company-uuid>/<issue-uuid>/<snapshot-sha256>.json`.
Full canonical content determines the filename, including declared source bounds,
messages, decisions, structured accepted answers, failed/not-run evidence and attachment
results. A changed or reopened thread produces another snapshot and preserves the old
one. There is no mutable `latest` pointer or overwrite operation. Complete file bytes
are published with exclusive hard links; a conflicting existing name is refused.
An interrupted run may leave an unused content-addressed blob or `.pending-*` temporary
file, but cannot publish a partially written snapshot. Such temporary files may be removed
after proving no exporter is active; committed snapshots and referenced blobs are retained.

Bounds: 8 MiB normalized input, 2,000 messages, 500 decisions, 500 accepted answers,
500 evidence records, 100 attachments, 16 MiB per attachment and 32 MiB total attachment
bytes. The source and output paths reject traversal, symlinks and nonregular inputs.
Run in an operator-owned checkout without concurrent hostile filesystem mutation:
Node path checks do not provide an `openat` sandbox against an attacker concurrently
renaming ancestor directories. This prototype is not a concurrency or credential boundary.

## Why live acquisition remains separate

The pinned official release tag `v2026.1012.0` resolved on 2026-10-25 to
`bba6a45f0d364cfd962ac59b3bdf2426a8222adb`. Its
[issue routes](https://github.com/paperclipai/paperclip/blob/bba6a45f0d364cfd962ac59b3bdf2426a8222adb/server/src/routes/issues.ts)
read an issue, comments and interactions separately. Comment reads accept `after`
(or `afterCommentId`), `order` and `limit`; interaction reads return a separate array.
The [shared source types](https://github.com/paperclipai/paperclip/blob/bba6a45f0d364cfd962ac59b3bdf2426a8222adb/packages/shared/src/types/issue.ts)
define comment IDs/timestamps, typed question/result interactions and attachment
`sha256`/`contentPath` metadata. An attachment metadata digest is not verified content.

These inspected contracts do not establish a shared transactional thread revision or
snapshot token. An issue's `updatedAt`, queued-comment revision, last comment ID, or
two matching API passes must not be represented as one. A live adapter needs separate
qualification of authorized company-scoped reads, pagination/deletions, acceptance
attribution, redactions, attachment-byte acquisition, and source consistency. This
first prototype deliberately requires explicit frozen input until that work is proved.
It adds no dependency and extracts no reusable kit module before a second consumer.
