# Morpheus — agent instructions

Read this before doing anything. `CLAUDE.md` is a symlink to this file so Claude and Codex
read the same instructions.

## What this repo is

Morpheus scaffolds new company repositories and maintains the reusable packages they depend
on. Read [`architecture.md`](./architecture.md) before making structural changes — it is the
specification, and it is more current than the code.

This repo is `kind: internal`. It has `hq/product/` and nothing else under `hq/` — no brand,
marketing, finance, or support, because Morpheus is a tool, not a company.

## Layout

| Path | What |
|---|---|
| `architecture.md` | The specification. Update it when a decision changes. |
| `src/pm/` | Project management: schemas, parser, index generator |
| `src/cli/` | The `morpheus` command |
| `hq/product/` | Morpheus's own roadmap and goals — it eats its own dog food |
| `.github/workflows/` | Reusable workflows called by every project |
| `.github/agent-review-prompt.md` | The rung-2 reviewer persona — versioned, so it is reviewable |
| `.claude/skills/` | Named, repeatable procedures — `voice-handoff`, `voice-import` |
| `local/handoffs/` | Handoff docs, both directions. Gitignored — never committed |
| `qa/acceptance/` | Acceptance criteria per item, named by `RoadmapItem.acceptance` |
| `tests/` | Vitest, mirroring `src/` |
| `.agent/worklog/` | What was attempted and learned per task, including dead ends |
| `.agent/decisions.md` | Settled choices and why — **read this first** |
| `.agent/inbox-archive/` | Past inbox cycles with replies, date-first |
| `hq/team/<handle>.md` | Live inboxes — one per person by GitHub handle |
| `hq/team/members.md` | The roster — handles, names, and how to work with each person |
| `hq/team/meeting-notes/` | Distilled meeting summaries, never transcripts |

## Commands

```sh
pnpm install
pnpm compile && npm link    # once — puts `morpheus` on PATH for every project
pnpm typecheck             # tsc --noEmit
pnpm test                  # vitest run
pnpm test:rules            # generated firestore.rules vs the emulator — needs Java
pnpm compile               # tsc -p tsconfig.build.json; refreshes committed dist/
pnpm morpheus pm validate   # validate hq/product frontmatter
pnpm morpheus pm index      # regenerate README index tables
pnpm morpheus pm new roadmap "Title here" --priority P1 [--issue 123]
pnpm morpheus pm link-issue MO-014 123  # attach an issue to existing work
pnpm morpheus pm migrate-ids --check   # integer roadmap ids → the dated scheme (MO-057)
pnpm morpheus pm block MO-051 --needs "what would unblock this"
pnpm morpheus pm unblock MO-051
pnpm morpheus heartbeat            # what should happen next, and whether anything should
pnpm morpheus review prompt        # the rung-2 reviewer prompt for this branch
pnpm morpheus voice knowledge      # standing explainer, uploaded once as project knowledge
pnpm morpheus voice brief "topic"  # today's state, to paste into a voice session
pnpm morpheus team validate        # the roster, and every meeting note
pnpm morpheus registry list        # every Morpheus project on this machine
pnpm morpheus brand status         # what the brand package still needs
pnpm morpheus brand build          # regenerate from an edited hq/brand/answers.md
pnpm morpheus init                 # scaffold a project — safe to re-run, never overwrites
pnpm morpheus init status          # how far through project setup this repo is
pnpm morpheus firebase auth setup --project <id> --domain <public-origin>
pnpm morpheus firebase auth check --project <id> --domain <public-origin>
pnpm morpheus access sync          # apply morpheus.json's allowlist to Firebase custom claims
pnpm morpheus hq rules --rules-path infra/firebase/firestore.rules
pnpm morpheus hq rules --check --rules-path infra/firebase/firestore.rules
pnpm morpheus context refresh      # take a context receipt — after reading the records
pnpm morpheus context status       # what the current lease says, and how old it is
```

## Context freshness

**Read `.agent/decisions.md`, `.agent/learned.md` and `hq/team/<your handle>.md`, then:**

```sh
morpheus context refresh
```

This takes a *context receipt* — your assertion that you have loaded current project state,
fingerprinted against the tip of `origin/main`. It is good for **five minutes**, after which the
next governed command re-checks the trunk and those records rather than trusting the old verdict.

**Until you have one, these are refused:** `pm claim`, `pm new`, `pm link-issue`, `pm block`,
`access sync`. Nothing
else is gated — a check that fires on `pm index` trains you to route around it, and the
routing-around outlives the staleness.

