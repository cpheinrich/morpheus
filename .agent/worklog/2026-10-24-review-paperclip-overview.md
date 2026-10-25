---
roadmap: MO-26-10-24-23.22.31
tags: [engineering, devops, infrastructure]
---
# Paperclip overview comment QA session

Chris asked to render the Markdown overview in a Morpheus web comment-QA session.
Following the comment-qa skill and installed `morpheus qa guide`, all feedback belongs
to this one claimed branch until Chris ends the session. Commit batch edits locally;
do not push, open a PR, start review or run CI per batch.

Local-only renderer: `local/paperclip-overview-preview/serve.mjs`, Marked18.1.1 and
Mermaid12.2.0 in the existing temporary rendering package directory. No repository
dependency changes or new public website. The renderer reads this checkout's
`docs/paperclip-overview.md` on page loads; it does not reload the person's tab when
the document changes. Diagram enlargement is a viewer control, not source content.

The temporary qa.web declaration in morpheus.json is deliberately uncommitted.
Its exact prior bytes are saved at local/paperclip-overview-preview/morpheus.original.json.
The responder is stopped and those bytes restored after QA; do not include the temporary
declaration in a commit. At Chris's request, the existing preview lease remains available
until its October 26 expiry, without renewal or reload of the person's tab.

Morpheus owns the renderer at127.0.0.1:4611 and the overlay at
http://127.0.0.1:4610/paperclip-overview, expires2026-10-25T10:25:35.651Z.
Air access uses the printed loopback-only SSH forward to the known Pro Tailscale host.
No remote-forward listener or public/LAN exposure was added. An attempt to reach the
Air's SSH server returned connection refused; do not repeat or enable SSH remotely.

Verified in Brave on the Pro: real document/table and all three SVG diagrams appear
beside the Morpheus comment column; Enlarge diagram1 opens the native dialog and Close
returns to the document. A temporary heading pin reported "Placement HTML and JPEG saved";
double Escape removed it, leaving no draft comment or submitted batch. In-app browser
control was unavailable to CUA, so the Codex panel was opened using open_in_codex instead.
This proves host preview behavior, not connectivity from the Air before its forward.

Background responder identity codex:paperclip-overview-01a165f2. The native responder
serializes batches; its local wrapper uses workspace-write Codex and access to the
shared Git metadata so it can commit on this branch. No model is called while idle.
A four-hour timer requests graceful responder stop. A real comment batch remains
unqualified until Chris submits it. End-session review/CI covers combined document edits.

## Batch 20261025T064002Z-w7mxiy — c2: common agent compute interface

The native Codex responder failed before editing: its saved CLI model gpt-6.1-sol was
rejected for the ChatGPT account. Native failed turn01a171c9-a97d-7aa2-b157-57cffb4117e1
and the error log are retained locally. Both responder/supervisor PIDs were absent and
no author process remained for this checkout; the original claim was explicitly released
after that proof, then claimed as codex:paperclip-overview-manual-01a165f2. No blind model
retry, configuration downgrade or credential change was attempted. Background handling is
currently stopped; the interactive agent handles submitted batches between turns.

Read the complete one-comment batch and its semantic HTML context, then opened the saved
comment-1.jpg. It pins the diagram's "Native Claude or Codex CLI" worker box; image capture
was reported captured, with no missing placement evidence substituted from the current page.

Researched official Paperclip, ACP, OpenRouter and LiteLLM documentation, and inspected the
installed @paperclipai/adapter-utils2026.1012.0 ServerAdapterModule declaration plus the
installed OpenCode adapter package. The current pool-config.mjs provider enum confirms our
own qualified pool still supports only claude/codex. The upstream adapter interface already
owns execution, environment tests and session serialization; ACP is a candidate interactive
protocol, while a model gateway is a separate layer. No runtime was changed.

Added "A common interface for agent compute", a proposed fourth diagram, runtime/model/effort
and execution-attribution requirements, the native-sign-in/quota/recovery qualification caveat,
and primary-source links. It recommends extending the existing contract and evaluating ACP
before adopting another framework. Future open-model support is explicitly distinguished from
current qualified behavior; gateway selection remains a proposal for review, not a settled
architecture decision or installation.

Validation: parsed all four Mermaid blocks offline with Mermaid12.2.0/JSDOM; six local
links/anchors resolve and seven external source URLs are well-formed (the cited primary
pages were opened during research). git diff --check passed. Opened a separate temporary
preview tab, confirmed all four SVGs rendered and inspected the enlarged proposed adapter
diagram: labels/arrows are legible and the proposal is visibly named. Closed that verification
tab without reloading or navigating Chris's review tab. No runtime tests, live worker replay,
push, PR or CI for this prose-only batch. Document edits are committed locally with this log;
the session-only morpheus.json edit remains unstaged.

