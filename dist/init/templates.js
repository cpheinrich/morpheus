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
import { DEFAULT_VISUAL_EVIDENCE } from "../check/visual-evidence.js";
import { STATIC_ROADMAP_README } from "../pm/index-gen.js";
export const manifest = (s) => JSON.stringify({
    name: s.name,
    prefix: s.prefix,
    kind: s.kind,
    // The handle puts `hq/team/<handle>.md` into the session-freshness
    // required set. It is the record a human actually replies in, so an
    // agent resuming without re-reading it is the failure the protocol
    // exists for — and the policy cannot derive a handle on its own.
    context: { handle: s.owner },
    review: { visualEvidence: DEFAULT_VISUAL_EVIDENCE },
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
export const codebaseMemoryBootstrap = () => `## Device bootstrap

The checked-in \`.morpheus/session-start.sh\` shim first asks whether the installed CLI supports
current self-update. When it or \`morpheus context brief\` reports that Morpheus is stale and
automatic updates are unconfigured, ask the user exactly: **"Morpheus is stale. Enable automatic
updates after pulls on this device?"** Do not infer consent.

- If the shim reports **Morpheus bootstrap required**, a yes runs
  \`sh .morpheus/bootstrap.sh enable\`; a no runs \`sh .morpheus/bootstrap.sh disable\`.
- Otherwise a yes runs \`morpheus self auto-update enable\`; a no runs
  \`morpheus self auto-update disable\`.

The legacy bootstrap never invokes the installed \`morpheus\` binary. After yes it clones reviewed
Morpheus \`main\` into a disposable directory, installs that clone's reviewed lockfile, and invokes
its committed CLI directly. That installs the current self-contained package, registers this
project, enables managed \`post-merge\` and \`post-rewrite\` hooks, then removes the clone. No
records the choice without installing anything. \`morpheus self check\` remains the read-only
freshness check.

Before structural code discovery, run \`morpheus codebase-memory install --check\`. If it is not
operational, run \`morpheus codebase-memory install\` on the trusted device. It is idempotent: it
installs Morpheus's reviewed package pin when absent or at another version, configures supported
local agent clients, enables automatic indexing and watching, and fully indexes this exact
checkout. It verifies the index against \`HEAD\`. A worktree needs its own exact-checkout index even
when the main clone is indexed.

Installing codebase-memory is an explicit device action, never an npm lifecycle script or a
session-hook download. Its version remains pinned until a reviewed Morpheus change advances it,
and the check requires the installed version to match. Morpheus auto-update is separately gated by
the user's remembered device-level consent.`;
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
morpheus codebase-memory install --check   # verify this device and exact checkout
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

This folder is the operating home for ${s.name}'s virtual AI CMO: a continuing growth system that
maximizes qualified attention and traffic while protecting the project's brand, users, and
reputation. It turns market, search, competitor, product, and channel evidence into prioritized
experiments and durable project records.

Positioning and voice live in \`hq/brand/\` and are **read** from here, not restated — a second
copy of the messaging is one that drifts from the brand package that generates it.

## The CMO loop

1. **Observe:** ingest current product analytics, Search Console, website and store research,
   channel-native analytics, customer language, market movement, and competitor evidence.
2. **Diagnose:** distinguish reach, qualified traffic, activation, retention, trust, and revenue;
   name uncertainty and data-quality limits instead of manufacturing precision.
3. **Prioritize:** maintain a small portfolio across SEO, ASO, GEO/AI visibility, platform-native
   social, community participation, partnerships, and launch work.
4. **Create and distribute:** derive truthful channel-specific work from the product and brand.
   Do not paste identical copy everywhere or manufacture a founder/customer voice.
5. **Measure and learn:** use tagged destinations and semantic events, compare against a baseline,
   record qualitative feedback and policy outcomes, and feed decisions back into the roadmap.

This is a continuing operating loop, not permission for unattended publication. Every automated
job must default to research, drafting, validation, or dry-run mode; resolve the exact account,
current platform rules and API access; prevent duplicates; and retain an audit trail. Posting,
replying, direct messaging, outreach, spending, creating accounts, and changing credentials require
the project's explicit approval policy. Never automate votes, follows, fake engagement, or
unsolicited interaction.

## Working records

| Area | Record |
|---|---|
| Measurement and privacy | \`analytics.md\` |
| Website search (OpenSEO) | \`seo/strategy.md\` |
| App-store search (Appeeky, when applicable) | \`aso/\` |
| Website and future app launch | \`launch-plan.md\` |
| Instagram | \`instagram/README.md\` |
| LinkedIn | \`linkedin/README.md\` |
| X | \`x/README.md\` |
| Reddit | \`reddit/README.md\` |
| Research, experiments, and reusable content | \`research/\`, \`experiments/\`, and \`content/\` |

The channel folders are created even when no account exists. Their account fields are a setup
reminder and their guidance is a starting point, not evidence that an account or posting program
has been approved. Store public handles and profile URLs there; never store passwords, recovery
codes, session cookies, tokens, or private account credentials in git.

Start by replacing the initialization markers in \`analytics.md\`, \`launch-plan.md\`, and
\`seo/strategy.md\` with verified project state. Then establish a weekly growth review and a
monthly market/search/competitor refresh, adjusting cadence to the project's evidence and risk.
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
    "hq/marketing/instagram": (s) => `# Instagram

Instagram is a visual discovery and relationship channel for ${s.name}. Use it to earn qualified
attention with original, useful, platform-native work — not as a mirror of every other feed.

## Account

| Field | Value |
|---|---|
| Status | Not created |
| Username | — |
| Profile URL | — |
| Owner/admin | — |
| Last verified | — |

Update these public account fields when an account is created. Keep passwords, recovery methods,
session cookies, tokens, and private admin details out of git. Record the exact professional
account in any automation configuration before a job can leave dry-run mode.

## What to publish

- Start with one audience problem, insight, demonstration, or proof point. Make the first frame
  understandable without relying on the caption.
- Use Reels for motion, demonstrations, stories, and discovery; carousels for steps, comparisons,
  and saveable reference material; feed images for a strong single idea; Stories for timely
  follow-up and existing-audience interaction.
- Create original work or add material analysis, explanation, or transformation. Do not repost
  low-value copies, buy engagement, or use exaggerated health or financial claims.
- Keep on-screen text readable, add accurate captions to spoken video and useful alt text, and
  assume some people watch without sound.
- Write a specific caption and one natural next step. Use only relevant tags, locations, mentions,
  and hashtags; test them rather than treating a generic hashtag count as a rule.
- Match the profile link and tagged destination to the post's promise. A click to an unrelated
  homepage is not a useful conversion path.

## Operating loop

Plan from real product releases, customer questions, research, and proven owned content. Adapt the
idea to Instagram instead of pasting cross-platform copy. Before publishing, verify claims,
sources, rights, disclosures, visual accessibility, landing-page readiness, and recommendation
eligibility in Account Status. Replies and direct messages are human-reviewed external actions.

Review non-follower reach, watch behavior, shares, saves, profile actions, link actions, qualified
sessions, and product activation together. Record what the audience actually did and said; do not
optimize to impressions alone.

Scripts may collect approved metrics, prepare drafts, validate assets, and assemble a review queue.
They must not create accounts, publish, comment, message, follow, or manufacture engagement without
an explicit project policy and approval for that external action.

## Current official guidance

- [Instagram Best Practices hub](https://about.fb.com/news/2024/10/best-practices-education-hub-creators-instagram/)
- [Recommendations on Instagram](https://www.facebook.com/help/instagram/313829416281232)
- [Recommendation eligibility and Account Status](https://www.facebook.com/help/instagram/653964212890722)

Reviewed 2026-08-13. Recheck current platform rules, product capabilities, and recommendation
eligibility before changing strategy or enabling automation.
`,
    "hq/marketing/linkedin": (s) => `# LinkedIn

LinkedIn is the professional insight, credibility, and relationship channel for ${s.name}. Earn
attention by helping a clearly defined professional audience think or work better; do not reduce
the Page to a stream of promotions.

## Account

| Field | Value |
|---|---|
| Status | Not created |
| Page username | — |
| Page URL | — |
| Owner/admin | — |
| Last verified | — |

Update these public fields when a Page is created. Keep passwords, recovery methods, session
cookies, tokens, and private admin details out of git. Record the exact Page and authorized actor
in any automation configuration before a job can leave dry-run mode.

## What to publish

- Lead with a recognizable professional problem, a concrete observation, or a clear thesis. Give
  enough context for someone outside the immediate network to understand why it matters.
- Prefer useful knowledge, specific advice, original evidence, product lessons, and a defensible
  point of view. Credit other people's work and avoid an overly promotional or salesy tone.
- Make the post skimmable, support claims with evidence, and end with one proportionate next step.
  A thoughtful question can invite discussion; generic engagement bait cannot.
- Choose the format for the idea: concise text, an accessible image, captioned video, a document
  for structured depth, or a longer article/newsletter when sustained context is warranted.
- Use employee or founder voices only when the named person approves and the words are genuinely
  theirs. Never fabricate personal experience, customer endorsement, or executive opinion.
- Begin with a sustainable weekly rhythm, as LinkedIn recommends for Pages, then let Page analytics
  and content quality determine cadence rather than filling a quota.

## Operating loop

Build themes from industry questions, customer language, research, product changes, and credible
internal expertise. Before publishing, verify claims, permissions, links, disclosures, visual
accessibility, and the destination's readiness. Respond substantively and in context; replies,
messages, invitations, and outreach remain human-reviewed external actions.

Use LinkedIn Page analytics to review impressions, members reached, clicks, engagement rate, video
behavior, followers, visitors, search appearances, and competitors. Connect those signals to tagged
qualified sessions and product activation; follower count alone is not the outcome.

Scripts may collect approved analytics, prepare drafts, check links, and assemble a review queue.
They must not create Pages, publish, comment, message, invite, or imitate a person's voice without
an explicit project policy and approval for that external action.

## Current official guidance

- [LinkedIn marketing fundamentals](https://business.linkedin.com/advertise/ads/how-to-market-on-linkedin)
- [Content suggested beyond your network](https://www.linkedin.com/help/linkedin/answer/a1499047)
- [Post and respond as a LinkedIn Page](https://www.linkedin.com/help/linkedin/answer/a1660869)
- [LinkedIn Page analytics](https://www.linkedin.com/help/linkedin/answer/a547077)

Reviewed 2026-08-13. Recheck current Page features, distribution guidance, and automation terms
before changing strategy or enabling automation.
`,
    "hq/marketing/x": (s) => `# X

X is the concise, real-time conversation and distribution channel for ${s.name}. Use it for timely
ideas, useful replies, product evidence, and relevant moments rather than a one-way link feed.

## Account

| Field | Value |
|---|---|
| Status | Not created |
| @handle | — |
| Profile URL | — |
| Owner/admin | — |
| Last verified | — |

Update these public fields when an account is created. Keep passwords, recovery methods, session
cookies, tokens, and private admin details out of git. Record the exact account in any automation
configuration before a job can leave dry-run mode.

## What to publish

- Be concise, conversational, and clear about the value before asking for an action. Avoid all
  caps, vague teasers, and copy that reads like an ad when the contribution is an idea.
- Attach useful images, GIFs, or video when they improve understanding. Avoid heavy text inside
  images; add alt text and captions. X's current business guidance favors short video (15 seconds
  or less) and sound-off comprehension as a starting point, not a timeless hard rule.
- Use relevant current moments only when ${s.name} has a legitimate contribution. Maintain an
  evergreen idea bank and content calendar so the account is not dependent on trend chasing.
- Monitor product terms, questions, and indirect mentions as well as direct @mentions. Read the
  thread before replying and personalize the response to its context.
- Use hashtags sparingly and only when they improve discovery in a real conversation. Test current
  behavior rather than copying a fixed hashtag formula.
- Give a linked post enough native value to stand alone, and send people to a destination that
  fulfills the exact promise.

## Operating loop

Mix original insights, product evidence, visual demonstrations, curated material with commentary,
and approved contextual replies. Before publishing, verify claims, source context, media rights,
disclosures, accessibility, link previews, and landing-page readiness. Keep a calm correction and
escalation path for fast-moving or sensitive conversations.

Review impressions, link clicks, replies, reposts, profile clicks, qualified sessions, and product
activation together. Look for durable audience questions and relationships, not only viral reach.

Scripts may monitor approved public terms, collect analytics, prepare drafts, validate media, and
assemble a review queue. They must not publish, reply, message, follow, repost, or mass-mention
people without an explicit project policy and approval for that external action.

## Current official guidance

- [X organic best practices](https://business.x.com/en/basics/organic-best-practices)
- [Get a business started on X](https://business.x.com/en/basics/get-your-business-started-with-x)
- [Post activity dashboard](https://business.x.com/en/help/campaign-measurement-and-analytics/tweet-activity-dashboard)

Reviewed 2026-08-13. Recheck current product behavior, policies, API access, and automation terms
before changing strategy or enabling automation.
`,
    "hq/marketing/reddit": (s) => `# Reddit

Reddit is a community-participation and research channel for ${s.name}, not a broadcast list. Earn the
right to mention the project by being useful in each community on that community's terms.

## Account

| Field | Value |
|---|---|
| Status | Not created |
| u/username | — |
| Profile URL | — |
| Owner/operator | — |
| Affiliation disclosure | — |
| Last verified | — |

Update these public fields when an account is created. Keep passwords, recovery methods, session
cookies, tokens, and private admin details out of git. State the operator's project affiliation
plainly wherever it is relevant.

## How to participate

- Research every subreddit before drafting: read its current rules, pinned posts, moderator
  guidance, recurring formats, recent removals, and the language members use. Record the subreddit
  and check date with a planned contribution.
- Answer the question or contribute the useful substance first. Link to the project only when the
  destination is directly useful, disclose the relationship, and make the answer valuable without
  the click.
- Use accurate, non-sensational titles; cite reliable sources; distinguish personal experience
  from project evidence; and respond honestly to criticism.
- Participate beyond the project's own links. Reddiquette's historical 9:1 rule of thumb does not
  make self-promotion automatically acceptable: community rules and authentic behavior control.
- Never repeatedly mass-post the same link or comment, send unsolicited messages or chat requests,
  use multiple accounts to evade rules, ask for votes, manipulate voting, mask destinations, or
  automate spam and low-value AI content.
- Moderator contact, posting, commenting, direct messages, and any health, financial, or other
  sensitive advice require explicit project review and approval.

## Operating loop

Use Reddit to learn real audience questions and vocabulary, identify missing product or content
work, and prepare community-specific contributions. Keep a placement log with the current rules,
draft, disclosure, approval, permalink, moderation outcome, meaningful replies, referrals, product
events, removals, and warnings. A removed post is evidence to stop and learn, not a prompt to evade.

Measure useful conversations, qualified referrals, product activation, recurring questions, and
moderation outcomes. Do not optimize for karma or treat community members as acquisition inventory.

Scripts may research public threads, collect approved analytics, detect duplicate drafts, and
assemble a review queue. They must never auto-post, auto-comment, vote, message, evade a ban, or
operate multiple identities.

## Current official guidance

- [Reddit spam policy](https://support.reddithelp.com/hc/en-us/articles/360043504051-Spam)
- [Reddiquette](https://support.reddithelp.com/hc/en-us/articles/205926439-Reddiquette)
- [Reddit Rules](https://redditinc.com/policies/reddit-rules)
- [Reddit Pro organic playbook](https://redditinc.com/hubfs/Reddit%20Inc/Content/Reddit%20Pros%20organic%20playbook.pdf)

Reviewed 2026-08-13. Recheck each community's rules and current Reddit policies immediately before
drafting or approving participation.
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
${codebaseMemoryBootstrap()}
## Working conventions

**Claim work before starting it:**

\`\`\`sh
morpheus pm claims             # what is already taken
morpheus pm claim ${s.prefix}-001      # stakes the branch on origin, sets in-progress
\`\`\`

The remote branch **is** the claim. Never create the branch by hand — \`pm claim\` derives it from
the item id, so the two cannot disagree.

**A request arriving in a conversation is intake, not a release path.** Messages, Slack, email,
voice and browser chat enter the same lifecycle: create or link the roadmap item, claim it, work on
its branch, test it, open a PR and merge it. A trusted author can authorize the work; the channel
cannot waive the records or review path. Never edit or release directly from a transcript.

**An external mutation ships with an exact target and proof.** Prefer a pasted one-shot CLI command
with explicit account, project and full resource identifiers; console prose is fallback only. Put
the caller-perspective verification probe and expected result beside the mutation. Upload, archive
or deploy success proves delivery, not acceptance: close the item only with evidence of the
requested user-visible result. Release jobs must depend on
\`cpheinrich/morpheus/.github/workflows/release-preflight.yml@main\` and check out its \`sha\` output.
Do not extract a recurring production probe until a second project needs the same one.

**Build vs. borrow — check before writing a generic module.** Before implementing any capability
that is not specific to this product's domain — parsing, diffing, scheduling, retries, rate
limiting, fuzzy search, date handling, CLI plumbing — make one quick search of the ecosystem's
registry for a maintained package that already solves it. If a credible candidate appears, check
its last publish and dependency footprint before deciding.

**Propose, don't decide silently — in either direction.** If a credible package exists, say so
before building: an open (❗) inbox item when the choice shapes the architecture, a line in the PR body
("considered X, built instead because Y" / "adopted X, N deps, maintained") when it is small.
Silently building what a package solves and silently adopting a heavy dependency are the same
mistake. **Prefer lightweight** — zero-to-few dependencies beats featureful; a framework pulled
in to save 60 lines is worse than the 60 lines. Build when the need is small — roughly under 100
lines — genuinely domain-specific, or every candidate is unmaintained. Record the outcome in \`.agent/decisions.md\`
so the choice is not relitigated next session.

**Every PR must carry** tests for anything testable, a documentation update when behaviour
changes, a test plan, any open questions stated plainly rather than guessed at, and the roadmap
item moved to \`review\`. Tests must pin expected behaviour, exercise guards at their boundaries,
and fail when a stated invariant is broken; coverage alone is not evidence of quality. See
[Morpheus's test guidance](${MORPHEUS_REPO}/blob/main/AGENTS.md#what-makes-a-test-count).

**Front-end changes must carry visual evidence.** When a changed path matches
\`review.visualEvidence.include\` in \`morpheus.json\` (minus \`exclude\`), attach a screen recording
to the PR when practical, otherwise screenshots, and list them under \`## Visual evidence\`.
\`morpheus check pr\` validates GitHub attachment references without fetching them. The path
contract is deterministic; it does not claim to infer whether rendered pixels changed. A repository
may disable the rule only with \`enabled: false\` and a substantive \`reason\` in the manifest.

**Before opening a PR**, run \`morpheus pm index\` and commit any one-time roadmap README migration
or generated goal/request index changes. The roadmap README is static after that migration. CI runs
the same check and will fail otherwise.

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
 * The canonical version — frontmatter fields, delivery boundary, both
 * redaction passes, the public-repo rule — lives in Morpheus's own
 * `hq/team/meeting-notes/`.
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

**Deliver the note in an isolated pull request containing only the factual, canonical meeting
record.** Roadmap changes, strategy refinement, implementation work, decision promotion, and every
other follow-up interpretation belong in separate pull requests. When a follow-up pull request
files roadmap items, it backfills their ids into the note's \`roadmap:\` field as bookkeeping.

**\`redacted: true\` is a claim you are making**, and \`morpheus team validate\` refuses a note without
it. It means you have stripped everything not about this project, and checked that the note is
something you would be relaxed about being read back — by the team, by the person it is about, or
by a stranger in a year.

The canonical format, delivery boundary, frontmatter fields, and both redaction passes are
documented once, in
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
export const pullRequestTemplate = () => `## Summary

<!-- What changed, and why? -->

<!-- If the roadmap item declares GitHub issues, close each explicitly: Closes #123. -->

## Visual evidence

<!--
Required when changed paths match review.visualEvidence in morpheus.json.
Paste GitHub attachments here. Prefer a screen recording; screenshots are accepted otherwise.

- Recording: <GitHub attachment URL>
- Screenshot: <GitHub attachment or pasted image>
-->

## Test plan

<!-- What was verified, and how? -->

## Open questions

<!-- State unresolved questions, or write None explicitly. -->
`;
export const productReadme = (kind, _s) => {
    if (kind === "roadmap")
        return STATIC_ROADMAP_README;
    const blurb = {
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
export const BRAND_EXPLORATION_IGNORE_RULES = [
    "hq/brand/moodboard/*",
    "!hq/brand/moodboard/README.md",
    "hq/brand/research/assets/*",
    "!hq/brand/research/assets/README.md",
];
export const gitignore = () => `
# Morpheus
local/
.env
.env.local
.obsidian/

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

# Raw reference material and heavyweight generated concept media are local
# exploration input, not the final asset library. Keep each folder's README
# visible, but retain the selected board's provenance in hq/brand/moodboards.md
# and approved delivery art in imagery.json.
${BRAND_EXPLORATION_IGNORE_RULES.join("\n")}
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
description: Create, iterate, or finalize a visual-first Morpheus brand exploration. Use when a project has hq/brand/brand-vibes.md and moodboard references, when reviewing research/brand.html, or when applying a selected direction to a home page or app.
---

# Visual-first brand review

Read \`hq/brand/README.md\`, \`brand-vibes.md\`, the useful files in \`moodboard/\`, the current
\`research/brand.html\`, its local \`research/assets/\` when present, and \`decisions.md\` before
making a visual call.

## Explore

Create one standalone \`research/brand.html\` with five genuinely distinct, stable named
directions. Keep the same product content, hierarchy, sample screens, and CTA in every direction
so people can compare the visual system rather than five different briefs.

Give each direction a Brand System, Home mock, Marketing mock, Typography view, and Graphics view.
The Graphics view should compare multiple candidates in the concept's illustration, diagram, icon,
or image-making language, including restrained and dense examples. Include a substantial Compare
All view with art, palette, type, UI primitives, and product snapshots. Keep
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

Treat \`brand-vibes.md\` as a working scratchpad, not a final source to cite. Final canonical
brand records should state the decisions directly without linking to or naming that file. Keep
heavy temporary concept media in \`research/assets/\`, which is local and Git-ignored except for
its README; \`research/brand.html\` itself remains versioned evidence.
`;
/**
 * The website initializer's discovery point.
 *
 * `morpheus web init` is only useful if it is found at the moment somebody asks
 * for a website, which is exactly when an agent is least likely to go looking
 * for a CLI it has never run. The same reasoning as `brand-review`: the command
 * is the durable thing, and this file is how an agent standing in the project
 * learns the command exists before hand-rolling a worse version of it.
 */
export const websiteInitSkill = () => `---
name: website-init
description: Create or extend this project's website — a Next.js app, email waitlist capture, and /hq behind Google sign-in. Use whenever someone asks to create the website, add a landing page, capture emails or signups, add a waitlist or contact form, or set up the internal dashboard or its login.
---

# Website initialization

**Run \`morpheus web init\` before writing any of this by hand.** It provisions the GCP and
Firebase project, Firestore, the registered web app and the Vercel deployment identity, then
scaffolds the code that depends on them: waitlist email capture and \`/hq\` behind Google sign-in.

\`\`\`sh
morpheus web status   # what the surface has, and what it is missing
morpheus web init     # add whatever is missing; never overwrites a file
\`\`\`

It is safe on a live site. Every existing file is skipped and reported, so a project with a
working home page gets the missing half and keeps what it has — including the home page, which
the command deliberately never edits.

## After it runs

1. \`pnpm install\`, then render \`<WaitlistForm source="hero" />\` where the page currently asks
   for nothing. A \`mailto:\` link or an anchor to another section is usually what it replaces.
2. Add a \`waitlist_joined\` event to the project's analytics contract and pass it to the form's
   \`onJoined\` prop. The generated form imports no analytics module on purpose — the event name
   belongs to this project's vocabulary.
3. \`morpheus access sync\`, so the allowlist in \`morpheus.json\` becomes the \`role\` custom claim.
   Until it runs, a signed-in account has no role and \`/hq\` refuses it — the gate working, not a
   broken sign-in.
4. Deploy the Firestore rules. The generated \`waitlist\` block denies every client operation; the
   collection is written only by the server, through the route handler.

## What not to do

Do not add a client-side Firestore write for a public form. A rule cannot see an IP, cannot
throttle, and cannot reduce a referrer to its origin — and the web config is committed, so
"anyone" means anyone who views source.

Do not hand-write a second route gate. If \`proxy.ts\` or \`middleware.ts\` already exists, the
command leaves it alone and says so; add the \`/hq\` matcher to the existing one.
`;
// The session hooks both providers read live in `src/session/install.ts`, with
// the protocol they belong to rather than beside the scaffold's strings. They
// are deliberately **informational rather than blocking**: `context brief`
// always exits 0, and the refusal lives in the `morpheus` CLI, which every
// provider goes through. A blocking `PreToolUse` hook would fire on every
// edit, and a gate that fires constantly is a gate people disable —
// permanently, where the staleness was temporary.
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
morpheus context install   # wire the hooks that run \`brief\` — safe to re-run
\`\`\`

\`.morpheus/session-start.sh\` is the only Morpheus bridge this project runs automatically, from a
session-start hook in **both** \`.claude/settings.json\` (Claude Code) and \`.codex/hooks.json\`
(Codex). It only inspects: a current CLI continues into \`context brief\`; a missing or pre-\`self\`
CLI emits the exact consent instructions above. \`morpheus context install\` writes or repairs the
shim, bootstrap, and both provider files, merging rather than overwriting.

**Codex will not run an untrusted hook and says nothing when it declines.** Once, run \`/hooks\` in
a Codex session and trust it; trust is keyed on the hook's hash, so an edit needs trusting again.

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