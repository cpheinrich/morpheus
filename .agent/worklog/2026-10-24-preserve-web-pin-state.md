---
date: 2026-10-24
roadmap: MO-26-10-24-20.37.28
agent: codex
---

# Web QA placement evidence and view attachment

Issue #482 came from MusicGuide QA: web screenshots and timestamps described Send rather than each original pin, and modal pins drifted onto the underlying page. Chris clarified compact semantic HTML/hierarchy and UI state as primary evidence, then requested a quality-0.5 JPEG of each visible application viewport capped at 1600 px.

Each new pin now synchronously freezes semantic context and an inert styled viewport clone before focus/navigation. Async rendering reads only the frozen clone; pending snapshots and JPEGs survive reload through IndexedDB. Metadata records the original timestamp, click, scroll, viewport and exact encoded scale. Element/view/page scope changes classification without replacing evidence. Stable view/entity and target/nearby-ancestor fingerprints hide mismatched, detached, recycled or occluded markers while sidebar comments remain available. JPEG transport is additive to existing iOS PNG support. Unsupported media is replaced only in its rectangle and recorded in `image.omitted`; image/storage failures retain HTML comments and report their limits.

The existing maintained modern-screenshot 4.7.0 API awaits media and clones asynchronously, so directly moving its old live-page render to the click would still capture later state. Its renderer is reused behind a small synchronous freeze boundary instead. Registry check found 4.7.0 current (modified 2026-04-16), zero runtime dependencies; no package was added.

Dead ends and corrections: the original screenshot-only handoff was updated before implementation to prioritize semantic evidence. Rejecting the entire image for a cross-origin iframe/artwork was too coarse for a real guide viewport; per-media placeholders now preserve the rest. Initial real JPEG pixel inspection exposed root-margin collapse after replacing html with an inert div; restoring the root formatting context keeps fixed media/dialog coordinates accurate. Concurrent Playwright invocations initially shared an output directory and collided during trace cleanup; subsequent runs use distinct temporary output paths. WebKit's actual renderer takes about 11 seconds in these fixtures, inside the 15-second encoding bound; assertions wait for that real completion rather than assuming Chromium timing. No live QA tab, preview process, responder or installed Morpheus runtime was touched.

Validation: `pnpm typecheck`; `pnpm compile`; `pnpm morpheus pm index`; focused `pnpm exec vitest run tests/qa-web.test.ts tests/qa-comments.test.ts tests/qa-overlay-pins.test.ts` (80 passed). The selected suites cover the changed web/schema/shared transport and its iOS consumer. Real Chromium/WebKit overlay tests cover base-page and modal pins, immediate Alice→Bob replacement, close/reopen, recycled target text, nested scrolling, resize, scope, multiline draft reload, pending-image recovery, correct original timestamps/bytes on Send, 1600-px cap and quality metadata, 12,000-row guide bounds, media placeholders with actual JPEG pixels, storage failure, 30-pin admission and legacy drafts. Final capture paths and final browser result are recorded below after completion. CI owns the full suite; it was not run locally because this change does not touch the shared core areas that authorize it.

Graph evidence: Tier 2 on project `Users-chrisheinrich-code-morpheus`, generation `2026-10-25T02:16:30Z`. `recordBatch` has simulator/server callers and calls `parseBatch`/`writePendingBatch`; both transport consumers are tested. Coverage reported no recorded gaps for existing source/test/docs paths. The embedded overlay JS is one graph variable, so exact source is the implementation evidence. The new browser test is absent from the primary-checkout graph and was read/executed directly; generated dist is excluded by design and refreshed with the compiler. No completeness claim is inferred from coverage.

Limitations: this is a DOM reconstruction, not native compositor pixels. Cross-origin/unloaded media, frames and shadow DOM receive explicit placeholders; unreadable external font sheets can still render fallback fonts. Bounded freeze work or browser quota can prevent JPEG persistence without losing in-memory HTML/comments; the UI says when a reload would lose unsaved metadata. Existing old comments cannot gain original context retroactively. Custom panels should opt into `data-qa-view` for stable view identity.

Final browser validation: `QA_EVIDENCE_DIR=/tmp/morpheus-pin-evidence pnpm exec playwright test --workers=2 --output=/tmp/morpheus-pin-final-results` — 14 passed. After the root-margin correction, the four affected modal/media scenarios passed again using `--grep 'cross-origin artwork|exact semantic' --output=/tmp/morpheus-pin-pixel-results`. Final inspected pixels: `/tmp/morpheus-pin-evidence/web-context-chromium.png`, `web-context-webkit.png`, `web-media-chromium.jpg`, `web-media-webkit.jpg`. The media JPEGs verify original fixed coordinates and intact surrounding viewport with labelled omissions. These local fixtures use synthetic content and separate ephemeral ports; no live consumer session was navigated or restarted.

