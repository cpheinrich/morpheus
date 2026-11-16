---
agent: claude
date: 2026-11-16
roadmap: MO-26-11-16-14.08.00
outcome: review
tags: [engineering, security]
---

# Upgrade the Factory host Vitest stack together

## Mandate

- Outcome: replace security bot PR #698, which overrides `@vitest/mocker` to 4.1.11 under
  Vitest 2.1.9 and Vite 5, with a coherent patched test-runner stack in the optional Factory
  host package (`plugins/factory/src/host`).
- Authority: host manifest and lockfile, governed worklog and roadmap only; no production
  dependency, source, workflow or bot-PR change; one unlabelled draft; controller owns review
  and delivery.

## What changed

- Dev `vitest` `^2.1.8` → `^4.1.12` (resolves 4.1.12, with `@vitest/mocker` 4.1.12), the same
  line as the root remediation #728.
- New dev `vite` `^7.3.7` (resolves 7.3.8). Vitest 4 needs Vite 6–8 as a peer; with only the
  Vitest bump pnpm kept the locked Vite 5.4.21 and reported an unmet peer, so the host declares
  Vite directly. Vite 7 matches the root lock's major (7.3.7) and supports the host CI's Node 22
  (`^20.19.0 || >=22.12.0`); Vite 8 (Rolldown) was not needed.
- No override is added; #698's `pnpm-workspace.yaml` override is not carried. `esbuild` stays
  the one allowed build script (Vite 7 and tsx both use it).
- No fixture or config change was needed: the five Vitest files use only
  `describe`/`it`/`expect`, and `vitest.config.ts`'s `defineConfig({ test: { include } })` is
  unchanged in Vitest 4.

## Result

The full host audit went from 16 advisories (Vitest, mocker, Vite, esbuild, tinypool, Zod) to
one: Zod GHSA-mrhx-c7xc-m3w5 (high, production), which is #726's lane. GHSA-82fw-gwwq-j7x9 and
GHSA-qxg6-89mg-rqv8 are absent. Production dependencies are unchanged: the lockfile importer
diff touches only `vite` and `vitest`, and no `zod` or `systeminformation` entry moved.

## Verification

In `plugins/factory/src/host`, local Node 26.8.2, pnpm 11.9.0:

- `rm -rf node_modules && pnpm install --frozen-lockfile` exit 0; `pnpm peers check` clean.
- `pnpm check`, `pnpm typecheck`, `pnpm build` exit 0.
- `pnpm test`: Vitest 68/68, unittest 278/278, reporting `node --test` 97/97.
- Node 22.23.5 (host CI's major, fetched as the `node@22` npm binary): Vitest 68/68,
  `tsc --noEmit` exit 0, reporting 97/97.
- `pnpm audit --json` and `pnpm audit --prod --json`: only the Zod finding above.

Root checks are listed in the PR test plan.

## Dead ends

- Bumping Vitest alone left Vite 5.4.21 in the lock with an unmet peer warning; pnpm does not
  re-resolve an already locked peer, so the direct Vite range is required.

## Open questions

- #698 should be closed as superseded once this lands; that is the controller's call.
