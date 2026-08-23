---
roadmap: MO-26-08-23-16.22.06
summary: Isolated shared previews from incompatible project environment policies.
---

# Isolate Vercel preview environment

## Changes

- Added caller-configurable preview and production GitHub environment names.
- Defaulted previews to the deployment-specific `Vercel Preview` environment.
- Preserved the environment URL receipt and separate production environment.

## Verification

- Morpheus typecheck, workflow tests and compile.
- Live Kairos pull-request rerun after merge.

## Dead ends

- GitHub allowed the old Kairos `Preview` environment policy to be read but returned 404 when the
  authenticated agent attempted to add an allowed branch. A portable workflow must not require
  mutation of every caller's pre-existing environment rules.
