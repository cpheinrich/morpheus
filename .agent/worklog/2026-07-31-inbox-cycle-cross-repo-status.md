# 2026-07-31 — inbox cycle: a cross-repo status, and four questions

Chris came back after two days away and asked for the inbox refreshed: what is done, what stands,
what he owes an answer on. The novel part was that his question spanned repos — Morpheus, Darwin,
Evo, and three retrofits — while the inbox convention is deliberately per-repo.

## What I found

**Morpheus had not moved at all.** The 7/29 night cycle went out and was never replied to — both
`~` slots empty. Nothing merged after #43. So the two open questions were carried verbatim rather
than reworded, which matters: rewording an unanswered question makes it look like a new one and
quietly loses the fact that it has been outstanding for two days.

**Work happened in the sibling repos.** Darwin merged DW-002 on the 30th; Evo shipped EV-004 and
has EV-005 open. Neither is visible from Morpheus's board, which is correct but means Morpheus's
inbox alone is a misleading picture of the week.

**Three retrofit PRs had been green and unmerged since Wednesday** — cpheinrich.com #1,
heinrichbros.com #1, lakina #3, all `MERGEABLE`/`CLEAN`. Morpheus's own rule is that the agent
merges once checks pass, so this is a convention that did not travel into the scaffolded repos, or
did not get followed there. Raised as a question rather than acted on: they are other repos and
other sessions' work, and merging is not reversible from here.

`heinrichbros.com` first reported `mergeable=UNKNOWN` — GitHub computes it lazily. Re-querying once
resolved it to `MERGEABLE`. Worth knowing before reporting a PR as blocked on a conflict it does
not have.

## The six-inbox problem

Reloading state now costs opening six `hq/inbox/cpheinrich.md` files, and two of the six are stale
in a way only their own session can fix — Evo's still asks Chris to merge two PRs that have since
merged. A per-repo inbox stays right (the repo is what makes it reviewable and CI-checkable), but
there is no front door.

Proposed, not built: `morpheus inbox status` walking the registry and printing every open `❗`
across every project with its repo. Asked before building it, because the annoyance is Chris's and
he is the only one who can say whether that shape fixes it.

## Dead end worth recording

I considered folding the other repos' open items into Morpheus's inbox so there was one list. It is
wrong: two agents would then own the same item's state in two files, and git would eventually merge
a status — precisely what one-inbox-per-person-per-repo exists to prevent. The table in item 5
reports the other repos' state as read-only and says out loud which rows I do not own.