## Repair automatic comment handling

Chris reported "No agent wake configured" after submitting batch20261025T065637Z-24l8m5.
The local queue/responder configuration existed, but its earlier native Codex CLI had
stopped on the unsupported saved model before performing work. Replaced only the local
responder wrapper with the existing Codex–Claude bridge, using this actual coordinator
thread and QA worktree. Model/effort come from the bridge's normal mapping (currently
fallback opus/xhigh), not a guessed Codex CLI model. No global settings or credential changed.

The local wrapper checks fresh native ordinary Claude quota before every batch and during
the turn: admit below77% weekly/90% session used, stop at80%/95% or unknown telemetry,
with a ten-minute batch bound. This retains the user-authorized20% weekly remaining floor
and an in-flight admission margin. Unknown native resets still refuse.

Its first admission coincided with the five-hour reset and was refused before provider
launch (runId null): native usage became0 with reset null. Retained that refusal. A separate
bounded initialization used native Claude with no tools, one turn, no saved session and a
30-second deadline; it returned QA_READY in8117ms. Fresh native read then reported session4%
with a real future reset and weekly73%. No reset value was invented and no guard was weakened.
The refused claim is released only after both supervisor and responder were observed stopped.

The exact-checkout graph bootstrap completed successfully. The already-loaded parent MCP
transport then closed, so the delegated context supplies the earlier bounded primary graph
evidence and exact source fallback; do not claim a fresh parent graph query succeeded.
Actual automatic batch execution and continuing idle readiness must be checked before
reporting the wake repair complete.

## Batch 20261025T065637Z-24l8m5 — Paperclip in HQ and Firestore

Claude responder (native bridge). Question: reach Paperclip's dashboard or its functions from
our Firebase-backed HQ, and use Firestore instead of Postgres. Research and documentation only;
no migration, network exposure or frontend rollout was authorized or performed.

Read the installed 2026.1012.0 packages under the managed `paperclipai` shim
(`~/.local/share/morpheus-paperclip/instance/cli/current/node_modules/@paperclipai`): `db`
(240 `pgTable`s, 304 SQL migrations, `Db` is a Drizzle postgres-js database), `server`
(Drizzle imported in 321 non-test modules; ~470 `.for("update")`/`FOR UPDATE` call sites,
some `noWait`/`skipLocked`; 53 advisory-lock references; 234 `onConflict` upserts), Better
Auth via `drizzleAdapter(..., {provider: "pg"})`, the `StorageProvider` interface (local disk
and S3), and `app.js` serving the board UI beside `/api`. Counts are grep counts over the
compiled build, not a source audit. Morpheus side: `src/hq/gate.ts`, `roles.ts`, `rules.ts` and
`architecture.md` §hq; graph MCP not used — direct source read.

Added an overview section: coupling table, three options (deep links, server-side API
boundary, Firestore port), why Firestore rules would not gate a Paperclip server (server
libraries bypass rules), Firebase/Paperclip authorization relationship, a Mermaid diagram of
the proposed boundary, a recommendation (stay on Postgres; links now, server-side controls
next; optional read-only Firestore projection) and four open questions for Chris. Dead end:
no local Mermaid CLI in this checkout (no `node_modules`); diagram checked by hand against the
existing diagrams' syntax. No preview reload, rebuild, push, PR or CI.

### Wake repair verification and completed-turn cleanup

The live background worker automatically claimed the real new batch, researched it, committed
e8ae038 and resolved it at2026-10-25T07:06:17.759Z. Bridge run
3802cb44-22d8-4b74-8564-46b9e80062b8 returned a completed structured result. Its native
stream-json process remained open after the result (state completed, terminal false). Gracefully
requested responder shutdown, stopped that exact bridge run, and verified terminal true plus
both supervisor/responder PIDs absent before the coordinator edited. The completed result and
resolved batch are retained; process cleanup is recorded as interrupted, not fabricated success.

Updated the gitignored wrapper to recognize a completed result, stop its still-open native
process through the bridge, and require verified terminal cleanup before returning ownership
to the serial queue. An isolated provider-free wrapper harness passed three cases: completed
result with open stream invokes inspect/start/wait/stop/wait and succeeds only after terminal;
unverified cleanup refuses; exactly77% weekly usage refuses before any bridge/provider start.
`node --check local/paperclip-overview-preview/respond.mjs` passed. No global bridge code changed.

