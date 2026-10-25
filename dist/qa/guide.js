/**
 * `morpheus qa guide` — the agent's instructions for comment QA, printed by the CLI that runs it.
 *
 * The skill each project carries (`.agents/skills/comment-qa`) is a pointer to this, the same way
 * `morpheus review prepare` prints the review contract: instructions that ship with the tool cannot
 * drift from the tool. Project specifics (how to build, which launch modes exist) live in the
 * project's `morpheus.json` and the preview prints them; nothing here names a project.
 */
export const QA_GUIDE = `# Comment QA

The person runs the app — the iOS app in a simulator, or the website in a browser — pins comments
on it, and you act on them. Every agent — Claude, Codex, Grok — uses the same surface: the QA
overlay page the preview prints. Do not substitute a host's native simulator panel or its own
annotation tool; the overlay is what writes comment batches you can read back.

## 1. Keep the session together

**One branch until the person ends the session.** Commit each batch's changes locally on the
one claimed branch for this QA session. Do not push, open a PR, start independent review or run
CI per batch: even a draft PR push starts CI. Ship the changes together only when the person
says the session is done. Tell them before rebuilding or relaunching the preview, or reloading
or navigating their overlay tab.

Drain claimed batches in order. Run focused local checks as needed; session-end review and CI
cover the combined changes.

## 2. Start the preview

For the website (morpheus.json qa.web names the dev server and how to start it):

    morpheus qa preview web start [--path /page] [--ttl-minutes N]

start attaches to the dev server if it is already running, or starts the declared command, and puts
the overlay in front of it: the same site, same paths and cookies, with a comment column beside it.
stop ends the overlay and only a dev server this preview started.

For the iOS app:

    morpheus qa preview ios doctor
    morpheus qa preview ios start [--mode <name>] [--no-build] [--no-ax] [--ttl-minutes N]

Run them from the project checkout (or pass --root). The project declares its app and launch
modes in morpheus.json (qa.ios); the default mode and every mode's flags are listed by
\`morpheus qa preview ios help\`. start builds this checkout, boots a simulator owned by this
checkout, launches the app, and starts serve-sim and the comment overlay under one supervisor.
Resolve missing local prerequisites yourself; do not silently switch machines. Full Xcode
setup or licence prompts may need the person. Use --no-build only for an explicitly accepted
existing build, and say its freshness is unverified. To keep the person's current screen, use
\`status\`, not \`start\` — start relaunches the app.

## 3. Open the overlay — the same page in every agent

start prints \`QA overlay: <url>\`. Open exactly that URL — never the stream or the dev server beside
it. The iOS overlay is at 127.0.0.1 and refuses POSTs from any other origin, localhost included; the
web overlay uses the dev server's own hostname (often localhost) so a signed-in session's cookies
apply there too.

- Claude: the Browser pane — preview_start with the url (or navigate).
- Codex: the in-app browser panel.
- Grok, or any agent without a browser panel: \`open <url>\`, which uses the person's default browser.

Then verify before calling QA ready: take a screenshot of the overlay and confirm it shows real
app pixels, not a blank stage or "No MJPEG stream"; click one control in the overlay and confirm
the screen changed (allow a second or two), then return to the screen you started on.

In the iOS overlay, left-click and drag drive the app, right-click places a numbered pin, Enter saves
its text, Shift+Enter is a newline, ⌘Enter sends the batch, Esc Esc deletes the focused pin.

On the web overlay the site sits on the left, as usual, and a full-height comment column on the
right takes the site's own colours, font and light or dark mode. Right-click any element
(Shift+right-click keeps the browser's own menu), or turn on Comment and click, to pin a comment;
the column lists every pin. Enter saves, Shift+Enter is a newline, Esc Esc deletes the focused pin,
⌘Enter sends. Applies to selects Element, Current view or Whole page feedback. Markers hide outside
their original view/target while comments stay accessible in the sidebar. The tab retains unsent
comments and placement evidence across navigation/reload, subject to reported storage failures.
For a sign-in that redirects the whole page to a provider, use the column's Full page button;
Column puts the frame back.

## 4. Queue comments and keep the person's chat free

Each Send writes local/qa-comments/pending/<batchId>/batch.json and available images in the checkout:
web placement JPEGs, iOS placement PNGs, and optional legacy/Send-time batch frames.

Every Send adds another complete batch to the durable queue and shows the open-batch count. It does
not mean a responder has started. Arm a responder before the person starts commenting when the host
can run one separately from the interactive chat. Configure the optional wake webhook for that
responder's session, not an unrelated agent's routine. A fresh checkout with no wake route keeps
the queue but cannot automatically resume a Codex chat; say so plainly to the person.

For a separate local responder, put a gitignored \`local/qa-comments/responder.json\` in this checkout
with an agent identity and argv command (see docs/runbooks/qa-comments.md), then run
\`morpheus qa comments responder start --root <checkout>\` in a separate process. The Codex CLI
example is \`["codex", "exec", "-C", "{root}", "-"]\`; other agent CLIs can use their own argv.
The responder claims one batch, waits for that agent process to finish, then takes the next. Its
\`local/qa-comments/responder.lock\` means it owns edits in this checkout. Stop it with
\`morpheus qa comments responder stop --root <checkout>\` and wait for the marker to disappear
before editing here from this chat or closing the QA session. The child commits locally on this
session's branch; this chat handles session-end review, push and PR. If the worker crashes, first
verify its child agent and descendants have stopped. Only then run responder recover
--confirm-no-agent-process to release ownership.

- Claude: a Monitor or separate agent session can watch and drain the queue.
- Codex and Grok: a separate local CLI responder can process batches without a chat wake route.
  Without one, check the queue between turns. Do not claim that the active chat will wake on Send.

Choose a stable responder identity, such as \`codex:<session-id>\`. Call
\`morpheus qa comments claim --agent <identity> --root <checkout>\` until it prints nothing. For
each claimed id: \`morpheus qa comments show <id> --root <checkout>\`. Read its evidence by type:

- **Current web comments** have \`comment.webContext\` as primary placement evidence: sanitized
  route, target/ancestors, view/entity, observable UI state, styles, original viewport and scroll.
  Respect \`webContext.scope\` (element/view/page), including feedback about a background or whole
  view. \`comment.createdAt\` and \`webContext.capturedAt\` record placement, not Send.
  When available, \`comment.frame.path\` names the supplementary placement viewport JPEG
  (comment-N.jpg, longest edge at most 1600 px, quality 0.5). It covers the visible application
  viewport, not the whole scroll page. \`frame.capturedAt\` is the frozen placement time.
  Check \`webContext.image.status\`, \`webContext.image.error\`, \`webContext.image.omitted\`
  and \`webContext.limitations\`: unsupported
  media can be labelled placeholders, and capture/storage failure can leave usable HTML without
  a JPEG. Never replace missing placement evidence with a later live screenshot.
- **Web JPEG coordinates:** \`webContext.image.point.x/y\` is the original viewport click.
  Its encoded JPEG point is x = image.point.x * image.scaleX, y = image.point.y * image.scaleY
  (all image fields are under webContext). \`image.scaleX/scaleY\` account for integer canvas
  rounding; \`image.scale\` is only the nominal cap. If exact scales are absent, derive them from
  comment.frame.width / webContext.viewport.width and comment.frame.height / webContext.viewport.height.
  \`webContext.viewport.scrollX/scrollY\` record the original window offset; \`webContext.scroll\`
  records nested scroll containers. Do not multiply a web JPEG's size by anchor.normX/normY:
  web \`anchor.normX/normY\` remain full-page fractions and \`anchor.x/y\` remain full-page pixels.
- **iOS comments:** open each comment's \`frame.path\` PNG first; it is the displayed simulator
  frame frozen at placement. Its \`anchor.normX/normY\` are fractions of that comment frame's
  width/height. \`screenId\`, when available, is screen/tracking context. The optional batch-level
  frame is from Send and may show different content after scrolling or navigation.
- **Legacy web comments** lack \`webContext\`. Their optional batch-level frame is the whole page
  captured at Send; \`anchor.normX/normY\` are full-page fractions. Their \`anchor.page\` carries
  URL, scroll, viewport and page size; \`element\`: a CSS \`selector\` identifies the original target
  with tag, visible text and within-element offsets. Use that text/selector to find the source.
  A missing legacy frame does not establish original visual state. For older iOS batches without
  comment frames, use the batch-level frame when available, mapping their normalized anchors to it.

Act on or answer each comment, then
\`morpheus qa comments resolve <id> --agent <identity> --root <checkout>\`.
If work fails, release that claim; if the responder died, an operator can release it with
\`--force\` after confirming the old responder stopped. Confirm the
first batch's saved images show the expected app content and inspect any declared omissions before
treating image locations as authoritative. HTML context remains primary for current web comments.

A wake webhook in local/qa-comments/webhook.json is scoped to that checkout, not this chat. It
fires for every batch at the root. Never copy another checkout's webhook or assume its target is
your responder.

## 5. End the session

    morpheus qa preview web stop      # or: morpheus qa preview ios stop

stop ends this checkout's preview and its overlay together; for iOS it shuts the simulator down, keeping
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