# Building a website, and Firebase Google sign-in

**Read this when** asked for a website, landing page, waitlist, signup or contact form, consumer accounts, the `/hq` dashboard, or right after creating a Firebase project.

## Building a website

**When someone asks for a website — a landing page, email capture, a signup or contact form, or
the internal dashboard — run `morpheus web init` before writing any of it by hand.**

```sh
morpheus web status   # what the surface has, and what it is missing
morpheus web init     # add whatever is missing
```

It does the half `morpheus init` deliberately does not: it provisions the GCP project, Firebase,
Firestore (`nam5`), the registered web app, and the Workload Identity a Vercel deployment
authenticates as — then scaffolds the code that depends on those. A Next.js app when there is
none, **email waitlist capture**, and **`/hq` behind Google sign-in**, gated on the same `role`
custom claim that Firestore rules read.

Scaffolded projects carry this as the `website-init` skill, so an agent finds it at the moment it
is needed rather than by going looking for a CLI it has never run.

**It never overwrites**, the same contract as `init` — every existing file is skipped and
reported, which is what makes "create the website" and "add the missing half to a live site" one
command. It will not edit a working home page; it tells you where to render the form instead.
Three files are *merged* rather than skipped, because skipping them would leave the generated code
unable to resolve: the app's `package.json` dependencies, the shared package's `exports` map, and
the Firestore rules — and the rules block is inserted only above an anchor the tool can actually
find, never at a guessed position.

**The Firebase-dependent half is written only when a Firebase project is real.** With
`--no-provision`, or when provisioning is blocked, the waitlist and `/hq` are skipped and reported
rather than written against placeholder configuration. A sign-in page holding a placeholder
`firebaseConfig` looks finished and cannot work, which is the failure shape `learned.md` records
four times over.

Afterwards: `pnpm install`, render `<WaitlistForm source="hero" />` on the page, add a
`waitlist_joined` event to the project's analytics contract and pass it to the form's `onJoined`
prop, then `morpheus access sync` so the allowlist becomes the `role` claim. Until that sync runs,
a signed-in account has no role and `/hq` refuses it — the gate working, not a broken sign-in.

**When a project wants people to sign themselves up, run `morpheus web add-consumer-auth`** — do
not hand-build Firebase auth. It extends `web init` with what Evo shipped and hardened
(cpheinrich/morpheus#135): a second Firebase project for staging with **staging as the default**
(only a Vercel Production build reaches production data), the auth plumbing whose review findings
are already encoded (login CSRF, the enumeration-oracle-proof reset route, the backslash open
redirect, the cross-device verification remint), starter sign-in/sign-up/reset/action pages, and
**three test suites that run against the Firebase emulators with no secrets** — wired into CI via
the reusable `firebase-tests.yml`. `--check` reports drift between a project's shared auth files
and the current templates. The console half — providers, authorized domains, the service-account
key scoped to Vercel Preview *only*, mail keys, the staging domain — is
[`consumer-auth.md`](consumer-auth.md).

`--no-provision` skips the cloud entirely; the provisioning half is what makes `web init` a
context-gated command, and the scaffolding half is not gated at all.

## Firebase Google sign-in bootstrap

**Do not call Firebase-ready just because the project, SDK config, or Auth tab exists.** Immediately
after an agent creates a Firebase project for a web/HQ surface, run:

```sh
morpheus firebase auth setup --project <firebase-project> --domain <public-origin>
```

The command writes the Google-provider configuration into `firebase.json`, deploys it with the
Firebase CLI, adds the app's authorized domain through the Firebase API, and verifies both remote
facts. It first tries the existing `gcloud` and Firebase CLI sessions. If either needs an interactive
Google authorization, the CLI launches its browser flow; if a Firebase consent/ToS screen still
blocks deployment, it opens Firebase Authentication and fails with the exact recovery step. Use
`morpheus firebase auth check` in a later session or CI to fail closed rather than rediscovering a
disabled provider or missing custom domain from a spinning sign-in screen. Successful setup records
the normalized origin and user-visible OAuth support identity as `publicDomain` and `supportEmail`
in `morpheus.json`; pass `--domain` explicitly on the first run. The check refuses to call an app
ready when it cannot determine that origin. Declare legitimate preview or secondary Auth hosts in
`authorizedDomains` as bare hostnames; the command reports any other remote domains for manual
review instead of silently retaining or automatically revoking them.
