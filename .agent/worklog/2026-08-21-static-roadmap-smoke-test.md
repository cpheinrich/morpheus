---
date: 2026-08-21
agent: codex
roadmap: MO-26-08-21-15.20.19
outcome: review
summary: Exercised the post-PR-150 roadmap lifecycle without rewriting its static README.
---

## Live lifecycle evidence

The roadmap README SHA-1 was `e6bd1957bd2d35f5052ffcea89a3532d63b91391` before item creation.
It remained identical after `pm new` and after `pm claim`, including claim-time reconciliation of
the item shipped by PR #150. It remained identical after this item moved to review and after both
`pm index` and `pm index --check`. This exercises the steady-state path: an already-static README
has no generated markers, so indexing deliberately leaves it alone.

## Legacy migration evidence

A disposable copy of Darwin's current `hq/product` exercised the other path. Before migration its
roadmap README SHA-1 was `e6e621f9537d53356e9bf6634ee3f655be087641`, contained the generated
markers, and sat beside 40 item files. The merged CLI validated all 40 items, replaced the table
once, and produced static README SHA-1 `014d375163f3519fb8076494b75bbb1e9ede1851`. A second
`pm index --check` reported it unchanged; the marker count became zero and the item count remained
40. Darwin's real checkout was not modified.

## Verification

Typecheck, compile, all 948 tests, PM validation, normal and check-only indexing, team validation,
and `git diff --check` passed before delivery. Merge and later shipped-state reconciliation are
not claimed here: those happen only after this record closes.
