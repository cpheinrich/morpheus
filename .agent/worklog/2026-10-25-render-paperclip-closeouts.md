---
roadmap: MO-26-10-25-04.40.09
tags: [engineering, devops, paperclip]
---
# Markdown Paperclip closeouts and committed history

The operator exporter already retained complete canonical JSON and verified local
attachment bytes. Added a deterministic adjacent Markdown view, exact canonical
identity verification, safe display fences, relative digest-only JSON/blob links,
and exclusive idempotent publication. The new view retains all captured fields
and explicitly preserves the operator's non-atomic, independently unproven
completeness/authority limitations.

Added a bounded Git-tree validator reading exact committed objects with replace
objects disabled. It preserves existing paths/objects/modes and validates new
JSON, Markdown relationships and blobs. A narrow credential-free PR workflow
invokes it without changing ordinary required checks or PM/review rules.

Registry check: marked 18.1.1 (modified 2026-10-12, no runtime dependencies) and
simple-git 4.0.2 (modified 2026-09-26, five direct dependencies) were considered.
The task emits fixed domain Markdown and compares Git objects; neither requires
a Markdown parser or generic Git wrapper. Reused Node, existing Zod, crypto and
the validated export path boundary; no new dependency.

Graph evidence: primary project Users-chrisheinrich-code-morpheus reported 11,112
nodes at generation 2026-10-25T11:11:30Z. Search found no implementation symbols
for this newly merged exporter; coverage reported missing freshness for the
exporter/CLI/test paths. Read exact source and tests instead, without exhaustive
graph claims. The prepared checkout's codebase-memory bootstrap completed.
Claim allocated a registered exclusive task checkout; all edits occur there.

Validation: `pnpm exec vitest run tests/paperclip-closeout.test.ts tests/paperclip-closeout-markdown.test.ts`
passed 60 tests covering the changed optional scripts and their existing exporter
dependency. `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and
`git diff --check` passed; generated build/index bytes were unchanged. The full
suite remains CI-owned because shared core was not changed. No live provider call
or consumer migration occurred. The repository visual-evidence contract is
disabled for this CLI-only surface.

Initial focused run found only the deliberately unset
golden digest; the emitted fixture was inspected and its exact digest pinned.
Typecheck found an unsafe tuple assertion; replaced it with explicit checked
match indices before final validation.
