# MO-26-09-25-10.04.40 — Extract security remediation

## Outcome

- Replaced Morpheus's internal OSV/remediation workflows with a nightly/manual caller pinned to
  `cpheinrich/morpheus-security@f6031dfaa67b22cb041cab9148dc3fc729ccd2c1`.
- Removed the duplicated resolver implementation and its workflow-specific tests.
- Declared the four live protected checks as merge gates and routed public-repository malware
  records to the private `cpheinrich/morpheus-security-incidents` repository.
- Kept Morpheus's bot marker, dependency-only scope, and review-waiver enforcement in
  `src/security/policy.ts` and `src/check/pr.ts`.

## Verification

- `pnpm typecheck`
- `pnpm test` — 51 files, 1,386 tests passed
- `pnpm compile`
- JSON parse and `git diff --check`

## Independent review

Pending.
