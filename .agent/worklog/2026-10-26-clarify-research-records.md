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

Merged fresh main at 8a5e9506 before independent review. The only conflict was the
two appended decision entries, both preserved. Focused guide checks and typecheck
were rerun on the integrated result; the full local suite was not repeated.

## Independent review

Independent reviewer /root/review_research_records cleared exact remote head 485a1b51 with no findings or conditions. It verified the metric definitions through numerical probes, appropriate scope for other domains, reproducibility and uncertainty guidance, and byte-for-byte agreement among canonical files, Claude mirrors, TypeScript and compiled exports. Final-head CI remains required.

```morpheus-review
{
  "version": 2,
  "base": "8a5e95064d534ce14d6c21355de007c814f37d0e",
  "reviewed": "485a1b513b08e4d918697a8b0c2280f657ed8f49",
  "covered": "485a1b513b08e4d918697a8b0c2280f657ed8f49",
  "authorSession": "01a17993-d3a3-7110-a2ec-bd8329556291",
  "reviewerSession": "/root/review_research_records",
  "risk": "small",
  "elapsedMinutes": 2.783333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 167000,
    "evidence": "Author observed invocation start 2026-10-26T19:38:22Z and completion receipt 2026-10-26T19:41:09Z for /root/review_research_records, including tool execution and waits."
  },
  "outcome": "complete",
  "summary": "Independent reviewer /root/review_research_records cleared exact remote head 485a1b51 with no findings or conditions. It verified the metric definitions through numerical probes, appropriate scope for other domains, reproducibility and uncertainty guidance, and byte-for-byte agreement among canonical files, Claude mirrors, TypeScript and compiled exports. Final-head CI remains required.",
  "findings": [],
  "trunkIntegrations": [
    {
      "commit": "d0bb85b9d7dbfe27455ce04947aa859b6a3e96f2",
      "reason": "Merge origin/main at a0176575060f2cef5b0ccde1eea4f1651f1354fd after PR524. The only manual resolution retained both independent decision-note additions. Architecture merged automatically; no implementation conflict was resolved. This records the unreviewed prose integration as the runbook requires."
    }
  ]
}
```