Coordinator corrected the new diagram to put rule-gated Firestore reads on the Firebase browser
client, not the privileged HQ server. Clarified IAM/application authorization, and left exact
Paperclip credential/company/action scope as a rollout qualification rather than promising a
generic service key. Live primary source links verified for DB client, auth, authorization and
Firebase rules. Bare Node Mermaid checks failed due to missing DOMPurify browser DOM (two
attempts; changed approach). All five diagrams rendered in a separate browser verification tab;
opened diagram5 and inspected its pixels and arrows. The person's review tab was untouched.

Session-only responder command/config remain under local/, never in the shared scaffold.
Quota was73% weekly used during this batch; native admission/stop guards remain unchanged.
No repository runtime changes, push, PR, independent review or CI during this QA batch.

## Batch 20261025T082330Z-01cp6n — HQ, shared fleet and interactive inbox

Five comments submitted at08:23:30Z: use HQ's own design system; one Paperclip instance with
company-specific HQs and shared compute visibility; prefer an independent Google Cloud tailnet
controller; go directly to option2 with simple Firebase role checks; consider a live human inbox
and ticket conversation with immutable Markdown closeout records.

The unattended responder refused before provider launch because no active verified Codex turn
settings were available. The queue remained intact. Verified the prior responder PIDs absent
and the previous bridge run terminal, then released the dead claim. Resuming while this chat was
active admitted Claude at73% weekly used, via the configured opus/xhigh fallback for gpt-6.1-sol
(same mapping, no override). Run4b2bed03-1867-4dab-913a-47ee6949a882 supplied the draft. Its native
stream emitted an empty zero-turn result before continuing work. The coordinator mistook the
bridge's needs_input report for an ended turn and stopped it too early; retained its draft,
verified terminal cleanup and absent responder, then took the claim as
codex:paperclip-overview-manual-01a165f2. No concurrent writer.

Incorporated all five comments into the overview and replaced answered open questions. Recommended
Paperclip as the live collaboration authority (comments, screenshots, structured questions and
human assignment), HQ as its normal branded UI, and versioned Git closeout records after verified
delivery. Firestore retains existing HQ data, without a duplicate task/chat store. Proposed shared
occupancy is explicitly a pool-runtime extension. Company-to-HQ mapping is server-owned. The cloud
controller diagram includes the bridge journal/control path: a Paperclip comment or interaction
response alone does not authorize a native pool turn. Current co-location remains a real gap.

Clarified that Git preserves snapshots but does not itself make a working file append-only;
the future closeout contract needs validation, revision/cursor and attachment hashes, durable
artifact references and a new snapshot on reopen. Existing Markdown inbox/PM policy remains in
force until an explicit migration. The other planning session was not identified in the bounded
recent-thread inventory/prose search; no claim that it does not exist. Added prospective acceptance
checks for two company HQs, shared capacity, one correctly delivered answer, company mismatch,
laptop-offline controller access and repeatable closeout export.

Evidence: direct pinned2026.1012.0 shared issue types confirm human assignees, structured
interactions and conversation metadata; package metadata and pinned LICENSE confirm MIT.
Read the official issues, companies and deployment API docs. Existing interactive-bridge design
states process-adapter control files, turn journaling and the same-host restriction. Graph
transport was unavailable in this continuous session; no new graph-completeness claim.
Opened placement JPEGs1 and5: both are white despite captured metadata. Used their semantic HTML
targets, disclosed the loss, and sent this concrete capture finding to the separately authorized
QA editor/thumbnail task. Never substituted new screenshots for placement evidence.

`git diff --check` passed. A separate browser tab rendered all five Mermaid diagrams; opened the
changed cloud/HQ diagram and inspected both its top and scrolled lower half. Labels and arrows
are readable. The person's live review tab, preview and drafts were not reloaded. No runtime
deployment or live two-HQ experiment is claimed; this batch is research and prose only.

Created the session-scoped app heartbeat `paperclip-document-qa-wake`, checking every five minutes
to wake this thread for queued comments when an idle chat cannot supply verified bridge settings.
It stays quiet for an empty queue or active writer and pauses at preview expiry10:25:35Z
(3:25 a.m. Pacific), or when Chris ends QA. Existing native quota guards remain unchanged; the
heartbeat adds no model override, reset or overage route. This replaces reliance on an idle chat
being implicitly wakeable. Commit and resolve locally; no push, PR, review or CI until QA ends.

## Batch 20261025T082437Z-hmf0u3 — diagram enlargement

