# Morpheus — Architecture

> **Status:** First draft, under active iteration. Decisions marked **[open]** are unresolved
> and listed together in [Open questions](#16-open-questions). Nothing here is implemented yet.

---

## 1. What Morpheus is

Morpheus is a company-building machine: a single repository that can instantiate a complete,
running business — software product, brand, dashboards, automations, third-party integrations
— and then keep every business it created up to date.

The observation behind it: across five web projects built in quick succession, roughly 80% of
the technology and company stack was either *entirely reusable* (design token pipeline, auth
gate, CI workflows, deploy config) or *structurally reusable* (brand documents, roadmap format,
QA checklists — same shape, different content). Rebuilding that 80% each time is waste, and
worse, the copies drift.

Morpheus makes the 80% a dependency instead of a copy.

### The two halves

| Half | What it is | How it reaches a project |
|---|---|---|
| **Initializer** | A CLI that creates a new company repo with full scaffolding | Copied once, at `init` |
| **Packages** | Versioned libraries of reusable runtime code and tooling | Depended on, upgraded over time |

Keeping these separate is the central architectural decision. See [§9](#9-distribution-templates-vs-packages).

### Who this is for

Chris, plus a small number of family and friends. It is not a product. That has three
consequences that shape every decision below:

- **Opinionation is free.** There is no user who wants Vue. Canonical choices can be hard-coded.
- **Public namespace collisions do not matter.** Package names, repo names, and CLI names only
  need to be unambiguous within this small world.
- **Multi-tenancy, billing, and onboarding UX are out of scope.** Forever.

---

## 2. Design principles

1. **Agents are the primary operator; humans review.** Every artifact is chosen for legibility
   to an agent first. Markdown over databases. Files over GUIs. SQL over proprietary APIs. If a
   human needs a nicer view, that view reads the same files.

2. **One obvious place for everything.** An agent should be able to infer a file's location from
   its purpose without searching. Directory names are plain nouns, not abstractions.

3. **Canonical choices, stated once.** The stack is decided here. Projects do not re-litigate it.
   Deviations are recorded explicitly in the project manifest, not discovered by reading code.

4. **State lives in git or in Postgres/Firestore.** Never in a third-party GUI that an agent
   cannot read. This is why project management, roadmaps, and QA plans are files.

5. **Reusable code is a dependency, never a copy.** If it can be a package, it is a package. A
   fix made once must propagate without a migration campaign.

6. **Templates are copies and that is fine.** Scaffolding is a starting point, not a contract.
   Projects will and should diverge from it. Do not build machinery to keep templates in sync.

7. **The human checks in once or twice a day.** Anything requiring human input must queue rather
   than block. Agents should always have work available that does not need approval.

8. **Prefer first-party lightweight tools over third-party SaaS** where the SaaS exists mainly to
   serve teams and collaboration. Fragmentation across five vendor APIs is worse than a simple
   tool an agent fully controls. See [§6](#6-canonical-tool-choices) for where this line falls.

---

## 3. Canonical project structure

What `morpheus init` produces. Optional directories are created only when the corresponding
surface is enabled during setup.

```
acme/
├── README.md                  # human entry point
├── AGENTS.md                  # agent entry point — canonical instructions
├── CLAUDE.md                  # symlink → AGENTS.md
├── morpheus.json              # project manifest (see §4)
├── package.json               # workspace root
├── pnpm-workspace.yaml
│
├── apps/                      # the software product
│   ├── web/                   # Next.js — always present
│   ├── ios/                   # SwiftUI — optional
│   └── hardware/              # designs, BOM, vendors — optional
│
├── company/                   # the business, as documents
│   ├── brand/                 # identity, voice, palette primitives, assets
│   ├── product/               # goals, roadmap, feature requests
│   ├── marketing/             # SEO, ASO, social, content calendar
│   ├── finance/               # revenue/expense model, dashboards config
│   ├── ops/                   # strategy, legal, contracts, vendors, procurement
│   └── support/               # macros, escalation policy, known issues
│
├── packages/                  # project-local packages (Morpheus packages are deps, not here)
│   └── shared/                # cross-surface types + generated design tokens
│
├── infra/                     # deploy config, environments, IaC
├── qa/                        # test plans, review checklists, acceptance criteria
├── .github/workflows/         # ci.yml, deploy.yml
├── .claude/                   # skills, commands, automations
└── local/                     # gitignored scratch space
```

### Why `apps/` and `company/`

The current repos (`darwin`, `evo`, `cpheinrich.com`, `lakina`) put `web/` and `ios/` at the
root. That works at two surfaces and stops working at four. More importantly, the business
functions from the source notes add roughly eight non-code directories — putting those at the
root alongside `web/` buries the code in paperwork.

The split is conceptually clean and easy for an agent to reason about:

- **`apps/`** — things that are deployed and have users
- **`company/`** — things that are read, decided, and written down
- **`packages/`** — things imported by `apps/`
- **`infra/` and `qa/`** — things that keep the above correct and running

This is a deviation from current convention. **[open]** — see [Q1](#16-open-questions).

### Where each business function lives

Mapping the source notes onto the tree, so nothing is homeless:

| Function | Location | Form |
|---|---|---|
| Software product — web | `apps/web/` | Next.js app |
| Software product — iOS | `apps/ios/` | SwiftUI app |
| Infra | `infra/` | Config + IaC |
| Package management | root `package.json`, `pnpm-workspace.yaml` | pnpm workspace |
| Analytics | `packages/shared/analytics`, surfaced in `/hq` | Package + dashboard |
| Automations | `.claude/`, `.github/workflows/` | Skills + Actions |
| Staging site / app | `infra/environments/staging.*` | Deploy target |
| QA, code review | `qa/`, `.github/workflows/ci.yml` | Checklists + CI |
| Cloud infra | `infra/` | Config |
| Security, bug reports | `qa/security.md`, `/hq/issues` | Doc + dashboard |
| SEO | `company/marketing/seo/` | Docs + Semrush integration |
| ASO | `company/marketing/aso/` | Docs + App Store Connect integration |
| Social media, marketing content | `company/marketing/content/` | Markdown |
| Company identity, mission, vision | `company/brand/strategy.md` | Markdown |
| Primary/secondary audiences | `company/brand/strategy.md` | Markdown |
| Finance — revenue and expense | `company/finance/`, surfaced in `/hq/finance` | Config + dashboard |
| Design system | `@morpheus/design` package + `packages/shared/tokens` | Package |
| Ops — strategy | `company/ops/strategy.md` | Markdown |
| Legal docs, contracts, ToS | `company/ops/legal/` | Markdown + PDFs |
| Vendor management, procurement | `company/ops/vendors/`, `apps/hardware/` | Markdown + structured YAML |
| Secrets | `secrets.manifest.json` + external store | Manifest, values external (§10) |
| Customer support | `company/support/` + `/hq/support` | Docs + dashboard |
| Agentic tooling | `AGENTS.md`, `.claude/skills/` | Markdown |
| Project management — goals | `company/product/goals.md` | Markdown |
| Project management — roadmap | `company/product/roadmap.md` | Markdown |
| Project management — requests | `company/product/requests/` | One file per request |
| Meta-tooling, setup wizard | Morpheus itself | CLI |
| HR | Google Workspace + Gusto (third-party) | External |
| Investors | `/hq/investors` | Dashboard view |
| Tools + integrations | `@morpheus/integrations` | Package |

---

## 4. The project manifest

`morpheus.json` at the project root is the single machine-readable description of the project.
The init wizard writes it; agents read it to know what exists without inferring from the tree.

```jsonc
{
  "morpheusVersion": "0.1.0",
  "name": "acme",
  "displayName": "Acme",
  "domain": "acme.com",
  "description": "One-sentence description of the business.",
  "surfaces": {
    "web": true,
    "ios": false,
    "hardware": false
  },
  "stack": {
    "web": "next",
    "backend": "firebase",
    "hosting": "vercel",
    "dns": "cloudflare"
  },
  "integrations": ["stripe", "firebase", "github", "slack", "semrush"],
  "hq": {
    "route": "/hq",
    "allowlist": ["you@example.com"]
  },
  "deviations": []
}
```

`deviations` is the escape hatch: a project that must break a canonical choice records it here
with a reason, so `morpheus doctor` reports it as intentional rather than as drift.

---

## 5. Morpheus's own structure

```
morpheus/
├── README.md
├── architecture.md            # this file
├── packages/
│   ├── cli/                   # the initializer + upgrade + doctor
│   ├── hq/                    # the internal dashboard, mountable at /hq
│   ├── design/                # design system: semantic tokens + components
│   ├── agent/                 # AGENTS.md fragments, skills, review-loop tooling
│   ├── integrations/          # third-party adapters (Stripe, Firebase, Slack, …)
│   ├── analytics/             # event schema + reporting helpers
│   ├── pm/                    # project management: file formats + parsers
│   └── qa/                    # test harness conventions, checklists, CI actions
├── templates/
│   ├── base/                  # files every project gets
│   ├── web/                   # Next.js scaffold
│   ├── ios/                   # SwiftUI scaffold
│   ├── hardware/              # vendor/BOM scaffold
│   └── brand/                 # brand document skeletons
└── docs/                      # design notes, ADRs
```

---

## 6. Canonical tool choices

Assumed by default. A project deviating must record it in `morpheus.json`.

### Third-party — bought

| Function | Choice | Why not first-party |
|---|---|---|
| Auth, database, storage, push, crash | **Firebase** | Mobile services bundle is genuinely irreplaceable |
| Payments | **Stripe** | Regulatory surface; never build this |
| Banking | **Mercury** | Obviously |
| HR / payroll | **Gusto** | Compliance surface |
| Email, company accounts | **Google Workspace** | |
| Code hosting, CI | **GitHub** | Also the substrate for everything else |
| Messaging | **Slack** | Agent notification target |
| DNS, CDN, edge | **Cloudflare** | Registrar + CDN; Google exited domains |
| SEO research | **Semrush** | Data moat, not replicable |
| AI agents | **Claude + Codex** | |
| Error tracking | **Sentry** | |
| Hosting | **Vercel** (web) | Matches current projects |
| Hardware | **Macs** | |

### First-party — built and maintained in Morpheus

| Function | Why build it |
|---|---|
| Internal dashboard (`/hq`) | Every SaaS alternative is built for teams; we need one pane an agent writes to |
| Project management | Goals/roadmap/requests as markdown in git beats any API |
| QA tracking | Checklists next to the code they check |
| Automations | GitHub Actions + Claude skills; no Zapier |
| Analytics reporting | Firebase → BigQuery → SQL; the warehouse is the product |
| Customer support | Lightweight email + issue tracking; Chatwoot only if volume demands it |
| Investor reporting | A view over the same data, gated differently |

The principle: **buy where the vendor holds a regulatory, data, or platform moat; build where the
vendor's value is collaboration UX we do not need.**

### Stack defaults

- **Web:** Next.js (App Router), React, TypeScript, Tailwind
- **Package manager:** pnpm, workspace protocol
- **Design tokens:** Style Dictionary, DTCG format
- **Testing:** Vitest + React Testing Library
- **iOS:** SwiftUI, native, no Android
- **Python (where needed):** uv + `pyproject.toml`, ruff, pytest
- **Auth for internal routes:** Auth.js with Google OAuth, email allowlist

---

## 7. The `/hq` dashboard

The single pane of glass. Mounted at `<domain>/hq` in the project's own web app — not a separate
deployment — so it inherits the domain, auth, and deploy pipeline for free.

Delivered as `@morpheus/hq`: a set of route handlers and React components the project mounts.
Improvements ship to every project on upgrade.

```
/hq                     Overview — key metrics, what agents did since last check-in
/hq/review              Review queue: PRs, staging deploys, decisions awaiting approval
/hq/product             Goals, roadmap, feature requests (rendered from company/product/)
/hq/finance             Revenue, expenses, runway
/hq/analytics           Product and web analytics
/hq/support             Open conversations, common issues
/hq/qa                  Test status, CI health, known defects
/hq/infra               Deploy status, environments, costs
/hq/vendors             Suppliers, procurement, contracts (hardware projects)
/hq/investors           Restricted subset, separately gated
```

Auth: Auth.js + Google OAuth, email allowlist from `morpheus.json`. `/hq/investors` takes a
second allowlist so investors see only that route.

`darwin` already implements `/hq` with `financials`, `suppliers`, and `legal` sub-routes plus
`/api/hq` — that is the prototype this package generalizes.

---

## 8. Agent operating model

The goal: agents work continuously; the human reviews once or twice a day and is never the
bottleneck.

### Instruction layering

- **`AGENTS.md` (root)** — canonical, project-wide. `CLAUDE.md` is a symlink so both agents read
  one file.
- **`apps/web/AGENTS.md`** — surface-specific rules. The brand preflight pattern in
  `cpheinrich.com/web/AGENTS.md` is the model: mandatory reading before any frontend change.
- **`.claude/skills/`** — repeatable procedures invoked by name.

### The work loop

1. Agents pull work from `company/product/roadmap.md` and `qa/`.
2. Work happens on a branch, always. Never on `main`.
3. Push triggers CI and a staging deploy.
4. The PR is registered in the review queue with a summary of what changed and why.
5. `/hq/review` shows the queue with staging links and diffs.
6. Human approves, requests changes, or rejects — from `/hq` or GitHub directly.
7. Approval merges and deploys to production.

**Never-blocked rule:** when the queue is full, agents must have a backlog of work that needs no
approval — tests, documentation, refactors, research written to `local/`. An idle agent is a
design failure.

### Escalation

Decisions an agent must not make alone: spending money, sending external communications,
publishing anything under the brand, schema migrations, changing auth or secrets, legal
commitments. These queue in `/hq/review` with a clear question and a recommendation.

---

## 9. Distribution: templates vs packages

The classic scaffolder mistake is conflating these. Morpheus keeps them strictly separate.

**Templates are copied at `init` and then owned by the project.** Scaffolding, config files,
brand document skeletons, starter routes. They will diverge — that is correct. `morpheus upgrade`
may offer a diff against a newer template, but never overwrites.

**Packages are dependencies and stay under Morpheus's control.** The `/hq` dashboard, design
system components, integration adapters, QA harness. A fix propagates on version bump.

The test: *if I improve this, do I want every existing project to get the improvement?* Yes →
package. No → template.

### Packages, not submodules

**Recommendation: npm packages via pnpm, published to GitHub Packages (private registry).**

Git submodules are a poor fit here specifically because agents operate the repos. Submodules
produce detached HEADs, silent staleness, and nested git state that confuses tooling — an agent
will get this wrong, repeatedly, in ways that are hard to detect. Packages give proper semver, so
a breaking change surfaces at install time instead of at runtime.

Caveat: the existing repos carry `.npmrc` overrides for a Polycam Artifactory registry. Morpheus
projects will need their own `.npmrc` scoping `@morpheus/*` to GitHub Packages. This is a known
friction point. **[open]** — see [Q3](#16-open-questions).

---

## 10. Secrets convention

Values never enter git. What enters git is a **manifest** declaring which secrets exist, what
they are for, and where they live — so an agent knows what it needs without being able to read it.

```jsonc
// secrets.manifest.json
{
  "STRIPE_SECRET_KEY": {
    "purpose": "Server-side Stripe API calls",
    "scope": ["production", "staging"],
    "store": "gcp-secret-manager",
    "consumers": ["apps/web"]
  }
}
```

Proposed tiering:

| Context | Store |
|---|---|
| Local development | `.env.local`, gitignored, populated by `morpheus secrets pull` |
| CI | GitHub Actions secrets |
| Runtime (production) | Google Secret Manager |

Source of truth is Google Secret Manager, consistent with the all-Google decision made earlier in
this project's design. GitHub Actions authenticates via Workload Identity Federation rather than
a long-lived key. **[open]** — see [Q4](#16-open-questions).

`morpheus doctor` verifies every manifest entry resolves in every declared scope, so a missing
secret is caught before deploy rather than at runtime.

---

## 11. Brand and design

Following the split already established: **brand is what changes in a rebrand; the design system
is what changes in a redesign.**

- **`company/brand/`** — project-owned, scaffolded from a template. `strategy.md`, `voice.md`,
  `visual-system.md`, `tokens.json` (primitives), `assets/`, and a `README.md` that indexes them
  in reading order. This structure is already working well in `cpheinrich.com` and `lakina`;
  Morpheus standardizes it.
- **`@morpheus/design`** — a package. Semantic tokens and React components. Consumes brand
  primitives, exposes `color.action.primary` rather than a hex value.
- **`packages/shared/`** — the Style Dictionary pipeline, generating `tokens.css`, `tokens.js`,
  and `Tokens.swift` from the project's primitives.

Token prefix convention: two-letter project prefix, as in `--lk-` for Lakina.

---

## 12. Project management as files

No Jira, no Linear. Three artifacts, all markdown, all in git, all rendered by `/hq/product`:

| File | Contents |
|---|---|
| `company/product/goals.md` | Annual and quarterly goals with measurable targets |
| `company/product/roadmap.md` | Ordered work items, each with status and linked PRs |
| `company/product/requests/` | One file per feature request, with source and status |

Roadmap items use a fixed frontmatter schema so both `/hq` and agents can parse them:

```yaml
---
id: RM-014
title: Ship calorie estimation pipeline
status: in-progress        # backlog | in-progress | review | shipped | dropped
goal: G-2026-Q3-01
owner: agent
prs: [42, 47]
---
```

The payoff over a hosted tool: an agent reads the entire roadmap in one file read, edits it in a
PR, and the change gets reviewed alongside the code it describes.

---

## 13. The init wizard

`morpheus init <name>` — interactive, with every answer written to `morpheus.json`.

1. **Identity** — name, display name, domain, one-sentence description
2. **Surfaces** — web (assumed), iOS, hardware
3. **Brand** — generate skeletons now, or point at an existing `brand/`
4. **Integrations** — which of the canonical list to wire up
5. **Secrets** — prompt for each required token, write to the configured store, never to disk
6. **Access** — email allowlist for `/hq`

Then it creates the local directory, scaffolds from templates, installs packages, initializes git,
creates the private GitHub repo, pushes, and configures Actions secrets and the Vercel project.

Target: a deployed skeleton at a real domain, with a working `/hq`, in a single command.

---

## 14. Hardware (optional)

Enabled only when the project has a physical component.

```
apps/hardware/
├── designs/            # CAD, schematics, revisions
├── bom/                # bill of materials, versioned
├── vendors/            # one file per vendor: contacts, terms, lead times, MOQ
└── procurement/        # POs, shipment tracking, QC records
```

Vendors and BOM are structured YAML rather than prose so `/hq/vendors` can render them and agents
can reason over cost and lead time.

---

## 15. What Morpheus is not

- Not multi-tenant, not a product, not sold.
- Not a way to avoid choosing a stack — it is the choice, made once.
- Not a replacement for Stripe, Firebase, or Gusto. Those moats are real.
- Not a runtime. Morpheus scaffolds and supplies packages; it is not in the request path.

---

## 16. Open questions

**Q1 — `apps/` and `company/` grouping.** This deviates from the flat `web/` + `shared/` layout in
all four current repos. It scales better to four surfaces plus eight business directories, but it
means existing projects would move files to adopt Morpheus. Worth it, or keep `web/` at root and
group only the business docs under `company/`?

**Q2 — Migrating existing projects.** Are `darwin`, `evo`, `cpheinrich.com`, and `lakina` meant to
be retrofitted onto Morpheus, or does Morpheus only apply to new projects? This changes how much
the structure should accommodate what already exists. `lakina` is the awkward case — Python core
plus a Vite site, not a Next.js app.

**Q3 — Package registry.** GitHub Packages is the natural fit but adds `.npmrc` scoping on top of
the existing Polycam Artifactory override. The alternative is publishing `@morpheus/*` to public
npm (code is not sensitive, just uninteresting to others) which removes all auth friction. Private
registry, or public packages in a private-source repo?

**Q4 — Secrets store.** Google Secret Manager is consistent with the all-Google decision but is
real setup per project. 1Password CLI (`op run`) is dramatically simpler and agent-friendly, at
the cost of a non-Google dependency. Which?

**Q5 — Analytics.** Earlier analysis favored Firebase Analytics with BigQuery export for
agent-queryable SQL over raw events, with PostHog Cloud as the alternative. Should Morpheus assume
one, or make it a wizard question?

**Q6 — Hosting.** Current projects use Vercel for Next.js and Cloudflare for DNS, with some
Cloudflare Workers usage in `darwin` and `lakina`. Is Vercel canonical, or should the default be
Cloudflare Workers now that DNS, R2, and the CDN are already there?

**Q7 — One repo per company, or a monorepo of companies?** Current assumption is one repo per
company. A single monorepo would make cross-project refactors trivial and package linking
instant, at the cost of blast radius and messy per-project deploys. Worth considering before the
convention hardens.

**Q8 — Support tooling threshold.** At what volume does first-party email support stop being
adequate and Chatwoot become worth self-hosting? Suggest defining a trigger now rather than
discovering it during an incident.

**Q9 — Staging.** Should every project get a permanent staging environment, or are Vercel preview
deployments per-PR sufficient? Previews are cheaper and better suited to the review-queue model,
but there is no stable URL to point at.

**Q10 — Review queue storage.** Where does the queue live? Deriving it from the GitHub API is
zero-maintenance but limits it to code changes. A Firestore collection would let agents queue
non-code decisions — spending approvals, copy review — at the cost of another store to maintain.
