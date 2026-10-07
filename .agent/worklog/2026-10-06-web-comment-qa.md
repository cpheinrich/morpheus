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

## Independent review

PR cpheinrich/morpheus#342. A fresh reviewer at normal-leaning-high risk ran typecheck, lint and the full suite, confirmed dist matches a fresh compile, and checked the proxy's security boundary and the process lifecycle. One substantive finding, cleared conditionally and fixed under its condition: the overlay built its own origin from the browser's Host header, so a DNS-rebinding page counted as ours and had its Host and Origin rewritten to the dev server's, which defeats the dev server's own rebinding defences (reproduced by the reviewer); requests and websocket upgrades whose Host is not 127.0.0.1, localhost or [::1] on the overlay's port are now refused, and a foreign Origin reaches the dev server unchanged. Five minors fixed: a dollar sign in the project name no longer corrupts the injected script; an encoding the proxy cannot read passes through untouched instead of being mangled; qa.web.url must be http; only an absent IPv6 loopback is tolerated when binding; a missing dev command fails at once with its reason. One incidental noted. The batch endpoint guard, loopback-only binding, kill-only-what-it-spawned lifecycle, config validation, additive schema and docs were confirmed. Re-run on the real Lakina site after the fix: page, hot reload, a batch with frame and element anchor, and a foreign Host refused with 403. Cleared.

