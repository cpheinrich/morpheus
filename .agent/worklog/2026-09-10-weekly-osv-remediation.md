---
roadmap: MO-26-09-10-21.45.21
---
# Hosted security remediation

The first implementation on this branch paired weekly OSV SARIF with a local Codex heartbeat. It
was fully tested but never merged because its review was exhausted after later trunk integrations.
Chris subsequently replaced that design: no heartbeat, paid service, or model; nightly GitHub-hosted
scanning and deterministic remediation through a private GitHub App.

The revised implementation combines active OSV results with open GitHub reviewed alerts, deduplicates
aliases, and creates one dependency-only PR per lockfile at a time. It supports npm and uv delivery,
selects the smallest fixed version, uses an exact npm override only when a transitive parent range
cannot reach the fix, refuses non-registry npm artifacts or missing integrity hashes, and rescans the
candidate before push. Marked App PRs receive a narrow authoring/review waiver but still require every
protected check. `MAL-*` findings upsert a private incident issue that remains open for exposure review.

The reusable workflow mints a one-hour installation token from encrypted caller secrets. The App has
only metadata read, Actions/checks/statuses read, Dependabot alerts read, and contents/PR/issues write;
it has no webhook, OAuth, administration, secrets, or workflow permission. Run receipts retain both
scans and the plan for 30 days.

Validation and independent-review evidence will be recorded here before merge.

Pre-review validation passed: TypeScript typecheck, all 1,392 tests in 52 files, ESLint, compile,
and `git diff --check`. A production-shaped dry run against a detached Lakina `origin/main`
checkout consumed real OSV v2.6.0 JSON plus live GitHub alerts. The js-yaml candidate changed only
its three lockfile fields and rescanned clean for GHSA-2883-xcg3-v3hh. A second run holding js-yaml
exercised uuid: the compatible transitive update could not reach 11.1.1, so the resolver added an
exact override instead of Dependabot's incompatible firebase-admin 14 major update. The candidate
rescanned clean, and Lakina's npm frozen install, typecheck, all 231 web tests, and production build
passed.
