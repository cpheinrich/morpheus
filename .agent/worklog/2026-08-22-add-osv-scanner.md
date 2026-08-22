---
agent: codex
date: 2026-08-22
roadmap: MO-26-08-22-01.13.35
outcome: complete
---

# Add OSV dependency vulnerability scanning

Added a pinned, reusable OSV full-scan workflow and a Morpheus caller that runs weekly, on `main`,
and on demand. The scan intentionally does not use OSV's PR-diff reusable workflow because its open
symlink-bypass report lets pull-request content suppress a newly introduced finding.

The first local scan found `nanoid` 3.3.16 (GHSA-2v37-7h3g-55p8), pulled by Vite's PostCSS
dependency. A direct `pnpm update postcss` did not change that transitive resolution. pnpm 11 also
ignored a `package.json` override, so the durable fix is the exact `nanoid: 3.3.18` override in
`pnpm-workspace.yaml`, followed by a regenerated lockfile. The follow-up OSV scan reported no
issues.
