---
date: 2026-11-09
roadmap: MO-26-11-09-15.13.20
tags: [engineering, devops]
---

# Refuse green CI for a conflicted pull request

Issue #616 reported green after an external check passed on a conflicted PR whose required workflows had never started. The existing Actions census cannot see a workflow GitHub never created. The same GraphQL snapshot now includes the PR mergeability value, and both the initial poll and the post-census confirmation refuse a conflict with an actionable message.

The five focused wait-ci suites passed all 236 tests. The regression covers the external-only case in both modes and a conflict first reported on the confirmation poll. The compiled CLI returned exit 3 against conflicted Morpheus PR #665. Complexity passed the enforced limit; the existing polling loop retains an advisory for cognitive complexity.
