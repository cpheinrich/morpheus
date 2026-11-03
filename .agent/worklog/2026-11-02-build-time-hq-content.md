---
date: 2026-11-02
agent: codex
roadmap: MO-26-11-02-19.50.13
outcome: success
summary: Made HQ scaffolding and architecture static by default and incorporated Lakina's exact production deployment evidence into the migration contract.
---

# Build-time HQ content

## Design

Repository Markdown is a deployment input. Shared HQ chrome is static and viewer-agnostic behind
the existing proxy. Identity, current account/portfolio data, actions and private external artifacts
remain explicit live boundaries that authorize themselves. Generated context is split by consumer,
and framework manifests plus function traces—not source inference—decide whether the contract holds.

## Implementation

- New HQ scaffolds no longer call `currentUser()` in the shared layout or overview. The overview is
  explicitly `force-static`; search was already built once per deployment and keyed by commit.
- New apps run a generated manifest/trace checker from `postbuild`. It requires declared static
  routes, refuses unclassified dynamic HQ routes, and rejects Markdown in declared dynamic traces.
  Existing apps receive the scripts and an activation note so their current route set is classified
  before the checker becomes blocking.
- Architecture §11 and the website runbook now define route classes, the proxy/data-boundary split,
  narrow generated fragments, static route enumeration, deployment freshness and size budgets.
- The migration checklist covers inventory, shell cleanup, compilation, live routes, postbuild
  enforcement and one-project-at-a-time production proof.

## Production evidence

Lakina PR #618 deployed merged SHA `ae8e8a6f995ae406ad6ef975dd138e0e1f5a868c` through the normal
Vercel production path (`dpl_3n36gH8TeKs65inuDySaCTxPDmpv`). It emitted 733 static content routes,
allowed eight intentional dynamic routes and traced no Markdown into them. Protected static pages
were cache hits after proxy authentication. Product, Research, Library and Inbox medians improved
68–76%; live Portfolio improved 23%. Theme persistence is cookie-only and the removed API is 404.
Every hostile gate probe redirected to sign-in.

The first preview exposed one Vercel-specific dead end: postbuild runs after the adapter moves some
HTML files, so guards must read the prerender manifest's recorded `htmlSize` rather than `stat` a
local `.next/server/app/*.html` path.

## Verification

- `npm test -- tests/web-scaffold.test.ts`: 33 passed, including executable pass, undeclared-dynamic
  failure, dynamic-Markdown-trace failure, and both dangling-postbuild negative cases.
- `npm run typecheck`; `npm run lint`; `npm run compile`; `git diff --check`: passed. Compile
  regenerated the committed distribution used by installed Morpheus.
- Lakina production: authenticated seven-sample route profile, representative content checks,
  theme endpoint removal, exact deployment SHA, and four unauthenticated/spoof probes all passed.

## Remaining delivery

Independent Morpheus review, CI and merge; then separate Darwin, Evo, morpheus-enterprises and
Kairos migrations with their own repository records and deployments.

## Independent review response

The first review found two substantive delivery gaps: the committed `dist` still emitted the old
identity-bearing dynamic scaffold, and no executable generated-project guard backed the written
contract. `npm run compile` now regenerates the distribution. New scaffolds now carry an active
postbuild manifest/trace guard, with an executable regression covering both drift and Markdown
traces. The follow-up cleared both and found that the package hook was also emitted for `--no-hq`
and missing-Firebase runs that could not emit its script. The conditionally cleared correction now
adds `postbuild` only when HQ and Firebase are both present, with explicit negative tests for both
supported flows.

## Independent review

Fresh normal-risk reviewer found two substantive delivery gaps: the committed distribution still emitted the old identity-bearing dynamic scaffold, and the written build-time contract had no executable generated-project guard. Both were fixed with generated output and executable manifest/trace regressions. The follow-up cleared those findings and found a third substantive regression: non-HQ or missing-Firebase scaffolds received a dangling postbuild hook. That hook is now gated by the same HQ-and-Firebase condition as script emission, both negative flows are covered, and the reviewer cleared the final commit with no new findings.

