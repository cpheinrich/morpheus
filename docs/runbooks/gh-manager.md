# GitHub Manager

A scheduled agent that keeps pull requests from piling up. It sweeps a repository's open pull
requests, merges what is ready, and for the ones that stalled it reads the reviews already done,
conducts one more if needed, fixes its own findings in the same session, and lands the result.

It exists because the author-managed review loop has one failure it cannot recover from: the
authoring session ends before the loop does. On 2026-10-01 Evo, Lakina and Morpheus had 20 open
pull requests between them and 13 failed `pr / conventions`, mostly for a review that was never
finished. Nothing was listening.

## What it does to a pull request

Every run starts with a sweep that uses no model. Each open pull request gets one route:

| Route | When | What happens |
|---|---|---|
| `merge` | Reviewed, checks green, auto-merge never enabled | Auto-merge is switched on; cancelled checks are rerun. No session. |
| `merge` (update) | Auto-merge is on but strict protection holds the branch behind its base | The base is merged in with GitHub's `update-branch`, guarded on the current head. No session. |
| `session` | Anything that needs judgment: no completed review, failing checks, conflicts, an abandoned draft | One fresh Claude session (below). |
| `close` | A stale warning's grace period ran out | Closed with a comment. The branch is left in place. |
| `escalate` | The attempt budget is spent | Labelled `manager:needs-human`. |
| `skip` | Recently active, already queued, a bot lane, an untrusted author, already escalated or marked incomplete | Reported in the digest, not touched. |

A session ends in one of five decisions:

- **merge** — on the author's review if it is complete and valid, otherwise on the manager's own.
- **incomplete** — a draft that has not done what its roadmap item defines. Labelled
  `manager:incomplete` with what is missing. The manager lands finished work; it does not finish
  features.
- **close** — other merged work made it obsolete. Closed at once when the session names the merged
  pull request that replaced it and that is verified; otherwise labelled `manager:stale` and closed
  after `closeGraceDays` unless it gets a push or someone removes the label.
- **escalate** — a human has to decide something. Labelled `manager:needs-human`.
- **wait** — nothing to do yet.

### Cooldowns

The manager does not touch a branch its author may still be driving. A ready pull request is left
alone until `quietHours` (default 8) after the later of its head commit and the time it was opened. A draft gets `draftQuietHours`
(default 48): only after that long untouched is it presumed abandoned and checked for completeness.

## The manager review

The ordinary contract ([independent-review.md](independent-review.md)) has an author who launches a
reviewer and answers it. The manager is a fresh session that did not write the change, so it may
review it — and because the author is gone, it fixes what it finds itself. **Those fixes are
reviewed by nobody else.** That is the deliberate trade (Chris, 2026-10-01), and these are what
bound it:

- The record names every finding, and `check pr` refuses a fix commit that touches a path no fixed
  finding names. The manager cannot quietly change something it did not report.
- Every non-incidental finding must be `fixed`. There is no deferral and no dispute: the manager
  fixes it or escalates.
- It cannot clear a change to policy the project is operated by — `AGENTS.md`, `CLAUDE.md`,
  `morpheus.json`, `.github/`, `.ci/`, `.morpheus/` — or to a path in the project's
  `protectedPaths`. Those need the ordinary review or a human.
- The record is a file on the branch, so anyone who can push can write one. Two things only the
  App can produce make it count, and `pr-check.yml` reads both:
  - the `manager-reviewed` label must have been applied by `morpheus-gh-manager[bot]` (from the
    issue events), and the App removes and re-applies it at every clearance;
  - the App's own comment names the **head it cleared**. Nothing may follow that head except
    merges of trunk that Git reproduces exactly. Without this an author could wait for the label,
    push more code, and extend the record to cover it.
- CI and branch protection are untouched. The manager enables auto-merge; it never merges past a
  required check and never uses `--admin`.
- The check reports the exception every time it is used: `~ [agent-review] cleared by the GitHub
  Manager (...)`.

The record is one `morpheus-manager-review` JSON fence in the pull request's worklog, linked from
the body by a visible `manager-review-record: .agent/worklog/<file>.md` line:

```json
{
  "version": 1,
  "managerSession": "<operations run URL> (pull request N)",
  "reviewed": "<head the manager reviewed>",
  "covered": "<last commit of its own fixes>",
  "priorReview": { "state": "none | complete | stalled | exhausted | invalid", "note": "..." },
  "findings": [
    { "id": "M01", "severity": "minor | substantive | incidental", "description": "...",
      "paths": ["..."], "disposition": "fixed | noted", "response": "..." }
  ],
  "outcome": "cleared",
  "summary": "..."
}
```

After `covered`, only the worklog and trunk merges may follow, exactly as for an ordinary record.
An existing `morpheus-review` record is left as it is; it is the history the manager read.

## Security model

Three jobs, three tokens (`.github/workflows/gh-manager.yml`):

| Job | Token | Model |
|---|---|---|
| `sweep` | Read only | None |
| `session` | Contents write, everything else read. Cannot label, comment, close, or change a workflow file. | Claude, on the subscription token |
| `apply` | Write | None. Runs on a fresh runner the session never touched. |

A session can only *ask*, by writing a decision file. `apply` checks each decision against live
state, the repository's policy, and a full checkout of the target before acting:

- the head must not have moved since the session finished;
- a merge on the **author's** review requires that the session pushed nothing but exact trunk
  merges, verified with Git, not taken from the decision file;
- a merge on the **manager's** review requires that its record validates with the same code
  `check pr` runs, and that the pull request touches no human-gated path;
- an immediate close needs the superseding pull request to be verifiably merged.

