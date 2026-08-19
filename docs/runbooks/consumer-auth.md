# Consumer auth — the console half

`morpheus web add-consumer-auth` writes the code; this runbook is everything a human does in
consoles the CLI cannot (or should not) reach. It was written by doing it once, on Evo
(darwin-health/evo#58, cpheinrich/morpheus#135) — every trap below was hit there, not predicted.

Order matters only where a step says so. Nothing here needs to happen before the scaffold runs;
plenty of it needs to happen before real mail moves.

## 1. The staging Firebase project

The scaffold can provision it (`gcloud` + the Firebase Management API), or create it by hand at
`console.firebase.google.com` — either way:

- **Id:** ids are globally unique across all of GCP, so the convention is `<prod-id>-staging`
  (`cph-evo` → `cph-evo-staging`). Record the pair in `morpheus.json` as
  `accounts.gcpProjectStaging` / `accounts.firebaseStaging`, and the staging origin as
  `stagingDomain`.
- **Firestore location: `nam5`.** REQUIRED, and **permanent** — it cannot be changed after
  creation, and a staging project in a different region than production is a permanent source of
  "works on staging" timing differences. (§13.2, and the decisions record.)
- **Spark plan.** No billing account. The whole design — profile provisioning from routes rather
  than `onCreate` triggers, Firestore over REST — assumes no Cloud Functions, so there is nothing
  on the staging project that needs Blaze.
- Append `?authuser=<email>` to every console link you share or bookmark, per house rule.

## 2. Auth providers, on BOTH projects

Console → Authentication → Sign-in method, once per project:

- **Email/Password** — enabled. Leave *email enumeration protection* on (it is the default on new
  projects); the scaffolded error copy and the constant-answer reset route are written for it.
- **Google** — enabled, with the support email set. `morpheus firebase auth setup` automates the
  Google half and verifies it; run it once per project id.

A provider enabled on production and forgotten on staging fails only when someone tests the flow
staging exists for — the failure names the provider, but only after a person is mid-sign-in.

## 3. Authorized domains, on BOTH projects

Authentication → Settings → Authorized domains. Each project needs the domains that will actually
open its popups: production gets the apex domain; staging gets the staging domain; both keep
`localhost`. Vercel's generated preview URLs **cannot be covered by a wildcard** — Firebase does
not accept one — so Google sign-in on an arbitrary `*.vercel.app` preview fails with
`auth/unauthorized-domain`. The scaffolded error copy names the cause; testing sign-in on previews
is what the staging domain is for.

## 4. The service-account key — Vercel **Preview only**

Staging deployments authenticate the Admin SDK with a service-account key
(`FIREBASE_SERVICE_ACCOUNT`, the whole JSON blob), because Workload Identity Federation is
configured for the production project only. Create the key on the **staging** project (IAM →
Service Accounts → its `firebase-adminsdk` account → Keys), grant the account
`roles/datastore.user` (the Firestore REST writes need it; a missing grant surfaces as a 403 on
the first write and nowhere earlier), and paste it into Vercel as an environment variable scoped
to **Preview. Only Preview.**

**The trap:** the credential chain prefers an explicit key over federation everywhere. Scoped to
Production as well, the key silently reroutes every production server-side call to the staging
project — sign-in works, writes land in staging, and nothing errors. The scaffolded
`credentialStrategy` refuses the *opposite* mistake (a staging build with no key falling back to
production's federation), but it cannot see this one: a key in the environment looks exactly like
the configuration it is.

## 5. Transactional mail

The scaffolded mail path sits behind one `deliver()` seam and ships with a Resend
implementation, because that is what Evo built and verified end to end. **Note the standing
canon:** §6 names Cloudflare Email Sending as the canonical transactional provider, so treat
Resend here as the extracted-and-working implementation, record it as a `deviations` entry if you
keep it, and know that swapping providers is one new `deliver()` and no other change.

For Resend specifically:

1. Verify the sending domain in Resend. The DNS records go on the domain's **actual DNS host** —
   Cloudflare, per §6.1, wherever the site itself is hosted. Wait for verification before
   trusting a green "sent".
2. Mint **two API keys**, scoped like the deployments that hold them: one in Vercel's Preview
   environment, one in Production. One shared key means a leaked preview is a production incident.
3. Set the from-address variable (`<NAME>_MAIL_FROM`) if the default
   `Display Name <noreply@domain>` is not right.

Without a key, deployments log redacted metadata and send nothing (deliberately — a preview
without a key is exactly where an action link would otherwise land in shared logs), and local dev
prints the action link to the console, which is the whole local flow. **Do the mail setup before
telling anyone to sign up:** accounts created meanwhile still work, but their verification mail
silently does not go out.

## 6. The staging domain, on the same Vercel project

- DNS at Cloudflare (§6.1): `staging.<domain>` as an unproxied CNAME to Vercel.
- In Vercel, add the domain to the **same project**, assigned to a non-production branch
  (a long-lived `staging` branch is the usual shape). Same build, second domain, staging Firebase
  — that is the whole trick, `resolveEnvironment()` does the rest.
- **Deployment protection:** Vercel's *Standard Protection* covers preview deployments **including
  their custom domains**, and the `all_except_custom_domains` setting exempts only *production*
  custom domains. Emailed action links must open on the staging domain with no Vercel
  authentication in front of them — a protected staging domain turns every verification link into
  an SSO wall. Either exempt the staging domain or turn protection off for the project,
  deliberately, and note that Vercel's automatic `noindex` on protected previews goes with it —
  which is why the scaffold tells you to send the `X-Robots-Tag` header for the staging host
  yourself.

## 7. Traps, all field-verified

- **`EMAIL_TEMPLATE_UPDATE_NOT_ALLOWED`.** Firebase refuses to point its email templates at your
  own action URL — on years-old and hours-old projects alike — and the console hides it: the
  Templates screen says only "an error occurred". Do not spend time on that screen. The scaffold's
  whole mail-your-own-links design exists because of this; there is nothing to configure. The
  general lesson travels: **when a Google console reports a bare "an error occurred", re-issue the
  same write against the underlying API before believing anything about the cause.**
- **`TOO_MANY_ATTEMPTS`.** Firebase rate-limits action-code *generation* per account,
  aggressively — a resend clicked seconds after sign-up's automatic send trips it, and it arrives
  as `auth/internal-error` with the real code buried in the message. The scaffolded routes map it
  to "a link was sent moments ago"; when testing by hand, wait a minute rather than retrying into
  the limit.
- **Gmail dot and plus aliases are distinct Firebase accounts sharing one inbox.** `chris@` and
  `ch.ris@` are two uids whose mail lands in one mailbox — confusing when debugging ("which
  account does this link verify?"), and genuinely useful for testing: one real inbox can hold as
  many test accounts as you need.
- **An unknown address is `auth/internal-error`, not `auth/user-not-found`.** Enumeration
  protection means Firebase will not tell the Admin SDK either, so "no such user" and "Firebase is
  broken" are one code in the logs. The reset route's log line is not an alerting signal — it
  fires on ordinary typos.
- **Generating an action code revokes the previous one of its type.** A build that generates and
  then fails to send does not merely lose the new link — it kills the one already in the person's
  inbox. The scaffold checks deliverability first (`canDeliver()`); keep it that way when editing.

## 8. Afterwards

- `morpheus access sync` — unchanged by any of this; consumer accounts hold no role at all.
- Walk the golden path against the real staging project once, then delete the test accounts:
  sign-up → automatic mail → verify link → display name saves; password reset end to end (old
  password dies, new one works); `/hq` as a consumer answers 404 — never a sign-in wall, so the
  internal surface's existence is not advertised; sign-out clears both cookies.
- The same paths run continuously and credential-free in CI — the scaffold wires
  `firebase-tests.yml` — so the manual pass is for the console configuration above, not the code.
