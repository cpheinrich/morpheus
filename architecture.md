# Morpheus — Architecture

> **Status:** Draft 2, under active iteration. Decisions marked **[open]** are unresolved and
> collected in [§21](#21-open-questions). Nothing is implemented yet.

---

## 1. What Morpheus is

Morpheus is a company-building machine: a single repository that can instantiate a complete,
running business — software product, brand, dashboards, automations, third-party integrations —
and then keep every business it created up to date.

The observation behind it: across five web projects built in quick succession, roughly 80% of the
technology and company stack was either *entirely reusable* (design token pipeline, auth gate, CI
workflows, deploy config) or *structurally reusable* (brand documents, roadmap format, QA
checklists — same shape, different content). Rebuilding that 80% each time is waste, and the
copies drift.

Morpheus makes the 80% a dependency instead of a copy.

### The two halves

| Half | What it is | How it reaches a project |
|---|---|---|
| **Initializer** | A CLI that creates a new company repo with full scaffolding | Copied at `init`, then owned by the project |
| **Kit** | One versioned package of reusable runtime code and tooling | Depended on, upgraded over time |

### Who this is for

Chris, plus a small number of family and friends. It is not a product. Three consequences:

- **Opinionation is free.** No user wants Vue. Canonical choices are hard-coded.
- **Public namespace collisions do not matter.**
- **Multi-tenancy, billing, and onboarding UX are out of scope.** Forever.

---

## 2. Design principles

1. **Agents are the primary operator; humans review.** Every artifact is chosen for legibility to
   an agent first. Markdown over databases. Files over GUIs. SQL over proprietary APIs.

2. **One obvious place for everything.** An agent should infer a file's location from its purpose
   without searching. Directory names are plain nouns.

3. **Canonical choices, stated once.** The stack is decided here. Projects do not re-litigate it.
   Deviations are recorded in the manifest, not discovered by reading code.

4. **Import, don't sync.** Where two places need the same fact, one owns it and the other imports
   it. Copying with a sync step is drift waiting to happen.

5. **Reusable code is a dependency, never a copy.**

6. **Templates are copies and that is fine.** Scaffolding is a starting point. Projects diverge.
   Do not build machinery to keep templates in sync — build machinery to *add* new ones (§13).

7. **The human checks in once or twice a day.** Anything requiring human input queues rather than
   blocks. Agents must always have work available that needs no approval.

8. **Buy where the vendor holds a regulatory, data, or platform moat; build where the vendor's
   value is collaboration UX we do not need.**

9. **Instructions are advisory; CI is enforcement.** Anything that genuinely must happen on every
   PR is a check, not a sentence in a markdown file.

---

## 3. Canonical project structure

```
acme/
├── README.md                  # human entry point
├── AGENTS.md                  # agent entry point — canonical instructions
├── CLAUDE.md                  # symlink → AGENTS.md
├── morpheus.json              # project manifest (§5)
├── package.json               # workspace root
├── pnpm-workspace.yaml
│
├── apps/                      # deployable surfaces
│   ├── web/                   # Next.js — always present
│   │   └── tests/             # unit + component tests, colocated
│   ├── ios/                   # SwiftUI — optional
│   │   └── Tests/
│   └── hardware/              # designs, BOM, vendors — optional
│
├── packages/
│   └── shared/                # cross-surface: tokens, schema, generated types (§4)
│
├── company/                   # the business, as documents
│   ├── brand/                 # identity, voice, visual system, messaging, assets
│   ├── product/               # goals, roadmap, feature requests
│   ├── marketing/             # SEO, ASO, social, content
│   ├── finance/               # revenue/expense model, dashboard config
│   ├── ops/                   # strategy, legal, contracts, vendors, procurement
│   └── support/               # macros, escalation policy, known issues
│
├── qa/                        # cross-surface QA (§16)
├── docs/                      # engineering documentation (§17)
├── infra/                     # deploy config, environments, IaC (§18)
├── .agent/                    # agent journal and durable notes (§12.4)
├── .claude/                   # skills, commands
├── .github/workflows/         # ci.yml, deploy.yml, agent-*.yml
└── local/                     # gitignored scratch
```

### `apps/` and `company/`

Confirmed. The split is: **`apps/` is deployed and has users; `company/` is read, decided, and
written down.** Existing repos will be retrofitted (§21 Q1 resolved — see changelog).

The concern about `apps/` needing facts from `company/` is real and is solved by importing rather
than syncing — see §15.2.

### `packages/shared/`, not `apps/shared/`

`shared/` is not a deployable surface, so it does not belong under `apps/`. It holds everything
consumed by two or more surfaces:

```
packages/shared/
├── tokens/                 # DTCG source (primitives from brand)
├── generated/              # Style Dictionary output
│   ├── web/tokens.css, tokens.js, tokens.json
│   └── ios/Tokens.swift
├── schema/                 # Firestore collections + document shapes (source of truth)
│   └── *.schema.ts
├── generated/schema/       # codegen output
│   ├── web/types.ts
│   └── ios/Models.swift
└── messaging.json          # taglines, mission, audience — imported by web (§15.2)
```

The schema pipeline mirrors the token pipeline: one source of truth, generated bindings per
surface, generated output never hand-edited. Firestore security rules are generated from the same
schema, so rules cannot drift from the shape they guard.

---

## 4. Where each business function lives

| Function | Location | Form |
|---|---|---|
| Web product | `apps/web/` | Next.js app |
| iOS product | `apps/ios/` | SwiftUI app |
| Android product | `apps/android/` | Deferred — bolt-on template later |
| Design tokens | `packages/shared/tokens/` | DTCG JSON → generated |
| Database schema | `packages/shared/schema/` | TS source → generated types + rules |
| Brand messaging | `packages/shared/messaging.json` | Imported by web |
| Analytics | PostHog Cloud + `/hq` KPIs | SaaS + dashboard |
| Automations | `.claude/skills/`, `.github/workflows/` | Skills + Actions |
| Staging | Vercel preview per PR | Ephemeral |
| Unit tests | `apps/*/tests/` | Colocated |
| E2E tests | `qa/e2e/` | Playwright |
| QA checklists, acceptance | `qa/` | Markdown |
| Security posture | `qa/security.md` | Markdown |
| Cloud infra | `infra/` | Config + IaC |
| SEO | `company/marketing/seo/` | Docs + Semrush |
| ASO | `company/marketing/aso/` | Docs + ASC integration |
| Marketing content | `company/marketing/content/` | Markdown |
| Identity, mission, audiences | `company/brand/strategy.md` | Markdown |
| Finance | `company/finance/` + `/hq/finance` | Config + dashboard |
| Legal, contracts, ToS | `company/ops/legal/` | Markdown + PDFs |
| Vendors, procurement | `company/ops/vendors/`, `apps/hardware/` | YAML |
| Secrets | `secrets.manifest.json` + GSM | Manifest; values external (§14) |
| Customer support | Chatwoot + `/hq/support` | Self-hosted + dashboard |
| Agent instructions | `AGENTS.md`, `.claude/skills/` | Markdown |
| Agent journal | `.agent/journal/` | Markdown |
| Goals, roadmap, requests | `company/product/` | Markdown |
| Engineering docs | `docs/` → `/hq/docs` | Markdown + Mermaid |
| HR | Google Workspace + Gusto | External |
| Investors | `/hq/investors` | Dashboard view |

---

## 5. The project manifest

`morpheus.json` — written by the wizard, read by agents. The `stack` block is gone; the stack is
canonical and lives in this document. Only *deviations* are recorded.

```jsonc
{
  "morpheusVersion": "0.1.0",
  "name": "evo",
  "displayName": "Evo",
  "company": "darwin-health",        // groups sibling repos (§11)
  "domain": "evo.med",
  "description": "One-sentence description.",
  "surfaces": { "web": true, "ios": true, "hardware": false },
  "integrations": ["firebase", "stripe", "posthog", "github", "slack", "semrush"],
  "hq": {
    "route": "/hq",
    "allowlist": ["you@example.com"],
    "investorAllowlist": []
  },
  "inherits": {                       // §11 — what comes from the parent company
    "legal": "darwin",
    "hr": "darwin"
  },
  "deviations": [
    { "choice": "hosting", "value": "cloudflare", "reason": "..." }
  ]
}
```

---

## 6. Morpheus's own structure

**One package, not many.** `@morpheus/kit` ships everything, with subpath exports so a project
imports only what it uses. One version number, one install, one registry entry.

```
morpheus/
├── README.md
├── architecture.md
├── package.json               # the single published package
├── src/
│   ├── cli/                   # init, add, upgrade, doctor, secrets
│   ├── hq/                    # dashboard routes + components
│   ├── design/                # semantic tokens + React components
│   ├── agent/                 # AGENTS.md fragments, skills, review tooling
│   ├── integrations/          # Stripe, Firebase, PostHog, Chatwoot, Slack adapters
│   ├── analytics/             # event schema + PostHog helpers
│   ├── pm/                    # roadmap/goal file parsers
│   └── qa/                    # test harness, CI actions
├── templates/
│   ├── base/  web/  ios/  hardware/  brand/  android/
└── docs/
```

Consumers import subpaths:

```ts
import { HqShell } from "@morpheus/kit/hq";
import { Button } from "@morpheus/kit/design";
```

Heavy or surface-specific dependencies are declared as **optional peer dependencies**, so a
web-only project never installs hardware or iOS tooling. If install weight becomes a real problem
later, splitting one package into several is a mechanical change — starting split and merging
later is not. Start together.

The CLI is exposed as a `bin` from the same package, installed globally:
`pnpm add -g @morpheus/kit`.

---

## 7. Canonical tool choices

### Bought

| Function | Choice | Why not first-party |
|---|---|---|
| Auth, database, storage, push, crash | **Firebase** | Mobile services bundle is irreplaceable |
| Payments | **Stripe** | Regulatory surface |
| Banking | **Mercury** | |
| HR / payroll | **Gusto** | Compliance surface |
| Email, accounts | **Google Workspace** | |
| Code hosting, CI, packages | **GitHub** | Substrate for everything else |
| Messaging | **Slack** | Agent notification target |
| DNS, CDN, public media | **Cloudflare** | Registrar, CDN, R2 (§19) |
| SEO research | **Semrush** | Data moat |
| Agents | **Claude + Codex** | |
| Error tracking | **Sentry** | |
| **Web hosting** | **Vercel** | §9 — decided on the review loop, not the hosting |
| **Product analytics** | **PostHog Cloud** | §8 |
| Hardware | **Macs** | |

### Built and maintained in Morpheus

| Function | Why build it |
|---|---|
| Internal dashboard (`/hq`) | Every alternative is built for teams; we need one pane agents write to |
| Project management | Goals/roadmap/requests as markdown in git beats any API |
| QA tracking | Checklists next to the code they check |
| Automations | GitHub Actions + skills; no Zapier |
| Review queue | Firestore + GitHub PR sync (§12.3) |
| Investor reporting | A view over the same data, gated differently |

### Self-hosted

| Function | Choice | Notes |
|---|---|---|
| Customer support | **Chatwoot** | §20 — deployed at `support.<domain>`, surfaced in `/hq/support` |

### Stack defaults

Next.js (App Router) · React · TypeScript · Tailwind · pnpm · Style Dictionary (DTCG) ·
Vitest + React Testing Library · Playwright (E2E) · SwiftUI · Auth.js with Google OAuth ·
uv + ruff + pytest where Python is needed.

---

## 8. Analytics: PostHog

**Decision: PostHog Cloud.** It is a strong fit and self-hosting is strictly worse.

### Why it fits

The positioning you responded to is backed by the actual product surface. PostHog bundles product
analytics, session replay, feature flags, experiments, surveys, and error tracking in one tool
with one SDK — which collapses five vendors into one and, more importantly, gives an agent one
place to look.

**SDK coverage is complete for our surfaces:** official libraries for React, iOS (Swift, moving to
Swift Package Manager as CocoaPods goes read-only in December 2026), Android, and React Native.
Android is covered before we build it.

**It has an official MCP server**, so an agent can query trends, funnels, retention, and raw HogQL
without a bespoke integration. This is the mechanism for the ingestion loop in §12.5 — the agent
reads product metrics the same way it reads a file.

### Cost

Free tier, per month: **1M events**, 5K web session replays, 1M feature flag requests, 100K
exceptions, 1M data warehouse rows, 1,500 survey responses. No platform or base fee.

Beyond that: **$0.00005/event** — $50 per additional million. Session replay is $0.005/recording
(web), $0.01 (mobile); flags $0.0001/request; error tracking $0.00037/exception. Rates decrease at
volume.

Practically: a new project pays nothing for a long time, and a successful one pays tens of dollars
a month. This is not a cost decision.

### Self-hosting: no

PostHog's own documentation recommends against it, and the terms make it clearly wrong here:

- **Paid-plan features are Cloud-only.** Self-hosting gets you *fewer* features, not the same ones
  cheaper.
- No support, no uptime guarantee, "assume all responsibility and risk."
- Continuous updates from `main` rather than versioned releases, and **they do not publish CVEs** —
  so staying secure means tracking the latest Docker image continuously.
- Recommended only below ~300K events/month, on a 4 vCPU / 16GB VM.

Self-hosting costs more operationally, delivers less, and the free Cloud tier is three times the
volume they consider the self-host ceiling. Not close.

### Interface

Exactly the shape you described: a handful of KPIs rendered in `/hq` (pulled server-side via the
PostHog API and cached), each linking out to the corresponding PostHog dashboard for depth. We do
not rebuild PostHog's UI.

---

## 9. Software architecture and hosting

### What Next.js is (and Angular)

Both are frameworks for building websites and web apps in the browser — the web equivalent of
choosing SwiftUI vs UIKit. Both are React-era answers to "how do I build a site with many pages,
shared components, and data fetching."

- **Next.js** is built on React (Meta's UI library) and is the mainstream default for new web
  work. It renders pages on the server for speed and SEO, then hydrates them into an interactive
  app in the browser.
- **Angular** is Google's older, heavier, more prescriptive framework. It is common in enterprises
  and rare in new consumer products.

**Next.js + TypeScript is the right call and matches what all four of your existing repos already
use.** Firebase App Hosting listing Angular support first is a signal about its origins, not about
what you should build.

### The complete picture

```
                     ┌──────────────────────────────────────────┐
   Browser  ────────►│  Vercel — Next.js (apps/web)             │
                     │  public site · /hq dashboard · /brand    │
                     └───────────┬──────────────────────────────┘
                                 │  Firebase Admin SDK
   iOS app  ─────────────────────┤
   (App Store / TestFlight)      │
                                 ▼
                     ┌──────────────────────────────────────────┐
                     │  Firebase / Google Cloud                 │
                     │  Auth · Firestore · Storage · FCM        │
                     │  Cloud Functions (2nd gen) · Secret Mgr  │
                     │  BigQuery (warehouse)                    │
                     └───────────┬──────────────────────────────┘
                                 │
        ┌────────────────────────┼─────────────────────┐
        ▼                        ▼                     ▼
   PostHog Cloud           Cloudflare              Chatwoot
   analytics · flags       DNS · R2 media          support.<domain>
   replay · errors         cdn.<domain>            (self-hosted VPS)
```

Both surfaces talk to the same Firebase backend. The web app additionally does server-side work in
Next.js route handlers (using the Firebase Admin SDK) for anything that needs a secret. The iOS app
talks to Firebase directly via its SDKs, and to Cloud Functions for privileged operations.

### Hosting decision: Vercel

**Decided on the review loop, not on hosting quality.**

Firebase App Hosting has improved substantially — it runs on Cloud Build, Cloud Run, and Cloud CDN
with Secret Manager integration, and Next.js 16.2's stable Deployment Adapter API gives it
first-class support where previously providers reverse-engineered internal Next.js APIs. It is a
credible option and the all-Google consolidation argument is genuine.

But two things decide it:

1. **Remaining Next.js gaps.** Cache Components and the Proxy (formerly Middleware) still present
   architectural hurdles on non-Vercel providers; App Hosting limits caching for apps using
   middleware, and Cloud Run's URL path decoding can break parallel routes. These are exactly the
   features a `/hq` dashboard with auth middleware would use.

2. **Vercel Comments solve your Q9 directly.** Comments on preview deployments are enabled by
   default on every plan at no cost, let a reviewer click any element on the staged page and leave
   a threaded comment anchored to it, and **sync those comments into the associated GitHub pull
   request**. That is precisely the loop you described: a human leaves visual feedback on a staged
   site, and the agent ingests it as PR comments with enough context to know which part of the page
   each note refers to. Nothing in the Firebase or Cloudflare stack has an equivalent.

The cost is one more provider. It buys the single most important human-in-the-loop mechanism in the
whole system, so it is worth it.

**Reconsider if:** Vercel pricing becomes painful at scale, or Firebase App Hosting ships
equivalent preview commenting.

---

## 10. The `/hq` dashboard

Mounted at `<domain>/hq` in the project's own Next.js app — not a separate deployment — so it
inherits the domain, auth, and deploy pipeline. Shipped as `@morpheus/kit/hq`.

```
/hq                     Overview — KPIs, what agents did since last check-in
/hq/review              Review queue: PRs, staging links, decisions awaiting approval
/hq/product             Goals, roadmap, requests (rendered from company/product/)
/hq/finance             Revenue, expenses, runway
/hq/analytics           PostHog KPIs, links out to PostHog dashboards
/hq/support             Chatwoot summary, links out to support.<domain>
/hq/qa                  Test status, CI health, known defects
/hq/infra               Deploy status, environments, costs
/hq/docs                Rendered engineering documentation (§17)
/hq/design              Internal design system reference
/hq/vendors             Suppliers, procurement, contracts (hardware projects)
/hq/investors           Restricted subset, second allowlist
```

Auth: Auth.js + Google OAuth, allowlist from `morpheus.json`. `darwin` already implements `/hq`
with `financials`, `suppliers`, `legal`, and `/api/hq` — that is the prototype this generalizes.

Public counterpart: `<domain>/brand` — see §15.3.

---

## 11. Companies with multiple repos

One repo per product, not per company. Darwin Health operates `darwin` and `evo` as separate
repos with separate brands and separate analytics, but shared HR and legal.

**Grouping:** `morpheus.json` carries a `company` field. Sibling repos share a value.

**Inheritance:** the `inherits` block declares which `company/` subtrees come from the parent
rather than being owned locally. `evo` inherits `legal` and `hr` from `darwin`; it owns `brand`,
`product`, `marketing`, and `support`. The CLI does not copy these — `/hq` resolves them by
reading the parent repo, and agents are told in `AGENTS.md` where the canonical copy lives.

**Cross-project dashboards:** `darwin.health/hq` needs Evo's numbers. Two options considered:

- *Rejected:* Evo exposes an authenticated `/api/hq/export` that Darwin calls. Adds a service
  dependency, an auth surface, and a failure mode.
- **Chosen:** both projects write metrics to a **shared BigQuery dataset scoped to the company**.
  `darwin`'s `/hq` queries across both. PostHog projects stay separate (separate products deserve
  separate funnels) but both export to the same warehouse.

This means the GCP project boundary is per *company*, not per repo — which also makes the secrets
model in §14 simpler.

---

## 12. Agent operating model

### 12.1 Instruction layering

- **`AGENTS.md` (root)** — canonical, project-wide. `CLAUDE.md` symlinks to it so Claude and Codex
  read exactly one file. Generated at init from `@morpheus/kit/agent` fragments plus project
  specifics, with a marked region the CLI can update on `morpheus upgrade`.
- **`apps/web/AGENTS.md`** — surface-specific. The brand-preflight pattern from
  `cpheinrich.com/web/AGENTS.md` is the model.
- **`.claude/skills/`** — named, repeatable procedures.

### 12.2 Conventions and how they are actually enforced

The conventions: every PR includes tests where testable, updates docs when behavior changes,
carries a staging link, updates roadmap status, states a test plan, lists open questions, and
records self-review.

Enforcement is layered, weakest to strongest:

| Layer | Mechanism | Strength |
|---|---|---|
| Instruction | `AGENTS.md` | Advisory — agents mostly comply |
| Visible | `.github/pull_request_template.md` with checklist | Social |
| **Enforced** | **`ci.yml` — `morpheus check pr`** | **Blocking** |

`morpheus check pr` runs in CI and fails the build when: source files changed without
corresponding test changes and no `skip-tests` justification is present; a public API changed
without a `docs/` change; the PR body is missing required sections; or the roadmap item referenced
in the branch name was not moved to `review`.

Instructions get ignored eventually. A failing check does not.

### 12.3 The work loop and review queue

1. Agents pull work from `company/product/roadmap.md` and `qa/`.
2. Work happens on a branch named `rm-<id>-<slug>`. Never on `main`.
3. Push triggers CI and a Vercel preview deploy.
4. The PR is registered in the review queue with a summary, staging link, screenshots, and a test
   plan.
5. Human reviews at `/hq/review` or directly on the Vercel preview, leaving anchored comments.
6. Comments sync to the PR; the agent ingests them and iterates.
7. Approval merges and deploys.

**Queue storage.** To clarify the earlier note: "GitHub API" meant *pull requests*, not issues —
deriving the queue from open PRs is free but can only ever represent code changes. Since agents
also need to queue non-code decisions (spending approval, copy sign-off, vendor selection), the
queue is a **Firestore collection**, with open PRs synced in as one item type by a scheduled
Action. Lightweight, and it gives one place to look.

**Never-blocked rule:** when the queue is full, agents must have a backlog needing no approval —
tests, docs, refactors, research written to `.agent/`. An idle agent is a design failure.

### 12.4 Agent memory

Deliberately minimal: markdown in git, no vector database, no external store.

```
.agent/
├── journal/
│   └── 2026-07-28-calorie-pipeline.md
└── learned.md
```

Journal entries carry frontmatter (`agent`, `date`, `roadmap-id`, `outcome`) and a short body: what
was attempted, what happened, what was learned — **including dead ends that produced no code**,
which is the part git history cannot capture.

`learned.md` holds durable project facts an agent should know before starting: gotchas,
non-obvious constraints, decisions and their reasons.

Git rather than Cloud Storage because these are small, textual, benefit from appearing in PR
diffs, and are greppable by any agent with no authentication. If volume ever makes grep
insufficient, indexing markdown is easy; migrating off a bespoke store is not.

`AGENTS.md` instructs both agents to read `learned.md` at session start and append a journal entry
before opening a PR.

### 12.5 Ingestion loops

Scheduled agent runs (GitHub Actions cron) that read the world and propose changes:

| Loop | Cadence | Reads | Produces |
|---|---|---|---|
| Bug triage | Daily | Sentry, Chatwoot, bug form | Labeled issues, roadmap entries |
| Analytics review | Weekly | PostHog MCP | `/hq` KPI notes, roadmap proposals |
| Support sweep | Daily | Chatwoot API | Draft replies queued for approval |
| Finance sync | Weekly | Stripe, Mercury | `/hq/finance` update |
| Market research | Monthly | Semrush, web | `company/marketing/research/` |
| Roadmap proposal | Weekly | All of the above | **A PR against `roadmap.md`** |

The critical design choice: **agent proposals arrive as pull requests against
`company/product/roadmap.md`.** Review is a diff. The human edits the proposal in the same place
the agent will read it back from. No separate approval system.

---

## 13. Distribution: templates vs packages

**Templates are copied at `init` and then owned by the project.** They will diverge — correct.

**The kit is a dependency and stays under Morpheus's control.** A fix propagates on version bump.

The test: *if I improve this, do I want every existing project to get the improvement?* Yes → kit.
No → template.

### `morpheus add` — bolt-on templates

Templates are not only for `init`. `morpheus add <template>` applies a template to an existing
project:

```sh
morpheus add android          # scaffold apps/android/, wire CI, extend token pipeline
morpheus add hardware
morpheus add legal            # a company function added after the fact
```

It refuses to overwrite existing files, writes only what is missing, prints a summary of what it
added, and updates `morpheus.json`. Because templates are additive and file-scoped, this stays
simple — it is `init` restricted to a subset, run against a non-empty directory.

`morpheus upgrade` is the separate, narrower operation: bump the kit, and *offer diffs* for
template files that changed upstream without ever applying them automatically.

### Why not GitHub template repositories

GitHub's template-repo feature is one-shot and monolithic — it cannot compose optional surfaces
(base + web + ios) or bolt on later. Templates live as directories inside the Morpheus repo, and
the CLI copies and interpolates them. That supports composition, `add`, and per-file diffs.

### Registry

`@morpheus/kit` publishes to **GitHub Packages**. Projects get an `.npmrc`:

```
@morpheus:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${GITHUB_TOKEN}
```

Publishing is a GitHub Action on tag; consuming needs a PAT with `read:packages` (CI gets it
automatically via `GITHUB_TOKEN`). **Prerequisite:** the machine-level Polycam Artifactory registry
config must be removed first, and the per-repo `.npmrc` overrides in `darwin` and `evo` deleted
during retrofit.

---

## 14. Secrets

Values never enter git. What enters git is a manifest declaring which secrets exist and where they
live, so an agent knows what it needs without being able to read it.

```jsonc
// secrets.manifest.json
{
  "STRIPE_SECRET_KEY": {
    "purpose": "Server-side Stripe API calls",
    "scope": ["production", "preview"],
    "store": "gsm",
    "consumers": ["apps/web"]
  }
}
```

### Two populations, two stores

The apparent 1Password-vs-Secret-Manager choice dissolves once you notice these are different
kinds of secret:

| | **Google Secret Manager** | **1Password** |
|---|---|---|
| Holds | Anything code reads at runtime | Anything only a human uses |
| Examples | API keys, service account JSON, DB URLs | Bank logins, vendor portals, 2FA recovery codes |
| Runtime access | Native — Cloud Run and Functions mount secrets directly | Awkward — requires fetch-at-boot |
| Human editing | Console; adequate, not delightful | Excellent |
| Agent access | `gcloud secrets` — full lifecycle management | `op` CLI with a service account |

**GSM is the source of truth for every secret the software touches. 1Password holds credentials
code never reads.** These populations barely overlap, so this is one system per job, not two
systems for one job.

### Scoping

One **GCP project per company** (matching §11), so `darwin` and `evo` share a boundary while
`lakina` is fully isolated. IAM is per-project, and the agent's service account gets
`roles/secretmanager.secretAccessor` scoped there and nowhere else. Compromise of one project's
agent credentials cannot reach another company's secrets.

For 1Password, the equivalent is **one vault per company**, with a 1Password Service Account
granted read access to only that vault. Agents never hold your personal 1Password credentials —
they hold a scoped service-account token that is itself stored in GSM.

### How much can an agent manage?

Essentially all of GSM. Creating projects, enabling APIs, creating secrets, granting IAM,
rotating versions, and wiring Cloud Run to mount them are all `gcloud` commands. `morpheus init`
will run them. The only step needing you is the initial billing-account link and the first OAuth
consent.

1Password requires you to create the vault and mint the service-account token once per company;
after that an agent can read and write within that vault.

### Tiering

| Context | Mechanism |
|---|---|
| Local development | `.env.local`, gitignored, populated by `morpheus secrets pull` |
| CI | GitHub Actions secrets, synced from GSM by `morpheus secrets push --ci` |
| Runtime | GSM mounted directly into Cloud Run / Vercel environment |

`morpheus doctor` verifies every manifest entry resolves in every declared scope, so a missing
secret fails before deploy rather than at runtime.

### MCP identities

Each project needs MCP connections to *its own* Cloudflare account, Google account, and so on.
Project-scoped `.mcp.json` in the repo references credentials by name; values resolve from that
company's GSM. Multiple accounts of the same service across companies is therefore the normal
case, not a special case — the boundary is the GCP project.

---

## 15. Brand and design

**Brand is what changes in a rebrand; the design system is what changes in a redesign.**

### 15.1 Layout

```
company/brand/
├── README.md              # index, reading order
├── strategy.md            # positioning, mission, vision, audiences
├── voice.md               # tone, vocabulary, patterns
├── visual-system.md       # color, type, layout, imagery, logo usage
├── tokens.json            # primitives — the raw palette and type scale
├── messaging.json         # taglines, mission statement, audience — structured (§15.2)
└── assets/
    ├── logo.svg  logo-reverse.svg  monogram.svg
    ├── icon.png  icon-1024.png
    └── og-image.png
```

Assets live in git: they are small, versioned, diffable (SVG), and needed at build time. Large
media does not — see §19.

Design *system* is code, not documents: `@morpheus/kit/design` supplies semantic tokens and
components; `packages/shared/` runs the Style Dictionary pipeline turning brand primitives into
`tokens.css`, `tokens.js`, and `Tokens.swift`. Token prefix is a two-letter project code, as with
`--lk-` in Lakina.

The flow: `company/brand/tokens.json` (primitives) → `packages/shared/generated/` (per-surface) →
`@morpheus/kit/design` (semantic names and components) → `apps/*`.

### 15.2 Import, don't sync

Your point about brand copy also appearing on the website is the important one. A Claude skill that
copies text between `company/brand/` and `apps/web/` would drift within weeks.

Instead, facts that appear in both places live once in **`company/brand/messaging.json`**, are
re-exported through `packages/shared/`, and are *imported* by the web app:

```ts
import { tagline, mission, primaryAudience } from "@acme/shared/messaging";
```

Changing the tagline is a one-line edit in one file; the site picks it up at build. Prose that is
genuinely page-specific stays in `apps/web/content/`. The skill that remains
(`.claude/skills/brand-review`) checks *consistency and application* — does this page reflect
current voice and visual system — rather than copying strings.

### 15.3 Public design system route

`<domain>/brand` — a public, unauthenticated page rendering the live design system: palette,
type scale, components, logo downloads, and usage rules. Generated from the same tokens the
product uses, so it cannot go stale.

This is the link you send a hardware vendor or contractor. It deliberately excludes strategy,
audiences, and positioning, which stay internal in `company/brand/strategy.md`. `/hq/design` is the
internal counterpart and may include the strategic material.

---

## 16. Testing and QA

Tests are first-class. Agents update tests in the same PR as the code, enforced by CI (§12.2).

### Where tests live

**Colocated with the code they test.** Unit and component tests go in `apps/web/tests/` and
`apps/ios/Tests/`, never centralized — an agent editing a component should find its test in the
same tree.

**`qa/` holds what spans surfaces or is not code.**

```
qa/
├── e2e/                       # Playwright — full user journeys across the web app
│   ├── specs/
│   └── fixtures/
├── test-plans/                # per-feature manual test plans, referenced from PRs
│   └── RM-014-calorie-pipeline.md
├── checklists/
│   ├── pr-review.md           # what an agent self-checks before requesting review
│   ├── release.md             # pre-deploy gate
│   └── accessibility.md
├── acceptance/                # acceptance criteria per roadmap item
├── known-issues.md            # defects accepted and deferred, with reasons
└── security.md                # posture, threat notes, dependency policy
```

### Gates

| When | Runs | Blocks |
|---|---|---|
| Every commit | Lint, typecheck, unit tests | Merge |
| Every PR | Above + `morpheus check pr` + build | Merge |
| Pre-deploy | E2E against the preview deployment | Deploy |
| Human review | Preview link + screenshots + test plan | Deploy |

### The human review artifact

Every PR must carry: a Vercel preview link, screenshots of changed screens (captured in CI, not by
hand), a per-change "what to test" list generated from the acceptance criteria, and for iOS a
TestFlight or Firebase App Distribution build link. Feedback comes back as Vercel comments anchored
to page elements, synced into the PR (§9), which is what makes it unambiguous to the agent which
note refers to which part of the page.

---

## 17. Documentation

One source of truth: **markdown in `docs/`**, rendered at `/hq/docs`.

```
docs/
├── README.md              # index
├── architecture/          # system design, with Mermaid diagrams
├── decisions/             # ADRs — one file per significant choice
├── runbooks/              # how to do operational things
└── api/                   # generated where possible
```

**Diagrams are Mermaid in fenced code blocks**, not image files. Mermaid renders natively on
GitHub *and* in the web app, so one text source serves both, diagrams live in PR diffs, and agents
can edit them. No Figma-export-to-PNG step that goes stale.

`/hq/docs` renders `docs/` at build time. The markdown is canonical; the web page is a view. There
is never a second copy.

Company documentation is different in kind — it *is* the `company/` tree, navigated from `/hq`,
which is why it does not live in `docs/`.

---

## 18. `infra/`

Configuration for everything that runs, kept at the root because it spans surfaces — the same
Firebase project backs web and iOS, and the same DNS zone fronts the site, the CDN, and Chatwoot.

```
infra/
├── environments/
│   ├── production.json  preview.json  local.json
├── firebase/
│   ├── firestore.rules        # generated from packages/shared/schema
│   ├── firestore.indexes.json
│   └── storage.rules
├── vercel.json
├── cloudflare/                # DNS records, R2 buckets, cache rules
├── gcp/                       # project setup, IAM, enabled APIs, Secret Manager
├── chatwoot/                  # docker-compose + Coolify config for the support host
└── README.md                  # what runs where, and how to reach it
```

The goal is that recreating the entire runtime from an empty cloud account is a scripted operation
an agent can perform, not tribal knowledge.

---

## 19. Media assets

Git holds brand assets (SVG logos, icons, OG images) because they are small and build-time.

**Everything large goes to Cloudflare R2**, served from `cdn.<domain>`: hero images, motion
graphics, onboarding videos, marketing photography, App Store screenshots.

Rationale, consistent with earlier analysis: marketing media is written once and read constantly by
every visitor, which is exactly the profile where R2's **zero egress fees** win decisively. R2
storage is $0.015/GB-month with no transfer cost, against $0.08–0.12/GB egress on Google Cloud.

The split:

| Content | Store | Why |
|---|---|---|
| Brand assets (logo, icon) | Git | Small, versioned, build-time |
| Public marketing media | **R2**, `cdn.<domain>` | Read-heavy — free egress |
| User-generated content | **Firebase Storage** | Upload-heavy, read-cold, needs Security Rules + lifecycle tiering |
| Source files (raw video, PSD) | Google Drive | Never needed by the build |

Always store **object keys** in the database, never full URLs, and always serve through
`cdn.<domain>` — so the backing store can change without touching data or shipped clients.

---

## 20. Customer support: Chatwoot

**Decision: self-host Chatwoot from the start**, rather than building first-party email handling
and migrating later. You expect volume to grow and dislike migrations; Chatwoot is a well-trodden
deployment, and starting there costs a few hours once instead of a migration under pressure.

### What it takes

A Linux VPS with **2 CPU cores and 4 GB RAM minimum** (4 GB / 2 cores is the production baseline),
running Docker Compose with PostgreSQL and Redis, behind Nginx with a Let's Encrypt certificate.
Roughly $20–40/month on Hetzner.

**Deploy via Coolify** rather than hand-rolled Compose. Coolify is a self-hosted PaaS that handles
TLS, environment variables, backups, and updates behind a consistent API — which turns "a bespoke
server an agent must reason about" into "a managed surface an agent can operate." An agent can
perform the entire setup: provision, deploy, configure channels, and wire webhooks.

### Integration

Chatwoot runs at **`support.<domain>`**, not embedded in `/hq`. Embedding a full Rails app in an
iframe means fighting two auth systems and two design languages.

`/hq/support` follows the same pattern as analytics: summary KPIs pulled from the Chatwoot API
(open conversations, first-response time, backlog, common topics), with links out to the full
Chatwoot UI for real work. Agents use the REST API and webhooks to triage, draft replies, and
queue them for approval.

**Reconsider if:** volume stays trivially low for a year, in which case the VPS is waste — but the
cost of being wrong in that direction is $30/month, versus a migration in the other.

---

## 21. Project management as files

No Jira, no Linear. Three artifacts, all markdown, all in git, all rendered by `/hq/product`:

| File | Contents |
|---|---|
| `company/product/goals.md` | Annual and quarterly goals with measurable targets |
| `company/product/roadmap.md` | Ordered work items with status and linked PRs |
| `company/product/requests/` | One file per feature request, with source and status |

Roadmap items use fixed frontmatter so `/hq` and agents parse the same thing:

```yaml
---
id: RM-014
title: Ship calorie estimation pipeline
status: in-progress        # backlog | in-progress | review | shipped | dropped
goal: G-2026-Q3-01
owner: agent
prs: [42, 47]
acceptance: qa/acceptance/RM-014.md
---
```

Branch names derive from the id (`rm-014-calorie-pipeline`), which is how `morpheus check pr` knows
which item to verify status on.

---

## 22. The init wizard

`morpheus init <name>` — interactive; answers written to `morpheus.json`.

1. **Identity** — name, display name, domain, one-sentence description, parent company if any
2. **Surfaces** — web (assumed), iOS, hardware
3. **Brand** — generate skeletons, or point at an existing `brand/`
4. **Integrations** — which canonical services to wire
5. **Secrets** — prompt for each required credential, write to GSM, never to disk
6. **Access** — `/hq` allowlist

Then: create the directory, scaffold from templates, install `@morpheus/kit`, init git, create the
private GitHub repo, push, provision the GCP project and Secret Manager entries, create the
Firebase project, link the Vercel project, configure DNS in Cloudflare, and set Actions secrets.

Target: a deployed skeleton on a real domain with a working `/hq`, in one command.

---

## 23. Hardware (optional)

```
apps/hardware/
├── designs/            # CAD, schematics, revisions
├── bom/                # bill of materials, versioned
├── vendors/            # one file per vendor: contacts, terms, lead times, MOQ
└── procurement/        # POs, shipment tracking, QC records
```

Vendors and BOM are structured YAML so `/hq/vendors` can render them and agents can reason over
cost and lead time. Large CAD files go to R2, not git.

---

## 24. What Morpheus is not

- Not multi-tenant, not a product, not sold.
- Not a way to avoid choosing a stack — it *is* the choice, made once.
- Not a replacement for Stripe, Firebase, or Gusto. Those moats are real.
- Not a runtime. It scaffolds and supplies packages; it is not in the request path.

---

## 25. Resolved since draft 1

| Question | Resolution |
|---|---|
| `apps/` + `company/` grouping | Adopted. Solved the cross-reference concern with import-not-sync (§15.2) |
| Retrofit existing projects | Yes, all four — after Morpheus matures. Lakina moves off Vite to Next.js |
| Package registry | GitHub Packages. Wipe Artifactory config first |
| One package or many | **One** — `@morpheus/kit` with subpath exports |
| Secrets store | GSM for anything code reads; 1Password for human-only credentials |
| Analytics | PostHog Cloud. Not self-hosted — self-host has fewer features |
| Hosting | Vercel, decided by preview-comment review loop |
| Repo per company | One repo per product; `company` field groups them; shared BigQuery for cross-project `/hq` |
| Support | Chatwoot self-hosted from day one, via Coolify, at `support.<domain>` |
| Staging | Vercel preview per PR; no permanent staging environment |
| Review queue | Firestore, with GitHub PRs synced in |

---

## 26. Open questions

**Q1 — iOS review artifacts.** Vercel Comments solve web review elegantly. iOS has no equivalent:
TestFlight feedback is clumsy and does not sync to PRs. Firebase App Distribution supports tester
feedback with screenshots. Is that good enough, or do we build a lightweight in-app feedback
overlay in debug builds that posts directly to the PR?

**Q2 — Codex and `AGENTS.md`.** Claude reads `CLAUDE.md`, Codex reads `AGENTS.md`, and the symlink
handles that. But skills are Claude-specific. Does Codex get an equivalent, do we keep conventions
in plain `AGENTS.md` prose so both benefit, or do we accept asymmetric capability?

**Q3 — Kit versioning across many projects.** With one package and a dozen projects, a breaking
change means a dozen upgrades. Do we commit to strict semver with long deprecation windows, or
accept that projects pin and lag, and add `morpheus doctor --outdated` to surface drift?

**Q4 — Chatwoot host.** One shared Chatwoot serving all companies with separate inboxes, or one
per company? Shared is cheaper and less to maintain; separate keeps a security boundary and lets
each company have its own domain. Leaning shared, with per-company inboxes.

**Q5 — Firestore schema as source of truth.** §3 proposes generating types and security rules from
`packages/shared/schema/`. This is high-leverage but real work. Build it in v1, or start with
hand-written rules and add codegen once the pattern is proven?

**Q6 — `company/` for non-software businesses.** The structure assumes a software product. If a
company is purely hardware or services, `apps/` is nearly empty and the shape is odd. Worth
supporting, or explicitly out of scope?

**Q7 — Journal growth.** `.agent/journal/` grows monotonically. At what point does it need
pruning, summarizing, or moving out of the repo — and should there be a scheduled agent that
compacts old entries into `learned.md`?
