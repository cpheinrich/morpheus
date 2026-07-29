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

## Distribution

**Do not publish `morpheus-kit` to npm** — 2026-07-29. Publishing only helps strangers install
it, which is the opposite of the goal. CI checks the repo out and builds the CLI; local use is
`pnpm build && npm link`.

**A licence cannot prevent forks of a public repo** — GitHub's Terms of Service grant every
user forking rights through GitHub's own functionality, regardless of the attached licence. If
the goal is minimal external use, the mechanism is private visibility, not a stricter licence.

## Tooling, continued

**Nimbalyst as the editor; our own PM suite for task state** — 2026-07-29. Nimbalyst renders
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
ownership begins when work begins. The remote branch (`rm-014-*`) *is* the claim — no assignee
field, no lock file, no new concept. Merging releases it by deleting the branch.

**Status is per person, not per session** — the point of the file is one place to look. Sessions
are covered by `.agent/journal/`. Split to `hq/status/<person>.md` when a second collaborator
joins a project, not before.
