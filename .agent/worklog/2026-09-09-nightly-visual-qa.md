---
roadmap: MO-26-09-08-19.28.34
date: 2026-09-09
agent: codex
---

# Nightly visual QA

Added the shared publisher and/or app-owned screen inventory and synthetic UI captures.
A separate workflow_run observer updates a persistent draft PR with two columns and exact-run
provenance. No previous screenshots fill gaps in a failed run. The screenshot branch is reset
above main rather than accumulating nightly binary diffs; immutable commit URLs retain provenance.

Validation: Morpheus typecheck and all 1,110 tests passed, including publisher create/update,
missing captures, unsafe artifacts, stale runs, and workflow contracts. App simulator/CI validation
and explicit Evo nightly publication are being completed before delivery is declared successful.

Considered peter-evans/create-pull-request. Used GitHub's existing github-script/Octokit API instead:
this publishes only bounded artifact PNGs and a manifest without checking out or executing caller
code in a write-permission job, and needs a single commit based on current main each night.

GitHub combines automatic PR creation and approval under can_approve_pull_request_reviews.
Both caller repositories currently disable it. Automatic approval review rejected enabling it;
explicit permission is needed for that setting before automated PR creation can be verified.
