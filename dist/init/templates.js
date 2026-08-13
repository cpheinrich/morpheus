/**
 * What a Morpheus project starts as.
 *
 * Every template here is written from what the Evo and Darwin retrofits
 * actually needed, which is why this was deliberately built second. Guessing
 * the shape before doing it twice by hand would have produced a scaffold that
 * looked right and was wrong in ways nobody could name.
 *
 * Nothing emits a `TODO`. A file full of placeholders looks answered and is
 * not, which is worse than an absent file — the same rule the brand package
 * follows.
 */
import { EMPTY_ANALYTICS_EVENT_MAP } from "../analytics/contract.js";
export const manifest = (s) => JSON.stringify({
    name: s.name,
    prefix: s.prefix,
    kind: s.kind,
    // The handle puts `hq/team/<handle>.md` into the session-freshness
    // required set. It is the record a human actually replies in, so an
    // agent resuming without re-reading it is the failure the protocol
    // exists for — and the policy cannot derive a handle on its own.
    context: { handle: s.owner },
}, null, 2) + "\n";
export const firebaseConfig = (rulesPath) => JSON.stringify({ firestore: { rules: rulesPath } }, null, 2) + "\n";
/**
 * The public Morpheus repository.
 *
 * Every scaffolded project links back here, because a project's conventions are
 * only legible to someone who has read Morpheus — and the readers who most need
 * that are the ones who cannot be told: code review agents, which start with no
 * memory by design, and agents working for collaborators.
 */
export const MORPHEUS_REPO = "https://github.com/cpheinrich/morpheus";
/**
 * The callout every project carries, in two registers.
 *
 * Kept as constants rather than inlined so the wording is one fact. Five repos
 * carry this text; five copies that drift are five different answers to "what
 * is this repo".
 */
export const morpheusCalloutForAgents = () => `## This project is managed by Morpheus — read that first

This repository is architected and operated according to
[Morpheus](${MORPHEUS_REPO}), which is public. The directory layout,
the roadmap and inbox formats, the \`morpheus\` CLI, and the conventions below all come from
there. Very little of the *reasoning* behind them lives in this repo.

**Before reviewing or changing anything here, read:**

- [\`architecture.md\`](${MORPHEUS_REPO}/blob/main/architecture.md)
  — the specification: what the structure is, and why it is that way
- [\`AGENTS.md\`](${MORPHEUS_REPO}/blob/main/AGENTS.md)
  — the operating principles: claiming work, what a pull request must carry, the inbox cycle

This is aimed at agents arriving with **no memory of this project**. Without that context the
conventions here look arbitrary, and the resulting mistakes are confident ones: "tidying" a
generated file that is rewritten from its source, renaming an id that a branch and a PR both
depend on, deleting a worklog as clutter, or branching by hand instead of \`morpheus pm claim\`
and colliding with another agent's work.

### Found a gap in Morpheus itself?

If something in Morpheus is wrong, missing, or gets in your way while working here, **send it
upstream**. Do not quietly work around it in this repo — a local workaround fixes one project,
hides the defect from every other one, and leaves the next agent to rediscover it.

1. **Open an issue.** ${MORPHEUS_REPO}/issues
   It is the durable record, it needs no fork, and it is where triage happens.
2. **A pull request is welcome too**, especially carrying a fix you have verified — you hit the
   problem, so you can prove the fix works, and that reproduction is the expensive part to
   rebuild from a description.
3. **Create the roadmap item in your pull request**, with \`morpheus pm new roadmap "..."\`.
   Do not leave it for a maintainer: a roadmap id is a timestamp and \`baseSha\` is the commit
   **you** were on, so both only mean anything when recorded at the moment you hit the problem.
   Written afterwards by someone else, they record the wrong repository and a date days late.

A pull request from outside the project needs a fork; an issue does not. Note that a fork's CI
runs without secrets, so some checks skip and a first-time contributor's workflows need manual
approval — that is GitHub's behaviour, not a problem with your change.`;
export const morpheusCalloutForReadme = () => `## Built and managed with Morpheus

This project is architected and operated with
[Morpheus](${MORPHEUS_REPO}) — a public framework for structuring
and running a company's repositories so that agents can do the work.

That is why this repo has \`hq/\` for the business layer, \`.agent/\` for what agents have learned,
and roadmap items with prefixed ids. Those are Morpheus conventions, not local invention.

**If you are reviewing or contributing here — human or agent — read Morpheus first:**

- [Architecture](${MORPHEUS_REPO}/blob/main/architecture.md)
- [Operating principles](${MORPHEUS_REPO}/blob/main/AGENTS.md)

Most conventions in this repo have a reason recorded there rather than here, so without it they
read as arbitrary and get "corrected" into breakage.

Found a shortcoming in Morpheus while working here? **Open an issue** rather than working around
it locally — that is how Morpheus gets better. A pull request is welcome too, especially with a
fix you have verified; include the roadmap item in it, since a roadmap id is a timestamp and only
means anything recorded at the moment you hit the problem.

${MORPHEUS_REPO}/issues`;
/**
 * A README for humans.
 *
 * Deliberately short. `init` cannot know what the project *is*, and a template
 * that guesses produces prose nobody trusts — so it states only what is true of
 * every Morpheus project and leaves the description as one visible line to
 * fill in. The same rule as the rest of this file: no `TODO` that looks
 * answered.
 */
