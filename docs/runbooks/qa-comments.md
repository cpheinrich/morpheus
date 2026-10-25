# QA comment batches

How an operator leaves visual QA comments for any Morpheus agent, without
Codex's right-panel tool.

Batches are **local-only** (`local/` is gitignored). Shared evidence remains
screenshots pasted in chat, the worklog, and the PR — never a committed PNG.

## On-disk layout

Under the project checkout (Evo, Morpheus, Lakina, Kairos, …):

```
local/qa-comments/
  pending/
    <batchId>/
      batch.json      # schema below
      frame.png       # optional captured frame at Send
      comment-1.png   # iOS PNG at placement
      comment-2.jpg   # web viewport JPEG at placement
  claims/
    <batchId>.json    # exclusive agent claim; survives process exit
  responder.json      # optional local command for a separate agent process
  responder.lock      # active checkout owner; do not edit concurrently
  responder.stop.<pid> # graceful stop request for that owner
  resolved/
    <batchId>/        # same shape, moved here by `resolve`
```

`batchId` is `YYYYMMDDTHHMMSSZ-<short>` (UTC clock + 4–6 char suffix) so ids
sort chronologically without consulting a remote.

Send publishes `batch.json` and its optional frames together, then returns the
batch id and current open-batch count. Later Sends append to the queue while an
agent is working. A claim is created exclusively for one agent identity; other
agents can claim other batches but cannot resolve or release that claim. Claims
do not expire automatically, because a long-running QA edit must not be handed
to another agent mid-work. Use `release --force` only after confirming the
original responder stopped. The batch remains in `pending/` while claimed.

## Background responder

For QA while the interactive chat stays free, run one separate responder process
per checkout. Put its command in gitignored `local/qa-comments/responder.json`:

```json
{
  "agent": "codex:evo-qa",
  "command": ["codex", "exec", "-C", "{root}", "-"],
  "pollMs": 2000
}
```

This example uses Codex's noninteractive CLI. A Claude, Grok, or other responder
can supply its own argv array. Morpheus executes the array directly without a
shell, replaces `{root}`, `{id}`, and `{agent}` in each argument, and sends the
batch instructions on stdin. Do not put secrets in command arguments. The
responder claims one batch, waits for that child to finish and resolve it, then
claims the next. Later Sends append while it is busy. If the child exits without
resolving, the responder stops and leaves the claim for investigation.

```sh
morpheus qa comments responder start --root <checkout>   # separate terminal/process
morpheus qa comments responder status --root <checkout>
morpheus qa comments responder stop --root <checkout>    # after current batch
morpheus qa comments responder recover --confirm-no-agent-process --root <checkout>
```

If the responder is killed while its agent child is still editing, the owner
record remains. `recover` refuses to remove it until an operator verifies the
agent process and its descendants have stopped and passes
`--confirm-no-agent-process`. A short-lived `responder.recovering` guard keeps
another responder from starting during that recovery. If recovery itself
crashes and leaves that guard, verify that no recovery or agent process is
running before removing the stale guard file manually.

While `responder.lock` exists, that process owns the checkout for
comment implementation. Other chats may inspect or converse, but should not
edit the checkout. Stop it and wait for the marker to disappear before handing
the checkout to another author. The child works on the existing QA session
branch and commits locally; the interactive chat owns session-end review, push,
and PR creation. The responder does not rebuild or relaunch a live preview.


## Agent wake webhook (one true config)

After **Send** writes a pending batch, the serve process POSTs a small JSON
payload when a wake webhook is configured. The webhook is only a notification;
the receiver must claim and drain the on-disk queue. Configure it to start a
separate responder where the agent host supports that. Morpheus cannot make an
active Claude, Codex, or Grok chat continue in the background by itself. In
particular, a new Codex checkout without a configured wake route will retain
the comments but will not wake its chat. The overlay reports "Queued", the
open count, and whether a background responder is running or another wake
route is configured; it never claims that an agent has started from a webhook
alone.

