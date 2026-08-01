# Decisions

Choices Chris made and why. Distilled from status replies — the archive in `status/` is the
raw record; this is the part worth reading.

**Consult this before proposing something that contradicts a settled choice.** If a decision
here looks wrong, say so and ask — do not quietly work around it.

Distinct from [`learned.md`](./learned.md), which holds technical facts about how things
behave. This file holds judgment calls, which could have gone the other way.

---

## Structure

**`hq/`, not `company/`** — not every project is a company, and it makes the three layers
coherent: `hq/` is the data, `/hq` is the view, `morpheus-kit/hq` is the renderer.

**`apps/` + `hq/` split** — `apps/` is deployed and has users; `hq/` is read, decided, and
written down. Cross-references solved by importing, never by a sync step.

**One file per roadmap item, with a generated index** — several agents run concurrently, and a
single `roadmap.md` conflicts on every status change.

## Tooling

**Vercel over Firebase App Hosting** — decided on the review loop, not hosting quality. Vercel
Comments anchor feedback to page elements and sync into the PR, which is the mechanism that
makes human review work. Revisit if Firebase ships an equivalent.

**PostHog Cloud, never self-hosted** — self-hosting gets *fewer* features (paid features are
Cloud-only), no support, no published CVEs, and is recommended only below ~300K events/month,
which is a third of what the free Cloud tier gives.

**Firebase Auth custom claims for `/hq`** — not Auth.js, not Cloudflare Zero Trust. The same
claim gates the route and the Firestore data; a network-layer gate cannot do the second.

**Chatwoot self-hosted from day one** — Chris dislikes migrations and expects volume. One
instance, per-company inboxes. ~$30/month beats migrating under pressure.

**Reusable workflows pin `@main`, not a tag** — with one operator and a handful of repos,
instant propagation beats staged rollout. Revisit if a simultaneous CI break gets expensive.

## Repo and licence

**Public repo, and staying public** — 2026-07-29 confirmed. Originally for CI friction; the
deciding reason now is being able to share Morpheus with close friends without minting them a
PAT. The licence does not prevent forks, and that is an accepted trade rather than an open
question. Explicitly *not* a product: no marketing, no support, no stability guarantee.

**PolyForm Noncommercial 1.0.0** — source-available, commercial use needs a separate licence,
keeps monetization open. Contributions not accepted, so relicensing stays possible.

**Commit identity is the GitHub noreply address** — the gmail address should not appear in any
public repo.

## Distribution

**Do not publish `morpheus-kit` to npm** — 2026-07-29. Publishing only helps strangers install
it, which is the opposite of the goal. CI checks the repo out and builds the CLI; local use is
`pnpm build && npm link`.

**Runtime code reaches projects as a git dependency** — 2026-07-29. `npm link` does not survive a
Vercel build and a workflow reference cannot be imported, so components and token modules need to
resolve as a real dependency. `"morpheus-kit": "github:cpheinrich/morpheus#main"` does that with no
registry, no token, and nothing published — the repo is public. The cost is pinning to a ref rather
than a semver range, which for four projects and one author is simpler, not harder.

Distribution splits three ways and the word "kit" was hiding it: the **CLI** is linked or built from
a checkout, the **workflows** are referenced by path from the public repo, and only **runtime
imports** need dependency resolution at all.

**A licence cannot prevent forks of a public repo** — GitHub's Terms of Service grant every
user forking rights through GitHub's own functionality, regardless of the attached licence. If
the goal is minimal external use, the mechanism is private visibility, not a stricter licence.

## Tooling, continued

**Nimbalyst as Chris's editor, but never a requirement** — 2026-07-29. Documented in the README
as a suggestion so collaborators can use anything. Validation lives in CI, not the editor, which
is what keeps it optional.

