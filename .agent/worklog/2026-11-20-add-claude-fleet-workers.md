---
date: 2026-11-20
roadmap: MO-26-11-20-14.21.09
tags: [engineering, devops, factory]
---

# Simplify Fleet handoffs and add Claude workers

The rollout exposed three recurring handoff problems. A lost submit acknowledgement left
owners unsure what to retry. Queued tasks exposed their state without the reason for the wait.
A single oversized response clipped exact review evidence during protected pre-merge review.
Fleet now reuses the same message ID on a retryable submit, includes a queue reason in the
existing snapshot, and prepares independently checkable per-path review evidence against the
published pair of commits.

Claude shares the existing service, slot and workspace leases, scoped quota checks, artifact
path and cleanup receipt with Codex. The service binds the enrolled provider and model on
submission. Each project retains its existing authorization and protected delivery path.

The Fleet implementation returned a private patch with an exact source receipt and verified
cleanup. The controller verified the patch and its digest. The controller extended the restricted
macOS profile and independently ran the Factory, review packet, typechecking, compile and
complexity checks. Existing review gates require the reviewed source and CI before host activation.

Initial review found three operational gaps. Bounded discovery now alternates between runnable
provider windows in the same index. Claude admission requires an existing Git-backed worker
route. A prelaunch quota failure releases the initial slot and workspace and restores the same
task to its queue. A saved answer keeps the live lease and original session while Claude quota
recovers. Focused regressions verified these cases. The controller corrected the draft Test plan
to name the exact suites that ran.
