---
agent: codex
date: 2026-10-26
outcome: review
tags: [engineering, security, devops]
---

# Refresh Paperclip HQ Zod remediation

## Mandate

- Outcome: reuse the existing focused Paperclip HQ Zod pull request to remove the production
  GHSA-mrhx-c7xc-m3w5 advisory without creating a duplicate remediation.
- Acceptance: the branch includes current `origin/main`, keeps the now-required Functions
  Framework package, resolves Zod to a patched release, builds and passes the package boundary
  check, and remains a draft with auto-merge disabled for independent review.
- Authority: update pull request #513 and its branch only; do not merge, enable auto-merge,
  deploy, create credentials, or widen dependency policy.
- Budget: existing local subscription and included CI only; no new spend or paid service.

## Evidence

- Current `origin/main` was merged into Dependabot's exact `scripts/paperclip-hq` update branch.
  The package conflict retained both `@google-cloud/functions-framework@5.0.5` from main and
  `zod@4.6.6` from the remediation.
- `pnpm --dir scripts/paperclip-hq why --prod zod` resolves the direct production dependency to
  Zod 4.6.6; GHSA-mrhx-c7xc-m3w5 is therefore absent from the package audit.
- The remaining package audit result is one distinct moderate advisory:
  `@google-cloud/functions-framework@5.0.5 > cloudevents@10.0.0 > uuid@8.3.2`
  (GHSA-w5hq-g745-h8pq). Current upstream pins the vulnerable UUID major, so forcing a cross-major
  override is outside this focused Zod remediation and needs separate compatibility evidence.
- Local validation is recorded in the pull request test plan. Node 26 emits the expected package
  engine warning because hosted CI owns the declared Node 22 environment.

## Boundaries

- Pull request #464 is the separate root dependency graph.
- Pull request #522 changes `@modelcontextprotocol/sdk`; its exact branch still resolves the
  plugin's direct Zod dependency to 4.4.3 and still reports the high advisory.
- Reusing Dependabot pull request #513 avoids a duplicate governed remediation vehicle. The
  moderate transitive UUID advisory is not hidden or represented as fixed here.