**Nimbalyst's Tracker rejected; our own PM suite keeps task state** — 2026-07-29. Nimbalyst renders
arbitrary frontmatter as typed form fields, so it gives task-manager ergonomics over our schema
with no adoption cost. Its Tracker was rejected because its scanner only reads
`nimbalyst-local/tracker/`, UI-created items default to a database with no file backing, and
that directory is local by default — all three break rendering `/hq` from committed files.

**The schema is what makes third-party editors safe** — a WYSIWYG editor writing to our
frontmatter is fine precisely because `pm validate` and `pm index --check` catch anything wrong
in CI. Validation is not bureaucracy; it is what permits the ergonomic surface.

## Process

**Extract on the second use, never the first** — nothing enters the kit until a second project
needs it.

**The kit generates primitives only; each project owns its semantic layer** — 2026-07-29. Three
projects had hand-rolled the same tokens-to-CSS script, which is the extraction trigger; the
semantic layer had exactly **one** use, which is not. `--ember` from `color.vermilion` is a brand
choice rather than a technical one, so a shared vocabulary extracted from a sample of one would
be a guess — and a wrong abstraction in a *vocabulary* propagates into every project that adopts
it, which is worse than a wrong function. Architecture §15.1a already assigns the semantic layer
to `packages/shared/tokens/semantic.json` per project; this settles that the kit does not take it
back. Revisit when a second project wants one.

**Retrofit by hand before building the initializer** — the retrofit *is* the specification.
Building `init` first would encode guesses about a structure no project has lived in.

**Agents do not touch another repo's `main`** — work on a branch, open a PR, let Chris merge.

**Structural PRs stay structural** — 2026-07-29. The Evo retrofit deliberately excluded brand
content so it stayed reviewable as advertised. Mixing content into a wide structural move makes
a diff nobody can review.

**Vercel Root Directory is project-level, not per-branch** — changing it for a restructure means
`main` cannot deploy until the restructure merges. The live deployment keeps serving; only new
deploys fail. Sequence accordingly.

**Claims, not assignees** — 2026-07-29. Any person may point any agent at any roadmap item;
ownership begins when work begins. The remote branch (`mo-014-*`) *is* the claim — no assignee
field, no lock file, no new concept. Merging releases it by deleting the branch.

**`pm claim` is the only supported way to start work** — 2026-07-29. Hand-naming a branch failed
`check pr` three times, always the same way: the branch cited an id whose item did not exist yet.
The rule against it was already written down, so a fourth restatement was not the fix — the
documentation now describes no other entry point, and `check pr` names the recovery command
instead of only reporting the violation.

**Inboxes are per person, not per session** — 2026-07-29. The point of the file is one place to
look; per-session would mean reading N files to find what needs you. Sessions are covered by
`.agent/worklog/`. Split to `hq/status/<person>.md` done immediately, since Alex is already a
Lakina collaborator. Items are tagged with the agent that raised them, so Claude and Codex land
in one inbox rather than two.

**One git worktree per parallel session** — subagents fan out within a task and return;
parallel sessions hold independent workstreams with their own context and git state. Worktrees
stop two simultaneous sessions colliding in one checkout.

**"Inbox", not "status" or "standup"** — 2026-07-29. The file is addressed *to* a person, so it
must be named by recipient: `inbox/cpheinrich.md` parses without explanation, where
`standup/chris.md` did not — in that analogy the human is the audience, not the subject. Summary
before blockers survives from the standup framing because it is the order a human expects.

**Owner, by GitHub handle** — not *author* (the agent wrote it), not *manager* (collaborators are
peers). Validated against GitHub's handle rule so it cannot drift into a display name.

**Inbox archives lead with the date** — `YYYY-MM-DD-HHMM-<handle>.md`, so the directory sorts as
one project-wide timeline rather than per-person threads. The handle is last only for uniqueness.

**State markers live in the heading, not inline** — `❗`/`✅` in an `##` heading carry colour, so
scanning does not depend on the renderer's text colour. Nimbalyst dims each descending heading
level, which is why items are `##` with no wrapping section header.

