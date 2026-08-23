---
roadmap: MO-26-08-23-16.11.42
summary: Fixed reusable Vercel pnpm discovery after the first live Evo call.
---

# Resolve caller pnpm manifest

## Changes

- Added a package-manager manifest input, defaulting to the repository root.
- Preserved the empty explicit version so callers do not declare pnpm twice.
- Added a structural test for the input and setup-step handoff.

## Verification

- Morpheus typecheck, workflow tests and compile.
- Live Evo rerun after merge.

## Dead ends

- The initial implementation assumed every app manifest carried the pnpm pin. Evo pins it at the
  monorepo root, while Kairos pins it inside `apps/web`; the path must be caller-owned.
