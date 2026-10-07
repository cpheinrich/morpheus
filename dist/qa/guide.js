/**
 * `morpheus qa guide` — the agent's instructions for comment QA, printed by the CLI that runs it.
 *
 * The skill each project carries (`.agents/skills/comment-qa`) is a pointer to this, the same way
 * `morpheus review prepare` prints the review contract: instructions that ship with the tool cannot
 * drift from the tool. Project specifics (how to build, which launch modes exist) live in the
 * project's `morpheus.json` and the preview prints them; nothing here names a project.
 */
export const QA_GUIDE = `# Comment QA

The person runs the app, pins comments on it, and you act on them. Every agent — Claude, Codex,
Grok — uses the same surface: the QA overlay page the preview prints. Do not substitute a host's
native simulator panel or its own annotation tool; the overlay is what writes comment batches you
can read back.

## 1. Start the preview

    morpheus qa preview ios doctor
    morpheus qa preview ios start [--mode <name>] [--no-build] [--ttl-minutes N]

Run them from the project checkout (or pass --root). The project declares its app and launch
modes in morpheus.json (qa.ios); the default mode and every mode's flags are listed by
\`morpheus qa preview ios help\`. start builds this checkout, boots a simulator owned by this
checkout, launches the app, and starts serve-sim and the comment overlay under one supervisor.
Resolve missing local prerequisites yourself; do not silently switch machines. Full Xcode
setup or licence prompts may need the person. Use --no-build only for an explicitly accepted
existing build, and say its freshness is unverified. To keep the person's current screen, use
\`status\`, not \`start\` — start relaunches the app.

## 2. Open the overlay — the same page in every agent

start prints \`QA overlay: http://127.0.0.1:<port>/\`. Open that URL, never the stream URL beside
it, and always at 127.0.0.1 (the overlay refuses POSTs from any other origin, localhost included).

- Claude: the Browser pane — preview_start with the url (or navigate).
- Codex: the in-app browser panel.
- Grok, or any agent without a browser panel: \`open <url>\`, which uses the person's default browser.

Then verify before calling QA ready: take a screenshot of the overlay and confirm it shows real
app pixels, not a blank stage or "No MJPEG stream"; click one control in the overlay and confirm
the screen changed (allow a second or two), then return to the screen you started on.

In the overlay, left-click and drag drive the app, right-click places a numbered pin, Enter saves
its text, Shift+Enter is a newline, ⌘Enter sends the batch, Esc Esc deletes the focused pin.

## 3. Watch the inbox instead of asking the person to paste comments

Each Send writes local/qa-comments/pending/<batchId>/{batch.json,frame.png} in the checkout.

- Claude: arm a Monitor that polls \`morpheus qa comments pending --root <checkout>\` every few
  seconds and emits new batch ids.
- Codex and Grok: poll the same command between turns.

For each batch: \`morpheus qa comments show <id> --root <checkout>\`, open frame.png, map every
anchor (normX/normY are fractions of the frame's width and height) to what is on screen, act on
or answer each comment, then \`morpheus qa comments resolve <id> --root <checkout>\`. Confirm the
first batch's frame.png shows real app pixels before treating its anchors as authoritative.

A wake webhook in local/qa-comments/webhook.json, when present, belongs to another agent's routine
and fires for every batch at that root: do not depend on it, and resolve your own test batches at
once so they do not become that agent's stale work.

## 4. Changes from one session ride together

Act on each batch as it lands, but keep every change from one QA session on one claimed branch,
commit locally, and push or open the pull request only when the person says the session is done:
comments arrive in several batches and are merged together. Never reload or navigate the person's
overlay tab, and never rebuild or relaunch, while they are commenting without saying so first.

## 5. End the session

    morpheus qa preview ios stop

stop ends this checkout's preview and its overlay together and shuts its simulator down, keeping
its data. Closing a browser tab or panel stops nothing. Previews expire after four hours by default
(--ttl-minutes sets 1–1440); start renews the lease, status does not. For your own screenshot or
interaction checks, stop in cleanup. Leave a preview running only as a requested interactive QA
deliverable, and report its expiry.

Never run an unscoped \`serve-sim --kill\`, erase devices, stop another checkout's preview, or
change the person's global Xcode selection.

## Viewing from another Mac

The host's browser is not proof the viewer's can connect. Run
\`morpheus qa preview ios status --ssh-host <user-provided destination>\` and give the printed
command to run on the viewer's Mac; keep that terminal open. Only the overlay port is forwarded —
the overlay proxies the stream and input itself. Never expose it on the LAN or through a public
tunnel.

## Feedback outside the overlay

For behaviour, include reproduction steps, expected and actual results, and a recording when it
helps. The stream is media, not a DOM: you cannot query SwiftUI controls through it.
`;
//# sourceMappingURL=guide.js.map