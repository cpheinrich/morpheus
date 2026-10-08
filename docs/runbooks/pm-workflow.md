# Project-management workflow — claims, ids, blocking, PR contents

**Read this when** you file or claim an item, need to block or resume one, open a records-only or meeting-note PR, use a waiver, or `check pr` refuses your PR. `AGENTS.md` keeps the one-line rules.

## Claiming and roadmap ids

**Claim work before starting it:**

```sh
morpheus pm claims           # what is already taken
morpheus pm claim MO-014     # stakes the branch on origin, sets in-progress, pushes
```

The remote branch **is** the claim — `pm claim` refuses if `origin` already has `mo-014-*`.

**Roadmap ids come from the clock** — `MO-26-08-01-15.26.34`, `PREFIX-YY-MM-DD-HH.MM.SS` in
**Pacific time on every machine**, not the author's local zone. A fixed zone is what makes ids
from different contributors comparable; a local one silently reorders the board the moment two
people are in different places.
No remote is consulted because none can help: a fork contributor's `origin` is their fork, so no
query would say which ids Morpheus has issued. On collision the seconds field steps forward, so a
fan-out gets `:34 :35 :36 :37` and ordering survives. **Name the slug like a branch.** `morpheus pm new roadmap "<title>" --slug update-roadmap-ids`
— verb-noun, two to four words, ≤ 32 characters. It is a handle, not a summary: the description
belongs in the title and body, and the id above it is already unique, so the slug does not have
to be. Omitting `--slug` derives one from the title, which is a fallback rather than the intent —
"Roadmap ids become timestamps, not a coordinated integer" derives to
`roadmap-ids-become-timestamps` where `update-roadmap-ids` says as much in half the space.

Items migrated from the old integer scheme read `MO-26-07-29-045`: their own creation date plus the
old number, so `grep MO-045` still resolves against git history that cannot be rewritten.

`morpheus pm migrate-ids` also **repoints structured references** — `roadmap:` in worklog
frontmatter, which a tool would otherwise fail to resolve. Prose mentions are left alone
deliberately: the number is still in the new id, and rewriting narrative in a historical record
edits the past rather than repairing a link.

**Goals and requests are still sequential**, and for those `pm new` allocates against the remote
as well as the item files, because the files only hold ids that have already merged — an id
another session holds sits on its branch and nowhere else. If `origin` cannot be reached it still
allocates, but says so; treat that id as provisional until `pm claim` accepts it.

**Never create the branch by hand.** `pm claim` derives it from the item id, so the two cannot
disagree; hand-naming has already failed `check pr` twice by referencing an id that did not exist
yet.
Never start an item without claiming it; another agent, possibly on someone else's machine,
may be on it. Move the item to `review` when you open the PR. Merging deletes the branch and
releases the claim.

Use **one worktree per implementation task**, not per conversation. Read-only investigation
needs no new worktree. `pm claim <ID>` from a shared or unrelated checkout prepares a detached
worktree at freshly fetched trunk and prints its absolute path. It moves only that item's new,
untracked intake file; existing items come from trunk. Read the destination's records, refresh
context there, then repeat `pm claim` there to stake the branch. No receipt is copied automatically.
An already isolated detached worktree can claim directly after reading and refreshing.

Use `morpheus pm resume <ID>` to continue an explicitly named existing task. It reuses the
worktree holding its claimed branch, or checks out that branch in a worktree when needed.
Preserve its commits and edits; fetch and integrate trunk explicitly when behind. A resumed session
must not silently attach an unrelated request to its old task. Provider session IDs associate
sessions with tasks; `--session-id` on claim/resume supplies one explicitly (Codex defaults to
`CODEX_THREAD_ID`). Without an ID, the currently checked-out claimed branch identifies the task.
Do not run concurrent authors on the same task worktree.

## Blocking

**When you hit real ambiguity, block — do not guess:**

```sh
morpheus pm block MO-051 --needs "which model, and whose subscription pays for it"
morpheus pm unblock MO-051    # once answered
```

This sets `status: blocked` and `needs:` on the item, writes a worklog entry, raises an open
`❗` item in the inbox, then commits and pushes those records on the claimed branch. Online it
refuses the protected trunk before writing anything; the explicitly
offline path may write locally there because it never commits or pushes. **Escalating is cheap;
shipping half-baked is expensive** — a plausible guess costs far more to discover later than a
question costs to ask now.

`needs` is required by the schema when an item is blocked, so say what would actually unblock you.
"Blocked on Chris" is not an answer; "which model, and whose subscription pays for it" is.

**A blocked item keeps its branch** — the partial work is on it, and blocked work holds no lane in
the heartbeat's ceiling. So resuming is a checkout, not a fresh claim; `pm claim` will refuse and
print exactly this:

```sh
morpheus pm resume MO-051
# In the reported worktree, after reading current records:
morpheus pm unblock MO-051
```

Do not open a PR from the blocked branch: it must retain the partial work. If the block records
need to land on trunk, copy them to a records branch that stakes no item (for example
`inbox-YYYY-MM-DD`). `check pr` names this route and explicitly refuses the tempting but false
answer of changing the item to `review`.

## What a PR carries

**Every PR must carry:**

- Tests for anything testable — a source change with no test change needs an explicit reason,
  and see [What makes a test count](test-quality.md), because "a test exists" is not the bar
