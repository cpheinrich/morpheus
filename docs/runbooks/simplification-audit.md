# Run a structural simplification audit

Use this runbook for a coordinated cleanup of a subsystem or repository, including Morpheus
itself. Reuse the project's claim, review, and delivery process. A periodic health report can
supply candidates. A single local cleanup usually fits in its ordinary PR.

## 1. Survey and rank

Start the audit brief in the project's audit folder (typically `qa/audits/`) and link it from
the task worklog. Record the current revision, in-scope surfaces and
compatibility promises, exclusions, observed pain, and the available time and resources.
Separate the audit mandate from authorization to implement or release.

- Trace real callers, configuration, and supported data through the current owner. Verify graph
  coverage and read the source where coverage is missing. A TODO, hotspot, or apparently unused
  symbol is a lead to verify.
- Look for scattered ownership, duplicated policy, unnecessary state and fallback paths, and
  abstractions coupling things that evolve separately. For UI, check shared primitives, semantics,
  and the cases where independent components are easier to change.
- For each proposal, capture **evidence and affected callers**, **before and after** (use a
  diagram when ownership, dependencies or state transitions change), **migration and rollback**,
  **risk and validation**, and **expected benefit**. Rank by impact, effort, disruption, and
  confidence. State the relevance threshold and the reason for any consequential deferral.
- Use a small prototype or trace when it could change the decision. Leaving working code alone
  is a valid result when the evidence or expected benefit is weak.

## 2. Turn the plan into reviewable slices

Keep the plan beside the brief or in the same document. An audit-only mandate ends at the
proposal. Start implementation when the existing mandate or its accountable owner authorizes it.
The normal PR and worklog can carry the evidence.

| Slice and outcome | Needs merged first | Owner and shared files | Before/after checks | Rollback or stopping point |
| --- | --- | --- | --- | --- |
| Stable ID and behavior it preserves | Other slice IDs or baseline | Main responsibility and contested resources | Commands, fixtures, revisions, and any gate | Revert, transition, or decision with evidence |

Draw dependencies for multi-lane work. Serialize contested files, integration points, and scarce
resources. Choose concurrency from actual worker, review, CI and device capacity. A lead can
maintain architectural continuity. Authors get one isolated scope each and reviewers follow the
[independent review contract](independent-review.md). Factory is an option when authorized.

Capture a pinned baseline on the relevant runtime and data. Characterize critical behavior before
changing it when existing checks leave a gap. Repeat the same focused checks afterward; use
screenshots, traces, benchmarks, or physical hardware where they establish something material.
Write which evidence gates merges and which gates delivery, using the project's existing policy
and the mandate. Keep advisory checks visible without turning them into gates. If a test can
disable its own recovery channel, verify a separate recovery path first or use narrower fault
injection. Record infra failures separately from product assertions.

## 3. Continue through review and integration

Keep one controller worklog with links to the brief and plan. Include the following for each live
slice and update it at each handoff or meaningful change.

- Slice ID, status, owner and isolated checkout, base revision, PR and exact head.
- Active worker or waiter ID, current resource owner or lease expiry, and next action or unblock
  condition.
- Review and required CI for the candidate, actual merge revision, post-merge evidence and gaps.

On resume, reconcile the checkpoint against remote main, PR heads and checks, active runs and
resource ownership. Resume a live job or consume its settled result. Start a new job only when
the previous outcome and changed conditions justify it. Renew live leases as required by the
executor. Use bounded waits and retry only a recoverable failure with new evidence. Continue
independent slices when another is blocked. Integrate through normal protected merges and
validate the combined result on a pinned revision. The project's release owner owns delivery.

## 4. Close out and improve the recipe

Link baseline and final revisions, merged PRs, and reproducible evidence. For each goal report
the original target, result, measurement method, validation gaps, and remaining work. Measure at
the changed boundary and across the affected scope. A smaller file may move code elsewhere;
report both. Attribute intervening changes separately. Log useful no-change decisions and
distinguish measurements from hypotheses.

Where rollout matters, name the owner, baseline and qualifying build or revision, cohort,
signals and denominators, comparison dates, and stop condition. Track regressions and known
issues separately. Label missing signals or small samples. Retain only evidence the project is
authorized to keep. Promote a general lesson when it changes a future decision, and leave
environment-specific commands and incidents in their project runbooks.

## Worked example

In a CLI audit, suppose two commands show the same validation error but handle absent input
differently. First pin the source and test both cases. If the contracts differ, preserve the
separate policies. If only formatting is shared, that can be the first small slice; changing the
policy, if warranted, is a separate decision. Give the merge its focused tests and ordinary
review, then compare remaining policy owners and affected entry points on the integrated
revision.