**Durable config (preferred):** under the project that receives batches (Evo,
Lakina, …), create the gitignored file:

```json
// local/qa-comments/webhook.json
{
  "url": "https://…paste-from-Grok-routine-panel…",
  "authorization": "Bearer …paste-key…"
}
```

`authorization` is optional. Use a full `Bearer …` value or a bare token (the
server prefixes `Bearer` when missing). The file applies to **every operator** writing
batches to that root; it is not scoped to an agent or browser session. `local/` is already gitignored — never
commit the URL or key.

**Session overrides** (on the `morpheus qa comments serve` process):
- `MORPHEUS_QA_COMMENTS_WEBHOOK_URL` — replaces `url` when set; an empty value disables waking, including file config
- `MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION` — replaces `authorization` when set; an empty value clears it

For QA that should not wake the configured routine, start that serve process with
`MORPHEUS_QA_COMMENTS_WEBHOOK_URL= morpheus qa comments serve ...`.

Send **always succeeds** without a webhook. If neither env nor file is set, the
server logs one hint line and continues. The POST is fire-and-forget (≈2.5s
timeout); webhook failures never fail Send.

Payload shape:

```json
{
  "event": "qa.comments.batch_pending",
  "id": "20261002T195345Z-0e94sn",
  "project": "evo",
  "root": "/Users/…/code/evo",
  "pendingDir": "/Users/…/code/evo/local/qa-comments/pending",
  "path": "/Users/…/code/evo/local/qa-comments/pending/20261002T195345Z-0e94sn",
  "commentCount": 2,
  "createdAt": "2026-10-02T19:53:45.000Z"
}
```

## Overlay UX

No Comment/Interact mode. The live MJPEG stream is always interactive
(left-drag drives the simulator via serve-sim HID). Pins sit on top.

Touches are ordered and paced before they reach serve-sim (`src/qa/touch-pacer.ts`):
a tap's end is sent no sooner than 40 ms after its begin, an end that arrives before
its begin waits up to 120 ms and is paired with it, and a new begin ends any finger
still down. Without this, instant clicks and trackpad taps were dropped or left the
finger down until the next tap, which made switches flip late or flip two controls.

| Input | Action |
|---|---|
| **Right-click** the frame | Place a numbered pin and open its comment box |
| **Click** an existing pin (or its row) | Reopen/edit that pin's text |
| **Enter** | Save text for the open pin |
| **Shift+Enter** | Newline in the comment box |
| **⌘Enter** / Ctrl+Enter | Send batch (all pins with text) |
| **Esc Esc** (within ~1s) | Delete the focused pin (first Esc saves/blurs) |

Pins stay for the session until deleted or cleared after a successful **Send**. They and the
draft being typed are mirrored into the tab's `sessionStorage`, so a page reload, an overlay
server restart or a simulator relaunch brings them back; closing the tab forgets them.
Each iOS pin freezes the simulator stream frame displayed at the right-click. The captured
image is shown beside the editor and stored in the browser's IndexedDB until Send succeeds.
If the stream has no frame yet, the overlay asks you to wait and does not create a pin.
Review the image while writing the comment. The batch also retains the Send-time frame for
older agents. The pin's original
coordinates refer to its own screenshot, even after the app scrolls. The overlay reads the
simulator accessibility stream to follow the nearby native element while it scrolls; a marker
outside the visible frame or on another screen is hidden, while its comment stays in the list.
`screenId` comes from the raw simulator accessibility tree: the app's `*Screen` identifier when
exposed (including SwiftUI roots omitted from the simplified stream), otherwise an `ax:` ID
from the first two app-specific landmarks. During a vertical drag the overlay server retains
that fallback ID even if a lazy list recycles those landmarks; a subsequent tap permits a new
screen candidate. The overlay's accessibility stream derives the screen ID and element positions from
the same native tree, so animations cannot make a later screen-ID response mislabel a pin.
When a screen ID and nearby named element are available at the click, the pin uses them to
follow scrolling and hide on other screens. If accessibility is unavailable or there is no
stable nearby element, the captured image and comment remain valid; marker tracking is best
effort. Send requires each pin's placement PNG, but does not require accessibility data.