export const readme = (s) => `# ${s.name}

_One sentence on what this is._

${morpheusCalloutForReadme()}

## Working here

\`\`\`sh
morpheus init status    # how far through setup this repo is
morpheus pm claims      # what work is already taken
morpheus pm claim ${s.prefix}-001   # stake a branch and start
\`\`\`

Agent instructions are in [\`AGENTS.md\`](./AGENTS.md); \`CLAUDE.md\` symlinks to it.
`;
/**
 * A README for a directory that earns one.
 *
 * Not every folder does. The rule (see `AGENTS.md`) is that a folder gets one
 * when an agent could plausibly do the wrong thing without it: it feeds
 * something else, it has a convention filenames do not reveal, it is generated,
 * or it is a seam between projects. Framework-standard directories — `app/`,
 * `components/`, `__tests__/` — do not, because their meaning is universal and
 * a README restating it is noise that can also go stale.
 *
 * These are **short on purpose** and point at `architecture.md` for the
 * canonical explanation rather than repeating it. Locality is what a README
 * buys — eight lines where you are standing beat 1,400 lines in another repo —
 * but two copies of the same reasoning drift, so depth stays in one place.
 *
 * The previous scaffold wrote `Nothing here yet.` into every directory, which
 * looks documented and says nothing. A file full of placeholders is worse than
 * an absent one, the same rule the brand package follows.
 */
const SPEC = "https://github.com/cpheinrich/morpheus/blob/main/architecture.md";
export const dirReadmes = {
    "hq/team": () => `# Team

Who collaborates on this project, and what passed between them.

\`hq/\` is otherwise organised by business **function** — product, brand, marketing, finance. This
folder is a **medium**: one meeting covers three functions, so it belongs to none of them.

| Path | What |
|---|---|
| \`members.md\` | The roster — handles, names, and how to work with each person |
| \`<handle>.md\` | That person's live inbox — the human↔agent exchange |
| \`meeting-notes/\` | Distilled meeting summaries, never transcripts |

## Inboxes

One file per person, named for their GitHub handle — \`cpheinrich.md\`, not \`chris.md\`.

**These are the only files a human is expected to edit.** An agent writes a summary and numbered
items at the end of a session; the human replies inline after the \`~\` marker, and the next
session acts on the replies and archives the exchange to \`.agent/inbox-archive/\`.

An inbox is a snapshot, never a log. \`morpheus inbox validate\` enforces the shape and CI runs it.

## Everything here is raw input to a distillation

Meeting notes feed \`.agent/decisions.md\` and the roadmap; they are not meant to be read in bulk.
A note whose decisions were never promoted is an archive, and an agent that reads every archive
knows less, not more.

\`morpheus team validate\` checks the roster and every note.

See [the inbox cycle](${SPEC}) in the specification.
`,
    "hq/marketing": (s) => `# Marketing

SEO, content plans, and campaign notes for ${s.name}.

Positioning and voice live in \`hq/brand/\` and are **read** from here, not restated — a second
copy of the messaging is one that drifts from the brand package that generates it.

Start with \`analytics.md\`, \`launch-plan.md\`, and \`seo/strategy.md\`. Each begins as an
initialization brief, not evidence that setup or launch work has happened.
`,
    "hq/marketing/seo": (s) => `# SEO

Website search strategy, research, and operating notes for ${s.name}. Use OpenSEO for website
research; app-store search belongs in \`hq/marketing/aso/\` and uses Appeeky.

## Google Search Console is part of setup

When setting up or materially reviewing SEO, **try to complete Search Console setup yourself in
the authenticated browser**. Do not leave it as a list of clicks for the user merely because it is
in a web console.

1. Read the production domain and intended Google identity from \`morpheus.json\` and its account
   records. Confirm the canonical site, \`robots.txt\`, and \`sitemap.xml\` are publicly reachable.
2. Open the domain property in Google Search Console. Pin Google links with
   \`authuser=<email>\` when the identity is known. If the property is absent, create it and complete
   verification; use the project's canonical DNS provider when a domain-property TXT record is
   required (Cloudflare unless the §6.1 deviation table records otherwise).
3. Submit \`sitemap.xml\`; inspect Page indexing, Manual actions, and Security issues; fix safe,
   in-scope problems; then request indexing for the homepage and a small set of launch-priority
   routes. An accepted request is a crawl-queue request, **not evidence that Google indexed it**.
4. Record the property, submitted sitemap, requested URLs, observed status, remaining issues, and
   check date in this folder. Never validate a fix that was not made, and do not remove an existing
   Google verification token unless every service using it has been ruled out.

If the browser cannot proceed, **prompt the user immediately for the smallest missing prerequisite**:
sign in to the named Google account, complete an interactive security check, grant Search Console
access, approve an external DNS change, or choose between genuinely ambiguous identities. Say what
you tried and name the exact blocker; do not ask for passwords or verification codes in chat. Keep
the page ready and resume the setup when the prerequisite is supplied.

Search Console is Google's operational indexing surface; OpenSEO is the SEO research surface.
Missing one is not a reason to skip the other. See [search tooling and browser-first operation](${SPEC})
in the specification.
`,
    "hq/finance": (s) => `# Finance

Revenue and expense model, pricing, and runway for ${s.name}.

Numbers that a dashboard reads belong in structured files rather than prose, so \`/hq/finance\`
can render them without parsing sentences.
`,
    "hq/ops": (s) => `# Ops

Legal, contracts, vendors, and suppliers for ${s.name}.

Contracts themselves are not committed — this holds the index and the decisions, not the PDFs.
Large binaries do not belong in a text repository.
`,
    "qa": () => `# QA

Acceptance criteria, test plans, and known defects.

\`qa/acceptance/<name>.md\` is the input to verifier rung 3: a roadmap item's \`acceptance\` field
names a file here, and the check is whether the shipped work meets it. An item with no
\`acceptance\` has nothing to verify against, which is the gap this directory exists to close.

Unit and integration tests live beside the code they test, not here.

See the verifier stack in [the specification](${SPEC}).
`,
    "qa/acceptance": () => `# Acceptance criteria

One file per roadmap item, named by that item's \`acceptance\` field.

Written **before** the work, in terms a reviewer can check without reading the implementation:
what a user can now do, what the system must refuse, what must not have changed. If it can only be
verified by reading the diff, it is a test, not an acceptance criterion.
`,
    "infra": () => `# Infra

Deployment configuration, security rules, and environment definitions.

\`firestore.rules\` is partly **generated** — the role helpers between the \`morpheus:begin roles\`
markers come from the role vocabulary and are rewritten by
\`morpheus hq rules --rules-path <the rules file firebase.json deploys>\`. Verify that path before
running the command: the checked file and the deployed file must be the same gate. The \`match\`
blocks around them are yours. Never hand-edit inside the markers.

Provisioning is not here: consoles, DNS and hosting need credentials this repo should not hold.

See [access control](${SPEC}) in the specification.
`,
};
/**
 * Project-owned marketing briefs. They are deliberately useful before any provider is configured,
 * and the marker lets doctor distinguish a copied starting point from completed project work.
 */