**Standup items link a roadmap id optionally, never mandatorily** — some items are prerequisites,
decisions, or credentials rather than tasks. Requiring an id would mean inventing fake ones.

**`.agent/inbox-archive/` and `.agent/worklog/`** — 2026-07-29. The archive shares a stem with
`hq/inbox/` so the pairing is visible without documentation. `worklog` needs no counterpart
directory: a roadmap item never moves, it just reaches `status: shipped`, and the worklog is a
separate record of what was learned — including research that produced nothing.

**Naming stopping rule** — name it well enough that a fresh agent reads it correctly on first
encounter, then document the rest. Further rounds of renaming solve a documentation problem
with the more expensive tool.

**One GCP project per app, not per company** — 2026-07-29. Corrects an earlier error. A Firebase
project *is* a GCP project, one-to-one, so apps with separate user bases must be separate GCP
projects. Grouping happens at the billing account, which is where it actually matters. A company
therefore has n+1 projects: one per app, plus a warehouse project for cross-app BigQuery.

**GCP project ids need an org prefix** — 2026-07-29. Ids are globally unique across all of GCP,
so `darwin`, `evo`, `darwin-health`, and `evo-med` were all taken. Convention is `<org>-<app>`:
`dh-darwin`, `dh-evo`. Display names must be at least 4 characters, which is a separate and
easily-misread failure.

**One PostHog account per organization, not one login with two orgs** — 2026-07-29. Chris does
not want his personal email associated with Darwin's analytics even though PostHog supports it.
Separate accounts, separate billing, cleaner boundary.

**Brand: the live surface wins over the brand document** — 2026-07-29. Where `apps/web/app/brand`
and a strategy doc disagree, what is actually rendering is the decided direction until someone
deliberately changes it. The wizard encodes this when given a `visualSource`.

**The brand wizard is owner: human** — the answers must come from current thinking, not be
reverse-engineered from artefacts of different vintages. An agent reading three disagreeing
sources produces something plausible and subtly wrong.

**Always append `?authuser=<email>` to Google and GCP links** — 2026-07-29. Chris runs several
Google identities and the account switcher defaults to the wrong one, losing link context. The
parameter pins the link. Applies to console.cloud.google.com, console.firebase.google.com,
payments.google.com, admin.google.com — every Google property. Use the email, not an index;
indexes shift as accounts sign in and out.

**Firestore is `nam5` (US multi-region) on all projects** — 2026-07-29. Permanent and
unchangeable after creation, so worth stating: multi-region for durability, and it still includes
`us-central1` so colocation with Cloud Run holds.

**Use the browser tool to verify UI before giving UI instructions** — 2026-07-29. Three rounds of
Firebase console directions were wrong because they were inferred rather than observed. If the
task is "where do I click", look first.

**Ids are namespaced by project prefix** — 2026-07-29. `RM-002` was identical in every repo, so
it named nothing in particular the moment there were two projects. Now `EV-002` and `MO-002`.
Roadmap items get the bare prefix because they are the common case — named in conversation,
derived into branch names, cited in PRs. Goals and requests take an infix (`EV-G-2026-Q3-01`,
`EV-FR-007`) since they are rarer.

**The registry indexes; the manifest is authoritative** — `~/.morpheus/registry.json` records
where each project lives and its prefix, and enforces prefix uniqueness at allocation. But a
fresh clone has no registry entry and must still work, so nothing may depend on it for
correctness. `morpheus.json` holds the prefix and travels with the repo.

**`main` is protected everywhere; agents merge their own PRs** — 2026-07-29. Branch, PR, and
merge once checks pass — Chris is not a merge bottleneck. Use `gh pr merge --auto` so GitHub
merges when checks go green rather than holding a session open polling.

**Set `--auto` only when the branch is finished** — 2026-07-29. Enabling auto-merge on a PR with
failing checks lost a commit pushed afterwards. Watch, fix, *then* auto-merge.

