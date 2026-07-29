---
date: 2026-07-29
agent: claude
outcome: shipped
summary: Firebase Auth with Google sign-in on Evo, plus access-as-code custom claims tooling.
---

## Built

`morpheus access sync` — reads the allowlist from `morpheus.json` and applies Firebase custom
claims via the Identity Toolkit REST API. Access becomes a pull request rather than a console
click, and the same `role` claim gates both the Next.js middleware and Firestore rules.

Deliberately uses a gcloud access token rather than a service-account key: the org enforces
`disableServiceAccountKeyCreation`, and a key on disk would be a credential to protect for no
benefit.

**Revocation is included, not just granting.** Anyone holding a role who is no longer in the
allowlist has it stripped. Without that half, the allowlist is merely additive and drifts into
being a record of everyone ever granted access.

## The behaviour that matters

**A Firebase Auth user does not exist until their first sign-in**, so a freshly-listed person
cannot be granted a claim yet. `sync` reports them as `pending` rather than failing, and
re-running after they sign in completes the grant. That makes it safe to run on every deploy,
which is what keeps the allowlist authoritative rather than a thing someone remembers to apply.

## Note

Identity Platform (GCIP) requires billing; classic Firebase Auth does not. `initializeAuth`
returns `BILLING_NOT_ENABLED` — the right move on Spark is to enable providers through the
console, not to upgrade. Provider enablement has no public API on Spark, which is a genuine
gap rather than something I failed to find.
