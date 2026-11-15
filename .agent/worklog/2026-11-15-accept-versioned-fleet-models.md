---
roadmap: MO-26-11-15-02.43.34
tags: [engineering, devops, factory]
---

# Accept versioned Codex models in Factory Fleet

A synthetic startup probe reproduced a model-validation failure with a dotted
Codex identifier. Service enrollment and both explicit submit interfaces now
use the same bounded model grammar. Each request still uses the exact
enrolled model as its authority. Routing IDs keep their existing grammar.

The real service booted locally with synthetic enrollment and returned its
JSON 401 for an unauthenticated request. The focused Factory suites passed 14
tests, including default and explicit dotted selection, a version mismatch,
a malformed model name, and a dotted project ID. Typecheck, compile and
the scoped Lizard complexity check passed.