**MO-004 first in the kit** — 2026-07-31. Of the three unblocked kit items, `/hq` auth via Firebase
custom claims goes first. Darwin's DW-002 shipped exactly this and Chris verified it renders
`chris@darwin.health · admin`, so the kit version generalises something demonstrably working rather
than designing it. MO-005 renders a shell that without auth renders to everyone; MO-006 is least
coupled and can go any time.

**Cross-repo inbox gets a reader, not a new home** — 2026-07-31. `morpheus inbox status` (MO-047)
walks the registry and prints every open `❗` across all repos. One inbox per person *per repo*
stays — the repo is what makes an inbox reviewable and CI-checkable. Explicitly "not the end of the
story": replying from one place is unsolved and deliberately deferred until the reader has been
lived with.

**Neither personal site is on Vercel** — 2026-07-31. `cpheinrich.com` and `heinrichbros.com` both
serve from Cloudflare; heinrichbros is a Worker with custom-domain routes and a KV binding, and
neither repo has a `.vercel/` link. There is no missing personal Vercel account — there was never
one. Only `darwin` and `evo` are linked to Vercel, both under `team_WvHuh3zpY4O68wXCIUolqksG`.
This retires the "personal Vercel login" blocker that had been carried through three cycles.

**Browser-reachable work is not blocked** — 2026-08-01. When the *only* obstacle to finishing is
that something must happen in a browser, the agent drives the browser rather than stopping to
describe what a human should click. This had recurred often enough to be a pattern: work parked, a
human asked, "try it yourself in the browser", and the same agent clearing it in a minute. The wait
was pure loss — the capability was there and only the asking cost anything.

The boundary is what makes it safe, and it is about **obstacles, not gates**. Where a human is
wanted for judgment — spending, publishing, sending, granting access — the gate stands, and the
browser merely being where that happens changes nothing. Pairs with *use the browser tool to verify
UI before giving UI instructions*, which is the same instinct one step earlier: look first.

**Verifiers are a concept, not a directory** — 2026-08-01. The handoff spec asked whether to
formalise "verifiers" as its own thing or fold them into `qa/`. Neither: they are named in
`architecture.md` §9 as a four-rung stack, and no directory is created. `qa/` holds *artifacts* —
test plans, checklists, acceptance criteria — while a verifier is a *stage in the merge path*, and
its rungs already live in `.github/workflows/`, `qa/acceptance/`, and a pull request. A
`verifiers/` directory would contain only pointers to those three.

What was actually missing was vocabulary. With no word for *the thing that checks the doer*, the
rungs could not be reasoned about as a stack — which is why nobody had noticed that rung 3's input,
`RoadmapItem.acceptance`, had never been set by a single item.

**An edge gets drawn when the schema already declares it and nothing traverses it** — 2026-08-01.
The test for which work-graph edges to formalise. A dangling field is evidence someone thought a
handoff mattered; a speculative edge is a guess, and a wrong edge in a *vocabulary* propagates.
Three qualified (`JournalEntry.outcome: blocked`, `RoadmapItem.acceptance`, the roadmap-proposal
loop) and two did not (`Request.roadmap`, `Goal.current`) — same rule as *extract on the second
use*, applied to edges.

**The heartbeat proposes; dispatch is a flag, off by default** — 2026-08-01. Chris's call at
intake. A scheduled beat picks the next item and surfaces it; it does not run an unattended agent
on a timer. The switch is wired and tested so enabling it later is configuration rather than
redesign.

**The heartbeat's assess step is a ranking function, not a prompt** — 2026-08-01. The spec framed
it as a model call. Built that way it would be unrunnable without a credential, untestable in CI,
dead at the first billing failure, and non-deterministic in a job that runs unattended. Every input
— priority, goal status, claim age, ceiling headroom — is computable from files already in git, so
the ranking stands alone and a model is an optional second opinion over it. This is also what let
the heartbeat ship before any API key existed.

