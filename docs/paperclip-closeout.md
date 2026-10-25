# Versioned Paperclip conversation closeouts

This optional operator prototype turns an explicitly frozen conversation input into
an immutable Git-reviewable snapshot. It does not replace Markdown inboxes or PM,
connect to Paperclip, change upstream status, commit files, or establish completion.
Review and commit its output through the ordinary claimed-task PR. An optional
deterministic Markdown view makes that same snapshot readable at wrap-up; the
canonical JSON remains the full content identity.

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

## Readable Markdown from an existing snapshot

Render only an existing canonical export, using its exact repository-relative path:

```sh
pnpm exec tsx scripts/paperclip-closeout/cli.ts --repo . --render \
  --snapshot .agent/paperclip-closeouts/<company-uuid>/<issue-uuid>/<snapshot-sha256>.json
```

This writes the adjacent `<snapshot-sha256>.md`, reports its `canonicalPath` and
same `snapshotId`, and leaves the exporter command above backward compatible.
The renderer verifies the canonical JSON schema, bytes, digest and company/issue
path, plus every locally verified attachment's digest and size, before publishing.
It does not rerun acquisition or authenticate the operator's declarations.
The view leads with the issue title/status, conversation, decisions, accepted
answers, evidence and attachments. Compact message attribution precedes each body;
full source/freeze and identity/cross-reference audit JSON follows at the end.
The view preserves source identity/freeze, issue, every message and author/time,
decisions and message references, accepted question/answer JSON and attribution,
all validation outcomes/references, and every attachment reference and verification
classification. Binary bytes stay in content-addressed blobs; verified ones get
relative links. External references remain display text and are explicitly
unverified when no local bytes were captured.

All untrusted text and structured fields appear in plain code blocks whose fence
is longer than every backtick run in the value. HTML, scripts, links and embedded
Markdown therefore remain display text in a CommonMark-compatible preview.
Only renderer-owned digest-based JSON/blob links become active links. Human
review for sensitive prose remains necessary. An identical repeat returns
`created: false`; changed/reopened source has a new JSON digest and a new view.
A mismatched existing view is refused rather than overwritten. There is no
mutable latest view or in-place rerender migration.

## Git history guard

Git itself permits rewriting files. The operator's exclusive writes are only one
boundary; validate the exact proposed Git trees before accepting a PR:

```sh
pnpm exec tsx scripts/paperclip-closeout/cli.ts --repo . --check-history \
  --base <full-40-character-base-commit> --head <full-40-character-head-commit>
```

The guard reads exact committed objects with replacement objects disabled, never
the working tree or index. Every existing path under `.agent/paperclip-closeouts`
must retain its bytes and mode; edits, deletions and renames are refused. Added
files must be canonical valid JSON at its digest/source identity, exact derived
Markdown beside its JSON, or a digest-matching binary blob. Every verified
attachment referenced by a new record/view must exist with matching bytes and size.
An existing JSON export may gain its missing Markdown view; old JSON-only exports
remain valid. Symlink/executable modes, root case aliases, unexpected paths and
unresolved canonical/blob references are refused. A valid orphan blob is allowed
for recovery from an interrupted export. No temporary `.pending-*` file may enter Git.

The comparison is deliberately bounded: 32 MiB tree listing per commit, 1,000 added
closeout files, 128 MiB total unique object reads, 16 MiB per blob, about 8 MiB per
JSON record and twice that per Markdown view. Exceeding a bound refuses validation.
The base and head must be exact verified commit IDs; when the base has advanced,
integrate its records rather than deleting them from a behind branch.

The narrow `Paperclip closeout history / history` PR workflow runs for closeout
records, their ancestors/case aliases, exporter/guard source/tests, or its own
workflow. Normal PM/review/CI checks still apply. This check enforces the inspected
comparison when it runs; GitHub path filtering and repository policy are not an
adversarial append-only storage service. It does not retroactively audit unchanged
old content, prove upstream completeness/atomicity, establish acceptance authority,
or complete a PM item. Consumers adopting this optional prototype must wire the
guard into their own ordinary review path.

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
