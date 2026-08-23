---
roadmap: MO-26-08-23-16.02.05
summary: Centralized no-seat Vercel CLI deployment for Morpheus projects.
---

# Centralize Vercel deployment

## Changes

- Added an atomic reusable Vercel CLI workflow for preview and production deployments.
- Required callers to pass their own token, organization id and project id explicitly.
- Guarded secrets from fork pull requests and published the exact deployment URL as both the
  GitHub environment URL and one updated pull-request comment.
- Kept agent review independent and documented the boundary in architecture and decisions.

## Verification

- Workflow YAML and structural contract tests.
- Morpheus typecheck, test suite and committed build verification.
- Live verification follows in Kairos after this workflow merges.

## Dead ends

- None.
