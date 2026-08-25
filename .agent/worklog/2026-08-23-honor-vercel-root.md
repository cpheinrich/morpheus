---
roadmap: MO-26-08-23-16.18.02
summary: Fixed double application of the Vercel Root Directory in monorepo callers.
---

# Honor Vercel project root

## Changes

- Changed the reusable CLI working directory default from `apps/web` to repository root.
- Kept pnpm manifest discovery independently configurable.
- Added a regression assertion for the root default.

## Verification

- Morpheus typecheck, workflow tests and compile.
- Live Evo deployment after merge.

## Dead ends

- The first shared workflow treated the web app directory as the Vercel CLI directory. Vercel
  projects already carry their Root Directory, so that convention applied the path twice.
