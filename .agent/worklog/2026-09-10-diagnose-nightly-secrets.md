---
agent: codex
date: 2026-09-10
roadmap: MO-26-09-10-21.50.06
outcome: review
---

# Diagnose unavailable nightly signing credentials

Issue #194 is distinct from the caller-owned upload boundary fixed by #193/#192. The built-in
job still needs an early explanation when required credentials are unavailable. PR #195 adds
a caller template and does not address this diagnostic; its owner branch remains untouched.

The first upload step now receives only boolean presence flags for the five required signing
secrets. It fails with missing names and conditional guidance for cross-repository callers to
use `run-upload: false` and the caller-owned action in their protected environment. It does not
infer repository identity from `github.workflow_ref`, relocate secrets, or require optional
Firebase/Sentry credentials or a nonempty P12 password. Values first enter the final upload step.

## Validation

The new test failed against the original workflow because checkout was still the first step.
It executes the actual guard shell for all credentials present, each required secret absent,
and all required secrets absent. The test verifies that the guard receives only presence flags.
Typecheck, all 1,145 tests, compilation, PM index, and inbox validation passed. Further
integration validation is recorded below. No signed build, credential access,
TestFlight upload, or production activation is performed by this change.

## Independent review

Pending final integration and review.
