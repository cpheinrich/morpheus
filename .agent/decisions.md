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

**Public repo** — purely to remove friction (public npm, no cross-org PAT, freely callable
workflows). Explicitly *not* a product: no marketing, no support, no stability guarantee.

**PolyForm Noncommercial 1.0.0** — source-available, commercial use needs a separate licence,
keeps monetization open. Contributions not accepted, so relicensing stays possible.

**Commit identity is the GitHub noreply address** — the gmail address should not appear in any
public repo.

## Process

**Extract on the second use, never the first** — nothing enters the kit until a second project
needs it.

**Retrofit by hand before building the initializer** — the retrofit *is* the specification.
Building `init` first would encode guesses about a structure no project has lived in.

**Agents do not touch another repo's `main`** — work on a branch, open a PR, let Chris merge.
