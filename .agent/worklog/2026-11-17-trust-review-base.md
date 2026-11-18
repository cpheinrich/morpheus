---
date: 2026-11-17
roadmap: MO-26-11-17-21.42.37
tags: [engineering, devops]
---

# Evaluate independent review under trusted base policy

The target branch supplies the independent-review requirement and the Manager's protected paths.
The PR head supplies the committed evidence and proposed policy, which still has to parse. Local
validation applies the same review requirement, and review packets name the trusted target.
Morpheus uses the shared workflow on main and its own reviewed base executable. Consumer runs
use the released Morpheus checker. The PR input and checker are sibling checkouts. The original
PR check context and candidate Node test lane are preserved. The old workflow ref input remains
accepted for existing callers, but does not select authority.

The disposable audit reproduced an exit-status change from 1 to 0 on a proposed opt-out. With
this build both candidates exit 1 and name the missing review label. A base-approved opt-out
still waives; a reviewed policy change can still clear. The reusable job rechecks the live target
before reading its policy and reports checker and base revisions.

MCP graph calls closed after two attempts. The pinned graph analyzer checked successfully at the
primary checkout; work used exact source and focused test reads to recover the affected call paths.
The installed actionlint pin does not recognize the newer job workflow SHA context, so the consumer
checkout uses the explicit protected main ref. Initial workflow tests exposed a pin guard that
also matched non-reusable top-level callers; the guard now checks its intended reusable scope.

## Validation

- 611 focused tests across local review, Manager review, CLI, conventions, workflows, and Manager.
- Focused review-packet tests verify the exact target commit is printed.
- `pnpm typecheck`, `pnpm compile`, `pnpm exec oxlint src`, `pnpm morpheus pm index`,
  `actionlint -shellcheck= .github/workflows/{ci,pr-check,review-metadata}.yml`, and diff whitespace passed.
- Complexity passes in enforce mode. Final scope 36 functions in 8 measured files.
- Reran the baseline CLI probe against the compiled checker for both waiver cases.

## Trusted ref verification

Git can prefer a same-named tag to an abbreviated remote-tracking ref. The hosted checker resolves
the exact remote-tracking ref and passes its commit SHA. The CLI qualifies the default `origin/`
shorthand before resolving it. Reproduced the conflicting tag in both the workflow fixture and the
local review tests. GitHub's reusable workflow lookup also prefers a same-named tag. Checked that
`refs/tags/main` was absent, created [ruleset 27524573](https://github.com/cpheinrich/morpheus/rules/27524573)
for its creation and update, then read back the active tag rule with the exact include and no bypass
actors. The tag remained absent. Only this reserved name is targeted.

While checking that boundary, also made an unavailable PR head fail the required job after fetch.
A base-only checkout with no candidate object must not be treated as a records-only diff.

The first follow-up showed that Git's revision lookup could still fall through when a fully
qualified ref was absent. Both the workflow and local CLI now use exact `git show-ref --verify`
for remote-tracking refs, with regressions against a tag named like the missing full ref.

Final focused run passed 613 cases. Complexity passed in enforce mode, 44 functions in eight measured files.

## Independent review

Fresh independent review found two tag-resolution paths and a Manager regression gap. The first follow-up resolved the workflow tag and test findings and reproduced a residual Git lookup fallback when the target ref was missing. Exact ref lookup cleared the final follow-up. The reviewer verified the active tag rule and reproduced the missing-base refusal.

```morpheus-review
{
  "version": 2,
  "base": "c60f76d14369e7384ba234f57d271f9f7306cd59",
  "reviewed": "0acbb61bc7a35c947ab524f0d304f42d955b3d75",
  "covered": "f866aa46f6d4cc70a77a0d11b87dfa7f266d3446",
  "authorSession": "01a1e8ee-5131-7a11-bf34-a05e67fd8d67",
  "reviewerSession": "/root/trusted_base_review",
  "risk": "high",
  "elapsedMinutes": 6.42415,
  "timing": {
    "source": "clock",
    "durationMs": 385449,
    "evidence": "Author clock at invocation and observed verdict, Unix ms 1794981151527 to 1794981536976."
  },
  "outcome": "complete",
  "summary": "Fresh independent review found two tag-resolution paths and a Manager regression gap. The first follow-up resolved the workflow tag and test findings and reproduced a residual Git lookup fallback when the target ref was missing. Exact ref lookup cleared the final follow-up. The reviewer verified the active tag rule and reproduced the missing-base refusal.",
  "contextRead": [
    "AGENTS.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    "architecture.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    "docs/runbooks/device-bootstrap.md",
    ".agent/worklog/2026-09-10-independent-review.md",
    ".agent/worklog/2026-11-17-trust-review-base.md",
    "hq/product/roadmap/MO-26-11-17-21.42.37-trust-review-base.md"
  ],
  "findings": [
    {
      "id": "TBR-1",
      "severity": "substantive",
      "description": "A tag could replace a remote-tracking target during Git revision resolution, selecting the candidate's own review requirement or an empty diff.",
      "paths": [
        ".github/workflows/pr-check.yml",
        "src/cli/check.ts",
        "src/review/local.ts"
      ],
      "disposition": "fixed",
      "response": "Resolve the exact remote-tracking ref with git show-ref --verify in hosted and local paths. The check receives the commit SHA. Regressions cover colliding tags with the real ref present and absent."
    },
    {
      "id": "TBR-2",
      "severity": "substantive",
      "description": "GitHub resolves a same-named tag first for reusable workflow references. A main tag could displace protected main.",
      "paths": [
        ".github/workflows/ci.yml",
        ".github/workflows/review-metadata.yml"
      ],
      "disposition": "fixed",
      "response": "Created and read back active tag ruleset 27524573, limited to creation and update of refs/tags/main with no bypass actors. Verified the reserved tag is absent."
    },
    {
      "id": "TBR-3",
      "severity": "substantive",
      "description": "The Manager protected-path fixture merged target policy into the candidate and would pass if authority reverted to the candidate.",
      "paths": [
        "tests/manager-review.test.ts"
      ],
      "disposition": "fixed",
      "response": "The revised fixture leaves policy unmerged and checks both a protected path and an invalid base policy. A temporary head-policy mutant failed the protected-path assertion."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/trusted_base_review",
      "commit": "e747259c7ff56cbf0060860841c8a587c25a6d57",
      "outcome": "blocked",
      "elapsedMinutes": 2.4291833333333335,
      "timing": {
        "source": "clock",
        "durationMs": 145751,
        "evidence": "Author clock at invocation and observed verdict, Unix ms 1794981641613 to 1794981787364."
      },
      "summary": "Confirmed the tag ruleset and protected-path regression. Reproduced Git revision resolution falling through to a tag when the fully qualified remote-tracking ref was missing.",
      "blockedOn": [
        "TBR-1"
      ]
    },
    {
      "reviewerSession": "/root/trusted_base_review",
      "commit": "f866aa46f6d4cc70a77a0d11b87dfa7f266d3446",
      "outcome": "cleared",
      "elapsedMinutes": 1.8118,
      "timing": {
        "source": "clock",
        "durationMs": 108708,
        "evidence": "Author clock at invocation and observed verdict, Unix ms 1794981865945 to 1794981974653."
      },
      "summary": "Verified exact remote-tracking ref resolution in local and hosted code, reproduced refusal despite both tags, and reran the focused regressions. All three findings resolved."
    }
  ]
}
```
