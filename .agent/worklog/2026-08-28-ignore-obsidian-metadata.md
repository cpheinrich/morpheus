---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-13.46.02
outcome: review
---

# Ignore Obsidian metadata

Added `.obsidian/` to Morpheus's own ignore policy and the initializer template.
The focused initializer suite passed all 64 tests, TypeScript typechecking and
compilation passed, and `git check-ignore` confirmed the pattern covers both root
and nested Obsidian vault metadata.
