---
agent: codex
date: 2026-11-18
roadmap: MO-26-11-18-16.12.21
outcome: review
tags: [engineering, devops]
---

# Document Security PR recovery policy

The Security engine now recovers its attested drafts, retries unresolved GitHub merge states, and
isolates blocked candidates. The operator runbook and architecture describe the committed hold and
the six-hour reconciliation cadence. The reviewed implementation is
[Security engine #12](https://github.com/cpheinrich/morpheus-security/pull/12).
