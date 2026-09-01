---
agent: codex
date: 2026-09-01
roadmap: MO-26-09-01-02.58.25
outcome: review
---

# Allow repository-owned visual evidence hosts

## What changed

- Extended the visual-evidence policy with optional, exact `allowedUrlPrefixes` entries while
  preserving GitHub attachments as the default.
- Required HTTPS, a trailing path separator, and no credentials, query, or fragment. Matching
  compares both origin and path prefix, so approving one cloud bucket does not approve its
  provider's other tenants.
- Updated the reusable agent instructions, pull-request template, architecture, and decision record
  to describe agent-native evidence storage.

## Build vs. borrow

No package was added. This is a small policy extension to the existing checker; the platform `URL`
parser and the existing Zod boundary cover the complete requirement more directly than a generic
URL-validation dependency.

## Verification

- Focused visual-evidence and scaffold suites passed: 2 files, 162 tests.
- Full suite passed: 37 files, 1,042 tests.
- TypeScript typecheck and compile passed; compile refreshed the committed `dist/` artifacts.
- Product records validated and generated indexes were unchanged.
