---
date: 2026-11-07
agent: codex
roadmap: MO-26-10-28-14.10.57
tags: [engineering, research, agent-workflow]
outcome: implemented
summary: "Implement a local 60/20/20 project-context search trial."
---

# Local context search trial

The session policy assigns bounded Tantivy, bounded ripgrep and full ripgrep
with a stable session hash. The project manifest opts in and names critical
startup files and corpus globs. The worktree keeps its index under Git metadata.
Common Git metadata retains capped, expiring trace metadata. Required reads
still pass through the ordinary evidence hook and freshness gate.

The CLI smoke replay froze three recent worklogs per project and exercised all
three arms with a 1,000-token cap. The expected excerpt appeared in 5/6 Tantivy
queries and 2/6 queries in each ripgrep arm. All 24 trace rows associated
assignments with their queries, recorded the actual engine and carried no query
or excerpt text. Estimated startup tokens were 9,651 bounded vs. 115,390 full
in the larger fixture and 8,758 bounded vs. 25,978 full in the smaller fixture.
These are explicit required-read tokens, excluding the provider's other prompt
overhead. One-shot CLI wall time was roughly 0.6–1.0 s for warm queries and
2.4–2.8 s for the two first Tantivy queries including the index build. The
resident benchmark's query times excluded CLI process and startup overhead.
These checks replayed retrieval, not task completion.

Focused checks cover session start, evidence, the freshness gate, cleanup,
dispatch, search sources, exact token caps, engine selection and Tantivy cache
invalidation. Consumer enrollment and real-session traces require the released
CLI and the projects' enrollment manifests.
