---
date: 2026-08-11
roadmap: MO-26-08-11-18.39.11
---

# Automate Firebase Google sign-in setup and verification

Kairos exposed a repeated provisioning gap: a Firebase project, client keys, and
even a Google user can exist while a custom-domain HQ remains unable to complete
Google sign-in. The durable boundary is now a Firebase Auth bootstrap rather
than a project-specific console checklist.

`morpheus firebase auth setup` writes the Google provider configuration into
`firebase.json`, uses the existing Google and Firebase CLI sessions (opening
their browser login only when absent), deploys provider configuration, repairs
the Firebase Auth authorized-domain set, and verifies the provider/domain state
through the Identity Toolkit API. Its companion `check` command is read-only and
fails closed. If deployment still needs a console-only consent or ToS action,
setup opens Firebase Authentication and reports the exact recovery path.

The first implementation used a stateless API mock that always returned the
pre-patch domain list, which correctly caused verification to fail. The test
now models the remote update, preserving the important guarantee that setup
verifies the post-deploy remote state rather than trusting a successful PATCH.

## Verification

- `tsc -p tsconfig.build.json` regenerated committed `dist/` artifacts.
- `vitest run --maxWorkers=1`: 820 tests passed across 28 files.
- `tsc --noEmit`: passed.
- `git diff --check`: clean.
- `pnpm lint` could not run in this isolated clone because this package does
  not declare or install an `eslint` executable; CI does not enable the
  reusable lint step for this repository.