export const marketingAnalytics = (s) => `<!-- morpheus:template marketing-analytics -->
# Analytics initialization — ${s.name}

> **Scaffold status:** this is an initialization brief, not evidence that analytics is installed.
> Replace this callout and remove the template marker after the project-specific setup, privacy
> choices, dashboards, and production verification are recorded here.

## Outcome and decisions

State which product and marketing decisions measurement should inform. Inventory the deployed
surfaces, important user journeys, launch channels, and existing analytics before naming events.
Do not collect data merely because a provider makes it available.

## Event contract first

1. Populate \`packages/shared/schema/analytics.ts\` with project-owned semantic events and explicit
   property allowlists. Keep provider-native lifecycle events such as pageviews provider-native.
2. Name the decision or metric served by every custom property. Prefer low-cardinality dimensions
   and version each event.
3. Keep PostHog transport and framework-specific helpers in the consuming app. A provider binding
   must not become the product vocabulary.

## Privacy boundary

Record the project's actual boundary before instrumentation. The default is no personal or
sensitive data, health or financial inputs/results, free text, raw URLs or query strings, broad
autocapture, session replay, or console capture without an explicit reviewed exception.

PostHog can provide acquisition, approximate geography, browser, operating-system, and device
context. Do not represent those as reliable age, gender, income, ethnicity, medical, or other
demographic attributes. Classify every credential: a browser-visible project token is not a
personal API key, and private credentials never belong in public environment variables or this
record.

## PostHog initialization

1. Resolve the intended organization, account identity, and existing project from \`morpheus.json\`
   and current provider state. Do not create, delete, or replace a project merely because it was
   not found under the first identity checked.
2. Configure privacy controls in PostHog as well as in code. Record raw-IP handling, person-profile
   behavior, autocapture, replay, console capture, retention, and any consent requirement.
3. Install the SDK per real surface and environment. Separate production from local and preview
   traffic, and attach only the common context allowed by the shared contract.
4. Build a small dashboard or saved views tied to the decisions above. Record durable provider
   identifiers and links, never secret values.

## Verification

- Exercise each canonical event through the production product and confirm it arrives once with
  the expected name, environment, release, and allowlisted properties.
- Inspect raw payloads for accidental inputs, results, identifiers, query strings, or preview data.
- Confirm disabled collection remains absent and dashboard filters use actual production schema.
- Record the verification date, tested routes/surfaces, known gaps, and the weekly review owner.

Analytics is initialized only when the contract, provider configuration, live ingestion, privacy
inspection, and decision-linked reporting agree.
`;
export const marketingSeoStrategy = (s) => `<!-- morpheus:template marketing-seo -->
# Website SEO strategy — ${s.name}

> **Scaffold status:** this is an initialization brief, not a completed strategy. Replace this
> callout and remove the template marker after current site, OpenSEO, Search Console, audience, and
> competitive evidence have been recorded.

## Strategy in one sentence

State the audience, problem, differentiated asset, and discovery wedge. Read positioning and voice
from \`hq/brand/\`; do not create a second brand strategy here.

## Evidence and baseline

1. Confirm the canonical production domain, market and language, route inventory, redirects,
   canonicals, robots policy, sitemap, structured data, performance, and index boundaries.
2. Use **OpenSEO** for website audits, keyword research, SERPs, competitors, backlinks, and search
   opportunities. Use Google Search Console for operational indexing state and performance.
3. Record the date range, properties/project ids, crawl scope, failures, and unknowns. Search-volume
   and difficulty estimates are directional; never turn unavailable evidence into a confident zero.
4. Reconcile opportunities with product truth, brand, legal, safety, editorial, and evidence limits.

App-store discovery is a different discipline. Use **Appeeky** for App Store or Google Play
keywords, ranks, competitors, reviews, and charts; never substitute website-search data for ASO.

## Search portfolio

- Document current strengths and gaps.
- Map each priority query or intent cluster to one canonical existing or proposed page.
- Separate utility, commercial, navigational, and supporting-information intent.
- List exclusions: queries the project will not pursue because fit, evidence, safety, or trust is
  insufficient.

## Foundation and authority

Record required technical fixes, internal linking, trust/authorship, editorial standards,
structured data, and original evidence. Define link-worthy assets and earned-distribution ideas
without treating outreach, posting, or paid placement as authorized.

## Measurement and phased plan

Define weekly Search Console and PostHog review, periodic OpenSEO research, and 14/30/60/90-day
milestones. Keep indexing requests distinct from indexed results, referral discovery distinct from
backlink authority, and scheduled paid research/rank tracking behind an explicit cost decision.
`;
export const marketingLaunchPlan = (s) => `<!-- morpheus:template marketing-launch -->
# Launch plan — ${s.name}

> **Scaffold status:** this brief does not authorize publishing, posting, outreach, account
> creation, spending, moderator contact, or store submission. Replace this callout and remove the
> template marker only after a project-specific plan and its approval gates are recorded.

## Shared launch frame

Define the launch objective, audience, promise, differentiated asset, current readiness, named
owner, measurement window, and stop conditions. Read positioning from \`hq/brand/\`, website search
work from \`seo/strategy.md\`, and event definitions from \`analytics.md\` plus
\`packages/shared/schema/analytics.ts\`.

Separate referral discovery, product learning, earned authority, and conversion goals. A raw link,
download, impression, or account total is not a strategy by itself.

## Website launch plan

### Readiness and assets

- Inventory production routes and classify each as ready, conditional, deferred, or excluded.
- Verify product behavior, mobile/accessibility basics, metadata, canonicals, robots, sitemap,
  trust/legal surfaces, sources and claims, analytics privacy, and production event delivery.
- Establish a current Search Console/OpenSEO baseline before interpreting launch movement.

### Channels and sequence

Choose channels from actual audience fit: owned profiles or newsletters, communities, direct
answers, partners/resource lists, press, and durable search. For every channel record current rules,
relationship/disclosure requirements, exact asset, useful contribution, approval owner, and risk.

Use staged phases rather than a single announcement:

1. **Foundation:** finish readiness, establish measurement, and participate without links where
   reputation or community fit must be earned.
2. **Constrained soft launch:** approve a small number of attributable placements, spaced so their
   effects and reputation cost can be understood.
3. **Learn before expanding:** review removals, replies, referrals, meaningful product events, and
   qualitative feedback; pause when safety, policy, or trust concerns appear.
4. **Durable discovery:** turn validated questions into useful owned content and pursue earned
   citations or partnerships without manufacturing links.

### Placement and measurement log

For each planned external action, record the live destination and rules, exact copy, disclosure,
approval, permalink, moderation outcome, referred visits, meaningful events, and product learning.
The plan prepares drafts; the user separately approves the actual external action.

Define go/no-go gates and review points for launch day, 72 hours, 14 days, and 30 days. Connect each
decision rule to events that already exist; never collect sensitive inputs or invent a completion
event merely to improve attribution.

## App launch plan — placeholder

No app launch is implied by this scaffold. Leave this section as a placeholder until a real iOS or
Android build, bundle identity, store account, listing, privacy disclosures, screenshots, app
analytics, review process, and release candidate exist.

When those prerequisites are real, replace this section with:

- store and market scope, release type, ownership, and launch objective;
- App Store/Google Play readiness, privacy labels, review risks, support and rollback plan;
- **Appeeky** ASO research and store-specific keyword/competitor evidence, never OpenSEO web data;
- beta/TestFlight or staged-rollout gates, crash and analytics verification, launch assets and copy;
- store submission authorization, review monitoring, ratings/review response policy, and
  1/7/14/30-day decision rules.

Until then, record only the missing prerequisites and do not create speculative store metadata or
claim an app launch date.
`;
export const agents = (s) => `# ${s.name} — agent instructions

Read this before doing anything. \`CLAUDE.md\` is a symlink to this file so Claude and Codex
read the same instructions.

${morpheusCalloutForAgents()}

## Layout

| Path | What |
|---|---|
| \`hq/product/\` | Roadmap, goals and requests — the board agents pick work from |
| \`hq/team/<handle>.md\` | How a person and their agents exchange state |
| \`hq/brand/\` | Strategy, voice, visual system and tokens |
| \`hq/onboarding.md\` | Setup checklist — \`morpheus init status\` |
| \`.agent/decisions.md\` | Settled choices and why — **read this first** |
| \`.agent/learned.md\` | Things that have bitten us |
| \`.agent/worklog/\` | What was attempted per task, including dead ends |

${contextFreshness()}
## Working conventions

**Claim work before starting it:**

\`\`\`sh
morpheus pm claims             # what is already taken
morpheus pm claim ${s.prefix}-001      # stakes the branch on origin, sets in-progress
\`\`\`

The remote branch **is** the claim. Never create the branch by hand — \`pm claim\` derives it from
the item id, so the two cannot disagree.

**Every PR must carry** tests for anything testable, a documentation update when behaviour
changes, a test plan, any open questions stated plainly rather than guessed at, and the roadmap
item moved to \`review\`.

**Before opening a PR**, run \`morpheus pm index\` and commit any index changes. CI runs the same
check and will fail otherwise.

**Append a worklog entry** to \`.agent/worklog/YYYY-MM-DD-slug.md\`. Record dead ends especially —
git history cannot hold work that produced no code, and that is the expensive knowledge.

## Branch protection

\`main\` is protected. **Never push to \`main\`** — work on a branch, open a PR, and merge it
yourself once checks pass.

\`\`\`sh
gh pr merge <n> --squash --auto --delete-branch
\`\`\`

## Style

- Small, single-purpose modules with named exports
- Explicit types at boundaries; inference inside
- Errors surfaced as data rather than thrown, so one bad input cannot abort a batch
- Comments that explain *why*, not *what*
`;
export const decisions = (s) => `# Decisions

Settled choices and the reasoning behind them. **Read this at the start of every session.**

If a decision here looks wrong, say so and ask — do not quietly work around it. A decision worked
around rather than revisited is one that gets made again, differently, next month.

Each entry: what was decided, when, and the reason. The reason is the part that matters; the
decision alone cannot be re-evaluated when circumstances change.

## ${new Date().toISOString().slice(0, 10)} — ${s.name} follows the Morpheus structure

\`hq/\` for the business, \`.agent/\` for what agents learn, ids prefixed \`${s.prefix}-\`.

**Why:** conventions shared across projects mean an agent that has worked on one can work on any of
them, and improvements to CI or tooling land once rather than per repository.
`;
export const learned = () => `# Learned

Things that have bitten us. Not decisions — those live in \`decisions.md\` — but the surprises
worth not rediscovering.

Add an entry when something cost you more than ten minutes and the cause was not obvious.
`;
/**
 * The provider-neutral analytics contract every user-facing project owns.
 *
 * It is deliberately dependency-free. A fresh Morpheus project may not use
 * TypeScript at runtime, but the repository still needs one reviewable source
 * of truth that web, mobile and backend adapters can implement.
 */
