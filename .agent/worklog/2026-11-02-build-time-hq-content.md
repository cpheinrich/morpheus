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
