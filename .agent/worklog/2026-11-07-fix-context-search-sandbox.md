---
date: 2026-11-07
agent: codex
roadmap: MO-26-11-07-15.41.07
tags: [engineering, devops, agent-workflow]
outcome: implemented
summary: "Make Tantivy work in sandboxed sessions and support explicit engine selection."
---

Tantivy opens a lockfile when it opens a read index. The workspace sandbox
rejects those writes under Git metadata and also rejects query trace appends
there. Use ignored workspace storage for generated indexes, traces, and
session engine pins. Keep startup policy independent from a search pin.

Compile and typecheck passed. All 177 focused tests passed with Tantivy
0.27.0. The complexity check passed with cognitive advisories. A macOS
Codex workspace-write probe forced Tantivy in an assigned ripgrep session,
built and reused the index, cited the expected worklog, and restored the
assigned engine. A fresh Evo desktop task ran both candidate CLI queries
with Tantivy cache hits and the expected citation, then cleared the pin.