Header hint: *Right click to add comment. Press Esc twice to Delete*.

The device frame **contain-fits** the left pane (aspect ratio preserved,
centered, 16px padding). It resizes with the window — no fixed zoom — and any
margin matches the chrome background `#12151a`, not stark black.



## Batch schema

See `src/qa/comments.ts` (`QaCommentBatch`). Summary:

| Field | Meaning |
|---|---|
| `version` | `1` |
| `id` | directory name |
| `project` | `morpheus.json` `name` (e.g. `evo`) |
| `createdAt` | ISO-8601 with offset |
| `preview` | `{ url, kind?: "serve-sim" \| "web" \| "other", label? }` |
| `frame` | `{ path?: "frame.png", width, height, capturedAt? }` |
| `comments` | ordered list of `{ id, text, createdAt, anchor, screenId?, frame? }` |
| `comments[].screenId` | screen identifier captured at iOS or web pin placement |
| `comments[].frame` | `{ path?: "comment-N.png", width, height, capturedAt? }`, captured at iOS or web pin placement |
| `anchor` | `{ normX, normY }` in 0–1 of the frame, and/or `{ x, y }` pixels, and/or `{ x, y, w, h }` region |
| `status` | `pending` \| `resolved` |
| `resolvedAt` / `resolvedBy` | set by `morpheus qa comments resolve` |

## CLI

```sh
morpheus qa comments pending          # inspect open batches (including claimed)
morpheus qa comments claim --agent <session-id>  # reserve oldest unclaimed batch
morpheus qa comments show <batchId>   # print one batch.json
morpheus qa comments resolve <batchId> --agent <session-id>
morpheus qa comments release <batchId> --agent <session-id>  # return failed work to queue
morpheus qa comments release <batchId> --force  # recover an abandoned claim
morpheus qa comments responder start|status|stop --root <checkout>
morpheus qa comments responder recover --confirm-no-agent-process --root <checkout>
morpheus qa comments serve --preview <url> [--port 3456] [--root <project>] [--stream-url <url>] [--no-ax]
```

`serve` binds **only** to `127.0.0.1`. `--root` is the project checkout that
receives `local/qa-comments/` (defaults to cwd) — for Evo QA, pass Evo's path
even when the Morpheus CLI is running from a Morpheus worktree. `--stream-url`
skips MJPEG discovery. `--project <name>` is the global flag (the parser
consumes it before `qa`) and is what `batch.project` records. POSTs must be
`Content-Type: application/json` from `http://127.0.0.1:<port>` or
`http://localhost:<port>` at the bound overlay port; a cross-site
page cannot inject a batch or drive the simulator. `frame.path` is recorded
only when a PNG was actually written.

If macOS accessibility crashes the overlay, use `--no-ax` to pin comments from the MJPEG frame
without native accessibility reads. A managed iOS preview runs the overlay in a separate process:
if that process exits, the supervisor keeps the simulator stream alive and restarts the overlay
once with accessibility disabled. A second overlay failure is logged and requires a deliberate
preview restart. An open AX tab reloads into screenshot-pin mode when the fallback becomes healthy;
its unsent comments and captured frames are restored.

Exit non-zero when a named batch is missing. `pending` with an empty inbox
prints nothing and exits 0 — agents can poll safely. Resolving an already-resolved
batch returns the original record unchanged, preserving its first `resolvedAt` and
`resolvedBy`.

## Operator loop

1. From the project checkout: `morpheus qa preview ios start`. It builds the checkout, boots a
   simulator this checkout owns, launches the app, and starts serve-sim **and this overlay** under
   one launchd supervisor. It prints `QA overlay: http://127.0.0.1:<port>/`.
