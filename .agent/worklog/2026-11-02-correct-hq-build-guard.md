---
agent: codex
date: 2026-11-02
roadmap: MO-26-11-02-21.01.13
outcome: complete
---

# Correct the HQ build guard after Darwin production

## Mandate

- **Outcome:** feed Darwin's production findings into the reusable HQ build contract before the
  next repository migration.
- **Acceptance:** an explicit dynamic page remains dynamic when a catch-all prerenders the same
  concrete URL; a fully emitted catch-all remains recognized without a `dynamicRoutes` entry;
  dependency Markdown does not fail the trace guard; relative and absolute repository
  `hq/**/*.md` traces do fail it.
- **Authority:** edit, test, document, review and merge this Morpheus repository change under the
  normal project workflow.
- **Budget:** existing local tooling and included CI only; no new service, credential, package or
  spend.
- **Gates:** independent review, repository conventions and CI remain required. The change must
  merge before the next consumer migration uses it.

## What changed

Darwin's Next 16 build emitted `/hq/live` as a concrete prerender entry whose `srcRoute` was the
repository catch-all, while also having an explicit live page at that URL. The original generated
guard checked only concrete membership and therefore called the explicit page static. It also
matched every `.md` file in a dynamic trace, including dependency README files.

The generated classifier now attributes each concrete route to its `srcRoute`, while retaining
compatibility with manifests whose explicit static entry omits that field. It derives fully
emitted catch-all patterns from concrete entries when Next omits the `dynamicRoutes` row. The trace
guard resolves relative entries from their NFT file, canonicalizes existing paths, and reports
only Markdown physically under the repository root's `hq/` tree.

The executable scaffold test reproduces the catch-all collision, the omitted dynamic-pattern row,
the dependency README false positive, and both relative and absolute repository HQ source paths.
The architecture and website migration runbook name the same boundary. `pnpm compile` regenerated
the committed distribution.

## Verification

- `pnpm vitest run tests/web-scaffold.test.ts` — 33 tests passed.
- `pnpm compile` — passed; committed `dist/` mirror regenerated.
- `pnpm typecheck` — passed.
- `pnpm lint` — passed.
- `pnpm test` — 139 files and 4,169 tests passed. This was the single full-suite run for the PR
  because the shared web template changed.

## Production provenance

The behavior came from Darwin PR #140, merged as
`31e8a00cbdc6a0a5d7e1472dae7231e362334d02` and deployed to production as
`dpl_65darLTu9r1q4QneZG3ZJiEa6RDd`. Its build verified 257 static routes, 11 declared dynamic
routes and no repository HQ Markdown in dynamic traces. Representative authenticated static-page
medians improved 47–76% in production. This follow-up contains no deployment of its own; it is the
reusable contract correction required before the next project deployment.

## Independent review

Independent review found one substantive containment gap: a dependency path such as
`node_modules/hq/README.md` still contained an `hq/` segment and would have been reported as
repository source. The author changed the guard to resolve entries from the NFT directory,
canonicalize existing paths and check containment under the repository root's `hq/` directory;
the regression now uses that exact dependency shape. The same reviewer verified the fix, the
generated mirror and the focused test, and cleared the change with no remaining findings.

Independent review found one substantive dependency-path containment gap. The author anchored trace entries to the canonical repository HQ root and added the exact node_modules/hq regression. The same reviewer verified the fix and cleared the change with no remaining findings.

```morpheus-review
{
  "version": 2,
  "base": "abac7a1d78e41de0b0eaa942e0b72e1df08049cf",
  "reviewed": "0c83aafd7cb35dc346285e67595dad09efc2d6f5",
  "covered": "2f8fc5207b87999223766332d02249f1971f41fb",
  "authorSession": "01a19f40-6bee-7aa1-bf04-dd2abaaf6991",
  "reviewerSession": "/root/morpheus_hq_guard_review",
  "risk": "normal",
  "elapsedMinutes": 0.71535,
  "timing": {
    "source": "clock",
    "durationMs": 42921,
    "evidence": "Codex reviewer rollout 01a19fcb-a510-7fa0-a5c8-f10a6a5a723d initial task_started 2026-11-03T05:04:45.949Z to task_complete 2026-11-03T05:05:28.870Z."
  },
  "outcome": "complete",
  "summary": "Independent review found one substantive dependency-path containment gap. The author anchored trace entries to the canonical repository HQ root and added the exact node_modules/hq regression. The same reviewer verified the fix and cleared the change with no remaining findings.",
  "findings": [
    {
      "id": "HQ-TRACE-001",
      "severity": "substantive",
      "description": "Matching any hq path segment still reports dependency paths such as node_modules/hq/README.md as repository Markdown.",
      "paths": [
        "src/web/templates.ts",
        "dist/web/templates.js",
        "tests/web-scaffold.test.ts"
      ],
      "disposition": "fixed",
      "response": "Resolve relative entries from the NFT directory, canonicalize existing paths, and require containment under the canonical repository hq root. The exact node_modules/hq dependency regression and relative/absolute repository controls pass; the same reviewer cleared the fix."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_hq_guard_review",
      "commit": "2f8fc5207b87999223766332d02249f1971f41fb",
      "outcome": "cleared",
      "elapsedMinutes": 0.20011666666666667,
      "timing": {
        "source": "clock",
        "durationMs": 12007,
        "evidence": "Codex reviewer rollout 01a19fcb-a510-7fa0-a5c8-f10a6a5a723d follow-up task_started 2026-11-03T05:06:39.510Z to task_complete 2026-11-03T05:06:51.517Z."
      },
      "summary": "The same reviewer verified root-anchored containment, the dependency hq fixture, relative and absolute repository controls, the checker context and generated mirror, then cleared with no new findings."
    }
  ]
}
```
