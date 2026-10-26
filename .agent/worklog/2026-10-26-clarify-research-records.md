---
roadmap: MO-26-10-26-12.30.21
tags: [engineering, research]
---

# Concise research records

Issue #497 asks for the research record to lead with a concise ask, implementation,
plain-language result and decision, with detailed evidence in bottom appendices.
The canonical record reference and skill entrypoint now state this; the existing
sync script propagates it to the Claude mirror and CLI guide. Ratio formulas retain
their established meaning, with positive inputs and signed bias explicitly defined.
Other domains keep appropriate metrics and predeclared selection rules. Provenance
links the trusted issue. No algorithm, new module, package or runtime dependency changed.

## Validation

- Frozen install passed. Existing guide distribution, mirror, link and scaffold
  tests passed: `pnpm exec vitest run tests/agentic-cto-skill.test.ts tests/agent-instructions.test.ts`
  (55 tests). No new wording-matching test: the existing byte-for-byte distribution
  tests and manual reading are meaningful for this prose-only behavior change.
- Skill creator quick validation passed using temporary `uv --with pyyaml==6.0.3`
  after the system Python lacked PyYAML. No repository dependency changed.
- Canonical/mirror bytes agree for all three research skill files.
- Numerical sanity examples: ratios [0.8, 1, 1.25] give 25% typical multiplicative
  error and zero median signed bias. Uniform 0.8 gives 25% error and 20% low bias;
  uniform 1.25 gives 25% error and 25% high bias. The two measures are intentionally
  distinct, and neither replaces a task's declared tolerance rule.
- Typecheck, compile, PM index and diff whitespace checks passed.
- Full `pnpm test` ran once as requested: 3297 tests passed across 115 files
  in 147.56 seconds, with verified actionlint 1.7.12 on PATH.
- The compiled CLI printed the updated research-engineer/record guide correctly.

## Discovery

Tier 2 graph project Users-chrisheinrich-code-morpheus, generation
2026-10-26T18:59:37Z, identifies ctoGuide and the generated researchEngineerSkillFiles.
The CLI dispatches to the guide; the reference is selected from its skill map.
Coverage reports no recorded gaps for canonical files, generator, source, tests and
architecture. Claude mirrors and dist are excluded from the graph; direct file
comparison and generated-output tests cover them. Branch edits were read directly.
