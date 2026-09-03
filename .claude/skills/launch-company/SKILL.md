---
name: launch-company
description: Launch a new Morpheus-managed company or project from domain acquisition through GitHub, Google Cloud/Firebase, Vercel, DNS, and a protected /hq. Use for a full greenfield company setup or when auditing and completing a partially configured launch. Do not invoke for a routine deploy or a single-provider change.
---

# Launch a Morpheus company

Deliver a working public origin and an authenticated `/hq`, not a checklist of
console instructions. Inventory each provider first and resume existing work;
never create a second domain, repository, project, or deployment because a read
failed.

## Establish the contract

Resolve the company name, canonical domain, repository owner/name, Google Cloud
organization and billing account, Vercel scope, DNS account, and employee
allowlist from the request and existing configuration. Prefer a private GitHub
repository unless the user explicitly wants the source public.

Domain purchase, paid-plan changes, and new recurring spend require explicit
authorization immediately before the mutation. A prior request to complete the
whole launch covers ordinary project creation, DNS, deploys, and access grants,
but does not authorize inventing missing legal, tax, payment, or registrar
contact information.

## Provision in dependency order

1. Check domain registration and the DNS zone. Purchase only when requested and
   re-check registration afterward. Keep registrar lock, privacy, and renewal on
   unless the user chose otherwise.
2. Find or create the GitHub repository. Clone or initialize it, then run
   `morpheus init` before writing application code. Follow the generated records,
   claim, branch, PR, and merge lifecycle.
3. Run `morpheus web status`, then `morpheus web init` before hand-writing any
   site or `/hq` files. Pass explicit `--project`, `--domain`, `--account`,
   `--organization`, and `--vercel-team` values on the first provisioned run.
4. Keep one GCP/Firebase project per app. Put it under the intended organization
   folder, attach the chosen billing account, and confirm billing is enabled.
   Treat Firebase `403` for an Owner with no prior Firebase use as a possible
   unaccepted Firebase Terms state before changing IAM.
5. Run `morpheus firebase auth setup --project <id> --domain <origin>` immediately
   after Firebase exists. Enable Google sign-in, authorize the canonical host,
   record the support identity, and verify with `morpheus firebase auth check`.
6. Put employees in `morpheus.json` and run `morpheus access sync`. Verify the
   named account receives the expected custom claim; authentication without the
   claim is not `/hq` access.
7. Link the Vercel project from the repository root. For a monorepo, explicitly
   set its Root Directory to `apps/web`. Connect GitHub, deploy only reviewed
   source, and keep runtime secrets in Vercel's encrypted environment store. If
   a private-repository deployment is blocked because the agent's commit author
   is not a member of the user's Pro team, do not invite the agent team-wide or
   rewrite commit authorship. Deploy through the user's authenticated Vercel CLI
   from a clean source copy that excludes `.git`, `.env*`, private keys, local
   build output, and dependency directories. Record that Git-triggered deploys
   by that author remain blocked; the CLI path is the durable agent workflow.
8. Add the domain in Vercel, apply the exact DNS records it requests through the
   authoritative DNS provider, and wait for both Vercel verification and public
   DNS resolution. Do not replace unrelated records.

## Finish the product surface

Adapt the project-owned brand and copy after the scaffold exists. Preserve the
generated authentication and route-gate boundaries. The public root must work
without authentication; `/hq` must redirect signed-out users, admit only the
declared employee allowlist, and render the default Morpheus dashboard for an
authorized user.

Verify desktop and mobile rendering, production build, public HTTPS, redirect
behavior, Google sign-in, denied unlisted access, and the signed-in `/hq`. A
successful upload or provider API response is delivery evidence, not acceptance.

Record provider identifiers and non-secret operational decisions in the project
manifest or worklog. Never copy credentials into the project repository. Use
the configured secret manager at runtime and keep each provider credential in
its intended store.

## Stopping conditions

Continue through browser-reachable setup yourself. Stop only for a human fact or
gate that cannot be supplied safely—payment details, MFA/password re-verification,
legal identity, or a provider review. Finish every independent step, record the
exact blocked provider state, and provide the account-qualified recovery URL.