```sh
morpheus context status    # what the current lease says, and how old it is
morpheus context check     # exit non-zero unless fresh — for hooks and scripts
morpheus context brief     # session start: discards the last receipt, says what to read
```

**When something has moved**, `context refresh` prints what landed on the trunk and which records
changed. Re-read those and refresh again — the delta is the point, not the ceremony. **Do not
refresh without reading.** The receipt is your assertion, and a receipt taken to clear a gate is
the one failure mode the whole protocol cannot detect.

**Offline**, set `MORPHEUS_OFFLINE=1` — or pass `--offline`. Local work proceeds; anything that leaves the machine —
pushing a claim, granting access — stays refused, because an unverified trunk is exactly when you
should not be operating external controls. **`pm block` still works**: it writes the records and
skips the push, telling you the block is not visible to other sessions yet. Blocking rather than
guessing is the one escape hatch a stuck session needs most, so it is not the one to take away.

**On a fork**, set `"context": { "trunk": "upstream/main" }` in `morpheus.json`. `origin` is
your fork, whose `main` sits still while the real trunk moves — measured against it, a lease
certifies fresh forever. `morpheus doctor` reports a trunk that does not resolve.

Receipts live in `local/sessions/`, keyed by worktree, and are gitignored. A receipt says *this
working copy read these files*, which is true of one machine — committing it would turn a local
observation into a claim about everyone. Shared evidence stays the worklog, the commit and the PR.

Why it exists and what it is built against: [`architecture.md` §7.10](./architecture.md).

## Working conventions

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

Run one **git worktree per parallel session** so two agents cannot collide in the same
checkout.

**When you hit real ambiguity, block — do not guess:**

```sh
morpheus pm block MO-051 --needs "which model, and whose subscription pays for it"
morpheus pm unblock MO-051    # once answered
```

This sets `status: blocked` and `needs:` on the item, writes a worklog entry, and raises an open
`❗` item in the inbox, refreshes the roadmap index, then commits and pushes those records on the
claimed branch. Online it refuses the protected trunk before writing anything; the explicitly
offline path may write locally there because it never commits or pushes. **Escalating is cheap;
shipping half-baked is expensive** — a plausible guess costs far more to discover later than a
question costs to ask now.

`needs` is required by the schema when an item is blocked, so say what would actually unblock you.
"Blocked on Chris" is not an answer; "which model, and whose subscription pays for it" is.

**A blocked item keeps its branch** — the partial work is on it, and blocked work holds no lane in
the heartbeat's ceiling. So resuming is a checkout, not a fresh claim; `pm claim` will refuse and
print exactly this:

```sh
git checkout mo-051-agent-code-review
morpheus pm unblock MO-051
```

Do not open a PR from the blocked branch: it must retain the partial work. If the block records
need to land on trunk, copy them to a records branch that stakes no item (for example
`inbox-YYYY-MM-DD`). `check pr` names this route and explicitly refuses the tempting but false
answer of changing the item to `review`.

**Browser-reachable work is not blocked.** If the only thing standing between you and finishing is
that something has to happen in a browser — a console to click through, a dashboard to read, a
setting to verify — **do it yourself.** Do not stop and describe what someone should click. This
has cost hours repeatedly: work parked, a human asked, and then the same agent clearing it in a
minute once told to try.

The boundary is about obstacles, not gates. Where a human is wanted for **judgment** — spending,
publishing, sending, granting access — the gate stands and the browser being where it happens
changes nothing. The rule applies only when browser use is the *single, entire* obstacle.

**Every PR must carry:**

- Tests for anything testable — a source change with no test change needs an explicit reason
- A documentation update when behaviour or a public API changes
- A test plan: what you verified and how
- Any open questions you could not resolve, stated plainly rather than guessed at
- The roadmap item moved to `review`
- `Closes #<number>` for every GitHub issue declared in the roadmap item's `issues:` field

When an issue becomes roadmap work, create it with `morpheus pm new roadmap "<title>" --issue 123`.
For an existing item, use `morpheus pm link-issue <ID> 123`. Both write structured closure intent
into the item, and the generated roadmap makes the linked issues visible. `check pr` then requires GitHub's closing
keyword in the PR body, so merging the fix cannot leave the issue open as a second, stale backlog.
An issue merely mentioned as related is not declared and is not closed.