export const analyticsSchema = () => `/**
 * Canonical analytics contract for this project.
 *
 * Keep this file provider-neutral. PostHog, Firebase Analytics and other SDKs
 * are transports; product event names and properties are product decisions.
 * Non-TypeScript clients conform to this contract manually until generated
 * schemas earn their complexity.
 */

export const ANALYTICS_SCHEMA_VERSION = 1 as const;

export const ANALYTICS_SURFACES = ["web", "ios", "android", "backend"] as const;
export type AnalyticsSurface = (typeof ANALYTICS_SURFACES)[number];

export const ANALYTICS_ENVIRONMENTS = [
  "development",
  "preview",
  "production",
  "test",
] as const;
export type AnalyticsEnvironment = (typeof ANALYTICS_ENVIRONMENTS)[number];

export type AnalyticsScalar = string | number | boolean;

export type AnalyticsEventProperties<Properties> = {
  [Property in keyof Properties]: Property extends "event_version"
    ? number
    : AnalyticsScalar | undefined;
} & { event_version: number };

/**
 * Makes missing event versions and nested property values fail at typecheck.
 * Naming and sensitive-data semantics still require review.
 */
export type DefineAnalyticsEvents<
  Events extends {
    [Name in keyof Events]: AnalyticsEventProperties<Events[Name]>;
  },
> = Events;

/** Attached by each surface's analytics adapter to every custom event. */
export interface AnalyticsContext {
  schema_version: typeof ANALYTICS_SCHEMA_VERSION;
  surface: AnalyticsSurface;
  environment: AnalyticsEnvironment;
  release?: string;
}

/**
 * Add product events here as lower_snake_case semantic outcomes.
 *
 * Example shape:
 *   account_created: { event_version: 1; method: "email" | "apple" };
 *
 * Every event has an explicit property allowlist and its own event_version.
 * Do not add personal or sensitive data, health inputs or results, free text,
 * raw URLs, query strings, or values already supplied by the analytics SDK.
 * Standard page and screen lifecycle events remain SDK-native.
 */
export type ProjectAnalyticsEvents = DefineAnalyticsEvents<
  ${EMPTY_ANALYTICS_EVENT_MAP}
>;

export type AnalyticsEventName = Extract<keyof ProjectAnalyticsEvents, string>;
export type AnalyticsEvent<Name extends AnalyticsEventName> = {
  name: Name;
  properties: AnalyticsContext & ProjectAnalyticsEvents[Name];
};
`;
export const sharedReadme = () => `# Shared product contracts

This package boundary holds provider-neutral contracts and generated assets used by more than one
deployable surface. Applications under \`apps/\` own their provider adapters and runtime wiring.
`;
export const sharedSchemaReadme = () => `# Shared schemas

Product-owned source contracts live here. This includes analytics event vocabularies as well as
database document shapes; generated client types and provider-specific adapters live elsewhere.
`;
export const agentReadme = () => `# .agent

Four records, each answering a different question.

| File | Question it answers |
|---|---|
| \`decisions.md\` | What did we settle, and why? |
| \`learned.md\` | What has bitten us before? |
| \`worklog/\` | What happened during this task, including what failed? |
| \`inbox-archive/\` | What was asked and answered, and when? |

The split matters because they have different lifetimes. A decision stays true until reversed. A
worklog entry is a snapshot and is never edited. An inbox is a live document; its archive is the
record.
`;
export const worklogReadme = () => `# Worklog

One file per task: \`YYYY-MM-DD-slug.md\`, with frontmatter naming the roadmap item and outcome.

\`\`\`md
---
date: 2026-07-29
agent: claude
roadmap: XX-001
outcome: shipped | abandoned | blocked | research
summary: One line.
---
\`\`\`

**Record dead ends.** Git history holds what worked; only this holds the two hours spent proving
an approach could not work, which is exactly what the next person needs.
`;
export const inboxArchiveReadme = () => `# Inbox archive

Past inbox cycles with their replies, filed \`YYYY-MM-DD-HHMM-<handle>.md\` — date first, so the
directory reads as one timeline.

An inbox is a snapshot and never accumulates history. This is the record.
`;
/**
 * Deliberately short, and deliberately a pointer.
 *
 * The canonical version — frontmatter fields, both redaction passes, the
 * public-repo rule — is 130 lines in Morpheus's own `hq/team/meeting-notes/`.
 * Copying it into every project would give one copy per repo to drift, and the
 * one that drifts is a document about what may be published. What locality
 * buys is the *gate* being visible where somebody is standing; the depth stays
 * in one place.
 */
