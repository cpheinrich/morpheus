---
date: 2026-11-09
roadmap: MO-26-11-09-15.10.54
tags: [engineering, devops]
---

# Reject shallow CD source history

Issue #445 showed that a depth-limited source clone can renumber first-parent commits below sources already admitted to a delivery ledger. Both the controller and repair worker use the same source loader. The loader now checks the checkout after its normal fetch and before enumerating ordinals or reading PR evidence. The operator can unshallow the source clone and retry the same operation.

A real local depth-one Git clone reproduces the boundary. The regression checks that it stops before PR lookup and that unshallowing restores the exact full-clone source record, including ordinal 1. The adapter, controller and native-worker suites passed all 360 cases.
