---
roadmap: MO-26-10-25-03.51.22
agent: codex
---

# Optional Git closeout exporter

Delegated implementation under the parent CTO mandate. Scope is the optional
`scripts/paperclip-closeout/` prototype, its focused test, operator document, acceptance
and this task's records. Existing PM and Markdown inboxes remain; independent review,
PR and release are parent-coordinated. No implementation push or PR was authorized
for this worker. The mandatory `pm claim` created the remote claim and its claim
commit; its existing reconciliation also marked the already-merged
MO-26-10-25-03.13.21 shipped. No exporter operation changes task status.

The first contract requires explicit `operator-frozen-v1` input: exact source
origin/company/issue/thread, declared revision and nullable source cursor, messages,
sourced decisions, explicit accepted structured questions/answers, validation evidence,
and attachment references. Input is read twice around acquisition and verified bytes
are reread. Observed churn refuses publication. Canonical content produces immutable
SHA-256 filenames; reopened/changed content adds snapshots while preserving prior bytes.
Local attachment bytes are hashed and retained; metadata-only hashes say unverified.
Acquisition paths are omitted from output. Exclusive atomic hard links publish complete
files. Bounded reads, regular-file checks, no-follow opens, explicit path validation and
ancestor symlink refusal protect an operator-owned repository.

## Source evidence and deliberate limits

Official `v2026.1012.0` resolves to
`bba6a45f0d364cfd962ac59b3bdf2426a8222adb`. Exact-commit upstream source was read:

- `server/src/routes/issues.ts`, SHA-256
  `3274ee1abdb064b9fb798ee9a24f3a1da696a1ca52ed29489d1af80e6b979f98`:
  comments support `after`/`afterCommentId`, `order`, `limit`; issue/comments/interactions
  are separate reads. The interactions route returns a separate array.
- `packages/shared/src/types/issue.ts`, SHA-256
  `869b255466b3cebcc10acf39d2ccd812398ab0b85ea24a41c73b4cc0c344482a`:
  comment IDs/timestamps, structured question/result interaction variants, attachment
  `sha256`/`contentPath` metadata are real source shapes.

The inspected contracts do not establish an atomic cross-resource thread freeze.
The record explicitly says `atomic: false`; completeness, declared source revision/cursor
and acceptance authority remain operator assertions. Matching reads cannot exclude ABA
changes. This worker implemented frozen-input export, not an unqualified live API adapter.
No service/credential/cloud operation, model worker or provider API call was made. Only
public upstream source was read. Repository path checks are not an adversarial concurrent
filesystem sandbox; docs name that boundary. Prose/JSON needs privacy review before a
public commit. No consumer migration or actual private conversation export was performed.

Build/borrow: this fixed domain contract reuses existing Zod, native crypto/filesystem,
`parseArgs`, and `gitSubprocessEnv`; no generic module or new dependency was introduced.
The existing bridge already considered Commander 15 for the same fixed operator CLI seam.
Root-kit extraction is deferred until a second consumer.

Graph Tier2: parent project `Users-chrisheinrich-code-morpheus`, generation
2026-10-25T09:31:59Z. Symbol search/snippet/outbound trace found bridge `prepare` and
coverage reported no recorded issue for bridge/CLI, test and Git environment helper.
The exact task checkout index was then installed successfully. The later coverage request
for new exporter/test paths failed `Transport closed`; direct final-source inspection was
used, with no negative graph or completeness claim.

## Validation

- `pnpm exec vitest run tests/paperclip-closeout.test.ts`: 25 focused tests pass.
  Temporary Git repositories exercise exact identities and bytes, duplicate idempotence,
  reopened threads, changed attachment bytes, provider-only hashes, wrong declared hashes,
  source and byte churn before writes, foreign target fields, traversal/symlinks including
  final names, tampered immutable records, 16 MiB per-file/32 MiB total/8 MiB source bounds,
  unsafe references, duplicate IDs, incomplete inputs, canonical key order and actual CLI
  output/refusal. Exact failed validation evidence is preserved instead of upgraded to pass.
- `pnpm typecheck`: passes. The initial run exposed test union access without narrowing;
  the test now checks the verified-byte discriminator before using byte fields.
- `pnpm compile`: passes without generated changes.
- `pnpm morpheus pm index`: unchanged generated files.
- `pnpm morpheus pm validate`: passes,338 roadmap items/1 goal/0 requests.
- `git diff --check`: passes.

Focused scope covers the new script and its invocation; shared core is unchanged, so the
full suite was not run locally. No independent-review assertion is made by this worker.

## Budget

Parent reservation: at most8 Codex weekly points, initial20-minute bound; no Claude,
paid API, reset or extra workers. Shared usage read22% used at start,23% during initial
validation and24% after25 focused tests (rounded shared-account observations, not exact
attributable consumption). Global admission ceiling68%/hard ceiling75% were not approached.

## Continued delivery authorization

After the implementation checkpoint, the parent explicitly authorized the complete
normal delivery loop: one fresh independent reviewer without inherited history,
review record, PR, CI and merge. Additional review reservation is at most4 shared Codex
weekly points; latest observation before review preparation is25% used. No Claude,
provider API or cloud action is authorized. Normal review ceiling15 minutes; global
stop-new-work threshold68–70% used and hard ceiling75% remain. The frozen-input
prototype is not live API qualification or a migration. Initial no-push scope above is
historical and is superseded by this authorization.