Initial independent reviewer `/root/morpheus_web_pin_fix/web_pin_review` blocked commit `168fadc80bf4258cd513bafda70dfa3057373a4c` on two substantive findings: PIN-001, a v2 draft suppressed other route-local legacy drafts; PIN-002, the first descendant entity made page identity change when an unrelated card was filtered. The reviewer opened all four capture images and reproduced both defects independently in Chromium. Real clock measurement: 2026-10-25 03:51:42 UTC through 03:54:41 UTC, 179030 ms from the clock calls around launch and completion. The author corrected migration to merge on route entry, durably record each admitted index before source cleanup, retain overflow/source data on count/byte/write failure, and avoid replay after deletion/Send. View identity now uses the root's entity attributes and heading, never an arbitrary list-card descendant. Regression coverage includes empty/nonempty v2, second-route navigation, cleanup failure, 30-pin and 256-KiB overflow, failed metadata persistence, and unrelated filtered/reordered cards. Both findings await the same reviewer's focused follow-up; no conditional clearance was claimed.

Correction validation: `pnpm compile`, `pnpm typecheck`, `pnpm lint`, the same 80 focused Vitest tests and `pnpm morpheus pm index` pass. The expanded complete Chromium/WebKit overlay suite passes all 22 tests (`--output=/tmp/morpheus-pin-review-fixed-final-results`). The legacy overflow scenarios also pass with final screenshots at `/tmp/morpheus-pin-evidence/web-legacy-overflow-{chromium,webkit}.png`; author opened them and re-opened the four context/media captures before handing the correction to the reviewer.

The independent reviewer found two substantive defects in legacy draft migration and page identity. Both were fixed and verified in the same reviewer's follow-up, which cleared commit 6bc1f5fe748032079ecfdfb56a6f081727efb38f. Final validation passed 80 focused tests and 22 Chromium/WebKit overlay cases; all six final captures were inspected. Documented DOM-rendering and media-omission limitations remain.

```morpheus-review
{
  "version": 2,
  "base": "8fb23695d5b50ea4429bb133c85ab710b608fc79",
  "reviewed": "168fadc80bf4258cd513bafda70dfa3057373a4c",
  "covered": "6bc1f5fe748032079ecfdfb56a6f081727efb38f",
  "authorSession": "01a17121-d469-73a1-b304-3d770aabf560",
  "reviewerSession": "/root/morpheus_web_pin_fix/web_pin_review",
  "risk": "normal",
  "elapsedMinutes": 2.983833333333333,
  "timing": {
    "source": "clock",
    "durationMs": 179030,
    "evidence": "Clock/Date.now around initial reviewer invocation: 2026-10-25T03:51:42.896Z to 2026-10-25T03:54:41.926Z (1792900302896 to 1792900481926), runner-issued /root/morpheus_web_pin_fix/web_pin_review."
  },
  "outcome": "complete",
  "summary": "The independent reviewer found two substantive defects in legacy draft migration and page identity. Both were fixed and verified in the same reviewer's follow-up, which cleared commit 6bc1f5fe748032079ecfdfb56a6f081727efb38f. Final validation passed 80 focused tests and 22 Chromium/WebKit overlay cases; all six final captures were inspected. Documented DOM-rendering and media-omission limitations remain.",
  "findings": [
    {
      "id": "PIN-001",
      "severity": "substantive",
      "description": "Any v2 payload suppressed per-route legacy drafts, including empty v2 state after Send, and later route visits never imported them.",
      "paths": [
        "src/qa/web/overlay-client.ts",
        "tests/browser/qa-web-context.spec.ts",
        "docs/runbooks/qa-comments.md"
      ],
      "disposition": "fixed",
      "response": "Commit 6bc1f5f merges route drafts on attach/navigation, persists each admitted pin and consumed-index guard before cleanup, retains source overflow and failed writes, and prevents replay after Send/deletion. Count, byte, cleanup and metadata-write regressions pass in Chromium/WebKit; same reviewer independently reran the four new Chromium regressions and cleared."
    },
    {
      "id": "PIN-002",
      "severity": "substantive",
      "description": "Page identity depended on the first descendant entity, so filtering an unrelated card hid a still-valid marker on another card.",
      "paths": [
        "src/qa/web/overlay-client.ts",
        "tests/browser/qa-web-context.spec.ts",
        "docs/runbooks/qa-comments.md"
      ],
      "disposition": "fixed",
      "response": "Commit 6bc1f5f restricts view identity to root attributes and heading, excluding arbitrary card descendants. Bob's marker survives Alice removal/reordering, while existing different-artist dialog tests still hide mismatched markers. Same-reviewer follow-up verified and cleared."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/morpheus_web_pin_fix/web_pin_review",
      "commit": "6bc1f5fe748032079ecfdfb56a6f081727efb38f",
      "outcome": "cleared",
      "elapsedMinutes": 1.0371166666666667,
      "timing": {
        "source": "clock",
        "durationMs": 62227,
        "evidence": "Clock/Date.now around same-reviewer follow-up: 2026-10-25T03:58:45.969Z to 2026-10-25T03:59:48.196Z (1792900725969 to 1792900788196), same runner-issued reviewer task."
      },
      "summary": "PIN-001 and PIN-002 resolved; four added Chromium regressions independently passed. Reviewer inspected all six final captures, verified generated output and clean diff, and reported no new findings in the focused follow-up."
    }
  ]
}
```
