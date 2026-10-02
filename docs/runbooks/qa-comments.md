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

| Input | Action |
|---|---|
| **Right-click** the frame | Place a numbered pin and open its comment box |
| **Click** an existing pin (or its row) | Reopen/edit that pin's text |
| **Enter** | Save text for the open pin |
| **Shift+Enter** | Newline in the comment box |
| **⌘Enter** / Ctrl+Enter | Send batch (all pins with text) |
| **Esc Esc** (within ~1s) | Delete the focused pin (first Esc saves/blurs) |

Pins stay for the session until deleted or cleared after a successful **Send**.

Header hint: *Right click to add comment. Press Esc twice to Delete*.


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
morpheus qa comments serve --preview <url> [--port 3456] [--root <project>]
```

`serve` binds **only** to `127.0.0.1`. `--root` is the project checkout that
receives `local/qa-comments/` (defaults to cwd) — for Evo QA, pass Evo's path
even when the Morpheus CLI is running from a Morpheus worktree.

Exit non-zero when a named batch is missing. `pending` with an empty inbox
prints nothing and exits 0 — agents can poll safely.

## Operator loop

1. Start the project preview (Evo: `apps/ios/scripts/preview.sh start`).
2. From a checkout that has this CLI (Morpheus worktree until merged):

   ```sh
   pnpm morpheus qa comments serve \
     --preview http://127.0.0.1:3200/ \
     --root /Users/chrisheinrich/code/evo \
     --port 3456
   ```

3. Open the printed overlay URL. Left-drag the stream to drive the sim;
   **right-click** to pin a comment; **Enter** saves the pin; **⌘Enter** sends
   the batch (pins clear after Send). Batches land in
   `<root>/local/qa-comments/pending/`. Configure the wake webhook once (above).
4. Agent (cwd = project root): `morpheus qa comments pending`, then `show` /
   `resolve`. Until this lands on Morpheus main, use
   `pnpm morpheus` from the claim worktree with `--root` pointing at the project.

## Hooking ios-qa / preview.sh later

Evo's ios-qa skill today: doctor → start → open Codex panel → use Codex
annotations. After this lands:

- `preview.sh start` keeps owning sim + serve-sim lifecycle and prints the
  preview URL; run `morpheus qa comments serve --preview <that-url> --root <evo>`
  beside it (no Evo claim required for the first usable loop).
- ios-qa step 3 can later print/auto-open the serve command when no Codex
  panel is available.
- The skill's "first annotation must confirm pixels arrived" check becomes:
  confirm `frame.png` (or the overlay's live canvas) shows real app pixels
  before treating comments as authoritative.

No change to serve-sim networking rules: stay on `127.0.0.1`; no LAN bind; no
public tunnel.

## Non-goals (v1)

- Replacing Codex annotations where that panel already works.
- Committing frames or batches.
- Cross-machine sync of `local/qa-comments/` (use chat / PR for remote agents).
- DOM-level element selectors for native sim streams.
