---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-20.59.54
outcome: review
---

# Harden the scheduled workflow boundary

The audit reproduced the scheduler failure with a manual dispatch and found twelve recent runs
that failed before starting a job. The caller had `contents: read` while its nested reusable
workflow also requires pull-request reads. The caller now grants that permission.

All external actions in reusable workflows are pinned to resolved commit SHAs, and tests enforce
both the nested permission envelope and the immutable-ref policy. Typecheck, 1,018 tests, and the
committed build passed locally. Hosted branch dispatch
[33233648707](https://github.com/cpheinrich/morpheus/actions/runs/33233648707) then completed the
heartbeat job successfully; the PR remains draft because the audit contract requires broader
remediation to stay explicitly review-gated.
