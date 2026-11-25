---
roadmap: MO-26-11-23-12.21.07
date: 2026-11-23
agent: codex
tags: [engineering]
---
# Preserve branded ASO keyword membership

Issue #765 exposed a duplicate term losing its branded flag. The existing normalizer now merges
branded membership into its first row, preserving trimmed spelling, order and one keyword lookup.
The App Store signals runbook documents the rule. This is a correction inside the existing
domain-specific normalizer, with no generic module, dependency, provider call or spending.

## Validation

Both new synthetic overlap regressions failed on the original source with `branded: false`.
After the fix, the fetcher/validator and downstream viewer suites pass all 55 tests. They assert
exact rows, order, spelling, branded-only duplicates, one lookup per term, exact credit boundaries,
and rejection at 2/6 distinct terms before any fetch. An initial test fixture typecheck found a
possibly undefined first element; its known nonempty fixture is now explicit and typecheck rerun.
Frozen install, typecheck, lint, compile, PM index and diff checks pass. Complexity passes: eight
touched functions across two measured files, limit 15; the normalizer and helper were inspected.
Full `pnpm test` ran once with actionlint 1.7.12 on PATH: 4,687 passed; one unchanged
artifact workflow test exceeded its 100 ms Node VM deadline under suite load. All seven
`tests/artifact-workflows.test.ts` tests passed in the focused rerun. No timeout was relaxed.
Required hosted Node CI must pass before merge.

Graph evidence: main-checkout generation 2026-11-23T20:21:02Z, configuredTerms inbound caller
fetchAppeekySnapshot and outbound add, exact snippet, no recorded coverage gap for appeeky.ts or
product-research.test.ts. Exact task indexing could not activate because existing Codex/Claude
hooks have ambiguous ownership; no forced hook edits. Exact task source supplied fallback.
Context MCP overview/search and coverage included architecture, product-research runbook and the
2026-11-20 host-app-research worklog, which were read before the change.

## Open questions

None.

## Independent review

Independent review cleared the exact published head with no findings. The reviewer verified branded merging, spelling/order, distinct-term and lookup boundaries; reran all 55 focused tests, exercised organic matches and frozen inputs, and matched generated output to TypeScript emission. Hosted Node CI passed on the reviewed head.

```morpheus-review
{
  "version": 2,
  "base": "2105901c0cbedf6da9a0b8550f6cb02bdc64ea0e",
  "reviewed": "dffcd8995a00dd76613c67ec470354a0098bb369",
  "covered": "dffcd8995a00dd76613c67ec470354a0098bb369",
  "authorSession": "01a209fd-2dc8-7523-aa73-7ec5401f7f32",
  "reviewerSession": "/root/review_branded_terms",
  "risk": "normal",
  "elapsedMinutes": 3.6333333333333333,
  "timing": {
    "source": "clock",
    "durationMs": 218000,
    "evidence": "clock.curr_time immediately before reviewer spawn 2026-11-23T20:31:03Z and completion observation 2026-11-23T20:34:41Z; /root/review_branded_terms under author thread 01a209fd-2dc8-7523-aa73-7ec5401f7f32."
  },
  "outcome": "complete",
  "summary": "Independent review cleared the exact published head with no findings. The reviewer verified branded merging, spelling/order, distinct-term and lookup boundaries; reran all 55 focused tests, exercised organic matches and frozen inputs, and matched generated output to TypeScript emission. Hosted Node CI passed on the reviewed head.",
  "contextRead": [
    "AGENTS.md",
    "docs/runbooks/independent-review.md",
    "hq/product/roadmap/MO-26-11-23-12.21.07-preserve-branded-terms.md",
    "docs/runbooks/product-research.md",
    "architecture.md",
    ".agent/worklog/2026-11-20-host-app-research.md",
    ".agent/worklog/2026-11-23-preserve-branded-terms.md",
    "docs/runbooks/test-quality.md",
    "hq/product/roadmap/MO-26-11-23-12.02.14-target-context-worktree.md"
  ],
  "findings": []
}
```
