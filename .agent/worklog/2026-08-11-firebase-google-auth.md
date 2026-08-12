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

## Review follow-up

Independent review correctly caught three ways the first pass could become a
false positive or leave a project in a confusing state. The setup path now
authenticates the Firebase CLI before it writes shared configuration, the
domain repair checks set membership rather than list length, and the tests fail
on an unexpected CLI command rather than silently treating it as success.

The review questioned the `auth` deployment target itself. That concern was
checked against the current Firebase documentation and the installed Firebase
CLI: `firebase.json` Authentication provider configuration and `firebase
deploy --only auth` are supported. The documented CLI path remains the
implementation; it does not need an Identity Toolkit write that would require
provider-specific client credentials.

The durable app origin is now an explicit optional `publicDomain` field in
`morpheus.json`. Setup/check may take `--domain` or use that field, while the
onboarding detector returns unknown—not ready—when a Firebase project has no
recorded public origin. The existing Firebase ToS recovery hint is retained
alongside the new command.

Follow-up verification after the repair:

- `firebase deploy --help` lists `auth` as the Authentication provider
  configuration target.
- `vitest run --maxWorkers=1`: 828 tests passed across 28 files.
- `tsc --noEmit`, `tsc -p tsconfig.build.json`, `morpheus pm validate`,
  `morpheus pm index --check`, and `git diff --check`: passed.

The observed CLI evidence is deliberately recorded verbatim enough to prevent a
later reviewer from having to infer it again:

```text
auth  Deploys configuration settings for Firebase Authentication providers.
```

The second review found a real non-interactive regression: `--no-browser` had
suppressed console recovery but not the `gcloud auth login` or `firebase login`
commands that can block a headless run. Both are now gated after a read-only
session check, with tests proving existing credentials still work and missing
credentials fail fast without invoking either browser command. `publicDomain`
now accepts the same bare hostname or HTTP(S) origin that `--domain` accepts,
so recording the durable value cannot break the separate `access sync` parser.

- `vitest run --maxWorkers=1`: 829 tests passed across 28 files.

## Final review follow-up

The setup command now records the normalized `publicDomain` in `morpheus.json`
only after the deploy and remote verification succeed. That closes the loop
between the command and the onboarding detector without turning a failed setup
into a durable false record. A failed provider deploy also restores the exact
prior `firebase.json` (or removes the newly created file), so recovery does not
leave an unverified configuration behind.

Status-path network work is bounded: gcloud token reads and Identity Toolkit
requests time out after ten seconds and still return the existing fail-closed
unknown state. Interactive login and provider deployment are intentionally not
given that short status timeout.

The provider-enable question is settled by Firebase's current primary
documentation, not an inferred remote field. The documented `firebase.json`
schema represents Google Sign-In as the `googleSignIn` object and says
`firebase deploy --only auth` enables configured providers; `enabled` belongs
to the remote Identity Platform resource that the command verifies after
deploy. Source:
https://firebase.google.com/docs/auth/configure-providers-cli

- `vitest run --maxWorkers=1`: 833 tests passed across 29 files.
- `tsc --noEmit`, `tsc -p tsconfig.build.json`, `morpheus pm validate`,
  `morpheus pm index --check`, and `git diff --check`: passed.
