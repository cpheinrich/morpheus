# MO-26-09-25-10.04.40 — Extract security remediation

## Outcome

- Replaced Morpheus's internal OSV/remediation workflows with a committed opt-in policy discovered
  by the centrally operated `cpheinrich/morpheus-security` workflow. Morpheus stores no App
  private key or repository schedule.
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

Cleared at `f1e46d98164c3f5a52f7367e06ea0d4be11ded1e` with no substantive findings
(review session `01a0d9a2-94ab-7ca1-b7dd-3e707b9d2325`). The reviewer verified the four live check
contexts, private incident repository, retained bot-policy enforcement, removal of every local
scheduler and credential reference, and 241 focused tests. A final exact-head pass follows the
current-main integration commit.