Chris reported that Enlarge diagram5 opened a smaller diagram. Semantic placement points to that
button; its saved JPEG is also blank, so it establishes no original pixels. The session-only
renderer cloned Mermaid's percentage-sized SVG into a shrink-to-content dialog with a700px
minimum. On a wider page that can shrink the diagram instead of enlarging it.

Updated the gitignored preview helper to size the clone explicitly to at least1.5times its
inline width, its native viewBox width or900px, whichever is largest. The modal uses available
viewport width and scrolls overflow rather than shrinking the SVG; opening resets scroll.
`node --check local/paperclip-overview-preview/serve.mjs` passed. Notified Chris before restarting
the managed preview; the replacement preserved overlay4610 and renderer4611 and kept the prior
expiry bound (new expiry10:24:52Z, 3:24 a.m. Pacific). No browser reload was performed in his tab.

Reloaded only the separate verification tab. All five diagrams rendered. Opened diagram5 and
inspected actual pixels: its labels are visibly larger than the inline and old modal versions,
with a working close control and scrollable content. Saved local proof at
local/paperclip-overview-preview/diagram-enlarged.png and closed that test tab. This changes
the temporary document-review renderer, not Morpheus's shared overlay or the separately owned
editor/capture fix. No new repository dependency or committed runtime source change.


## Final QA batch 20261025T103419Z-l83tuy and implementation mandate

All four responses read with their semantic placements. Opened all four original JPEGs: each
contains only a grey field and “Shadow DOM omitted”; they do not establish original page pixels.
Used the saved semantic context and retained the originals. Chris chose the current MacBook Pro
controller for v1, Firebase/Cloud Functions for the HQ backend, shared runner titles with simple
access, and the Paperclip live inbox plus versioned Git closeout contract. Updated the target
diagram and removed the answered questions. Cloud hosting is now a later availability option.

Chris's final direction: “take these responses and run with them … the rest … unsupervised …
push it as far as you can within the context of this design and session.” This ends the QA-only
authoring restriction and starts implementation under agentic-cto. Implementation belongs in
separate claimed tasks; this branch carries the reviewed design. Removed the QA heartbeat so its
stale QA-only instructions cannot start competing writers. The renewed preview remains leased
until 2026-10-26T10:29:22.239Z, without automatic renewal or browser reload.

Budget at transition: Codex 22% weekly used, 78% remaining, ordinary subscription usage allowed;
keep at least25% weekly remaining. Main Claude reports88% weekly used/12% remaining and95%
session used; its native responder refused admission before starting a provider (runId null).
No further Claude work is admitted while below the20% reserve. No overage, API fallback or reset.
Codex bounded subagents are permitted by the CTO skill; reserve review/cleanup headroom and stop
new admission before the75% used ceiling. No cloud resource, credential or paid-service change
is inferred from the design. The first riskiest assumption is crash-safe delivery from Firebase
to the existing single private pool owner; prove it before frontend rollout.

## Document delivery verification — October 25

Integrated origin/main through 0b4b6567, including the frozen-input closeout exporter. Added
only its bounded source-status link: it does not fetch live threads or qualify inbox migration.
The accepted MacBook Pro/Firebase design and current/planned distinctions remain intact.
The temporary manifest matches the committed bytes; no preview helper, private comment artifact
or dependency change is in this PR. No generic module or package decision is introduced.

`pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and `git diff --check` passed.
A bounded local Markdown-link check resolved 10 repository links/anchors and checked 17 HTTPS
URL shapes; all five Mermaid blocks are present. Runtime tests and the full suite were omitted
because only prose, acceptance and task records change; CI retains its normal checks.

In a separate CUA Brave test tab at renderer4611, all five Mermaid SVGs rendered. Enlarged the
final controller diagram and inspected its actual top, middle and bottom pixels: MacBook Pro
controller, planned outbound connector, bridge journal, Cloud Function, Firestore transport,
worker and planned Git closeout labels/arrows are legible. Captures are retained locally at
`local/paperclip-overview-preview/final-controller-diagram-20261025.png`,
`final-controller-diagram-lower-20261025.png` and `final-controller-diagram-bottom-20261025.png`.
These are new final-document verification captures, not original comment-placement evidence.
The test tab was closed; Chris's live QA tab and drafts were untouched. Preview expiry remains
2026-10-26T10:29:22.239Z without renewal. The independent reviewer receives these captures.

The independent reviewer found one minor wording defect: its installed2026.1012.0 build had
242 exported table declarations rather than the earlier240 observation;304 migrations matched.
Qualified the table/import counts as approximate October25 QA observations instead of exact
contract facts (DOC-001). This is the minor author response permitted by the review contract;
no additional reviewer turn is needed. `git diff --check` passed after the wording correction.
