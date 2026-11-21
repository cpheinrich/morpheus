---
date: 2026-11-20
roadmap: MO-26-11-20-16.24.16
tags: [engineering, devops, factory]
---

# Keep Claude worker temporary files inside the sandbox

The restricted macOS Fleet worker failed before reaching its gateway because Claude Code
used its own temporary directory. Point its internal temp setting at the existing private
worker temp. The existing sandbox and its authenticated relay retain their policy.

An isolated run of the signed CLI under the Fleet execution identity reproduced the
startup failure against a synthetic local endpoint. With the patch, the same CLI
created its internal directory under the private sandbox root and returned a session
initialization and completed result through the restricted relay. The extended
macOS sandbox regression verifies an inherited temp override is replaced while
protected Git writes and direct gateway access remain blocked.
