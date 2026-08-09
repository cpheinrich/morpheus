---
date: 2026-08-08
roadmap: MO-26-08-08-23.48.59
---

# Give non-client deployables a backend home

Issue #89 identified a real gap in the canonical tree: `apps/` described only client-facing
surfaces, while `packages/shared/` deliberately meant code consumed by more than one surface.
Lakina's trading engine is deployed product code but is neither.

The architecture now gives non-client deployables the stable conventional name
`apps/backend/`. The boundary is based on role rather than language or framework: a worker,
scheduled job, service, inference system, or execution loop that runs as the product belongs in
`apps/backend/`; code imported by multiple surfaces remains in `packages/shared/`.

This is documentation rather than mandatory scaffolding. An unused backend directory should not
appear in every new project merely because the convention exists.
