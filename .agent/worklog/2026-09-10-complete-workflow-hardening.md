---
roadmap: MO-26-08-28-20.59.54
---
# Complete scheduled workflow hardening

Chris authorized completing and merging the high finding from #176 using #177.
Updated the existing implementation against current main, pinning newly added visual-QA
and nightly actions to verified upstream commit references. The permission regression
check honors job-level replacement and checks each callee requirement independently.

Validation: typecheck, all 1,145 tests, compile and PM index passed before the final
permission-check refinement; the focused workflow suite is rerun for that refinement.
Graph transport closed; workflows and contracts were reviewed directly from source.
