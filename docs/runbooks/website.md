# Building a website, and Firebase Google sign-in

**Read this when** asked for a website, landing page, waitlist, signup or contact form, consumer accounts, the `/hq` dashboard, or right after creating a Firebase project.

## Building a website

**When someone asks for a website — a landing page, email capture, a signup or contact form, or
the internal dashboard — run `morpheus web init` before writing any of it by hand.**

```sh
morpheus web status   # what the surface has, and what it is missing
morpheus web init     # add whatever is missing
```

`web status` and `web init` share layout detection: an existing `apps/web` takes
precedence, followed by a root-level Next.js app, then an established `web/app`
whose `web/package.json` declares Next.js. Missing pieces are added inside the
detected app; a new project still defaults to `apps/web`.

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
prop. A verified Google account on the deployed allowlist receives its `role` claim on first
sign-in; the client refreshes its ID token before the session cookie is created. Run
`morpheus access sync` for prompt bulk grants or revocations when the allowlist changes,
including users who will not sign in again. A removed account's stale claim is also cleared
on its next sign-in.

### HQ rendering contract

Treat repository content as a deployment input. Read and parse `hq/`, `docs/`, and other approved
content roots only while building; use `generateStaticParams` for repository-backed dynamic paths.
Do not put `cookies()`, `headers()`, Firestore reads, or repository filesystem calls in shared HQ
layouts. The generated starter follows this rule: the proxy protects its static overview and
search index, while sign-in and action routes remain dynamic.

Shared static HTML may contain only material available to every role the proxy admits. Identity,
account and portfolio data belong in an explicit dynamic route or client island whose endpoint
re-verifies the session and authorization and returns `Cache-Control: private, no-store`. Keep
private immutable artifacts behind their existing authorized, digest-verified loader unless their
exact bytes become declared reproducible build inputs; do not give builds production bucket access
to chase a static-route label.

Before release, inspect the framework's built route inventory and runtime trace files rather than
inferring static behavior from source. Assert that every expected content slug was prerendered,
ordinary HQ routes are static, dynamic routes are declared with a rationale, and no runtime bundle
traces Markdown anywhere in the repository outside dependency trees. Attribute a concrete
prerender entry to its `srcRoute`: a
catch-all can emit the same URL as an explicit live page without making that live page static.
require every repository-backed route's prerender entry to set `initialRevalidateSeconds: false`;
an ISR entry is present in the same manifest but may re-run its repository loader after expiry. Then
verify that a Markdown-only commit triggers deployment and that pages and the search index report
one source commit. Set response-size budgets separately: a large
static page is still expensive for the browser.

New Morpheus web apps run `scripts/check-hq-build.mjs` from `postbuild` with `/hq`, no-access and
the protected search index declared static and no dynamic HQ routes. Extend its contract as routes
are added. On an existing app, `morpheus web init` writes the checker but deliberately does not
change an established `postbuild`; classify the current routes first, then add the checker command.

Lakina's production migration established that the authenticated proxy and Vercel's prerender cache
compose correctly: protected static pages returned `x-vercel-cache: HIT` after the proxy admitted a
valid session. Median response time fell from 328–453 ms to 85–113 ms across Product, Research,
Library and Inbox. The overview and Portfolio routes deliberately remained live cache misses because
they include current portfolio data; their smaller 40% and 23% improvements are the expected
separate optimization surface. Do not make an otherwise static page dynamic merely because one
small panel is live—prefer a client island or a narrow endpoint when the UX permits it.

#### Migrating an existing HQ

1. Inventory every `/hq` route and classify it as repository content, shared shell, identity/live
   data, an action, or an immutable external artifact. Record the reason for each dynamic route.
2. Remove identity and preference reads from shared layouts. Keep the proxy as the HTML gate and
   make presentation preferences local (a cookie is sufficient when cross-device synchronization
   is not a product requirement).
3. Build one validated catalogue during deployment. Enumerate repository routes with
   `generateStaticParams`; emit only the small metadata, per-route payload, and narrow dynamic
   fragments each consumer needs.
4. Keep live routes and private artifact loaders dynamic. Re-authorize at their data boundary and
   return private, non-cacheable responses.
5. Add a postbuild contract over the framework manifests and function traces: expected static
   slugs, an allowlist of dynamic routes with rationales, zero repository Markdown source in
   dynamic traces, and response-size budgets for large indexes and archive pages.
6. Deploy one project normally, verify the exact source SHA, signed-in and signed-out behavior,
   cookie preference, live fields and representative content, then compare repeated production
   samples before applying the same contract to the next repository.

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
