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

## Review round 3 — three "take or leave" items, all taken

The reviewer had nothing left to hold the merge for, and offered three smaller notes. All three
made the code match reasoning already committed to elsewhere in the change, so leaving them would
have meant shipping a comment that argues for something the code below it does not do.

**`base: "//"` reached root the way `""` used to.** `||` closed the empty-string spelling; a run of
separators strips to `""` inside `trimTrailingSlashes` and arrives at the same place. Now an
explicit `isEmptyBase`.

**`deny` was exact-match while its purpose implied a subtree.** `/hq/sign-in` did not cover
`/hq/sign-in/verify`, which bounces identically. Made subtree-matching, with the separator still
required so `/hq/sign-in-help` is unaffected, and the JSDoc now says which it is.

**`clampExpiresIn(Infinity)` returned the default rather than the ceiling.** `Infinity` from a
caller means "as long as you will give me", and the clamp already answers that correctly; only
`NaN` is genuinely unspecified. `Number.isFinite` conflated them.

## The regression my own test caught

Fixing the `"//"` case, I wrote `isEmptyBase` as "strip all slashes, is it empty" — which classifies
`"/"` as empty too. That silently removed root-base support, the thing round 1 had *added*, and the
round-1 test failed immediately.

Worth recording because the two values look like the same thing and are not: `"/"` is the deliberate
value a project passes when its whole origin sits behind the gate; `""` and `"//"` are typos.
A guard against misconfiguration has to name the misconfigurations rather than describe them by a
property the legitimate value also has.

The test suite caught it in one run, which is the argument for having written the root-base case as
a test in round 1 rather than checking it by hand.

## Review round 4 — the documented call shape did not work

The headline example had been in the PR since the first commit, and **four rounds of review read
past it**, mine included.

```ts
response.cookies.set(cookie, hqSessionCookieOptions({ expiresInMs }));   // wrong
```

Next's `ResponseCookies.set` has two overloads and this matches neither. The two-argument form is
`(name, value)`, so it passes the session JWT as the cookie *name*. Verified against the real
implementation rather than the type signature:

```
two-arg (name,value): "session-jwt-here=%5Bobject%20Object%5D; Path=/"
object form:          "hq_session=session-jwt-here; Path=/; Max-Age=100; Secure; HttpOnly; SameSite=lax"
```

TypeScript would reject it in a consumer's build, so it was friction rather than a shipped bug — but
§11.1 says "the three lines are not the valuable part," and these were the three lines. A snippet
that does not compile teaches nothing about the shape that does.

Two changes rather than one. The doc now uses the object form, **and** `createHqSessionCookie`
returns `value` rather than `cookie`. The rename is the actual fix: `{ cookie }` reads as "the
cookie", which is what invited `set(cookie, options)`, when it is the cookie's *value*.
`HqCookieOptions` is `ResponseCookie` minus exactly that field, so `{ ...options, value }` spreads
into the working call and the correct shape becomes self-evident rather than documented.

**Nothing tests this and nothing can** — it is a doc snippet against a dependency the kit does not
take. That is an argument for getting it right, not for adding a test.

## Round 4 — the third spelling of the base misconfiguration

`base: "hq"` — no leading slash — survived `isEmptyBase`, matched no path, and sent every
destination to `fallback`, which defaults to `base`. So the fallback was a **relative** URL:
`new URL("hq", "https://site/hq/product/")` resolves to `/hq/hq`. Silent, and the worst of the
three.

Three rounds of "here is another spelling" is the signal. The guard is now stated **positively** —
`/^\/(?!\/)/`, exactly one leading separator — which admits `"/"` and `"/hq"` and rejects `""`,
`"//"`, `"hq"` and `" /hq"` together.

That is the same lesson round 3 recorded and did not fully apply: **describing the bad values keeps
missing one; describing the good one is finite.** Round 3 named three bad spellings where it should
have named the single good shape, and round 4 found the fourth. The rule generalises past this
function — the dot-segment guard is the same story, where round 1 matched two literal spellings and
round 2 found four more the spec defines.

## Review round 5 — the same gap, one function over

`createHqSessionCookie` got the working call shape in round 4; `hqSessionClearOptions` is the only
other producer of `HqCookieOptions` and did not. The natural
`response.cookies.set(hqSessionClearOptions())` fails to typecheck for exactly the reason the mint's
did — `ResponseCookie` requires `value`, which `HqCookieOptions` omits on purpose.

Worth taking because of *where* it lands: a consumer who hits the type error and guesses reaches for
`cookies.delete("hq_session")`, which reintroduces the hardcoded name `HQ_SESSION.cookieName` exists
to prevent — on the sign-out path, where a name disagreeing with the gate's leaves the visitor
signed in.

Fixing a call shape in one place and not its counterpart is its own small version of the pattern
this PR keeps finding: the fix was applied where the defect was reported rather than where the
defect *is*.

## Two findings deliberately left, and why

- **`deny: ["/"]` denies only the literal `/`** — structurally the same as the root-base bug from
  round 1, in the sibling branch. Left because `deny: ["/"]` means "deny everything", which is not
  something a deny list is asked to express, so unlike `base: "/"` there is no legitimate caller
  behind it. A guard with no caller is speculative.
- **`base: "/hq "` — trailing space** — passes the leading-separator check, matches no path, and
  returns as a fallback with a space in it. Left because a `base` is a developer literal in a config
  object rather than user input, and at some point the guard is chasing typos the type system cannot
  see either. Recorded so it is not rediscovered as a sixth round.

Both are the reviewer's calls and both are right. Worth noting that "which spellings actually have a
caller" is the question that stops the describe-the-good-shape lesson from turning into infinite
validation.