```morpheus-review
{
  "version": 2,
  "base": "f4d7fe215bcc65515b2af55a3964fd51329dc006",
  "reviewed": "5a2b267885c76cb41652089bc6c51fd74f21c3e0",
  "covered": "a4a45b4def1783b1947febfae733d65e1b5021ef",
  "authorSession": "f963f54d-05ca-4439-8ec1-1dedd1e49e13",
  "reviewerSession": "acd171bc0b31af9b3",
  "risk": "normal",
  "elapsedMinutes": 3.63235,
  "timing": {
    "source": "runner",
    "durationMs": 217941,
    "evidence": "Agent tool task-notification usage.duration_ms=217941 for reviewer agent acd171bc0b31af9b3 (initial review, started 2026-10-07 01:44 UTC from author session f963f54d-05ca-4439-8ec1-1dedd1e49e13); reviewer clock readings 01:44:14 to 01:46:59 UTC."
  },
  "outcome": "complete",
  "summary": "A fresh reviewer at normal-leaning-high risk ran typecheck, lint and the full suite, confirmed dist matches a fresh compile, and checked the proxy's security boundary and the process lifecycle. One substantive finding, cleared conditionally and fixed under its condition: the overlay built its own origin from the browser's Host header, so a DNS-rebinding page counted as ours and had its Host and Origin rewritten to the dev server's, which defeats the dev server's own rebinding defences (reproduced by the reviewer); requests and websocket upgrades whose Host is not 127.0.0.1, localhost or [::1] on the overlay's port are now refused, and a foreign Origin reaches the dev server unchanged. Five minors fixed: a dollar sign in the project name no longer corrupts the injected script; an encoding the proxy cannot read passes through untouched instead of being mangled; qa.web.url must be http; only an absent IPv6 loopback is tolerated when binding; a missing dev command fails at once with its reason. One incidental noted. The batch endpoint guard, loopback-only binding, kill-only-what-it-spawned lifecycle, config validation, additive schema and docs were confirmed. Re-run on the real Lakina site after the fix: page, hot reload, a batch with frame and element anchor, and a foreign Host refused with 403. Cleared.",
  "findings": [
    {
      "id": "SUB-001-host-header-trusted-dns-rebinding",
      "severity": "substantive",
      "disposition": "fixed",
      "paths": ["src/qa/web/server.ts", "tests/qa-web.test.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map", "dist/qa/web/server.d.ts"],
      "description": "own was built from req.headers.host, so a DNS-rebinding page (evil.example resolving to 127.0.0.1) counted as the overlay's origin; its Host and Origin were rewritten to the dev server's on HTTP and websocket requests, defeating the dev server's own rebinding checks and exposing dev-server responses, the HMR socket and /__qa/health's root path to a remote site.",
      "response": "ownHost() accepts only 127.0.0.1, localhost or [::1] on the overlay's port; any other Host gets 403 on requests and on upgrades, and own is derived only from a host that passed; the Origin is rewritten only when it is the overlay's own, so a foreign Origin reaches the dev server unchanged. Tests cover the accepted and refused hosts, a rebound GET and /__qa/health refused without reaching the dev server, a foreign Origin passed through, and a refused upgrade.",
      "condition": {
        "paths": ["src/qa/web/server.ts", "tests/qa-web.test.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map", "dist/qa/web/server.d.ts"],
        "evidence": "Tests showing a foreign Host gets 403 on a GET and on an upgrade and a foreign Origin reaches upstream unchanged; npx vitest run tests/qa-web.test.ts, pnpm typecheck, pnpm lint and pnpm compile."
      },
      "conditionMet": "On a4a45b4d: npx vitest run tests/qa-web.test.ts passed 24 tests including the four host/origin/upgrade tests; pnpm typecheck and pnpm lint clean; pnpm compile regenerated dist/qa/web. A real preview on the Lakina site answered 403 to Host evil.example and served the page, hot reload and a batch normally."
    },
    {
      "id": "MIN-001-dollar-in-project-name",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/web/server.ts", "tests/qa-web.test.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map"],
      "description": "String.replace with a string expanded $' and friends from the project name, splicing script into the literal.",
      "response": "A replacer function; a test serves a script for the name Acme $' Co and parses it."
    },
    {
      "id": "MIN-002-unknown-encoding-corrupted",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/web/server.ts", "tests/qa-web.test.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map", "dist/qa/web/server.d.ts"],
      "description": "An HTML response in zstd or a stacked encoding was injected into while still compressed and its content-encoding removed.",
      "response": "decode() returns null for anything but one known encoding and the response passes through untouched; tested."
    },
    {
      "id": "MIN-003-https-upstream-half-supported",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/web/server.ts", "tests/qa-web.test.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map"],
      "description": "An https upstream was accepted but the websocket tunnel is plain TCP and self-signed certificates were refused.",
      "response": "normalizeUpstream accepts http only; https://localhost is refused in the test."
    },
    {
      "id": "MIN-004-ipv6-bind-failure-tolerated",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/web/server.ts", "dist/qa/web/server.js", "dist/qa/web/server.js.map"],
      "description": "Any failure to bind [::1] was tolerated, so another process on [::1]:port could receive localhost traffic meant for the overlay.",
      "response": "Only EADDRNOTAVAIL and EAFNOSUPPORT are tolerated; anything else closes what was bound and fails the start."
    },
    {
      "id": "MIN-005-missing-dev-command-slow-failure",
      "severity": "minor",
      "disposition": "fixed",
      "paths": ["src/qa/preview/web-supervisor.ts", "src/qa/preview/web.ts", "dist/qa/preview/web-supervisor.js", "dist/qa/preview/web-supervisor.js.map", "dist/qa/preview/web.js", "dist/qa/preview/web.js.map"],
      "description": "A dev command not on PATH crashed the supervisor on an unhandled spawn error and start reported only that the preview did not become ready, after the full wait.",
      "response": "start checks the command is on PATH before bootstrapping and names it if not; the supervisor handles the spawn error immediately after spawning and exits with the reason in the log."
    },
    {
      "id": "INC-001-font-style-outlives-timeout",
      "severity": "incidental",
      "disposition": "deferred",
      "paths": ["src/qa/web/overlay-client.ts"],
      "description": "If the capture timeout wins, the temporary font style stays until the capture library settles.",
      "response": "Harmless (it holds only faces the page already loaded) and removed when the capture settles; left as is and tracked on the roadmap item.",
      "roadmap": "MO-26-10-06-18.13.32"
    }
  ]
}
```
