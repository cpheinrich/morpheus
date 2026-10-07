---
date: 2026-10-06
agent: claude
roadmap: MO-26-10-06-18.13.32
outcome: shipped
summary: Web comment QA — morpheus qa preview web, a proxy that injects an element-anchored comment overlay into a local dev server.
---

# MO-26-10-06-18.13.32 — Web comment QA

Chris asked for web commenting as soon as possible, after the shared iOS preview landed (#332).

## What was built

- `src/qa/web/server.ts` — the proxy: HTML injected at the end of head, CSP dropped for pages,
  host/origin/referer rewritten to the dev server's, redirects brought back, websockets tunnelled,
  `/__qa/` endpoints (health, overlay script, capture library, origin-guarded batch POST).
- `src/qa/web/overlay-client.ts` — the injected script (ES5-style, a raw string, no build step):
  shadow-DOM toolbar on `<html>` outside React's tree, right-click or Comment-mode pins, a CSS path
  that resolves to exactly the element, drafts kept per page in sessionStorage, whole-page capture.
- `src/qa/preview/web.ts` and `web-supervisor.ts` — attach or start the dev server, lease, launchd.
- `src/qa/batches.ts` — the batch writer shared with the simulator overlay (extracted from serve.ts).
- Schema: optional `element` and `page` on anchors; existing batches unaffected.

## Found by running it on the real Lakina site, and fixed

1. **Hydration mismatch.** Injected at the start of `<head>`, the script was paired by React with the
   layout's own first head script. Moved to the end of head; a fresh tab then logged no errors.
2. **`stop` left the dev server running.** An open hot-reload websocket kept `server.close()` from
   resolving, so the supervisor never reached the dev-server cleanup and the process was orphaned.
   Tunnels are now tracked and destroyed on close, and the supervisor ends the dev server's process
   group first and bounds the overlay close. Re-run: stop ends the overlay, supervisor and dev server.
3. **The captured frame used the wrong font.** Lakina loads Instrument Serif and Inter from Google
   Fonts; the page cannot read that stylesheet, so the capture fell back to another serif and the
   heading wrapped onto the tagline. `font.cssText` did not help (it inserts CSS without inlining
   fonts, and an SVG image cannot fetch them). The overlay now adds a temporary same-origin copy of
   the cross-origin `@font-face` rules for the capture, which the library inlines. Re-run: faithful.

Dead end on the way: the dev server first failed under launchd with `cat: : No such file` — a fake
`npm` an earlier reviewer had left in this session's scratch `bin`, ahead in PATH. Not a product bug;
the preview copies the caller's PATH into launchd, as the iOS preview does.

## Verified on the real Lakina site (Next 16.3.8, Claude's Browser pane)

- `start` spawned `npm run dev` in `apps/web` and reported `QA overlay: http://localhost:4309/`.
- The home page rendered with the toolbar; a fresh tab logged `[HMR] connected` and no errors.
- Hot reload through the proxy: a temporary edit to the tagline appeared in the same document
  without a reload, overlay still mounted; reverted.
- `/hq` redirected to `/hq/sign-in?next=%2Fhq` on the overlay's origin, toolbar present.
- Right-click pins on the heading and tagline, ⌘Enter: one batch, anchors `h1` "Lakina Capital" and
  `main > p` "Carve your own path." with page context; frame 1876×1409, faithful after fix 3.
- Comment mode: toggled on, a click pinned the tagline, Esc left the mode; pin deleted.
- `status` healthy; `stop` ended overlay, supervisor and dev server; with a dev server started by
  hand, `start` attached and `stop` left it answering.

Not verified: a signed-in `/hq` page (needs a human Google sign-in), Codex's panel and Grok's `open`.

## Validation

`pnpm typecheck`, `pnpm lint` clean; `pnpm test` 61 files / 1,710 tests (18 new web tests: injection,
rewriting, the proxy against a fake dev server including gzip, CSP, origin guard, websocket tunnel and
a bounded close with a tunnel open, the client's selectors and anchors in jsdom, config and args).
