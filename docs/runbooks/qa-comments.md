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
  resolved/
    <batchId>/        # same shape, moved here by `resolve`
```

`batchId` is `YYYYMMDDTHHMMSSZ-<short>` (UTC clock + 4–6 char suffix) so ids
sort chronologically without consulting a remote.


## Agent wake webhook (one true config)

After **Send** writes a pending batch, the serve process POSTs a small JSON
payload so an agent (e.g. Grok Bot) can wake and call `qa comments pending`.

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
server prefixes `Bearer` when missing). `local/` is already gitignored — never
commit the URL or key.

**Session overrides** (on the `morpheus qa comments serve` process):
- `MORPHEUS_QA_COMMENTS_WEBHOOK_URL` — replaces `url` when set
- `MORPHEUS_QA_COMMENTS_WEBHOOK_AUTHORIZATION` — replaces `authorization` when set

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
| `comments` | ordered list of `{ id, text, createdAt, anchor }` |
| `anchor` | `{ normX, normY }` in 0–1 of the frame, and/or `{ x, y }` pixels, and/or `{ x, y, w, h }` region |
| `status` | `pending` \| `resolved` |
| `resolvedAt` / `resolvedBy` | set by `morpheus qa comments resolve` |

## CLI

```sh
morpheus qa comments pending          # list pending batches (paths + comment counts)
morpheus qa comments show <batchId>   # print one batch.json
morpheus qa comments resolve <batchId> [...ids]
morpheus qa comments serve --preview <url> [--port 3456] [--root <project>] [--stream-url <url>]
```

`serve` binds **only** to `127.0.0.1`. `--root` is the project checkout that
receives `local/qa-comments/` (defaults to cwd) — for Evo QA, pass Evo's path
even when the Morpheus CLI is running from a Morpheus worktree. `--stream-url`
skips MJPEG discovery. `--project <name>` is the global flag (the parser
consumes it before `qa`) and is what `batch.project` records. POSTs must be
`Content-Type: application/json` from this server's own origin; a cross-site
page cannot inject a batch or drive the simulator. `frame.path` is recorded
only when a PNG was actually written.

Exit non-zero when a named batch is missing. `pending` with an empty inbox
prints nothing and exits 0 — agents can poll safely.

## Operator loop

1. From the project checkout: `morpheus qa preview ios start`. It builds the checkout, boots a
   simulator this checkout owns, launches the app, and starts serve-sim **and this overlay** under
   one launchd supervisor. It prints `QA overlay: http://127.0.0.1:<port>/`.
2. Open that overlay URL — the same page in every agent: Claude's Browser pane, Codex's in-app
   browser panel, and for Grok (or any agent without a panel) `open <url>`, the default browser.
   Not the stream URL, and not a host's native simulator panel or annotation tool.
3. Left-drag drives the app; **right-click** pins a comment; **Enter** saves the pin; **⌘Enter**
   sends the batch. Batches land in `<root>/local/qa-comments/pending/`.
4. The agent polls `morpheus qa comments pending`, then `show` / `resolve`.
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
              "summary": "Mode: live. …" }
  }
} }
```

- `{key}` is the checkout key (first 12 hex of SHA-256 over the app directory's absolute path)
  and `{root}` the project root; both expand in commands, paths and launch arguments.
- The build command receives `DERIVED_DATA_PATH`, `SIMULATOR_NAME`, `SIMULATOR_OS` and
  `SIMULATOR_UDID` for the simulator the preview booted.
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

## The web preview (MO-26-10-06-18.13.32)

`morpheus qa preview web start|status|stop|help` puts the comment overlay in front of a project's
local dev server. The project declares it in `morpheus.json`:

```json
"qa": { "web": { "url": "http://localhost:5173", "command": ["npm", "run", "dev"], "cwd": "apps/web", "path": "/" } }
```

- **Attach or start.** If something already answers at `url`, the preview attaches and `stop` leaves
  it running. Otherwise it runs `command` in `cwd` under the launchd supervisor, in its own process
  group, and `stop` (or the lease, or the dev server exiting) ends the whole group.
- **A proxy, not an iframe.** The overlay serves the site on its own port and injects
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
- **Pins.** Right-click any element (Shift+right-click keeps the browser menu), or turn on Comment
  and click. Each anchor carries `element` (a CSS selector that matched exactly that element, its
  tag, visible text and the point within it) and `page` (url, scroll, viewport and page size);
  `normX`/`normY` are fractions of the whole page, which is what the frame is.
- **Frame.** modern-screenshot 4.7.0 (zero dependencies) renders the whole page on Send, overlay
  excluded. It inlines fonts only from stylesheets the page can read, so the overlay adds a temporary
  same-origin copy of cross-origin `@font-face` rules (Google Fonts) for the capture; without it the
  image used a fallback font and text reflowed. A capture that fails still sends, without a frame.
- **Default port** 4300–4555, spread per checkout; `--port` overrides.

## Non-goals (v1)

- Committing frames or batches.
- Cross-machine sync of `local/qa-comments/` (use chat / PR for remote agents).
- DOM-level element selectors for native sim streams (web pins carry them; a simulator stream has no DOM).
