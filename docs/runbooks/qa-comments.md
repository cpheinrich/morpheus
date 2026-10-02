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
```

Exit non-zero when a named batch is missing. `pending` with an empty inbox
prints nothing and exits 0 — agents can poll safely.

## Operator loop (target UX)

1. Start the project preview (Evo: ios-qa → `preview.sh start`).
2. Open the Morpheus QA overlay pointed at the printed preview URL
   (`morpheus qa comments serve --preview <url>` — not in this slice).
3. Tap → type → add more comments → **Send**. Overlay writes
   `local/qa-comments/pending/<id>/`.
4. Tell the agent (or it polls) `morpheus qa comments pending`. Agent reads
   `show`, acts, then `resolve`.

## Hooking ios-qa / preview.sh later

Evo's ios-qa skill today: doctor → start → open Codex panel → use Codex
annotations. After this lands:

- `preview.sh start` keeps owning sim + serve-sim lifecycle.
- ios-qa step 3 gains an optional branch: when no Codex panel is available,
  print `morpheus qa comments serve --preview <url>` (or auto-open it) instead
  of only "open the URL in Safari and paste screenshots".
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