2. Open that overlay URL — the same page in every agent: Claude's Browser pane, Codex's in-app
   browser panel, and for Grok (or any agent without a panel) `open <url>`, the default browser.
   Not the stream URL, and not a host's native simulator panel or annotation tool.
3. Left-drag drives the app; **right-click** pins a comment; **Enter** saves the pin; **⌘Enter**
   sends the batch. Batches land in `<root>/local/qa-comments/pending/`.
4. A separate responder, monitor, or the agent between turns calls `claim --agent
   <session-id>`, then `show` / `resolve --agent <session-id>` for each returned
   id until `claim` prints nothing. If work fails, `release` it so another agent
   can pick it up. `pending` remains a read-only inspection command.
5. `morpheus qa preview ios stop` ends the simulator, serve-sim and the overlay together.

`morpheus qa guide` prints the agent's full instructions; the `comment-qa` skill every project
carries points at it. `morpheus qa comments serve` remains for a preview Morpheus did not start.

## The shared iOS preview (MO-26-10-06-15.17.01)

Moved from Evo's `apps/ios/scripts/preview.mjs` so every project with an iOS app gets the same
lifecycle. A project declares only what Morpheus cannot know, in `morpheus.json`:

```json
"qa": { "ios": {
  "app": "apps/ios",
  "build": ["bash", "apps/ios/scripts/dev.sh", "build"],
  "precheck": ["bash", "apps/ios/scripts/lint.sh"],
  "product": "Build/Products/Debug-iphonesimulator/App.app",
  "derivedData": "/private/tmp/AppDerivedData-{key}",
  "bundleId": "com.example.app",
  "device": { "name": "App QA", "type": "iPhone 17 Pro" },
  "minimumXcode": "26.5",
  "defaultMode": "demo",
  "modes": {
    "demo": { "flags": ["--demo"], "args": ["-ui-testing"], "summary": "Mode: demo. …" },
    "live": { "flags": ["--live"], "args": ["--qa-live"],
              "prepare": { "command": ["node", "apps/ios/scripts/qa-account.mjs", "{key}"], "credentials": true },
              "summary": "Mode: live. …" },
    "production": { "flags": ["--production"], "args": [],
                    "build": ["bash", "apps/ios/scripts/dev.sh", "build", "--configuration", "ProductionDebug"],
                    "product": "Build/Products/ProductionDebug-iphonesimulator/App.app",
                    "bundleId": "com.example.app.production" }
  }
} }
```

