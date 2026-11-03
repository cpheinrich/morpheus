# Scheduler admission guard

The receiver half of repository-owned schedules: run it in a workflow's first job, then gate the
rest on a step named exactly `Scheduler admission`. Contract and template:
[`docs/runbooks/scheduler.md`](../../../docs/runbooks/scheduler.md).
