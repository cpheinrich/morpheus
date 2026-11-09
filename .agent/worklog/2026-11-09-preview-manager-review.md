---
date: 2026-11-09
roadmap: MO-26-11-09-15.20.21
tags: [engineering, devops]
---

# Preview GitHub Manager review validation

Issue #444 described a correct review that escalated because the apply step was the first place to see a formatting mismatch. The Manager brief now gives its session a local preflight using the same validator, committed head, base ref and proposed body. The session can correct its visible summary before pushing and submitting a decision. Apply still verifies the live head and all policy.

The real Git fixture rejects the mismatched paragraph, accepts the corrected committed worklog, and prints the checked head. Both focused suites passed all 116 tests. Typecheck, compile, PM index and enforced complexity passed.
