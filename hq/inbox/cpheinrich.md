---
owner: cpheinrich
date: 2026-07-29
agents:
  - claude
previous: .agent/inbox-archive/2026-07-29-0600-cpheinrich.md
---

# Inbox — 2026-07-29

Five of your seven replies settled cleanly: **staying public** with PolyForm Noncommercial,
**Nimbalyst as a suggested editor** rather than a requirement, **branch-as-claim locked in**,
**parallel sessions deferred**, and **npm publishing off the table**. All recorded in
`.agent/decisions.md`.

Your GCP question caught a real error in `architecture.md`, which I have corrected — see item 1.
Both gcloud configurations are live (`personal` and `darwin`), so the credential bootstrap is
half done.

Also added [RM-014](product/roadmap/RM-014.md) for the brand template and wizard, which is what
your Evo answer implies has to come first, and dropped [RM-012](product/roadmap/RM-012.md)
(going private) since you have settled the opposite.

> `❗` needs you and ends in an empty `~`. `✅` is settled. Reply after the empty `~`.

## ❗ 1. GCP projects — one per app, and I had this wrong · `claude`

~ *(previous: one GCP project per project; personal ids `cpheinrich` and `heinrich-bros`; unsure whether Darwin and Evo need separate projects)*

**Your instinct is right, and it is not even a choice: a Firebase project *is* a GCP project,
one-to-one.** A GCP project can host at most one Firebase project. Darwin and Evo have separate
user bases, so they need separate Firebase Auth pools and separate Firestore databases — which
means separate GCP projects, necessarily.

**I had specified "one GCP project per company" in `architecture.md`. That was wrong** and is
now corrected. The grouping you actually want happens one level up.

**Pros and cons, honestly:**

| Separate projects per app | |
|---|---|
| **Required** if the apps need separate Firebase projects | — |
| Blast radius is one app, not one company | More projects to provision (the agent does it) |
| Per-app quota isolation — one app cannot starve another | Cross-project reads need explicit IAM grants |
| Deleting an app is deleting a project | More Secret Manager instances |
| Clean per-app cost attribution | — |

**The cons are mild and the first row is decisive**, so: one project per app.

**Billing is where grouping actually happens.** Several GCP projects bill to *one* billing
account, so `darwin` and `evo` both roll up to a Darwin billing account, and personal projects
to a personal one. That gives you exactly the split you want with no extra structure.

Proposed layout, using your ids:

| Project id | For | Billing |
|---|---|---|
| `cpheinrich` | cpheinrich.com | Personal |
| `heinrich-bros` | heinrichbros.com | Personal |
| `darwin` | Darwin app | Darwin |
| `evo` | Evo app | Darwin |
| `darwin-warehouse` | Shared BigQuery so `darwin.health/hq` can query Evo | Darwin |

That last one is the *n+1*: cross-app rollup needs somewhere to land, and putting it in either
app's project makes that app privileged. Skip it until you actually want the cross-project
dashboard — I have noted it, not built it.

