---
agent: codex
date: 2026-08-28
roadmap: MO-26-08-28-12.56.50
outcome: review
---

# Govern external actions from intake through acceptance

## What changed

- Added one generated and repository-level rule: requests from Messages, Slack, email, voice, or
  browser chat enter the ordinary roadmap, claim, branch, test, PR, and merge lifecycle.
- Required manual mutations to prefer explicit one-shot commands and to carry a caller-perspective
  verification probe with the expected result.
- Added the secret-free `release-preflight.yml`. It accepts no source input, requires clean current
  `main`, requires the exact SHA to be associated with a merged PR, and returns that SHA for the
  dependent release job to check out.
- Defined archive, upload, and deploy success as delivery evidence; acceptance requires proof of the
  requested user-visible behavior.

## Issue and repository audit

All 31 GitHub issues and their comments or linked resolution evidence were reviewed. Issues #165
and #142 are the same external-action control problem at different stages, so they share this
resolution. The suggested scheduled Firebase probe remains project-local: only one project has the
shape, and the existing second-use rule says not to extract it yet.

The independent audit established a green baseline, traced generated agent instructions and
reusable workflow contracts, and found no existing release-source gate to extend. A small reusable
preflight plus an operating convention was therefore sufficient; no release framework, scheduler,
new dependency, or project-specific iOS implementation was added.

## Verification

- Focused workflow and scaffold suite: 2 test files and 160 tests passed.
- The workflow's actual shell body runs against local Git fixtures: a clean merged-PR source passes,
  a dirty tree fails, and a clean direct-push source with no merged PR fails.
- Final source verification: 33 test files and 995 tests passed; TypeScript typecheck, build, PM
  indexing and validation, team validation, and `git diff --check` passed.
- A fresh moderate code graph recorded no gap in the changed template source or workflow. The two
  changed test files are deliberately excluded by the graph's test-file pattern, so they were read
  and executed directly.
