---
date: 2026-08-05
roadmap: MO-26-08-05-16.50.38
outcome: shipped
---

# Closing out the hq/team migration across every repo

Five repos moved today — heinrichbros.com, heinrich.money, heinrich.llc, Evo, Darwin — joining
Lakina and Morpheus. Seven of seven. This entry is about what the sweep taught, not the sweep.

## The compatibility fallback had no test

`LEGACY_INBOX_DIR` and the `hq/inbox` fallback in `inbox validate` shipped yesterday with a manual
check against a scratch repository and **nothing pinning it**. Deleting it today broke no test,
which sounds like a clean removal and is actually the finding: for a day, the branch that kept five
repositories green was unverified by anything that runs.

Manual verification proves the code worked once, on one machine, in one shape. It cannot fail
later. The tests that should have existed are in this PR — written for the behaviour that replaced
the fallback, since that is the behaviour that survives.

## Two guards were keyed on a folder name, in two different repos

Darwin's `displayName()` opened `if (subtree !== "inbox")`, and Morpheus's onboarding detector
filtered `f !== "readme.md"`. Both stop working on a rename and **neither throws**: Darwin renders
`Cpheinrich` where it should render `Christopher`, and Morpheus unticks a setup step. A guard whose
failure mode is silence is worse than one that crashes, and both of these had already been written
about in a comment above themselves.

## grep does not find a moved directory

Three references survived a full-repo grep for `hq/inbox` across this migration:

- Morpheus's onboarding filter, which never mentions a path.
- Darwin's `hq/strategy/operating-principles.md`, which linked to `../inbox/` relatively.
- `hq/README.md` rows in four repos, written as `./inbox` rather than `hq/inbox`.

**A reference to a moved directory does not have to spell the directory's path.** Darwin was the
only repo with a check that *resolves* references against the filesystem rather than
pattern-matching their spelling, and it is the only repo where this would not have shipped broken.
That is an argument for `hq-links.test.ts` becoming a kit thing rather than a Darwin thing.

Then it caught the worklog describing the dead link, because the quoted example was itself a live
markdown link and the test scans `.agent/` too. Green locally only because I had run the suite
before writing the worklog rather than after.

## Two structural gaps the sweep exposed

**Scaffolded projects got less than migrated ones.** `morpheus init` wrote `hq/team/README.md` and
no `meeting-notes/`, so the folder carrying the redaction gate did not exist until somebody
hand-created it — and a gate you meet after hand-creating the directory is a gate you meet after
the first transcript is already committed. `init` now scaffolds it.

**Lakina's independent migration produced no `hq/team/README.md` at all.** Two agents doing the same
migration from the same spec reached different results, which is the argument for the README being
*copied from the scaffold* rather than written each time. Every repo migrated today has byte-identical
`hq/team/README.md`; Lakina is backfilled in this PR.

## The rung-2 review caught the guard I had just weakened

Two findings, both correct, both about the guards rather than the deletion.

**The staleness check no longer covered the class it was written for.** I narrowed it to
`/["']hq\/inbox/` so that honest prose about the old layout would stay green — a real motivation,
and `.agent/decisions.md` now says historical records keep the old paths. But a quote character is
not what code looks like here: the *scaffolded template* case the test's own docstring cites is a
markdown row inside a template literal with no quote at all, and the `RECORDS` regex this very PR
deleted spells the path `hq\/inbox\/`, so re-adding the exact deleted line would have passed.

I had also written in the PR body that the check was "confirmed to still fail on a re-introduced
string literal". Narrowly true, and it implied coverage that was not there. **A regression guard
that reads as covering templates and does not is worse than the exemption it replaced, because the
exemption was at least visible.** Now: strip comments, then look at what remains, in both
spellings — which gets both properties instead of trading one for the other. I had reached for the
first thing that made the suite green rather than the thing that expressed the rule.

**A `hq/team/` that exists and holds nobody exited 0.** `TEAM_RESERVED` filters the README and the
roster out, so a half-migrated repo — team README copied across, inboxes still in `hq/inbox/` —
produced an empty list, printed `No inboxes found.` and passed. That is `.agent/learned.md`
verbatim: *a check that skips what is absent will report an empty thing as correct.* And this PR
made it likelier, because the decisions entry it adds instructs people to copy the scaffold README
in, which is step one of exactly that half-migration. Now exit 1; a project with genuinely no
inbox opts out with an empty `inbox-dir`, which is a decision someone made rather than a silence.

Both fixes verified against all seven repos before merge — evo's local checkout was a commit behind
and failed, which is how I found that a stale working tree now fails honestly rather than quietly.

## Dead end

Considered keeping `LEGACY_INBOX_DIR` "just in case" for a fork whose clone predates the move. Left
in, it becomes the worst kind of compatibility code — silent, untriggered, and read by the next
person as evidence that both layouts are still supported. A fork that has not moved should be told
so.

`isRecordsOnly` lost `hq/inbox/` for the same reason: no repo has that directory, so re-creating one
is a mistake, and exempting it from the roadmap rules would merge the mistake quietly as
"records-only" instead of asking about it.

## One thing worth knowing about the machine

`~/code/cpheinrich.com` is a **stale clone of `heinrich.money`** — the GitHub repo was renamed and
the old checkout still pushes to the new one. It briefly produced a duplicate PR (#24, closed)
against heinrich.money from what looked like a separate project. It is not in
`~/.morpheus/registry.json`, which is correct; the directory on disk is the thing that lies.