export const meetingNotesReadme = () => `# Meeting notes

**A summary, never a transcript.** One file per meeting, named
\`PREFIX-YY-MM-DD-HH.MM.SS-short-handle.md\`, where the timestamp is when the meeting *started* — in
the wall clock of the people who were in it, with the offset in \`occurred\`.

A transcript is high volume and low signal; storing them would make an agent's context worse rather
than better. What is worth keeping is what was decided, what someone has to do, and enough of the
reasoning that a decision can be argued with later.

**\`redacted: true\` is a claim you are making**, and \`morpheus team validate\` refuses a note without
it. It means you have stripped everything not about this project, and checked that the note is
something you would be relaxed about being read back — by the team, by the person it is about, or
by a stranger in a year.

The canonical format, the frontmatter fields, and both redaction passes are documented once, in
[Morpheus](https://github.com/cpheinrich/morpheus/blob/main/hq/team/meeting-notes/README.md).
Depth stays in one place so two copies cannot drift.

A note is **raw input**: its decisions belong in \`.agent/decisions.md\` and its action items on the
roadmap. A note whose outputs were never promoted is an archive, which is much less useful than it
looks.
`;
export const inbox = (s) => `---
owner: ${s.owner}
date: ${new Date().toISOString().slice(0, 10)}
agents: [human]
---

Nothing yet. An agent writes here at the end of a working session: a prose summary of what got
done, then numbered items you reply to inline.

## \u2705 1. How this file works \u00b7 \`human\`

Each item is **either** closed or open, never both and never neither. The state lives in the
heading, because \u2757 and \u2705 carry colour and scanning should not depend on the renderer.

An open item ends in a \`~\` on its own line. Type your answer after it, leaving the marker in
place. On its next turn the agent reads your replies, acts on them, promotes anything durable to
\`.agent/decisions.md\`, archives the exchange to \`.agent/inbox-archive/\`, and writes a fresh
inbox.

An inbox is a snapshot and never accumulates history. \`morpheus inbox validate\` enforces the
shape, and CI runs it too.
`;
/**
 * CI for the project, matched to what the project actually is.
 *
 * `node-ci` runs `pnpm install --frozen-lockfile`, so wiring it into a static
 * site or a Python repo fails on the first push. A scaffold whose CI is red on
 * day one teaches people to ignore red CI, which costs more than the workflow
 * was worth.
 *
 * The convention checks are toolchain-agnostic — they build the Morpheus CLI
 * from a checkout — so every project gets those.
 */
