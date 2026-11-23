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
The automation also requests one full suite; its result is recorded below when complete.

Graph evidence: main-checkout generation 2026-11-23T20:21:02Z, configuredTerms inbound caller
fetchAppeekySnapshot and outbound add, exact snippet, no recorded coverage gap for appeeky.ts or
product-research.test.ts. Exact task indexing could not activate because existing Codex/Claude
hooks have ambiguous ownership; no forced hook edits. Exact task source supplied fallback.
Context MCP overview/search and coverage included architecture, product-research runbook and the
2026-11-20 host-app-research worklog, which were read before the change.

## Open questions

None.
