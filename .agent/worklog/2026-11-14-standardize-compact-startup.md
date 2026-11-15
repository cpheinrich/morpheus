---
date: 2026-11-14
agent: codex
roadmap: MO-26-11-14-20.37.36
tags: [engineering, agent-workflow]
summary: "Adopt Evo's compact startup in Morpheus and new projects."
---

Morpheus and new scaffolds now declare a small startup core using the existing
manifest. The scaffold test resolves both compact and fallback policies through
the real reader. Existing projects adopt the same configuration through their
own reviewed changes.

The author verified the old four-record receipt in a desktop session before
claiming this change. The independent design critique identified Lakina's
explicit mandatory record and operational validators that read decision files.
Address those in Lakina's rollout while preserving pinned evidence.

Verification: typecheck, compilation, PM index, complexity enforcement, and
120 tests across init, rollout policy, task lookup, MCP and session start.