export const ci = (opts = { node: true }) => `name: CI

# Delegates to the Morpheus reusable workflows, so improving CI for every
# project is one commit there rather than a change in every repository.

on:
  push:
    branches: [main]
  pull_request:

jobs:${opts.node
    ? `
  node:
    uses: cpheinrich/morpheus/.github/workflows/node-ci.yml@main
`
    : ""}
  pm:
    uses: cpheinrich/morpheus/.github/workflows/pm-check.yml@main${opts.rulesPath
    ? `
    with:
      hq-rules-path: ${opts.rulesPath}`
    : ""}

  pr:
    uses: cpheinrich/morpheus/.github/workflows/pr-check.yml@main
`;
export const productReadme = (kind, s) => {
    const blurb = {
        roadmap: `Work, one file per item. Ids are \`${s.prefix}-001\` upward.\n\nCreate with \`morpheus pm new roadmap "Title"\`. The table below is generated — edit the item files, not this.`,
        goals: `What the work is for. A roadmap with no goal is a list nobody can decline.\n\nCreate with \`morpheus pm new goals "Title"\`.`,
        requests: `Incoming asks, before they become roadmap items. Triage, then accept or decline —\ndeclining explicitly is the point.`,
    }[kind];
    return `# ${kind[0].toUpperCase()}${kind.slice(1)}

${blurb}

<!-- morpheus:begin -->
<!-- morpheus:end -->
`;
};
export const hqReadme = (s) => `# ${s.name} HQ

Everything about running ${s.name} that is not code.

| Directory | What |
|---|---|
| [\`product/\`](./product) | Roadmap, goals and incoming requests |
| [\`inbox/\`](./inbox) | One file per person — how humans and agents exchange state |
| [\`brand/\`](./brand) | Strategy, voice, visual system, tokens |
| [\`onboarding.md\`](./onboarding.md) | Setup checklist — \`morpheus init status\` |

Markdown with YAML frontmatter is the source of truth. Index tables are generated between the
\`morpheus:\` markers and are never edited by hand.
`;
export const gitignore = () => `
# Morpheus
local/
.env
.env.local

# Editor-pasted images, which land at the repo root or in the folder that
# happens to be open. A 448 KB screenshot reached a public repository that way.
#
# Scoped to the root rather than \`*.png\` on purpose: a brand session produces
# moodboards, mockups and logo exports, and a scaffold that quietly ignores the
# design work is worse than one that occasionally lets a screenshot through.
/*.png
/*.jpg
/*.jpeg
local/**/*.png

# Raw reference material is design input, not the final asset library. Keep
# the folder and its README visible, but retain the selected board's source and
# provenance in hq/brand/moodboards.md and approved delivery art in imagery.json.
hq/brand/moodboard/*
!hq/brand/moodboard/README.md
`;
/**
 * A local, discoverable instruction for the visual-first brand workflow.
 *
 * `explore-prompt.md` is the handoff for one particular brand session; this
 * stays with every new project so a later agent knows how to resume the work
 * after that handoff has been archived or revised.
 */
