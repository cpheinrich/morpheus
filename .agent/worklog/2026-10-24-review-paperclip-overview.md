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
