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

## Integrated verification

The controller merged main including #726 without conflicts. A frozen host install resolved
Vitest and mocker 4.1.12, Vite 7.3.8 and Zod 4.6.6. All 68 Vitest, 278 Python and 98 Node
reporting tests passed. The full and production host audits both reported zero advisories.

## Independent review

The independent Factory reviewer cleared the compatible Vitest, mocker and Vite upgrade, verified that pnpm retained incompatible Vite 5 without the explicit Vite dependency, and confirmed zero host advisories and no production dependency change. Node 22 Vitest, typecheck and reporting passed. The PR body now records the integrated audit and test counts and the closure of #698.

```morpheus-review
{
  "version": 2,
  "base": "0bcbc251cbfd12cc8215c922b51dda180447ebab",
  "reviewed": "4e691e433fab31a4d6e28bc16aded274cc4f1bca",
  "covered": "4e691e433fab31a4d6e28bc16aded274cc4f1bca",
  "authorSession": "01a1e65c-0355-76c1-8402-a96d3e0a8c43",
  "reviewerSession": "00787192-234b-43f9-8ffe-2669f056e43d",
  "risk": "normal",
  "elapsedMinutes": 3.1165166666666666,
  "timing": {
    "source": "runner",
    "durationMs": 186991,
    "evidence": "Claude result duration_ms=186991 in Factory run 395a51c0-e8a6-48b9-9814-c4ffc914502c events.jsonl."
  },
  "outcome": "complete",
  "summary": "The independent Factory reviewer cleared the compatible Vitest, mocker and Vite upgrade, verified that pnpm retained incompatible Vite 5 without the explicit Vite dependency, and confirmed zero host advisories and no production dependency change. Node 22 Vitest, typecheck and reporting passed. The PR body now records the integrated audit and test counts and the closure of #698.",
  "contextRead": [
    "hq/product/roadmap/MO-26-11-16-14.08.00-upgrade-factory-host-vitest.md",
    ".agent/worklog/2026-11-16-upgrade-factory-host-vitest.md",
    ".agent/worklog/2026-11-04-migrate-factory-host.md",
    "docs/runbooks/osv-maintenance.md",
    ".agent/decisions.md",
    ".agent/worklog/2026-08-22-add-osv-scanner.md"
  ],
  "findings": [
    {
      "id": "F01",
      "severity": "minor",
      "description": "The draft body recorded pre-integration audit counts and called for closing #698, which was already closed.",
      "paths": [
        ".agent/worklog/2026-11-16-upgrade-factory-host-vitest.md"
      ],
      "disposition": "fixed",
      "response": "Update the body to 15 to zero after main included #726, all 98 reporting tests, and #698 closed as superseded."
    }
  ]
}
```
