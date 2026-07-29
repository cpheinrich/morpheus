# Status — 2026-07-29

> **Markers.** Every item is either **closed** or **open** — never both:
>
> - `✅` — settled. Nothing further, no reply slot.
> - `!!` — my answer, still needs you. **Always followed by an empty `~` to reply into.**
>
> `~` is always a reply slot: filled ones are yours from last round, the empty one at the
> bottom of an open item is where you reply next. Scan for `!!`.
>
> Previous exchange archived to `.agent/status/2026-07-29-0400.md`.

---

## Needs you

### 1. Staging URL in the PR description

~ *(previous: CI was erroring; wanted the site published to a staging URL linked from the PR)*

✅ Done. Root cause was the Vercel root directory (item 2). All four checks now pass and the
staging link is at the top of [evo#6](https://github.com/darwin-health/evo/pull/6):

**https://web-jbfhjsdlp-darwin-health.vercel.app**

Sign in with Vercel — previews sit behind team protection, so it works for you but is not
publicly viewable. The description also carries a spot-check list. Clicking any element in the
Vercel toolbar leaves a comment that syncs back to the PR.

Automating the description patch is queued as [RM-011](product/roadmap/RM-011.md); for now the
Vercel bot comments the URL and I paste it into the description.

### 2. Vercel Root Directory

~ *(previous: authorized me to change it for Evo)*

✅ Changed from `web` to `apps/web` via the Vercel API using your CLI token. Preview now
deploys green.

**One thing to know:** root directory is a project-level setting, not per-branch. **A push to
`main` will fail to deploy until evo#6 merges.** The live site is unaffected — the existing
production deployment keeps serving — but do not push to `main` expecting a deploy before
merging.

### 3. Merge ordering — rebase done

~ *(previous: you merged #5; told me to update the refactor PR)*

✅ Rebased onto the new `main`. Three conflicts, all resolved keeping both sides:

- **`apps/web/package.json`** — kept Codex's `test` script *and* the `typecheck` script this PR
  adds
- **`tool-calculations.ts` / `.test.mjs`** — moved into `apps/web/`, **all 18 tests pass** in
  the new location
- **`deploy.yml`** — deleted; `ci.yml` supersedes it, and the delegated `web-ci` runs lint,
  test, and build

All checks green. Ready to merge.

### 4. `gcloud auth login` — where and how

~ *(previous: does it matter where I run it? how do I handle multiple accounts?)*

!! **It does not matter what directory you run it from** — gcloud credentials are global to
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

### 5. PostHog — API key and per-project MCP

~ *(previous: add instructions; want per-project setup with full MCP access)*

!! Here is the whole path. Two separate credentials, which is the part that trips people up.

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

### 6. Licence and npm — you are right, and the mechanism is not the licence

~ *(previous: prefer not to publish; want minimal public footprint and minimal external use; is PolyForm Strict the most restrictive?)*

!! Three answers.

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

### 7. Event schema — deferred, Evo brand fundamentals first

~ *(previous: do not build the schema yet; Evo needs brand fundamentals, strategy, and business goals in place first)*

!! Agreed and reprioritized. [RM-006](product/roadmap/RM-006.md) stays in backlog.

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

### 8. Editor — use Nimbalyst, keep our PM suite

~ *(previous: could we scrap our roadmap tooling for theirs? worried we're rebuilding what they have)*

!! Your two screenshots answered this better than the docs did.

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

---

## Shipped

| Item | What |
| --- | --- |
| [RM-001](product/roadmap/RM-001.md) | `morpheus pm` — schemas, parser, index generator, CLI |
| [RM-002](product/roadmap/RM-002.md) | `morpheus check pr` + four reusable workflows |
| [RM-007](product/roadmap/RM-007.md) | Evo retrofit — rebased, all checks green, ready to merge |

New: [RM-011](product/roadmap/RM-011.md) staging URL automation,
[RM-012](product/roadmap/RM-012.md) go private.

42 tests, Morpheus CI green, Evo CI green.

---

## Next, in order

1. You merge [evo#6](https://github.com/darwin-health/evo/pull/6)
2. Item 6 → flip Morpheus private, credential pass ([RM-012](product/roadmap/RM-012.md))
3. Item 4 → `gcloud auth login` → [RM-004](product/roadmap/RM-004.md) `/hq` auth, the gateway
   to the infra half
4. Evo brand promotion out of `local/` (pending item 7's answer)
5. [RM-008](product/roadmap/RM-008.md) `morpheus init`

---

## Anything else

~