**Except a PR that only touches records** — `hq/team/` and `.agent/`. An inbox cycle belongs to
no feature and has no item to move. Branch it as `inbox-<YYYY-MM-DD>`, staking no id, and
`check pr` will not ask for one.

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

**Before opening a PR**, run `pnpm typecheck && pnpm test && pnpm compile && pnpm morpheus pm index`, and commit
any index changes. CI runs the same checks and will fail otherwise.

## Branch protection

`main` is protected on Morpheus and every project repo. **Never push to `main`** — work on a
branch, open a PR, and merge it yourself once checks pass. Chris does not need to merge for you.

Do not wait on checks by polling. Two better options:

```sh
gh pr merge <n> --squash --auto --delete-branch   # merges itself when checks go green
gh pr checks <n> --watch --fail-fast              # blocks until they finish, then decide
```

Prefer `--auto` — it hands the merge to GitHub so the session is not held open waiting, and a
failing check simply leaves the PR unmerged rather than merging something broken. Use `--watch`
only when the next step depends on the merge having landed.

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
[`.agent/README.md`](.agent/README.md) for how the four records relate. Decisions are
settled choices — if one looks wrong, say so and ask rather than quietly working around it.

## The inbox cycle

`hq/team/<handle>.md` is how a human and their agents exchange state. These are the only
files a human is expected to edit.

**One inbox per person, not per session.** A person's file collects items from every agent
working for them, each heading tagged with the agent that raised it (`` `claude` ``,
`` `codex` ``). Two agents share a working copy so writes serialise; two *people* never touch
the same file, so git never merges a status.

1. I write it at the end of a working session: **a prose summary of what got done first**, then
   numbered items, each ending in a `~`. Summary-before-blockers is the order a human expects.
2. He replies inline after the `~`, leaving the marker in place.
3. On my next turn I: read the replies, act on them, promote anything durable to
   `.agent/decisions.md`, archive the whole exchange to
   `.agent/inbox-archive/YYYY-MM-DD-HHMM-<handle>.md` (date first, so the archive reads as one timeline), and write a fresh inbox.

A cycle goes out on its own `inbox-<YYYY-MM-DD>` branch — see the records exception above.

**Markers.** Three, and the distinction matters because Chris scans rather than reads:

**Every item is either closed or open. Never both, never neither.**

**The state lives in the heading**, not inline — `❗` and `✅` carry colour, so scanning does not
depend on the renderer's text colour. Items are `##` with no wrapping section header, because
Nimbalyst dims each descending heading level.

| State | Shape |
|---|---|
| **Closed** | `## ✅ 2. Title · \`claude\`` → answer, **no reply slot** |
| **Open** | `## ❗ 1. Title · \`claude\`` → answer → **`~` on its own line** to reply into |

Two mistakes to avoid, both made in the first round:

1. **`❗` without a following `~`.** He has nowhere to answer. The `~` at the top of an item is
   his *previous* reply, not a fresh one.
2. **`✅` on an item that still asks a question.** If there is a question, it is open.

**An open item proposes options.** Where the item is a decision, give **three concrete options
and an `Other`**, one marked recommended and placed first, so replying is a selection rather than
a composition:

```markdown
## ❗ 3. Which way on the contact form? · `claude`

Delivery still calls Cloudflare's Email Sending API…

- **A — keep Cloudflare (recommended).** Works today, already in the stack, no new account.
- **B — move to Resend.** Removes the dependency; needs an account, a verified domain, a key.
- **C — drop the form.** Point people at the social links already on the page.
- **Other —** something else, or none of these is the right frame.

~
```

Chris's reply time is the bottleneck, not agent generation time, and an item demanding prose
spends the scarce resource to save the abundant one. The second reason matters more: **three real
options cannot be written without having done the analysis**, where a bare `~` lets an
under-examined question be handed over as though that were collaboration. Items get longer; that
is the trade.

**`Other` is structural, not decoration.** Options railroad — three plausible choices can hide
that the answer is a fourth thing, and a reader scanning quickly takes the least-bad rather than
noticing the frame is wrong. This is not hypothetical: a question went out as *"darwin and evo use
Vercel DNS — if so, cut over"* when they in fact use Cloudflare DNS pointed at Vercel. As three
Vercel-DNS-flavoured options, that false premise would have been *harder* to catch, since each
option would have quietly reasserted it.

