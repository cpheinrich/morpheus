---
agent: codex
date: 2026-09-01
roadmap: MO-26-09-01-12.13.39
outcome: review
---

# Add reusable nightly iOS builds

## What changed

- Added `nightly-ios-build.yml`, a reusable TestFlight release workflow that reads the calling
  workflow's latest successful `main` run and diffs caller-declared iOS paths.
- Kept unchanged runs on one Linux job. A due run composes the existing exact-main release
  preflight and secret-free `ios-ci` workflow before entering the caller's protected environment.
- Kept archive/sign/upload behavior repository-owned through a validated executable script path;
  Apple credentials first enter the process in the final release step.
- Chose GitHub's Actions API plus native `git diff` instead of a path-filter action because the
  release-specific successful-run cursor still had to be resolved separately.

## Verification

- The focused workflow suite executes the decision script against Git fixtures and proves a
  docs-only commit skips while a subsequent `apps/ios` commit builds.
- Workflow contract tests cover read-only permissions, full-history checkout, exact-main preflight,
  independent native tests, protected environment use, globally unique build numbers, and delayed
  secret exposure.
