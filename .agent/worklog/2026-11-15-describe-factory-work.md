---
date: 2026-11-15
roadmap: MO-26-11-15-01.45.04
tags: [engineering, devops, design, factory]
summary: Project safe Factory task names, summaries and GitHub evidence for Infra Work.
---

The shared desk package now renders an explicit title and summary, with a repository-based
fallback for legacy tasks and validated PR/commit links. Fleet stores the separately supplied
display field, keeps only exact PR references from structured worker evidence, and serves a
single enrolled project's active and recent task metadata to a read-only viewer. No private
brief, message, result summary, or artifact path crosses that boundary. Existing controller
status/wait remains the place for private results; there is no Fleet browser log link.

The existing Zod, Firestore and GitHub link primitives cover this domain. No new package or
scheduler is needed. The recent query needs a composite index; verification in the emulator
is not evidence that the deployed index exists. See the
[Infra desk design](../../docs/runbooks/infra-dashboard-design.md) and
[Factory viewer contract](../../plugins/factory/README.md#read-factory-work-in-an-infra-desk).

Focused checks: Ops Desk Vitest (18), Factory Node tests (24), the real Fleet API with the
Firestore emulator (2), TypeScript, compile, complexity and PM indexing. The emulator test
exercises unauthorized roles, cross-project data, the private document rules and completed
work with PR evidence. All data and examples are synthetic.

The initial independent review reproduced three problems. The follow-up keeps held tasks as
Unknown (and dates expired contact), sorts before the limit, and lets a terminal result win
across concurrent live/history reads. PR evidence must match the finish schema before it
enters the journal; overlong evidence is declined without truncating a URL into another
destination. The runner, direct overlap fixture and Firebase emulator exercise these cases.