The audit comment is posted first in every plan. It carries the marker, so an attempt that fails
half-way is still counted, and a failure is followed by a second comment saying what was not done.
A session that writes no decision is reported and counted, never passed in silence. Everything a
model wrote is made inert before it is posted, and only the last marker in a comment is read, so
text in a summary cannot forge the manager's own bookkeeping.

**What the session token can still do.** GitHub scopes a token to a repository, not a branch, so
contents write would let a session push another unprotected branch, delete one, or create a tag.
The brief forbids it and nothing in the session's instructions points there, but it is not
technically prevented. What bounds the damage: `main` is protected; the token has no `workflows`
permission, so GitHub refuses any push that creates or changes a workflow file, which is what
stops a session editing the checks that judge it; and only collaborator-authored pull requests
are ever given to a session. A repository with tag-triggered releases should protect its tags
before adopting the manager. The cost of withholding `workflows` is that a branch whose merge from
trunk carries a workflow change may be refused on push; the session escalates that.

Pull request text does not enter the session's brief, with one exception: the branch and base
names, which must be plain (`[A-Za-z0-9._/-]`) or the pull request is skipped, and are quoted
where a command uses them. Otherwise the session is given a number and fetches the content
itself. Only pull requests from a trusted author on a branch in the repository itself are acted
on (decisions.md, 2026-08-03). Trusted means an `OWNER`, `MEMBER` or `COLLABORATOR` association,
or, when that is hidden, `admin`, `maintain` or `write` permission on the repository. The second
check exists because an App's token cannot see private organization membership: on the first
Evo run an organization owner read as `CONTRIBUTOR`. `morpheus-security[bot]` and Dependabot
pull requests have their own maintainers and are only reported.

The App key and the Claude subscription token live only in the private operations repository.
Target repositories hold a policy file and nothing else.

## Audit trail

- **Per pull request:** one comment from `morpheus-gh-manager[bot]` each time it acts, with the
  decision, the reasoning, the findings and a link to the run.
- **Per run:** one comment on the repository's `GitHub Manager log` issue, listing every open pull
  request, its route and the result.
- **Per review:** the manager review record in the worklog, on the branch, permanently.
- **Per session:** the operations run log and its `decision-*` and `outcomes-*` artifacts (30 days).

## Policy

`.github/morpheus-gh-manager.json` on the default branch. Absent means the manager does nothing in
that repository; invalid is an error, not "off".

```json
{
  "version": 1,
  "enabled": true,
  "quietHours": 8,
  "draftQuietHours": 48,
  "maxSessionsPerRun": 4,
  "maxAttemptsPerPullRequest": 2,
  "sessionBeforeMerge": false,
  "closeGraceDays": 7,
  "protectedPaths": [],
  "model": "claude-opus-5-5",
  "actions": { "merge": true, "repair": true, "review": true, "undraft": true, "close": true }
}
```

Everything but `version` is optional and shown at its default. `sessionBeforeMerge` is for a
project whose authors deliberately leave finished work open for a human to merge or redirect: a
reviewed, green pull request then goes through a session, which reads it, instead of having
auto-merge enabled from the sweep. `protectedPaths` are plain repository-relative prefixes; globs
are refused. A project may also keep
`.github/gh-manager-prompt.md`: additions to the session's brief, such as what a reviewer in that
codebase should lead on. They refine the procedure and cannot relax its rules.

## Operations

The private repository `cpheinrich/morpheus-gh-manager-ops` owns the schedule, the secrets and the
allowlist of repositories. It calls `gh-manager.yml` at an exact Morpheus commit.

Run it now, without exposing secrets to a chosen ref:

```sh
gh api --method POST repos/cpheinrich/morpheus-gh-manager-ops/dispatches -f event_type=gh-manager
```

### The App

`morpheus-gh-manager` is public-but-unlisted for the same reason `morpheus-security` is: one
registration has to be installable on a personal account and an organization.

| Repository permission | Access | Why |
|---|---|---|
| Metadata | Read | Required |
| Contents | Read and write | Push fixes; enable auto-merge |
| Pull requests | Read and write | Label, comment, edit the body, mark ready, close |
| Issues | Read and write | Labels, the log issue |
| Actions | Read and write | Read failing logs; rerun cancelled checks |
| Checks | Read | Sweep |
| Commit statuses | Read | Sweep |

Deliberately **no Workflows permission**: see the security model. No organization or account
permissions. No webhook, OAuth authorization or device flow.

### Adopt in a repository

1. Install the `morpheus-gh-manager` App on that repository only.
2. Add `.github/morpheus-gh-manager.json` (`{ "version": 1 }` takes every default) through an
   ordinary reviewed pull request.
3. Add `owner/name` to `config/repositories.json` in the operations repository.
4. Dispatch a run and read the log issue it creates.

The repository must allow auto-merge and should delete branches on merge, because a merged branch
left behind reads as a live claim.

### Turn it off

Set `"enabled": false` in the policy, or remove the repository from the operations allowlist.
Either takes effect on the next run. Removing the `manager:needs-human` label from a pull request
tells the manager to try that one again.

## Limits worth knowing

- **Sessions run on Linux.** An iOS suite cannot run there; the record says so and CI is the
  evidence. Missing visual evidence the manager cannot produce is an escalation.
- **Sessions spend the operator's Claude subscription** and private-repository runner minutes.
  `maxSessionsPerRun` is the lever.
- **The attestation is auditable, not cryptographic**, the same as the ordinary record. What is
  enforced is who applied the label and which paths the fix commits touched.
- **Issues are not triaged yet.** That is a follow-up item.
