---
roadmap: MO-26-08-07-20.10.23
---

# 2026-08-07 — Session cookies: the mint half of `morpheus-kit/hq`

## What the gap actually was

The kit had the **read** half of the `/hq` session and none of the **write** half.
`verifySessionCookie` is careful and well-commented — it even warns that session cookies use a
different key set and issuer than ID tokens, which is the trap on that side. But nothing in the kit
ever *minted* a session cookie, so a project reaching for one found a verifier with no counterpart.

`cpheinrich.com` did what that shape invites: it stored the raw **ID token** as its session cookie.
Google fixes those at one hour, so the site asked for Google again on nearly every visit.

**The failure worth recording is the fix that does not work.** Raising the cookie's `maxAge` is the
obvious move and changes nothing: the cookie outlives the token inside it, `jwtVerify` rejects on
`exp`, and the login page returns on exactly the same schedule. The change ships, looks right, and
the symptom is unchanged. `architecture.md` now says this in the section where someone would look.

## Design decisions

**`createHqSessionCookie` takes the Admin `Auth` as a parameter and imports nothing.** Reusing
`gate.ts`'s own argument: the kit refuses to depend on Next because that would pin every consumer to
one framework to reuse forty lines. `firebase-admin` is a stronger version of the same problem — it
is Node-only, and the kit is imported by edge middleware. The Admin call is three lines. The policy
around it is the shareable part, so that is what shipped. There is a test asserting the module never
imports `firebase-admin`, because this is the kind of constraint that erodes silently.

**`clampExpiresIn` clamps rather than throws.** A project asking for 30 days has made a reasonable
request against an unreasonable API limit. Throwing turns a constant into a broken sign-in at the
worst possible moment; clamping gives them 14 days and `renewalDue` keeps it alive indefinitely.

**Renewal is the mechanism, not duration.** Two weeks is Firebase's ceiling per mint and cannot be
raised, so a literal 30-day session is not available at all. What is available is re-minting on use,
which makes the ceiling irrelevant for anyone who visits weekly. `renewalDue` reads `iat`/`exp` off
the payload the gate already verified — deliberately no second store, because a renewal clock that
disagrees with the cookie is worse than no renewal.

**`renewalDue` returns false on an unreadable window.** An absent `iat` is not evidence that renewal
is due, and treating it as such would re-mint on every request — a sign-in storm from a missing
claim.

**`sameSite: "lax"`, not `"strict"`.** `strict` withholds the cookie on the return navigation from
Google, so the visitor arrives signed in and reads as signed out. This is a one-word difference with
a symptom nobody would connect to it.

## `safeReturnTo`, and why it belongs upstream

`gate.ts`'s example writes `next` from `request.nextUrl.pathname` — safe. The **read** side is not
shown and was not shipped, so every project writes its own, and `raw.startsWith("/")` is the version
most people write. That admits `//evil.example`: an open redirect on the one route in the product
that exists to be trusted. A gate that emits a redirect parameter and ships no narrowing for it is
an incomplete gate.

The implementation came from `cpheinrich.com`, generalised with `base`/`fallback`/`deny` so it is
not `/hq`-specific.

## Two mistakes worth recording

**A regex that would have rejected every path with a hyphen.** The control-character class was first
written with literal characters, which render in a file as something that looks like `[ - ]` — a
class matching space *or hyphen*. Every roadmap path contains hyphens. Caught before it ran, rewritten
with escapes, and the comment now says why the escapes are deliberate. **Literal control characters
in source are unreadable and unreviewable.**

**An `eslint-disable` for a rule that does not fire.** Added `no-control-regex` suppression by
reflex; with escaped ranges the rule has nothing to complain about. Removed — a suppression for a
rule that is not firing is a comment that lies about the code.

## Pre-existing: `pnpm lint` cannot run

`eslint` is not in `devDependencies`, so `pnpm lint` fails with `command not found` on a clean
checkout of `main`. It is not caught because `node-ci.yml` defaults `run-lint: false` and `ci.yml`
does not set it, so lint has never run in CI here.

Not fixed in this change — it is unrelated to the session work and would bury it — but it means the
lint script in `AGENTS.md`'s command list does not work as documented. Filed as an observation
rather than silently worked around.

## Not done

- **`morpheus hq session revoke <email>`**, wrapping `revokeRefreshTokens`. Longer sessions make
  this matter more, and it is the lever you want built before an incident rather than during one.
- **The client refresh component.** Documented as a convention in `architecture.md` instead: the kit
  stays framework-free, and a React component would be the first crack in that.
- **Adopting any of this in `cpheinrich.com`.** Separate work in that repo, and it needs a
  service-account key first — a real change to a project that currently advertises having no
  secrets.

## The distribution premise has quietly expired

`.agent/decisions.md` settles runtime distribution as a git dependency, and the stated reason is
that **the repo is public**, so it needs no token. Chris plans to make Morpheus private within days.
That invalidates the premise rather than the decision: a private git dependency needs a credential
in every consumer's CI and in Vercel, and `dist/` is gitignored so consumers build from source on
install.

Raised in the linked issue. Not decided here, because it is a judgment call about access rather than
a technical one.