**An unconfigured verifier must never report success** — 2026-08-01. Agent review needs a model
credential and none exists. The workflow logs that the rung is unconfigured and exits without
claiming to have run, rather than passing green. Same shape as *a check that skips what is absent
will report an empty thing as correct* in `learned.md` — and worse here, because a green check is
read as evidence.

**Hosting deviations must reach the manifest** — 2026-07-31. §4 says the canonical stack lives in
`architecture.md` and only *deviations* are recorded per project, but `heinrichbros.com` runs on
Cloudflare Workers with no `deviations` entry, and neither it, `cpheinrich.com`, nor `lakina` sets
`domain`. A deviation nobody recorded is indistinguishable from the canonical choice, which is how
a stale premise survives three inbox cycles.

**Cloudflare Email Sending is the canonical transactional email service** — 2026-08-01. Chris's
call, made while moving `cpheinrich.com` off Cloudflare Pages onto Vercel. Cloudflare is already
load-bearing and permanent: registrar and DNS for every domain — including the two that host on
Vercel — plus R2 for public media. Email Sending is a service inside a vendor already in the
stack, and it is a plain bearer-token REST endpoint, so using it does not tie a project to
Cloudflare *hosting*. Resend would have been a net-new dependency, a second account, and another
credential to rotate, to replace something that works.

The §6 row `Email, accounts | Google Workspace` was about human mailboxes and said nothing about
application email, which is exactly how a project ends up choosing a provider per-project rather
than reading one off the spec. Both rows now say which they are. Reach for another provider only
when Cloudflare cannot do the job, and record it as a `deviations` entry.

**Inbox items propose options, not open questions** — 2026-08-01. Chris's idea. An open `❗`
item that is a decision carries three concrete options plus `Other`, one recommended and first, so
replying is a selection rather than a composition. His reply time is the bottleneck and agent
generation time is not, so an item demanding prose spends the scarce resource to save the abundant
one.

The stronger reason is upstream of speed: **three real options cannot be written without having
done the analysis.** A bare `~` lets an agent hand over an under-examined question and call it
collaboration.

**The caveat is load-bearing.** Options railroad — three plausible-looking choices can hide that
the right answer is a fourth thing. The same day this was decided, a question was posed as "darwin
and evo use Vercel DNS, so cut over" when the premise was false; as three Vercel-flavoured options
it would have been *harder* to catch, since each would have reasserted it. So `Other` is
structural, options go only where the analysis is real, and non-decisions keep a plain `~`.

Not enforced by `inbox validate`: the validator cannot distinguish a real option set from three
restatements of one choice, and a check that cannot tell those apart would pass the filler it
exists to prevent — the `learned.md` shape where a check reports an empty thing as correct.

**Roadmap ids are timestamps, not a coordinated integer** — 2026-08-01. `PREFIX-YYMMDD-HHMMSS`,
taken from the clock when the item is first written. A sequential integer requires every writer to
agree on what the last one was, and that agreement does not exist: in one day `pm new` offered an
id a parallel session held as an untracked file, would have offered one an open PR's branch held,
and four items were created in the *same second* by a decomposition fan-out. Forks make it
unfixable — a contributor's `origin` is their fork, so no query tells them the truth.

**An id that needs no answer cannot be given a wrong one.** The clock needs no coordination and no
network, preserving `pm new`'s offline allocation. On collision the seconds field steps forward, so
ordering survives without randomness.

The slug lives in the **filename**, not the id: the timestamp already makes the id unique, so the
slug's only job is recognition when browsing, while the id is what every cross-reference repeats.
Capped at 64 and cut at a word boundary, preferring the shortest intelligible name.

Migrated ids keep the old number against the item's own creation date — `MO-045` → `MO-260729-045`
— so `grep MO-045` still resolves against history that cannot be rewritten, and real chronology
survives. Goals and requests stay sequential; they are rare and have never collided.
