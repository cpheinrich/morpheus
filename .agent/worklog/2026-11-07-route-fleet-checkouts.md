---
roadmap: MO-26-11-07-23.29.54
tags: [engineering, devops, infrastructure]
---

The approved phase runs fleet work beside the existing local path. Keep the
existing tools and use an explicit fleet placement choice. The controller binds
the task to the exact committed SHA and maps its owned run to the cloud task.
The service can authorize exact commits for a Git-enrolled project. The
supervisor fetches from the operator-configured bare mirror's origin. The
execution account can read the mirror and creates an attempt-specific checkout.
A clarification resumes that checkout. The supervisor holds the upstream
credential outside the executor account. No new package is needed for this Git
or Factory-specific boundary.

Factory package tests passed 171 cases, including Git source selection, checkout
isolation, continuation and local target validation. Both Firestore emulator
tests passed, including new source admission and idempotent submission. Typecheck,
compile, PM index and complexity passed. The intended Studio supervisor and
execution accounts proved the private Git credential and read-only mirror access
using a previously merged commit. The live standard-tool rollout is the next
acceptance step and belongs to the controller.