export const brandReviewSkill = () => `---
name: brand-review
description: Create, iterate, or finalize a visual-first Morpheus brand exploration. Use when a project has hq/brand/vibes.txt and moodboard references, when reviewing research/brand.html, or when applying a selected direction to a home page or app.
---

# Visual-first brand review

Read \`hq/brand/README.md\`, \`vibes.txt\`, the useful files in \`moodboard/\`, the current
\`research/brand.html\`, and \`decisions.md\` before making a visual call.

## Explore

Create one standalone \`research/brand.html\` with five genuinely distinct, stable named
directions. Keep the same product content, hierarchy, sample screens, and CTA in every direction
so people can compare the visual system rather than five different briefs.

Give each direction a Brand System, Home mock, Marketing mock, and Typography view. Include a
substantial Compare All view with art, palette, type, UI primitives, and product snapshots. Keep
the required \`data-morpheus-concept\` and \`data-morpheus-view\` markers from
\`explore-prompt.md\`, make the page usable at desktop and mobile widths, and record settled,
rejected, and open choices in \`decisions.md\` after each review.

## Finalize

Do not promote a direction until a person chooses it or names an intentional hybrid. Run
\`morpheus brand finalize --selection "Name"\`, then write the canonical records it names.

Retain the concept page. Preserve selected moodboards in \`moodboards.md\` and approved diagrams,
photography, illustrations, or textures in \`imagery.json\` with provenance, alt text, and named
placements. In \`application.md\`, map every asset id to a public-web or product surface. The first
homepage or app screen must visibly use the full selected package — messaging, tokens, type,
layout, and mapped imagery — not tokens and copy alone.
`;
/**
 * Claude Code's session hooks.
 *
 * One hook, and it is deliberately **informational rather than blocking**.
 * `context brief` prints what the session is missing and always exits 0; the
 * refusal lives in the `morpheus` CLI, which is provider-neutral and needs no
 * per-project wiring. A blocking `PreToolUse` hook would fire on every edit,
 * and a gate that fires constantly is a gate people disable — permanently,
 * where the staleness was temporary.
 *
 * Codex reads `AGENTS.md`, not this file, which is why the instruction is in
 * both places and the enforcement is in neither.
 */