- `{key}` is the checkout key (first 12 hex of SHA-256 over the app directory's absolute path)
  and `{root}` the project root; both expand in commands, paths and launch arguments.
- The build command receives `DERIVED_DATA_PATH`, `SIMULATOR_NAME`, `SIMULATOR_OS` and
  `SIMULATOR_UDID` for the simulator the preview booted.
- A mode that builds a different app overrides `build`, `product` and `bundleId` together.
  The command can select its Xcode configuration. The preview checks the built app's
  `CFBundleIdentifier` before installing it, including with `--no-build`; a stale product
  cannot quietly launch another mode's bundle. `status` and `stop` name the started mode.
- A mode's `prepare` command prints `{"env": {"NAME": "value"}}`; each entry reaches the app as a
  launch environment variable. With `credentials: true` it runs under
  `morpheus credentials run --`. Its stdout stays in memory: never in arguments, state files or
  launchd.
- `namespace` (launchd label and `~/Library/Caches/<namespace>/<key>` state) and `device.name`
  default to `morpheus.qa.<project>` and `<Project> QA`; Evo sets its old values so previews its own
  script started stay addressable across the move.
- Default ports are spread per checkout (3200–3455) so two projects' previews do not collide; the
  overlay is always 256 above the stream. `--port` overrides.
- serve-sim is a pinned dependency of the CLI, no longer installed per project.

Everything the old script guaranteed carries over and is tested in `tests/qa-preview.test.ts`:
launchd owns exactly this preview; a device is shut down only when its name proves this checkout
owns it; the lease defaults to four hours; a signal is intent, not an abort; Xcode 27's Device Hub
input shadowing is repaired before launch; occupied ports are refused, never freed.

## Standalone overlay lifecycle

This applies to `morpheus qa comments serve` beside a preview Morpheus did not start;
`morpheus qa preview ios stop` already ends its own overlay. The standalone overlay process and
the project preview are separate. Stopping or restarting the preview does not stop an existing
overlay. Use Ctrl+C in the overlay terminal when QA ends; restart the preview first, then the
overlay, after a simulator change. A missing stream shows “No MJPEG stream — pass --stream-url or
start serve-sim first.”

`/health` reports the overlay's configuration and process health; it does **not**
probe the upstream stream. Confirm live app pixels before QA. If port 3456 is busy,
inspect `lsof -nP -iTCP:3456 -sTCP:LISTEN`, stop the overlay you own, or select another
`--port`. Do not stop another operator's process merely to reclaim the default port.

## The web preview (MO-26-10-06-18.13.32)

`morpheus qa preview web start|status|stop|help` puts the comment overlay in front of a project's
local dev server. The project declares it in `morpheus.json`:

```json
"qa": { "web": { "url": "http://localhost:5173", "command": ["npx", "next", "dev", "--port", "{port}"], "cwd": "apps/web", "path": "/" } }
```

- **Startup failures.** Start checks the launchd supervisor during readiness. If the job exits or
  disappears, it fails promptly with the last20 log lines (at most8KiB) and the `preview.log`
  path. A pending first launch or running compile keeps the normal bounded readiness wait.
- **Attach or start.** If something already answers at `url`, the preview attaches and `stop` leaves
  it running. Otherwise it runs `command` in `cwd` under the launchd supervisor, in its own process
  group, and `stop` (or the lease, or the dev server exiting) ends the whole group.
- **Ownership survives project renames.** New web sessions use
  `~/Library/Caches/morpheus.qa.web/web-<checkout/dev-directory-key>/session.json`
  and a stable launchd label, independent of the project/display name and configured legacy
  namespace. Status, start and stop also discover old namespace directories for the same key.
  When old and new namespaces share a launchd label, its registered state-file argument selects
  the owner; an empty legacy directory cannot replace the stable session.
  The stored checkout and dev directory must match, and the registered job must name the web
  supervisor and exact state file; a port or upstream URL alone never authorizes stopping it.
  Legacy session files stay at their original paths while running so their supervisor can keep
  reading the lease. Status reports the actual old log path; the next start stops the verified
  old registration before writing a new stable session. Multiple registrations, foreign/malformed
  or symlinked records, active legacy start locks, and unverifiable jobs refuse without stopping
  an arbitrary process. Health also names the checkout root. Stop reports when no registered owner
  was found instead of claiming termination. Both the overlay and any spawned dev listener must
  disappear before shutdown is confirmed. Listener presence counts even for HTTP errors or a
  stalled response; failed/unconfirmed shutdown and orphan listeners retain their state for
  diagnosis. Only inactive records whose overlay port and owned dev endpoint are absent may
  be cleared without a registered job. Moving the actual checkout or
  dev directory is separate from renaming its display label: stop the original preview first.
- **The site's own address (MO-26-10-06-22.17.47).** When the preview starts the dev server and
  `command` contains `{port}`, the dev server runs on the first free port above `url`'s and the
  overlay listens on `url` itself. Sign-in allowlists (a Firebase browser key's HTTP referrers,
  OAuth redirect URIs), cookies and redirects then see exactly the address they were configured for.
  On a separate overlay port, Firebase refused Google sign-in with
  `auth/requests-from-referer-http://localhost:4342/-are-blocked`, and a proxy cannot fix that: the
  browser calls Google directly. Without `{port}`, or when a dev server already holds `url`, the
  overlay sits on its own port and `start` says that sign-in may be refused there; `--port` also
  keeps it on its own port. When fronting, requests reach the dev server with the site's own host,
  origin and referer, so absolute URLs it builds (an OAuth `redirect_uri`) name the site too. A dev script that
  hard-codes its port needs the underlying command, e.g. `["npx", "next", "dev", "--port", "{port}"]`.
- **A column beside the site (MO-26-10-07-13.27.17).** A browser's top-level page load
  (`Sec-Fetch-Dest: document`) gets a small shell: the site in a same-origin frame on the left and
  a full-height comment column on the right, the iOS overlay's shape. The site gets a genuinely
  narrower viewport, so its fixed elements and media queries behave; the shell keeps the address
  bar and title in step with the framed page, so a reload returns to it. The framed request
  (`Sec-Fetch-Dest: iframe`) is the proxied site with the script injected; inside the shell's
  frame the script does nothing, because the shell drives that document. `X-Frame-Options` is
  dropped from proxied pages. A browser that sends no `Sec-Fetch-Dest` gets the column fixed inside
  the page itself, with the page's margin moved to make room. Any framed document other than the
  top draws nothing, so a site's own iframes stay clean.
- **Full page, the way out of the frame.** Some flows cannot run in a frame: a sign-in that sends
  the page to Google or GitHub (Auth.js's default, Firebase `signInWithRedirect`) lands on a
  provider that refuses to be framed, and a site that frame-busts would reload forever. The
  column's Full page button sets a `morpheus_qa_layout=inline` cookie, which makes the server skip
  the shell and serve the site full width with the column inside it; Column clears it. When the
  frame leaves the site's origin the column says so and offers the same switch. A popup sign-in
  (`signInWithPopup`) works inside the frame. A file opened in a tab (a non-HTML extension, or an
  Accept without `text/html`) never gets the shell.
- **The site's own look.** The column reads the framed page's computed background, text colour and
  font (the first opaque background from body up) and re-reads them as the page changes, so it
  follows a light, dark or toggled theme on any product. Pins stay one fixed signal colour.
- **A proxy, not an iframe of the dev server.** The overlay serves the site on its own port and injects
  `<script src="/__qa/overlay.js" defer>` at the end of every HTML page's head. Paths, cookies and
  hot reload are the site's own: requests reach the dev server with its own host, origin and referer;
  redirects to the dev server's origin come back through the overlay; websockets are tunnelled. The
  page's CSP header is dropped (a dev-only tool on a local origin). Reserved paths live under
  `/__qa/` (health, the overlay script, the capture library, the batch endpoint).
- **The end of head, not the start.** React hydrates head children in order; a script placed first
  was paired with the layout's own first script and reported as a hydration mismatch.
- **Hostname.** The overlay URL uses the dev server's hostname (usually `localhost`) so cookies set for
  the dev server — a signed-in session — apply. Cookies ignore ports. The batch endpoint accepts JSON
  from the overlay's own origin, as `localhost` or `127.0.0.1`.
- **Pins and scope.** Right-click any element (Shift+right-click keeps the browser menu), or turn on Comment and click. The editor's **Applies to** control selects Element, Current view or Whole page. Scope changes classification without recapturing the original target, state or timestamp. A marker requires its original route (including query/hash) and stable view identity. Dialog headings and explicit view-root entity IDs distinguish different artists in the same dialog selector; arbitrary descendant list-card IDs do not define a page identity; target and nearby ancestor fingerprints reject recycled selectors. Detached, occluded, offscreen or wrong-view markers hide while their comments remain accessible in the sidebar. Nested scroll and resize update visible markers. Custom panels can identify their root with `data-qa-view`; native dialogs, `role=dialog` and `aria-modal=true` are recognized automatically. Hidden/inert roots and `aria-modal=false` are excluded.
- **Placement HTML is primary evidence.** Every new comment carries `webContext` version 1: original timestamp, sanitized route, target tag/allowlisted attributes/text/bounds, up to six ancestors, view/entity identity, up to sixteen observable UI state entries (including search and selected filters), up to eight scroll ancestors and viewport geometry. Target/view nodes include nine relevant computed style values. This is a compact semantic hierarchy, not a whole DOM dump or application store. Password/file/private fields, hidden content, unrestricted data attributes and arbitrary input values are excluded. Query keys naming tokens, keys, secrets, passwords, authorization, codes, sessions or email are redacted consistently in routes, anchor URLs and preview metadata. `data-qa-private` excludes sensitive subtrees. Publicly visible content can still be sensitive: keep QA local.
- **Placement JPEG.** Each pin synchronously freezes a bounded, inert styled clone before focus, navigation or asynchronous resource work. Computed styles are resolved at placement; one shared initial-style reset plus per-node differences avoids repeating inherited design-token dictionaries and default declarations. Explicit initial values inside styled parents remain reset, including pseudo-elements. Resolved colors remain explicit because border, outline and decoration initial colors depend on currentColor. modern-screenshot 4.7.0 renders only that clone to a JPEG of the visible application viewport, longest edge at most 1600 px and quality 0.5. Scripts, event handlers, navigation attributes, embedded frames and custom-element behavior are never mounted as live application content. Loaded image/canvas/video pixels are frozen synchronously; unsupported, unloaded or cross-origin tainted media gets a labelled placeholder and `image.omitted` annotation while the surrounding viewport remains captured. Browser DOM rendering can differ from native pixels (notably unreadable font sheets, shadow DOM and embedded media). HTML evidence remains usable when an image fails. The editor displays the saved placement image, or a persistent failure explanation beside it that remains visible after saving/reselecting the comment. A failed image never prevents Send. Send never captures a later page image.
- **Coordinate spaces.** Legacy `anchor.normX/normY` and `anchor.x/y` keep their full-page meaning. A web JPEG uses viewport space: `webContext.image.point` is the original viewport click, `viewport.scrollX/scrollY` record the original page offset, and `image.scale` records the nominal cap and `scaleX/scaleY` map viewport pixels to actual encoded JPEG pixels (including integer canvas rounding). `frame.width/height` describe the encoded JPEG; `frame.capturedAt` is the frozen placement timestamp, not the later encoding or Send time.
- **Drafts and bounds.** The tab keeps at most 30 pins and 256 KiB of text/context metadata in sessionStorage. IndexedDB holds frozen pending snapshots and completed images so encoding can resume after reload; at most 60 records are retained per origin, evicting entries after 24 hours. Each frozen clone is capped at 4000 included elements, 2 MiB and 120 ms synchronous work; each JPEG at 512 KiB. Rendering has a 15-second timeout. The server accepts at most 30 web comments per batch and enforces JPEG size/dimension limits. Quota/encoding/unsupported-content failures stay explicit and do not discard HTML or comments. Successfully sent/deleted pins release their image records. Old per-route drafts merge with current drafts whenever their route is visited, including after an empty v2 draft. Each admitted comment and its opaque consumed-index marker are persisted before source cleanup, so deletion/Send cannot replay it if cleanup fails. Capacity or byte-limit overflow remains intact in its original route draft with a recoverable status; Send/delete current comments and return to that route to admit the remainder. Unavailable placement context/time is marked honestly; no new evidence is fabricated for old pins. Closing a tab forgets its draft metadata.
- **Default port** 4300–4555, spread per checkout; `--port` overrides.

## Non-goals (v1)

- Committing frames or batches.
- Cross-machine sync of `local/qa-comments/` (use chat / PR for remote agents).
- DOM-level element selectors for native sim streams (web pins carry them; a simulator stream has no DOM).
