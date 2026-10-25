---
roadmap: MO-26-10-24-23.22.31
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
At session end, stop responder and preview, then restore those bytes; do not include
the temporary declaration in a commit. The responder's scope reminder repeats this.

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
