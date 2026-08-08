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

## The distribution premise, and where I looked too narrowly

`.agent/decisions.md` settles runtime distribution as a git dependency, and the stated reason is
that **the repo is public**, so it needs no token. Chris said in session that he intends to revisit
going private, which would invalidate the premise rather than the decision: a private git dependency
needs a credential in every consumer's CI and in Vercel, and `dist/` is gitignored so consumers
build from source on install.

**See the review section below before acting on this.** `MO-26-07-29-012` already covers the ground
and is `dropped` for a reason that anticipates the concern — I reached for `.agent/decisions.md`
without checking whether a roadmap item said the same thing better.

## Review round 1 — three real bugs, and one thing I had missed

The rung-2 reviewer found three defects. All confirmed and fixed; recording them because two are
the same shape.

**The default was the ceiling.** `defaultExpiresInMs` was `14 * DAY`, identical to
`maxExpiresInMs`, so every project inherited the most permissive value by saying nothing. Worse
than it first looks, and the reviewer was more precise about why than I had been: the gate reads
the **role** out of the cookie payload, baked in at mint time, so the window is also how long a
revoked or demoted account keeps working. `verifySessionCookie` is edge-only by design, and
`checkRevoked` needs the Admin SDK, so the edge structurally cannot close that.

The correction I had to accept is that my own `architecture.md` text was wrong:
`revokeRefreshTokens` stops the client minting *new* tokens, ending a renewal loop within about an
hour — it does **not** invalidate an already-issued session cookie, and does nothing at all for a
demotion. I had named it as the mitigation. It is half of one.

Default now five days, with the reasoning in the constant. Renewal means an active session never
reaches it, so the shorter default costs an active user nothing and cuts the stale-authorization
window by two thirds. The reviewer's sharpest line: *the kit ships the half that widens the window
and documents the half that closes it as the consumer's problem — the reverse of the argument this
PR makes everywhere else.* That is right, and the default was where it showed.

**`safeReturnTo` accepted dot-segments.** `/hq/../admin` starts with `/hq/`, passes the prefix
check, and the browser resolves it to `/admin` *after* the function has approved it. It also walked
around `deny`: `/hq/../hq/sign-in` is not string-equal to `/hq/sign-in`, so the one option written
to stop a sign-in loop would have let one through.

**Why the tests read as covering it and did not.** There was a case for `"/hq\\..\\.."` — the
backslash form — which passes because of the backslash guard, on a completely different branch from
the one under test. A test that passes for a reason you did not write, which `.agent/learned.md`
already names. The forward-slash form was never exercised.

Rejected rather than normalised: normalising changes what the caller gets back, and a redirect
target containing `..` is a hand-written URL or an attack, never something a working app produced.
A dot *inside* a segment — `/hq/reports/q3.2026` — still passes, and is now tested.

**`base: "/"` rejected every path.** With a root base the accept test became
`path === "/" || path.startsWith("//")`, and the second can never hold because protocol-relative
paths were already rejected two lines above. So the one project shape the `base` option was
generalised *for* — a whole origin behind the gate — got a `next` parameter that silently did
nothing. No throw, no log. The third instance in this repo's records of a check that admits nothing
reading as correct.

## Review round 1 — the finding I was wrong about

The reviewer pointed out that [`MO-26-07-29-012`](../../hq/product/roadmap/MO-26-07-29-012-make-morpheus-private-adjust.md)
is `status: dropped`, so the board records Morpheus as **staying public** — while my open question
asserted it was about to go private.

Both are true, which is the interesting part. Chris said in session that he intends to revisit it;
the board has not been updated. And the dropped item's stated reason is *exactly* the friction I had
identified independently — sharing without minting PATs — plus three costs I had not: `pm-check`
checks the repo out to build the CLI, reusable workflows need cross-repo access enabled, and Actions
minutes stop being unlimited.

So the right move was not to argue the point but to cite the item. **A record that already
anticipates your concern is worth finding before writing the concern down**, and I had reached for
`.agent/decisions.md` without checking whether a roadmap item covered the same ground.

## Review round 2 — the same defect in a spelling the guard did not recognise

**Percent-encoded dot-segments.** The round-1 fix rejected `.` and `..` as literal strings. WHATWG
does not define them that way: a double-dot segment is `..` **or** a case-insensitive `.%2e`,
`%2e.`, or `%2e%2e`, and a single-dot is `.` or `%2e`. So `/hq/%2e%2e/admin` passed every check and
the browser still resolved it to `/admin` — the identical defect, reached through a spelling the
guard did not know about.

The reviewer flagged honestly that their sandbox had declined `node`, so they could not execute the
check. **Ran it before acting**, which is the right response to a finding offered with its own
caveat:

```
/hq/%2e%2e/admin      -> /admin
/hq/%2E%2E/admin      -> /admin
/hq/.%2e/admin        -> /admin
/hq/%2e./admin        -> /admin
/hq/%2e%2e/hq/sign-in -> /hq/sign-in
/hq/%2ee/x            -> /hq/%2ee/x      ← not a dot-segment
```

Exactly as described. The last line is why the fold folds `%2e` to `.` and then compares the whole
segment, rather than doing a substring replace and a `startsWith` — `%2ee` is a legitimate path
component and an over-eager rewrite would reject it.

**The general lesson, which is the second time this file has recorded it:** a guard written against
the *spelling* of a hostile input rather than against what the consumer of that input actually does
with it will keep being bypassed by a new spelling. The first instance was backslashes, handled in
round 0 by luck rather than design — which is exactly why the round-1 test read as covering
dot-segments when it covered a different branch.

**`base: ""` silently became root.** `opts.base ?? "/hq"` passes an empty string through,
`trimTrailingSlashes("")` returns `"/"`, and the new root special-case then admitted every path. A
misconfiguration turning the narrowing into a no-op, with no throw and no log. `||` closes it. Third
instance in this repo's records of a check that admits nothing — or in this case everything —
reading as correct.

**`gate.ts` referenced an identifier the kit does not export.** Its example read
`request.cookies.get(SESSION_COOKIE_NAME)`, while `HQ_SESSION.cookieName`'s own comment claimed the
gate and the mint cannot disagree. Docstring now uses the exported constant, so the claim is true
rather than aspirational.
