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

## Independent review

A high-risk independent review of `c654f76` found five substantive fail-closed gaps. The author
fixed npm provenance, private incident targeting, current project holds, immutable tooling selection,
and uv artifact-level provenance across `68e4582` and `332461a`. The same reviewer used both allowed
follow-up turns and cleared the final commit. Focused suites passed on every turn; the final full
validation passed 1,394 tests in 52 files, typecheck, lint, compile, PM index, and diff checks.

```morpheus-review
{
  "version": 1,
  "base": "f47a3536fab26c9729ec34d805e7a9e2e3dda900",
  "reviewed": "c654f7607cdded35a79afdff618cb342c7e6dc87",
  "covered": "332461a31cee833db6ce437c2d9a25587a51b9e4",
  "authorSession": "/root",
  "reviewerSession": "/root/morpheus_security_review",
  "risk": "high",
  "elapsedMinutes": 11,
  "outcome": "complete",
  "summary": "A high-risk independent review found five substantive fail-closed gaps. The author fixed npm provenance, private incident targeting, current project holds, immutable tooling selection, and uv artifact-level provenance across 68e4582 and 332461a. The same reviewer used both allowed follow-up turns and cleared the final commit.",
  "findings": [
    {
      "id": "SEC-001",
      "severity": "substantive",
      "description": "The privileged Morpheus tooling checkout used a mutable ref, then incorrectly used the caller-associated github.workflow_sha.",
      "paths": [".github/workflows/security-remediation.yml", "tests/workflows.test.ts"],
      "disposition": "fixed",
      "response": "The caller must supply an exact lowercase 40-hex morpheus-sha; checkout and an explicit HEAD comparison both enforce it. Consumers pin the workflow use and this input to the same reviewed commit."
    },
    {
      "id": "SEC-002",
      "severity": "substantive",
      "description": "The uv adapter initially lacked provenance validation, then checked only that some hash existed in a changed package block.",
      "paths": ["scripts/security-remediation.mjs", "tests/security-remediation.test.ts"],
      "disposition": "fixed",
      "response": "Every changed uv URL-bearing artifact must be HTTPS on an approved PyPI host and carry its own full 64-hex sha256; incomplete and mixed-host blocks fail closed."
    },
    {
      "id": "SEC-003",
      "severity": "substantive",
      "description": "Changed npm entries without resolved URLs bypassed the provenance and integrity gate.",
      "paths": ["scripts/security-remediation.mjs", "tests/security-remediation.test.ts"],
      "disposition": "fixed",
      "response": "Only identical prior resolved, integrity, and link provenance is skipped; every changed entry requires an official npm registry URL and recognized integrity hash."
    },
    {
      "id": "SEC-004",
      "severity": "substantive",
      "description": "A public repository could name a public malware incident target and disclose exposure details.",
      "paths": ["scripts/security-remediation.mjs"],
      "disposition": "fixed",
      "response": "The selected incident repository is queried before mutation and must report private visibility."
    },
    {
      "id": "SEC-005",
      "severity": "substantive",
      "description": "Reconciliation unconditionally re-enabled auto-merge and ignored holds added after a PR opened.",
      "paths": [".github/workflows/security-remediation.yml", "scripts/security-remediation.mjs"],
      "disposition": "fixed",
      "response": "Reconciliation loads current config and disables auto-merge for held PRs or PRs missing parseable dependency and advisory metadata."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_security_review",
      "commit": "68e45827c2ac80fb58ede5043a035fefe0d4acf9",
      "outcome": "blocked",
      "elapsedMinutes": 7,
      "summary": "SEC-003, SEC-004, and SEC-005 cleared. SEC-001 remained open because github.workflow_sha is caller-associated; SEC-002 remained open because a mixed uv artifact block could pass with one unrelated hash."
    },
    {
      "reviewerSession": "/root/morpheus_security_review",
      "commit": "332461a31cee833db6ce437c2d9a25587a51b9e4",
      "outcome": "cleared",
      "elapsedMinutes": 4,
      "summary": "The exact-SHA checkout and per-artifact uv host/hash validation cleared SEC-001 and SEC-002 with no regressions."
    }
  ]
}
```
