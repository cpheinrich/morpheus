# OSV maintenance handoff

`node scripts/osv-maintenance/inspect.mjs [run-id]` reads the latest weekly/manual
Security run, validates its origin, and groups the pinned scanner's SARIF by dependency.
An explicit run id also permits bootstrapping from a historical push run. It never mutates
GitHub. Missing/expired artifacts and unknown report shapes fail visibly rather than claiming clean.

The local Codex heartbeat executes [the maintenance runbook](../../docs/runbooks/osv-maintenance.md).
The scheduler registration is local app state; deploying this directory alone does not enable it.
