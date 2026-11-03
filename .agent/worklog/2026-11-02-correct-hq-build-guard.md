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
predicate now reports repository `hq/**/*.md` source rather than all Markdown.

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
