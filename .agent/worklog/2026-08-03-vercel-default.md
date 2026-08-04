# 2026-08-03 — making Vercel an actual default

MO-26-08-03-13.58.45

## How it came up

Scaffolding Heinrich LLC. I asked Chris where the one-page site should deploy and offered
Cloudflare Pages as an option, on the reasoning that Lakina had already gone that way for an
identical site. His answer: *"you should always use Vercel! That is the Morpheus default. If its
unclear from Morpheus docs make it clear!!!"*

Worth noting that I had read §10.2 before asking. The section did not stop me offering the
alternative — which is the actual finding.

## What was wrong

Not the strength of the wording. The **shape of the argument**.

§10.2 justifies Vercel entirely through `/hq` dashboards, auth middleware and Vercel Comments. All
true, all specific to projects that have those things. A one-page marketing site therefore reads
as outside the case being made, and the reader concludes — correctly, from the premises given —
that the section does not apply to them.

Two of the three projects to hit that fork went the other way. Lakina wrote the deviation out in
full, and it is a *good* deviation: honest, specific, and it names the cost it accepted (no server
runtime, so `/hq` cannot be gated by edge middleware). That is what makes it useful evidence.
Nobody was being sloppy; the spec had a hole exactly where small projects live.

## Why "say it louder" would not have worked

My first instinct was a bold sentence at the top of §10.2 and nothing else. That fails, because
the local reasoning is not a mistake to be overruled — every sentence of it is true. An agent that
believes true things and reaches the wrong conclusion needs the missing premise, not a firmer
assertion.

So the subsection quotes the reasoning verbatim, concedes it, and adds the three things invisible
from inside a single project:

- **Uniformity is the product**, and it is worth *more* on trivial projects, not less, because
  nobody will remember the exception.
- **"It is only one page" is a claim about today.** Sites grow a contact form, then a route
  handler, then `/hq`.
- **The marginal account is not the cost it looks like.** Vercel is already in the stack; the
  eleventh project is not "one more provider", and declining is what creates a second deployment
  story.

Then a testable bar: *a deviation needs a reason the next project would not also have.* "Small
site" fails it by describing most projects.

## Also fixed

- **The §9 service table** said *"§10.2 — decided on the review loop"*, which repeats the framing
  that invites the exception. Now says every size, and names Cloudflare Pages as the thing it is
  not — because that is the specific alternative that keeps winning.
- **The reconsider line** at the end of §10.2 now says its conditions are reasons to change the
  default for everything, in this file. As written it read as a general licence to re-litigate.

## Deliberately not done

**Lakina's deviation is untouched.** Whether to migrate that site is Chris's call and a cost/benefit
question about a working deployment. Deciding it by editing a spec would be exactly the kind of
quiet action this file exists to catch.

## Generalisable

Every deviation in every project is a bug report against `architecture.md`. Two projects filing
the *same* deviation is the spec being wrong, not two projects being wrong — and the second one is
the signal worth acting on. Worth reading the deviation lists periodically rather than only when
someone shouts.