export const claudeSettings = () => JSON.stringify({
    hooks: {
        SessionStart: [
            {
                hooks: [
                    {
                        type: "command",
                        // Bare, not `pnpm morpheus`. `init` writes no `package.json`,
                        // so a scaffolded project has nothing for pnpm to resolve —
                        // and AGENTS.md documents `npm link` putting `morpheus` on
                        // PATH. Wrapping it also puts a layer in front that fails for
                        // its own reasons, which is what `context brief` exiting 0 by
                        // design was meant to avoid.
                        command: "morpheus context brief",
                    },
                ],
            },
        ],
    },
}, null, 2) + "\n";
/**
 * The freshness section every project's AGENTS.md carries.
 *
 * Short, and pointing rather than repeating — the reasoning is one copy, in
 * `architecture.md` §7.10. What has to be local is the two commands and the
 * list of what is refused, because an agent that has to follow a link to find
 * out it is about to be refused will not follow it.
 */
export const contextFreshness = () => `## Context freshness

**Read \`.agent/decisions.md\`, \`.agent/learned.md\` and your inbox, then:**

\`\`\`sh
morpheus context refresh
\`\`\`

This takes a *context receipt* — your assertion that you have loaded current project state,
fingerprinted against the tip of the trunk — \`origin/main\` unless \`context.trunk\` says
otherwise, see the fork note below. It is good for five minutes, after which the next governed
command re-checks the trunk and those records.

**Until you have one, these are refused:** \`pm claim\`, \`pm new\`, \`pm link-issue\`, \`pm block\`,
\`access sync\`.
Read-only and mechanical commands are not gated.

\`\`\`sh
morpheus context status    # what the current lease says, and how old it is
morpheus context check     # exit non-zero unless fresh — for hooks and scripts
morpheus context brief     # session start: discards the last receipt, says what to read
\`\`\`

\`context brief\` is what \`.claude/settings.json\` runs at the start of a session — the only
Morpheus command this project runs automatically.

**When something has moved**, \`context refresh\` prints what landed on the trunk and which
records changed. Re-read those, then refresh again — the delta is the point, not the ceremony.

**Offline**, set \`MORPHEUS_OFFLINE=1\` — or pass \`--offline\`. Local work proceeds; anything that leaves the machine —
pushing a claim, granting access — is still refused, because an unverified trunk is exactly
when you should not be operating external controls. **\`pm block\` still works**: it writes the
records and skips the push, telling you the block is not visible to other sessions yet. Blocking
rather than guessing is the one escape hatch a stuck session needs most.

**On a fork**, set \`"context": { "trunk": "upstream/main" }\` in \`morpheus.json\`. \`origin\` is
your fork, whose \`main\` sits still while the real trunk moves — measured against it, a lease
certifies fresh forever.

Receipts live in \`local/sessions/\`, which is gitignored. A receipt says *this working copy read
these files*, which is true of one machine — committing it would turn a local observation into a
claim about everyone. Shared evidence stays the worklog, the commit and the PR.

Why this exists, and the failure modes it is built against:
[\`architecture.md\` §7.10](${MORPHEUS_REPO}/blob/main/architecture.md).
`;
//# sourceMappingURL=templates.js.map