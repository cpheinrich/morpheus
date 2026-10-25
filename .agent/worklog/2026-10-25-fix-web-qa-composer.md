---
roadmap: MO-26-10-25-01.45.19
agent: codex
---

# Web QA saves and placement captures

Chris requested a separate background fix while continuing the Paperclip document QA.
Enter now clears the composer, scope, selection and placement details only after a successful
local save. The saved row remains editable. Failed captures keep a row warning and detailed
error on reselect; HTML evidence stays sendable. Send snapshots submitted text/scope before
waiting for image encoding and removes only unchanged acknowledged versions, preserving
newer edits and drafts. A late capture no longer overwrites a newer save/queue acknowledgment.

The blank Markdown image was an actual capture defect. Offscreen clipped diagram containers
were removed from the frozen layout, shifting later visible text above the original scroll
translation. Keep their layout boxes while still omitting their offscreen children. The
existing modern-screenshot dependency, original placement freeze, 120 ms work limit,
4,000-node/2 MiB HTML bounds and JPEG limits remain in force. No new generic module or
package was introduced; this is a correction within the existing domain-specific snapshot.

## Investigation and lessons

The original author was blocked on access. A stopped-author handoff preserved the task, and
this replacement session verified actual unrestricted filesystem/network access through a
create/read/delete probe, an own-process query and HTTPS, without an approval request.
A conflicting stop relay caused a further handoff; the coordinating parent subsequently
verified runtime permissions and explicitly continued this sole author. This is recovery
of this session, not evidence that the desktop app's permission inheritance bug is fixed.

The initial small Markdown fixture did not reproduce blank pixels. A read-only copy of the
real overview plus its Mermaid bundle reproduced a genuinely white scrolled JPEG in both
Chromium and WebKit despite successful capture metadata. The smaller regression needed a
fully offscreen clipped block and an additional document gap. Reintroducing the old pruning
line then failed with white [255,255,255] pixels instead of [22,96,143]; the final fix passes.
Early pending-Send tests also exposed capture completion replacing the Queued status; the
status guard fixes that race. No active preview, document, queued comment or user tab was changed.

Graph verification initially found WEB_OVERLAY_JS and startWebQaServer with complete result
pagination. Coverage generation 2026-10-25T08:08:28Z recorded no gaps for overlay-client.ts,
server.ts and the two browser test files. The embedded script still requires direct source
inspection. Exact-checkout bootstrap succeeded, but the loaded graph transport later closed;
subsequent inspection used exact source fallback rather than asserting fresh graph coverage.

## Validation

- pnpm typecheck — passed.
- pnpm exec vitest run tests/qa-web.test.ts tests/qa-web-lifecycle.test.ts tests/qa-web-readiness.test.ts
  — 65 tests across three files passed. This covers the affected server/lifecycle/readiness boundaries.
- QA_EVIDENCE_DIR="$PWD/local/qa-evidence/fixed" pnpm exec playwright test tests/browser/qa-web-context.spec.ts tests/browser/qa-comments.spec.ts --workers=1
  — all 38 Chromium/WebKit cases passed; persisted Playwright last-run status is passed with no failures.
  Includes save/reselect, storage/POST/image failure, edits during encoding and POST, actual JPEG
  pixel assertions, immutable captures, legacy drafts, capture bounds, styling/media and iOS transport.
- pnpm exec tsx local/markdown-capture-repro.ts chromium fixed and the equivalent webkit fixed
  — both read-only overview copies captured visible scrolled document text. The author inspected
  final JPEG pixels and composer screenshots; original blank JPEGs are retained as comparison.
- pnpm compile; pnpm morpheus pm index; pnpm exec eslint src/qa/web/overlay-client.ts; git diff --check
  — passed. Generated dist JS/map are included; indexes were unchanged.

Visual evidence is ignored local data, not committed binaries: local/qa-evidence/fixed contains
web-composer-before/after-{chromium,webkit}.png and web-markdown-{0,1}-{chromium,webkit}.jpg.
local/markdown-{chromium,webkit}-1.jpg are the original blank reproductions;
local/markdown-{chromium,webkit}-fixed-1.jpg and .png show repaired actual overview captures.
The protected live QA remains on its existing build; adopting this code there requires a later
coordinated preview restart, outside this background fix. Snapshot rendering still has its
existing bounded fidelity and explicit omission/error behavior.

## Independent review

The independent reviewer cleared the normal-risk change with no substantive findings and one minor warning-contrast finding. The author switched that warning to the inherited theme foreground, recompiled, passed the two affected Chromium/WebKit cases and inspected the final failure-state screenshots. The reviewer independently passed 12 focused browser cases and inspected the supplied before/after pixels. No follow-up turn was required for the minor correction; live preview adoption remains outside this background fix.

```morpheus-review
{
  "version": 2,
  "base": "454cf6498f0d39aa78b05aa1a3af714ea2d154d2",
  "reviewed": "9f7abd94274f13e041501ca0a0486c3bd92cfda3",
  "covered": "971619d1179d4f8482041ccf457268e06a3e673b",
  "authorSession": "01a1723e-f222-7d53-a285-9d330383990f",
  "reviewerSession": "/root/qa_composer_review",
  "risk": "normal",
  "elapsedMinutes": 3.0431,
  "timing": {
    "source": "clock",
    "durationMs": 182586,
    "evidence": "Actual author clock around /root/qa_composer_review initial invocation: start 2026-10-25T09:09:12.643Z, final response received and completion observed 2026-10-25T09:12:15.229Z. Includes reviewer tool execution and waits."
  },
  "outcome": "complete",
  "summary": "The independent reviewer cleared the normal-risk change with no substantive findings and one minor warning-contrast finding. The author switched that warning to the inherited theme foreground, recompiled, passed the two affected Chromium/WebKit cases and inspected the final failure-state screenshots. The reviewer independently passed 12 focused browser cases and inspected the supplied before/after pixels. No follow-up turn was required for the minor correction; live preview adoption remains outside this background fix.",
  "findings": [
    {
      "id": "QA-01",
      "severity": "minor",
      "description": "The new saved-row image warning hard-coded red at 11px, making it difficult to read against the inherited blue/dark panel.",
      "paths": [
        "src/qa/web/overlay-client.ts",
        "dist/qa/web/overlay-client.js",
        "dist/qa/web/overlay-client.js.map"
      ],
      "disposition": "fixed",
      "response": "Changed only the warning color to var(--qa-fg), keeping the explicit warning text. Regenerated dist; the sourcemap was unchanged. Both focused image-failure browser cases passed after the correction. Recaptured and opened final Chromium/WebKit save and reselect screenshots using the reviewer's isolated harness. The reviewer explicitly accepted this minor correction without another turn."
    }
  ]
}
```
