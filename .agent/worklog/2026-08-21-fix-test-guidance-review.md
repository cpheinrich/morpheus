---
date: 2026-08-21
agent: codex
roadmap: MO-26-08-19-22.02.06
outcome: review
summary: Resolved PR 147 against current main and carried test-quality guidance into project scaffolds.
---

# Closing PR 147's review findings

The review found three delivery defects around an otherwise sound test-quality section. The
section interrupted the waiver and pre-flight paragraphs beneath its heading; it changed only
Morpheus's own instructions even though the motivating failure occurred in a consumer project;
and the hand-named branch could not connect the merged PR back to its roadmap item.

The heading now follows the waiver and pre-flight paragraphs, so it owns only its subject. The
scaffolded `AGENTS.md` template carries a concise property-level version of the rule and links to
the full Morpheus guidance, with an init test pinning the behaviour. The roadmap item explicitly
records PR 147 because the existing head branch cannot be renamed without closing the pull
request; after merge, `morpheus pm ship MO-26-08-19-22.02.06` must perform the deliberate status
reconciliation the branch name cannot trigger automatically.

The old generated roadmap-table row was dropped while resolving current `main`: the roadmap
README is now deliberately static, and the item file is canonical.
