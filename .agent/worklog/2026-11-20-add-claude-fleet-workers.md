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

The follow-up confirmed the original fixes and found a disk leak on repeated quota holds. The
supervisor now fetches shared mirror data before checking fresh quota and defers the attempt
checkout to the admitted launch. Repeated holds made zero attempt checkouts in the real-Git
fixture. The controller joins a returned receipt to the exact prior attempt and exposes a queued
receipt as historical evidence.

A subsequent reviewer found that creating the checkout during the journal’s running phase could
strand a reservation after a restart before provider admission. The supervisor checks Claude
quota after the shared source fetch and before checkout materialization within the recoverable
preparation phase. Restart during preparation releases the exact task’s two leases with a
never-launched receipt. A saved answer still checks quota before its continuation.

A fourth independent turn found the remaining pre-admission gap during the executor’s Git
revalidation. Recovery can now atomically retire a never-reserved admission in the same
exclusive namespace. A delayed executor cannot reserve that ID. Existing admission directories
still require normal termination proof. The regression pauses the real executor during Git
validation, restarts the supervisor, verifies release of both exact leases with a never-launched
receipt, and confirms that the delayed executor starts no provider.