So: **options only where the analysis is real.** Filler is worse than an honest open question. And
not every item is a decision — an FYI or a genuinely open-ended question takes a plain `~`.

`morpheus inbox validate` enforces both, plus dense numbering, the GitHub-handle rule, and a
summary before the first item. Run it before finishing; CI runs it too.

**Link roadmap items with relative markdown paths** — `[MO-011](product/roadmap/MO-011.md)`
from `hq/STATUS.md`. These resolve in Obsidian *and* render on GitHub, unlike `[[wikilinks]]`
which only work in Obsidian.

Keep **Needs you** as one list. Splitting "waiting on you" from "blocked" was a false
distinction — both mean the same thing to the person reading it.

Never let an inbox accumulate history. It is a snapshot; the archive is the record.

## Sharing Google links

**Always append `?authuser=<email>`** (or `&authuser=`) to any Google or Google Cloud URL —
console, Firebase, payments, admin. Without it the link opens under whichever identity the
account switcher last used, and switching loses the link context. Use the email address rather
than an index.

## Firebase Google sign-in bootstrap

**Do not call Firebase-ready just because the project, SDK config, or Auth tab exists.** Immediately
after an agent creates a Firebase project for a web/HQ surface, run:

```sh
morpheus firebase auth setup --project <firebase-project> --domain <public-origin>
```

The command writes the Google-provider configuration into `firebase.json`, deploys it with the
Firebase CLI, adds the app's authorized domain through the Firebase API, and verifies both remote
facts. It first tries the existing `gcloud` and Firebase CLI sessions. If either needs an interactive
Google authorization, the CLI launches its browser flow; if a Firebase consent/ToS screen still
blocks deployment, it opens Firebase Authentication and fails with the exact recovery step. Use
`morpheus firebase auth check` in a later session or CI to fail closed rather than rediscovering a
disabled provider or missing custom domain from a spinning sign-in screen. Record the canonical
origin or hostname as `publicDomain` in `morpheus.json`, or pass `--domain` explicitly; the check refuses to
call an app ready when it cannot determine that origin.

## Folder documentation

**A folder gets a `README.md` when an agent could plausibly do the wrong thing without it.**
Concretely, when any of these is true:

| Trigger | Example |
|---|---|
| It is an **input to something** | `hq/` feeds the dashboard; `qa/acceptance/` feeds verifier rung 3 |
| It has a **convention filenames do not reveal** | worklog naming, inbox markers, id formats |
| It is **generated**, or partly | `hq/product/*/README.md`, the role helpers in `firestore.rules` |
| It is a **seam** | shared packages, kit boundaries, anywhere two projects meet |

**Not** for framework-standard directories — `app/`, `components/`, `__tests__/` — whose meaning
is universal. A README restating the folder name is noise that can also go stale.

**Keep them short, and point rather than repeat.** Three lines and a link into `architecture.md`
beats a second copy of the reasoning. Locality is what a README buys: eight lines where an agent
is standing beat 1,400 lines in another repo. Two copies of the same explanation drift, so depth
stays in one place.

This exists because a `/hq` dashboard was built that did not match the folder structure it was
rendering. The explanation existed — in `architecture.md`, in another repo — and the agent never
reached it.

**A tool reads the filesystem, not the README.** If a dashboard derives its sections from prose,
the README has quietly become a config file that looks like documentation, and the two will
disagree. The README explains *intent* to a reader; code reads *reality*.

`morpheus init` scaffolds these for the directories it creates. It is a convention, not a check —
a check that demands a file gets a file, and the result is stubs written to satisfy the check.

## Style

Match the surrounding code. This codebase favours:

- Small, single-purpose modules with named exports
- Explicit types at boundaries; inference inside
- Errors surfaced as data (`ParseIssue[]`) rather than thrown, so one bad input cannot abort a
  batch — see `src/pm/parse.ts`
- Comments that explain *why*, not *what*. The YAML-date preprocessing in `src/pm/schema.ts` is
  the model: it exists because YAML silently converts unquoted dates, and that is not obvious.

## Things that have bitten us

- **YAML converts unquoted `2026-07-01` into a Date object.** Frontmatter dates go through
  `isoDate`, which normalises both forms.
- **A colon in a title breaks YAML.** `pm new` quotes scalars defensively; hand-written
  frontmatter with a colon must be quoted.
- Generated files (`hq/product/*/README.md` between the `morpheus:` markers) are never edited by
  hand. Change the item files and regenerate.
