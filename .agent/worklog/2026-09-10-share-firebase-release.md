---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.58.31
outcome: review
---

# Share Firebase deployment and client readiness

Inspected Evo PR205 at 6988523cd2ddd73ba41ca35ddc2f0b501178406d: release.mjs, its tests, the caller
verification action, backend/TestFlight/Vercel workflows and activation runbook. The current user
request authorizes merging the shared extraction for #221; Evo PR205 itself remains held and no
production deployment, activation, credentials or spending are authorized by this maintenance run.

The shared composite action retains caller-owned protected credentials and a documented single
non-cancelling lock covering backend writes plus entire client publication. Project IDs/rule paths
stay in the consumer's tracked policy. The CLI reads immutable tested Git blobs, checks current
main before deployment and on both sides of verification, generates an explicit rules-only config,
and requires live exact-content rules and READY indexes after the ten-minute propagation window.
Receipt paths now hash the exact credential-free bytes, strengthening Evo's plain receipt filename.
Scoped Storage deploy config uses explicit bucket arrays, confirmed against official firebase-tools
storage prepare code, so default bucket inference cannot target a different bucket.

Borrowed official firebase-tools 15.29.0 (registry publication 2026-09-02, 70 CLI dependencies) and
google-github-actions/auth v3. No application dependency is added. Node built-ins implement only the
domain-specific source/readiness/receipt policy; package-managed deployment/auth were not rebuilt.
The exact CLI version matches the first consumer. Extended index options and field overrides fail
closed pending explicit readiness support rather than silently ignoring their semantics.

## Validation

Synthetic tests cover undeployed Firestore/Storage rules, propagation, HTTP/identity failure,
READY/missing/building/incorrect indexes, pagination and implicit name ordering, unsupported index
policies, exact-main/checkout identity, and minimal deploy config. A real CLI subprocess uses an
isolated Git fixture, fake GitHub/Google responses and a fake Firebase executable: immutable blobs
survive local edits, stale jobs cannot invoke deploy, command scope is exact, legacy token fallback
is stripped, receipt filenames hash exact bytes, and a main change during verification leaves no
new receipt. Event tests reject failed/fork/non-main/non-push/wrong-SHA workflow runs. Caller example
tests preserve the shared lock and verification-before-publication order. No live cloud request,
Firebase write, signed upload or consumer activation is part of these tests.

Graph tools returned Transport closed for status/coverage after earlier worktree installation
attempts reported existing configuration ownership conflicts. New source and all relevant config
were inspected directly; no current graph completeness is claimed.

After integration with merged PRs235/237: frozen install, lint, typecheck, all1,318 tests,
compilation, PM index and inbox validation passed. The19 focused Firebase tests include
executable CLI scenarios. actionlint1.7.12 validated both inert caller workflows.
Independent review is recorded below.

## Independent review

Pending final integration and review.
