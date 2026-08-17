---
date: 2026-08-17
roadmap: MO-26-08-17-15.23.36
agent: claude
---

# Rung 2 reviews once on open, then on request

## What started it

Chris asked why the agent review failed on
[#129](https://github.com/cpheinrich/morpheus/actions/runs/31874925732/job/94989127445), and said
separately that it was reviewing too much.

## The failure is not in this repo, and is worth recording separately

The job failed because the reviewer's **first API request was rejected**: 326 ms, one turn,
`total_cost_usd: 0`, `is_error: true`. Everything upstream worked. The action runs the SDK with
`show_full_output: false`, so the API's own message is redacted and the log reads as though nothing
went wrong.

Every `agent-review` run since **12 Aug 22:36 UTC** has that identical signature. The last real
review was at 22:29 and cost $1.66; `ANTHROPIC_API_KEY` has not changed since 2 Aug, and neither has
the pinned model or action SHA. A key that works at 22:29 and is rejected in 330 ms at 22:36, with
nothing in the repo changing between, is account-side — exhausted credit or a workspace spend limit.
Left with Chris to confirm in the console; I could not, the browser profile is signed out and
signing in is his.

Two things found alongside it and not fixed here:

- Run 31646138935 produced a **complete review** — 51 turns, $3.73 — and the job failed on
  `--max-turns 40`. The cap is a runaway backstop set below the cost of a real review of a large
  pull request, so a big PR pays in full and fails anyway.
- The `delivery` job has been concluding **success** with a warning annotation for every one of
  those failures. That is by design for an advisory rung, and it meant three days of undelivered
  reviews surfaced nowhere anyone looked.

## What was built

Two trigger changes; the reviewer itself is untouched.

**`ci.yml` gates rung 2 on `github.event.action`.** `opened`, `reopened`, `ready_for_review` — not
`synchronize`. `ready_for_review` is not in `pull_request`'s default type list, so the types are now
spelled out, which costs one extra full CI run when a draft is marked ready.

**`agent-review-request.yml` is a new caller on `issue_comment`**, guarded on the comment being on a
pull request, containing `@claude`, and coming from `OWNER`, `MEMBER` or `COLLABORATOR`.

`agent-review.yml` grew a `pr-number` input and a **Resolve the pull request** step to support it.

## Dead ends and things that nearly shipped wrong

**Gating the caller alone would have broken the re-review cursor silently.** The cursor finds the
last reviewed commit by querying the *caller's successful runs* on the branch. That is a stand-in
for "a review happened", and it holds only while the caller reviews every push. With `synchronize`
removed, almost every successful run reviews nothing — so a later `@claude` request would diff
against a run that read nothing, find an empty diff, and skip. The workflow's own comment says both
directions of the cursor's imprecision "err toward reviewing again, which is the safe way round";
change A inverts that without touching the cursor's code.

Considered deleting the cursor outright — under the new trigger every surviving run is one where a
full review is wanted, so it earns nothing here. Kept and scoped to `synchronize` instead, because
this is a *reusable* workflow and a consumer whose caller still runs on every push still needs it.
The change is in the caller; the reusable half has to stay correct for both caller shapes.

**`refs/pull/<n>/head`, not the head sha.** A fork's head commit is reachable from no branch of this
repository, so `actions/checkout` given the bare sha cannot fetch it. The pull ref works for forks
and same-repo branches alike — but it is the *only* ref that checkout then fetches, so
`origin/<base>` does not exist and the diff has nothing to compare against. The `since` step now
fetches the base branch explicitly; a no-op on the `pull_request` path.

**An empty `ref:` is what keeps the `pull_request` path identical.** `actions/checkout` treats an
empty `ref` as unset, so `checkout_ref` is empty on that path and the step behaves exactly as it
always has. This mattered more than it looks: the alternative was two checkout steps with an `if`
on each, which doubles the surface where the two paths can drift.

**`review prompt` reads `GITHUB_HEAD_REF`, which `issue_comment` does not set.** Missed on the first
pass. Without `MORPHEUS_BRANCH`, `currentBranch()` falls through to `git rev-parse --abbrev-ref
HEAD`, which on a detached checkout returns `HEAD` — the roadmap id does not resolve, and the
reviewer gets the persona with no intent. That is a generic "look for bugs" review, which is rung 1
with a model attached, and it would have looked like a working review.

**A closed pull request is skipped rather than reviewed.** `@claude` on a merged PR would otherwise
spend a dollar posting into a thread nobody opens again. Folded into the existing `needed` gate so
it reuses the honest skip summary rather than adding a third skip path.

**An explicit request overrides the cost gate.** `needed()` exists to stop a *trigger* paying to
re-read prose; a request is the judgment that gate approximates, so it wins outright. The cost is
that `@claude` on a records-only PR spends a review — acceptable, since only trusted authors can
send it.

## Verification

`pnpm test` — 878 passing, 12 new. The four new structural guards were each verified by breaking
their subject and watching the test fail, per *a guard is only verified by breaking the thing it
guards*:

| Break | Test that caught it |
|---|---|
| `ref:` removed from the checkout | checks out the pull request's head |
| delivery reads `github.event.pull_request.number` again | reads the payload in one step and nowhere else |
| `ci.yml` reviews on `synchronize` again | reviews when a pull request becomes reviewable |
| author guard relaxed to `!= 'NONE'` | acts only on a comment from someone with repo access |

The `reads the pull request payload in one step and nowhere else` guard is the one worth keeping:
it is structural rather than textual, and the failure it prevents — a step reaching for an empty
payload, checking out trunk, and posting a clean review of the wrong code — is a false negative that
is indistinguishable from a good result.

**Not verified end to end**, and it cannot be from a branch: `issue_comment` workflows run the copy
of the file on the default branch, so `agent-review-request.yml` does nothing until this merges. It
is also untestable while the API key is rejecting every request — the first real proof will be a
`@claude` comment on a pull request after the billing problem is cleared.
