---
roadmap: MO-26-08-28-17.55.16
date: 2026-08-28
agent: codex
---
# Install bootstrap dependencies

The real isolated acceptance test after PR #174 failed before the cloned CLI could dispatch
`self install`: committed `dist/` imports `gray-matter`, but a fresh Git clone has no installed
packages. The fake command harness intentionally replaced Node and therefore tested routing but
not module loading.

The follow-up installs the clone's frozen lockfile before invoking Node, asserts that ordering in
the harness, and repeats the full bootstrap with temporary device state before downstream rollout.

The repeated real test succeeded from a fake pre-`self` executable using an isolated `HOME`, npm
prefix, Morpheus registry and consent file. The standalone package matched current `main` at
`ecbb5c0`, the project was registered, both managed Git hooks were present, and the stale executable's
trace remained at the one capability probe from session start — the consented bootstrap never
invoked it.