- A documentation update when behaviour or a public API changes
- A test plan: what you verified and how
- Any open questions you could not resolve, stated plainly rather than guessed at
- The roadmap item moved to `review`
- `Closes #<number>` for every GitHub issue declared in the roadmap item's `issues:` field
- For changed paths declared by `review.visualEvidence` in `morpheus.json`, a screen recording
  attached under `## Visual evidence` when practical, otherwise screenshots

The visual-evidence gate is a deterministic repository-owned path contract, not an attempt to
infer whether rendered pixels changed. CI validates the presence of either a GitHub attachment or
an HTTPS URL under a repository-approved `allowedUrlPrefixes` location, without fetching it; a
human or independent reviewer still decides whether the evidence actually demonstrates the change.
Declare the narrowest stable prefix that owns the media, such as a specific bucket path rather than
all of `storage.googleapis.com`. A repository may opt out only with `enabled: false` and a
substantive `reason` in its manifest. A legacy manifest with no declaration warns rather than blocks
until its explicit rollout commit lands.

When an issue becomes roadmap work, create it with `morpheus pm new roadmap "<title>" --issue 123`.
For an existing item, use `morpheus pm link-issue <ID> 123`. Both write structured closure intent
into the item. `check pr` then requires GitHub's closing keyword in the PR body, so merging the
fix cannot leave the issue open as a second, stale backlog.
An issue merely mentioned as related is not declared and is not closed.

**Except a PR that only touches records** — `hq/team/` and `.agent/`. An inbox cycle belongs to
no feature and has no item to move. Branch it as `inbox-<YYYY-MM-DD>`, staking no id, and
`check pr` will not ask for one.

**Meeting notes are delivered in isolated PRs.** Put each note on an `inbox-<YYYY-MM-DD>` branch,
staking no id, in a PR that contains only the factual, canonical meeting record. Roadmap changes,
strategy refinement, implementation work, decision promotion, and any other follow-up
interpretation go in separate PRs. When a follow-up PR files roadmap items, it backfills their ids
into the note's `roadmap:` field as bookkeeping.

**Never borrow an unrelated item's branch for this.** Merging a branch that stakes an id marks
that item shipped, so a PR which changes only records and `hq/product/` bookkeeping is refused on
a claimed branch — it demonstrably did not do that item's work. That is how MO-010 came to read as
shipped against a PR that only moved the inbox, and a shipped item is never looked at again.

When the deliverable genuinely *is* the record — a decision item like MO-003, whose whole outcome
was "do not publish, use a git dependency" — put `records-only: <reason>` in the PR body, the same
shape as `skip-tests:`.

**Both waivers are reported, not swallowed.** They are your own say-so about your own PR, so
`check pr` prints them as `~ waived` with the reason attached and never says "conventions
satisfied" without listing them. They still pass — the reason just has to be visible to whoever
reads the check.

**A waiver needs a real reason.** `skip-tests: yes` is refused, as are `true`, `n/a` and an empty
value. Say what cannot be tested and why.

## Merging, the board and the worklog

Do not wait on checks by polling. Two better options:

```sh
gh pr merge <n> --squash --auto --delete-branch   # merges itself when checks go green
gh pr checks <n> --watch --fail-fast              # blocks until they finish, then decide
```

Prefer `--auto` — it hands the merge to GitHub so the session is not held open waiting, and a
failing check simply leaves the PR unmerged rather than merging something broken. Use `--watch`
only when the next step depends on the merge having landed.

**Finish the author-managed independent review before enabling auto-merge.** Opening a PR,
pushing commits, or changing labels never starts a reviewer session. Follow the
[review contract](independent-review.md), return to the original reviewer for the
permitted follow-up turns when required, and publish complete evidence before merging.

**Legacy GitHub review is opt-in.** Only repositories explicitly enabling the old
`agent-review.yml` run a model when a PR opens or a collaborator requests `@claude` re-review.
Its `agent-review / delivery` check may remain skipped to satisfy existing branch protection;
skipped delivery is not an independent review. A legacy `review-waived:` line applies only to
that delivery job and cannot waive the independent-review requirement.

Read and respond to any GitHub review findings as well, explaining declined findings in their
threads before resolving them. Unresolved substantive independent findings keep the PR open.
**Never merge with `--admin`** or use a delivery waiver to bypass independent review.

**`pm claim` reconciles the board first**, marking merged work shipped and recording its PR number,
so those status changes ride along in the claim commit. Nothing else advances an item to `shipped`,
and a board that lags reality stops being read — thirteen items had drifted before anyone noticed.

Running it after a merge instead leaves the status change in a dirty working tree on protected
`main` with nowhere to go, which is how a housekeeping step gets quietly dropped. `morpheus pm ship`
still exists for running it deliberately, and `morpheus pm ship <ID>` for work that shipped without
a PR it can see.

It confirms against a merged PR rather than inferring from a missing branch, and writes nothing when
`gh` is unavailable. It also reports merged branches that were never deleted — those read as live
claims and would make `pm claim` refuse the item forever.

**Append a worklog entry** to `.agent/worklog/YYYY-MM-DD-slug.md` before opening a PR. Record
what you learned, especially dead ends that produced no code — git history cannot capture those.

**At the start of a session** read `.agent/decisions.md` and `.agent/learned.md` — see
[`.agent/README.md`](../../.agent/README.md) for how the four records relate. Decisions are
settled choices — if one looks wrong, say so and ask rather than quietly working around it.