```morpheus-review
{
  "version": 2,
  "base": "38a25f4fdc9387326800888ab62797d8d10d6f1c",
  "reviewed": "6c584ec8eb1e50e638c30e4b91ec3411620c06fa",
  "covered": "6963301c1d392bffaa5ee9a884470cb425941665",
  "authorSession": "01a19f40-6bee-7aa1-bf04-dd2abaaf6991",
  "reviewerSession": "/root/morpheus_hq_build_review",
  "risk": "normal",
  "elapsedMinutes": 1.1015333333333334,
  "timing": {
    "source": "runner",
    "durationMs": 66092,
    "evidence": "Reviewer task /root/morpheus_hq_build_review initial turn ran from 2026-11-03T04:22:40.794Z to 2026-11-03T04:23:46.886Z in the runner session log."
  },
  "outcome": "complete",
  "summary": "Fresh normal-risk reviewer found two substantive delivery gaps: the committed distribution still emitted the old identity-bearing dynamic scaffold, and the written build-time contract had no executable generated-project guard. Both were fixed with generated output and executable manifest/trace regressions. The follow-up cleared those findings and found a third substantive regression: non-HQ or missing-Firebase scaffolds received a dangling postbuild hook. That hook is now gated by the same HQ-and-Firebase condition as script emission, both negative flows are covered, and the reviewer cleared the final commit with no new findings.",
  "findings": [
    {
      "id": "MO-HQ-001",
      "severity": "substantive",
      "description": "The committed dist templates still emitted currentUser calls and did not contain the source build checker, so installed Morpheus would scaffold the old dynamic HQ behavior.",
      "paths": [
        "src/web/templates.ts",
        "dist/web/templates.js",
        "dist/web/templates.js.map",
        "dist/web/templates.d.ts"
      ],
      "disposition": "fixed",
      "response": "Ran the repository compile step and committed the regenerated distribution. Direct distributed-template execution confirms no layout/page identity read, a force-static overview, and the build checker export."
    },
    {
      "id": "MO-HQ-002",
      "severity": "substantive",
      "description": "The architecture and runbook described a manifest/trace enforcement contract, but generated projects received no executable guard to enforce it.",
      "paths": [
        "src/web/templates.ts",
        "src/web/scaffold.ts",
        "tests/web-scaffold.test.ts",
        "docs/runbooks/website.md"
      ],
      "disposition": "fixed",
      "response": "New HQ apps now receive a postbuild manifest/trace checker. Existing apps receive the checker and an explicit activation note without silent package-script mutation. Executable fixture tests cover a valid build, undeclared dynamic drift, and Markdown in a declared dynamic trace."
    },
    {
      "id": "MO-HQ-003",
      "turn": 2,
      "severity": "substantive",
      "description": "appPackageJson installed the HQ postbuild hook for every new web app while the referenced scripts were emitted only for successful HQ scaffolds, breaking supported --no-hq and missing-Firebase builds.",
      "paths": [
        "src/web/scaffold.ts",
        "src/web/templates.ts",
        "tests/web-scaffold.test.ts"
      ],
      "disposition": "fixed",
      "response": "The package template now receives an hqBuildGuard flag gated by Boolean(opts.hq && opts.firebase), exactly matching checker emission. Tests assert both unsupported flows receive neither hook nor scripts and a successful HQ/Firebase app receives all three.",
      "condition": {
        "paths": [
          "src/web/scaffold.ts",
          "src/web/templates.ts",
          "tests/web-scaffold.test.ts",
          "dist/web/scaffold.js",
          "dist/web/scaffold.js.map",
          "dist/web/templates.js",
          "dist/web/templates.js.map",
          "dist/web/templates.d.ts",
          ".agent/worklog/2026-11-02-build-time-hq-content.md"
        ],
        "evidence": "Focused scaffold tests, typecheck, lint, compile with no uncommitted generated drift, diff check, and explicit assertions that non-HQ and missing-Firebase new apps have neither checker nor postbuild while a successful HQ/Firebase app has both."
      },
      "conditionMet": "Commit 6963301c is limited to the allowed source, test, generated dist/web and task-worklog paths. npm test -- tests/web-scaffold.test.ts passed 33/33; typecheck, lint and compile passed; git status and git diff --exit-code confirmed no generated drift; git diff --check passed. The reviewer independently repeated this evidence and cleared the commit."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_hq_build_review",
      "commit": "9b89c0ea42fa138718f812212cd5f67db42ed906",
      "outcome": "blocked",
      "elapsedMinutes": 0.62235,
      "timing": {
        "source": "runner",
        "durationMs": 37341,
        "evidence": "Reviewer task /root/morpheus_hq_build_review follow-up ran from 2026-11-03T04:24:52.793Z to 2026-11-03T04:25:30.134Z in the runner session log."
      },
      "summary": "Cleared MO-HQ-001 and MO-HQ-002, then blocked on MO-HQ-003 with a bounded conditional correction covering only the scaffold, template, test, generated distribution and worklog paths."
    },
    {
      "reviewerSession": "/root/morpheus_hq_build_review",
      "commit": "6963301c1d392bffaa5ee9a884470cb425941665",
      "outcome": "cleared",
      "elapsedMinutes": 0.34471666666666667,
      "timing": {
        "source": "runner",
        "durationMs": 20683,
        "evidence": "Reviewer task /root/morpheus_hq_build_review final turn started at runner epoch 1793679999 and completed at 1793680020; task_complete reports duration_ms=20683."
      },
      "summary": "Cleared the exact covered commit after independently verifying the bounded diff, 33 focused tests, typecheck, lint, compile with no drift, diff check, both negative flows and the successful HQ/Firebase flow; no new findings."
    }
  ]
}
```