Note you already have `darwin-health-503300` and a stray `evident-door-503300-s6` ("My First
Project", auto-created). Worth deciding whether `darwin-health-503300` becomes the Darwin app
project or gets superseded by a clean `darwin`.

**What I need:** confirm the layout and whether to reuse `darwin-health-503300`. Then I can
create the projects, enable APIs, and set `CLOUDSDK_ACTIVE_CONFIG_NAME` per repo — you only need
to link billing accounts, which is the one step that needs a human.

~

## ❗ 2. PostHog — billing is per organization, so you need two · `claude`

~ *(previous: should be multiple accounts since billing differs — darwin/evo to Darwin, personal to personal)*

**You are right that projects will not do it, but you do not need multiple accounts.** PostHog's
hierarchy is *organization → project*, and **billing is per organization**. One login can belong
to unlimited organizations and switch between them from the top bar.

So: **one PostHog account, two organizations.**

| Organization | Projects | Billing |
|---|---|---|
| Darwin Health | `darwin`, `evo` | Darwin card |
| Personal | `cpheinrich`, `heinrich-money` | Personal card |

**One wrinkle worth knowing before you set it up: a free organization is limited to one
project.** Adding a second requires putting a payment method on that organization — which does
not charge you, since the free allowance still applies, but it is a step you will hit
immediately with two projects per org.

Two ways out, and the choice depends on which you dislike more:

- **Two orgs, payment method on each** — one invoice per company, which is the clean mental
  model and what you asked for. Costs nothing until you exceed the free tier.
- **Four orgs, one per project, all free** — no payment methods at all, and *probably* more free
  allowance since the tier appears to be per-organization. But four org switches and four bills
  later, which fights the grouping you wanted.

**I would take two orgs.** Worth confirming the allowance really is per-org when you sign up —
that would make the four-org option meaningfully cheaper at scale, and I would rather you check
it than take my word.

Projects can be moved between organizations later within the same region for free, so this is
reversible.

**What I need:** create the two orgs and their projects, then the two credentials per project
(`phc_` client key for the app, `phx_` personal key for the MCP). Once item 1 lands, put the
`phx_` keys straight into Secret Manager rather than pasting them here.

~

## ❗ 3. Evo brand — template first, then consolidate · `claude`

~ *(previous: brand largely decided but fragmented — some in local/brand-research, some already in apps/web/app/brand; want the template and wizard right first)*

Agreed, and this is the right order — added as [RM-014](product/roadmap/RM-014.md), P0.

Consolidating first would mean hand-shaping Evo's brand and then discovering the template wanted
something different. The template is the spec.

**What the template gives a project:**

```
hq/brand/
├── README.md           index and reading order
├── strategy.md         positioning, mission, audiences
├── voice.md            tone, vocabulary, patterns
├── visual-system.md    colour, type, layout, imagery, logo usage
├── tokens.json         primitives — the palette and type scale
├── messaging.json      taglines, mission, audience (imported by web, never copied)
└── assets/             logo.svg, logo-reverse.svg, icon.png, og-image.png
```

Matching what already works in `cpheinrich.com` and `lakina`, so those retrofit cleanly too.

**On the wizard:** `morpheus brand init` should walk the strategic questions — what it is, who it
is for, what it must never sound like — and write those answers into the skeletons. A brand
document full of `TODO` is worse than an empty one, because it looks answered.

**One question that shapes the template.** You have two live sources with different authority:
`local/brand-research/` (30+ explorations, gitignored) and `apps/web/app/brand` (already built by
Codex, and therefore already shipping). **Which one is canonical when they disagree?** If the
built pages are the decided direction, I should derive the template's `tokens.json` from what is
actually rendering rather than from the explorations.

~

## ✅ 4. Licence and npm — staying public · `claude`

~ *(previous: leave it public with Noncommercial; want to share with close friends without minting PATs)*

Settled and recorded. The PAT friction is exactly what going private would reintroduce, so that
is a good reason to stay put. [RM-012](product/roadmap/RM-012.md) dropped.

The trade you are accepting: the licence does not prevent forks, since GitHub's Terms grant
forking on any public repo regardless. That is now a known accepted cost rather than an open
question.

## ✅ 5. Editor — Nimbalyst suggested, not required · `claude`

~ *(previous: decided on Nimbalyst, but don't tie project management to it; document as suggested in the README)*

Done — a new **Editing** section in the README says any editor works, the tooling is
deliberately editor-agnostic, and Nimbalyst is a suggestion.

The line that makes it true rather than aspirational: **validation happens in CI, not in the
editor.** A collaborator on vim gets the same guarantees you do.

## ✅ 6. Branch-as-claim — locked in · `claude`

~ *(previous: yes, branch as claim works)*

Already built and shipped — `pm claim` and `pm claims`, with `AGENTS.md` now instructing agents
never to start an item without claiming it. Recorded in decisions.

## ✅ 7. Parallel sessions — deferred · `claude`

~ *(previous: not solving this now; will come back when I actually need Claude and Codex in parallel)*

Closed. The groundwork is incidentally in place — claims stop two agents taking one item, and
inbox items carry an agent tag — so when you do run them in parallel it should mostly work.
Bring back whatever chafes.
