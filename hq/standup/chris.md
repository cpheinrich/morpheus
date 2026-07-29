---
person: chris
date: 2026-07-29
agents: [claude]
previous: .agent/standup/chris-2026-07-29-0400.md
---

# Standup — 2026-07-29

Since the last check-in: shipped the **claim mechanism** (`pm claim` / `pm claims` — the remote
branch is the lock, so two agents cannot start the same item), split inboxes **per person**
rather than per session, and renamed this document from *status* to *standup*.

Earlier: **Evo is retrofitted and green** — [evo#6](https://github.com/darwin-health/evo/pull/6)
is rebased onto main with all four checks passing, staging at
[web-jbfhjsdlp](https://web-jbfhjsdlp-darwin-health.vercel.app). Vercel's root directory is
fixed, and Codex's 18 tests pass in their new location.

60 tests, CI green on both repos. **Nothing is unblocked** — everything below needs you, which
is why there is no "working next" line.

> `❗` needs you and ends in an empty `~`. `✅` is settled. `~` is a reply slot — reply after
> the empty one at the bottom of an open item. `morpheus standup validate` enforces this.


## ❗ 1. `gcloud auth login` — where and how · `claude`

~ *(previous: does it matter where I run it? how do I handle multiple accounts?)*

**It does not matter what directory you run it from** — gcloud credentials are global to
your user account, stored in `~/.config/gcloud`, not per-project.

Multiple accounts are handled by **named configurations**. Run this once per identity:

```sh
# personal
gcloud config configurations create personal
gcloud auth login            # pick your personal Google account
gcloud auth application-default login

# darwin
gcloud config configurations create darwin
gcloud auth login            # pick your darwin.health account
gcloud auth application-default login
```

Each `create` also activates that configuration, so the `auth login` immediately after it binds
to the right one. Check with `gcloud config configurations list`.

Then a repo selects its identity without you switching anything by hand — Morpheus writes this
into `.env.local`:

```sh
CLOUDSDK_ACTIVE_CONFIG_NAME=darwin
```

Opening the Evo repo puts any agent on the Darwin account automatically. No `gcloud config
set` ritual, no risk of creating a resource in the wrong account.

**What I need from you:** run the two blocks above, then tell me the account emails and whether
you want one GCP project per company (`darwin` shared by darwin+evo, separate for personal) as
designed, or something else.

~


## ❗ 2. PostHog — API key and per-project MCP · `claude`

~ *(previous: add instructions; want per-project setup with full MCP access)*

Here is the whole path. Two separate credentials, which is the part that trips people up.

**Step 1 — create a project.** Sign up at [posthog.com](https://posthog.com), pick **US Cloud**
(matches your GCP region and keeps latency sane). Create one project per product: `evo`,
`darwin`, `cpheinrich`. Projects are the isolation boundary — separate data, separate
dashboards.

**Step 2 — the client key** (goes in the app, safe to expose): Settings → Project → *Project
API Key*, starts `phc_`. This is what `apps/web` sends events with.

**Step 3 — the personal API key** (for the MCP; secret): click your avatar → Personal API keys →
*Create*. Scopes it needs for an agent to be useful: **Query: Read**, **Insight: Read+Write**,
**Feature Flag: Read+Write**, **Dashboard: Read+Write**, **Annotation: Write**. Starts `phx_`.
Scope it to specific projects rather than "All" so the Evo key cannot read Darwin's data.

**Step 4 — per-project MCP.** PostHog runs a remote MCP server, so this goes in the repo's
`.mcp.json`, committed with no secret in it:

```jsonc
{
  "mcpServers": {
    "posthog": {
      "type": "http",
      "url": "https://mcp.posthog.com/mcp",
      "headers": { "Authorization": "Bearer ${POSTHOG_PERSONAL_API_KEY}" }
    }
  }
}
```

The value lives in gitignored `.env.local`. Because this is a project-scoped entry, it
**overrides** any account-level PostHog connector — which is exactly what gives you a different
PostHog identity per repo.

**What I need from you:** create the projects and both keys, then paste the personal API keys
here (or better, once item 4 lands, straight into Secret Manager and I will never see them).

~


## ❗ 3. Licence and npm — you are right, and the mechanism is not the licence · `claude`

~ *(previous: prefer not to publish; want minimal public footprint and minimal external use; is PolyForm Strict the most restrictive?)*

Three answers.

**On npm: agreed, do not publish.** No real upside for you. The CI workaround already works, and
for local use it is just:

```sh
cd ~/morpheus && pnpm build && npm link      # puts `morpheus` on your PATH
```

`morpheus init` will work from a clone. Publishing only helps strangers install it, which is the
opposite of what you want. **I will treat this as settled** unless you say otherwise.

**On PolyForm Strict: yes, it is the most restrictive of the family** — it grants the right to
*use* the software and nothing else. No distribution, no modification, no derivative works. It
is a stronger restriction than Noncommercial, which does permit noncommercial forks and changes.

**But here is the thing, and it is the important part: a licence cannot stop forks on a public
repo.** GitHub's Terms of Service grant every user the right to fork any public repository
through GitHub's own functionality, independent of what licence you attach. PolyForm Strict
would make a fork a licence violation you could complain about *after the fact* — it would not
prevent the fork button from working.

So if what you actually want is minimal external use, **the mechanism is making the repo private
again, not a stricter licence.** I flagged going public as a convenience trade, and it is
reversible. What it costs to reverse:

|  | Cost |
| --- | --- |
| `pm-check` checking out the CLI | A PAT with `repo` scope in Evo's and Darwin's Actions secrets |
| Reusable workflows | One Settings → Actions → Access change |
| Actions minutes | Come from quota instead of unlimited |

All one-time, none hard. Queued as [RM-012](product/roadmap/RM-012.md).

**My recommendation: go private, and keep PolyForm Noncommercial.** Once nobody can read it,
the licence is doing almost no work, so the strictest option buys you nothing extra and
Noncommercial keeps monetization open without re-licensing. Strict would actually get in your
way if you ever wanted to hand a copy to a friend.

**Say the word and I will flip it private and do the credential pass.**

~


## ❗ 4. Event schema — deferred, Evo brand fundamentals first · `claude`

~ *(previous: do not build the schema yet; Evo needs brand fundamentals, strategy, and business goals in place first)*

Agreed and reprioritized. [RM-006](product/roadmap/RM-006.md) stays in backlog.

I deliberately did **not** add brand work to evo#6 — that PR is advertised as structural-only
and should stay reviewable as such. `hq/brand/` is currently an empty scaffold while the real
material sits in `local/brand-research/` (gitignored, 30+ explorations).

Next Evo PR after merge: promote the decided brand direction out of `local/` into `hq/brand/`
as `strategy.md`, `voice.md`, `visual-system.md`, and `tokens.json`, matching the structure
already working in `cpheinrich.com` and `lakina`.

**One question before I start:** is the Evo brand direction actually *decided*? There are a lot
of alternatives in `local/brand-research/` — electric red, coral, spring green, signal orange,
clinical edge, grounded. If you have picked, tell me which. If not, that is a decision to make
before writing it down.

~


## ❗ 5. Editor — use Nimbalyst, keep our PM suite · `claude`

~ *(previous: could we scrap our roadmap tooling for theirs? worried we're rebuilding what they have)*

Your two screenshots answered this better than the docs did.

**Zed is out.** WYSIWYG markdown has been open since 2024
([#15066](https://github.com/zed-industries/zed/issues/15066),
[#21717](https://github.com/zed-industries/zed/issues/21717)) and no plugin fixes it — Zed's
extension API cannot do custom document rendering, itself an open
[discussion](https://github.com/zed-industries/zed/discussions/37270).

**Use Nimbalyst as the editor. Do not adopt its Tracker.** Your second screenshot is the whole
argument: opening `RM-003.md` rendered *our* frontmatter as typed form fields — ID, TITLE,
STATUS, PRIORITY, GOAL, OWNER, PRS, CREATED, UPDATED — with **zero tracker configuration**.
You already have the form-editing ergonomics of a task manager, over our schema, for free.

**Why their Tracker specifically does not fit** — three findings from the docs:

1. **The scanner only reads `nimbalyst-local/tracker/`.** Their docs state plainly that
   pointing it at an arbitrary directory is *not documented*. Our `hq/product/roadmap/` would
   not be seen; files would have to move.
2. **UI-created items default to Database, no file backing** — exactly what your first
   screenshot showed. File backing is opt-in, not the default.
3. **`nimbalyst-local/` is local by default.** Both of those break the hard requirement that
   `/hq` renders this on a deployed website. Their tracker targets a desktop app reading a
   local directory; ours targets a web app rendering committed files. That is the fork.

**On "will ours end up looking like theirs" — no, because we are building far less.** Their
Tracker is a kanban UI with six item types, custom YAML types, ULID generation, relationships,
and a sync engine. Ours is ~200 lines: a schema, a parser, and a table generator. We will never
build a board — `/hq` renders one, and Nimbalyst gives you form editing today.

**What "Zod-validated and CI-enforced" means**, since I used jargon: Zod is the schema
declaring `status` must be one of five values, `id` must match `RM-###`, dates must be ISO.
CI runs `morpheus pm validate` and fails the build on a violation, and `pm index --check` fails
if the generated table is stale.

**And that just proved itself on your edit.** You changed `priority` to `P0` in Nimbalyst's
form. Our validator accepted it (valid enum), and `pm index --check` immediately caught that
the generated table had gone stale — which I have now regenerated. **The schema is what makes
it safe to let a third-party WYSIWYG editor write to these files.** That is a reason to keep
it, not scrap it.

**Their "Decisions" type is convergent thinking, not a reason to adopt.** We independently
arrived at the same idea; that is reassuring about the idea, and says nothing about whose
implementation to use.

**What I need from you:** confirm Nimbalyst as the editor and I will note it in decisions. If
you want their kanban badly enough to move files into `nimbalyst-local/`, say so — but you
would be trading the `/hq` requirement for it.

~


## ❗ 6. Collaboration — claims, not assignees · `claude`

~ *(previous: few collaborators, git as the interface; need to stop two agents grabbing the same item; no upfront human assignee)*

Agreed on the framing. Three parts, and I disagree with one of them.

**The claim problem is real, and git already solves it — the remote branch *is* the claim.**

We already require branch names to derive from the item id (`rm-014-slug`). Make that load-bearing
rather than cosmetic:

```sh
morpheus pm claim RM-014      # errors if origin already has rm-014-*
morpheus pm claims            # lists live claims: item, branch age, last committer
```

`claim` runs `git ls-remote --heads origin "rm-014-*"`, and if nothing is there, creates the
branch, sets the item to `in-progress`, and pushes immediately to stake it. Another agent
checking sixty seconds later sees the branch and picks something else.

Why this over a claim field or a lock file:

- **Zero new concepts.** No new file, no new format, no new thing to keep in sync.
- **The remote is the arbiter**, so it works across machines and across your and Alex's laptops
  without any shared service.
- **Release is automatic** — merging the PR deletes the branch, which releases the claim.
- **No upfront assignee**, exactly as you wanted. Nobody owns anything until they start, and
  starting *is* claiming. Whoever points an agent at an item first gets it.
- Stale claims are visible: `pm claims` can flag a branch with no commits in N days.

The race window is the seconds between `ls-remote` and `push`. If two agents genuinely collide,
the second push is rejected and it retries — git's own conflict detection is the backstop.

**On "status is tied to a session" — I think it is tied to a *person*, not a session.**

You check in once or twice a day and want *one* place to look. If status were per-session you
would have to read N files to find out what needs you, which is worse than today. Sessions are
already covered by `.agent/journal/`, one entry per task, which is where "what did this
particular run do" belongs.

So: `hq/status/<person>.md` — one inbox per human, however many sessions wrote into it.

**But I would not restructure that yet.** Alex is not on Lakina today. It is a `git mv` plus one
line in `AGENTS.md` the day a second person appears, and doing it now means maintaining a
directory with one file in it. The trigger is clear: **second collaborator joins → split.**

**What I need from you:** confirm branch-as-claim and I will build `pm claim` / `pm claims`.
It is small — one `ls-remote`, one branch create, one status write.

~


## ❗ 7. Parallel sessions — Claude and Codex · `claude`

~ *(previous: Claude on frontend, Codex on image generation; will one markdown file handle that? is there value in parallel Claude sessions given subagents?)*

**One file handles it, with attribution.** Every item now carries the agent that raised it —
see the `` `claude` `` tags on these headings. Two agents finishing at once write to the same
working copy, so writes serialise naturally; you still get one place to look.

Where it would break is two *people*, which is why inboxes are per person. You and Alex never
touch the same file, so git never has to merge a status.

**On parallel Claude sessions versus subagents — they solve different problems.**

Subagents fan out *within* one task: search several places, review several dimensions, report
back to a parent that holds the thread. They are ephemeral and they return.

Parallel sessions hold *independent workstreams* with their own context and their own git
state. Frontend and image generation are exactly that — different files, different domains,
different branches. A subagent cannot hold a long-running workstream, because it exists to
return to its parent.

So yes, there is real value, and the mechanism is **git worktrees**: each session gets its own
checkout, so two agents editing simultaneously cannot collide. Nimbalyst supports parallel
sessions in isolated worktrees directly, which is another argument for it as the surface.

The combination that makes this work:

| Problem | Mechanism |
|---|---|
| Two agents pick the same item | `pm claim` — the remote branch is the lock |
| Two agents edit the same files | One git worktree per session |
| Two agents report status | One inbox per person, items tagged by agent |
| Two people | One inbox each — never a merge conflict |

**What I need from you:** nothing blocking. Try running Claude and Codex on two different
claimed items and tell me where it chafes — that is the only way to find the next gap.

~

## ❗ 8. Naming and format · `claude`

~ *(previous: is "status" the right word? should items be schematized? headings render grey in Nimbalyst)*

**"Standup" over "status".** You described it exactly: *"a mix of a brief, status update, and a
request for input."* That is a standup — done, next, blocked. "Status" only names the reporting
half and is silent on the asking half, which is the half that actually blocks work.

It also earns its keep by teaching the format: an engineer reading `hq/standup/chris.md` knows
what is inside without opening it, and knows summary comes before blockers. Runner-up was
`checkin`, which you used naturally twice — but it collides faintly with the SVN sense of
"check-in" inside a git repo, and it does not imply structure.

**Summary first, then blockers** — adopted, exactly the standup order you asked for.

**The grey headings fix turned out to be the restructure.** Nimbalyst dims each heading level as
it descends, so `##` was grey and `###` greyer. Items are now `##` with no wrapping section
header, so they render bright. Better still, **the state marker moved into the heading** — `❗`
and `✅` carry colour, so scanning no longer depends on the theme's text colour at all. That
also removed the redundancy of having `!!` inline *and* a state.

**Yes to a schema, and it is built.** `morpheus standup validate` enforces:

| Rule | Why |
|---|---|
| Frontmatter: person, date, agents, previous | Machine-readable provenance |
| `❗` must end in an empty `~` | The mistake I made by hand — an answer with nowhere to reply |
| `✅` must **not** offer a slot | Otherwise the check mark means nothing |
| Numbering dense and ascending | So "item 6" means the same to both of us |
| A summary must precede the first item | It is a standup, not a ticket list |
| Optional `RM-###` link per item | Some items are tasks; some are decisions or credentials |

**On tying items to roadmap tasks: optional, not required.** Item 4 (gcloud) is a prerequisite,
item 8 is a naming decision — neither is a roadmap task, and forcing an id would mean inventing
fake ones. The link is there when it is real.

Nine tests cover the parser. It runs in CI, so this cannot rot.

~
