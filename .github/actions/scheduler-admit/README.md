# Scheduler admission guard

The receiver half of repository-owned schedules: run it as a step named `Scheduler admission` in a
workflow's first job, follow it with a gated no-op step named exactly `Scheduler occurrence
admitted` (the marker history reads), and gate the rest on the output. Contract and template:
[`docs/runbooks/scheduler.md`](../../../docs/runbooks/scheduler.md).
