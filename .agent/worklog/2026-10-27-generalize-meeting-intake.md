---
roadmap: MO-26-10-27-13.40.43
domains: [engineering, operations]
agents: [codex]
---

# Generalize Gemini meeting intake

## Outcome

Morpheus now owns the deterministic Gemini meeting-intake boundary: discovery metadata and
project-policy validation, source-identity deduplication, immutable Git reads, bounded search,
optional projection rendering and a completion-notice gate that formats but never sends. Project
profiles own people, Gmail sources, topics, canonical storage, optional projection, timezone and
explicit notification authority. The registered `meeting-intake` skill points both Codex/Grok and
Claude at one shared procedural guide.

Invented fixtures exercise Evo's Darwin-owned projected catalog and Lakina's same-repository
canonical notes without a projection. Historical imports are encoded as notes-only and cannot
pass the notice gate. The reader resolves an exact commit and ignores dirty checkout content;
source bodies never enter the generated catalog.

The extraction retains Node's argument-safe Git subprocess adapter. `simple-git` 4.0.2 was
considered (last published 2026-09-26, five direct dependencies), but the adapter remains small and
domain-specific enough that the dependency would add more surface than it removes.

## Validation

- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm exec vitest run tests/meeting-intake.test.ts tests/project-skills.test.ts
  tests/package-manifest.test.ts tests/init.test.ts tests/cli-args.test.ts
  tests/cli-dispatch.test.ts tests/cli-check.test.ts --reporter=dot` — 261 tests passed.
- `pnpm compile` — passed and refreshed committed `dist/` artifacts.
- `pnpm morpheus pm index` — passed; all generated indexes were unchanged.
- `pnpm test -- --reporter=dot` — the single allowed local full-suite run passed all 3,438 tests
  across 122 files.
- The compiled CLI printed the shared guide, and a direct renderer comparison proved both
  canonical provider skill entrypoints exactly match the registered template.

## Tooling note

The current main graph had no recorded coverage gaps in the existing team schema, parser, CLI,
template, registry and test files. The task's new source, tests and roadmap record were not yet in
that main-branch generation, so they were read directly in full and verified through typecheck,
lint, focused tests, compiled CLI probes and the full suite.
