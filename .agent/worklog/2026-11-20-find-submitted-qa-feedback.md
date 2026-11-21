---
date: 2026-11-20
agent: codex
roadmap: MO-26-11-20-16.32.36
tags: [engineering]
---

# Check Firestore first for submitted QA feedback

A submitted live web comment was absent from checkout-local preview queues. The matching batch
was available through an authorized, read-only Firestore query in the Firebase project
of the site that received it.

The shared skill and CLI guide now start with Firestore for submitted live web and in-app iOS
feedback, using the submitting site's or reporting build's Firebase project. They preserve
direct local lookup for an explicitly named desktop overlay. The detailed guide covers bounded
lookup and matching, batch Notes, and reporting what evidence was stored.

Verified 130 focused tests for QA guide and skill parity, scaffolding, and project skill discovery.
Typecheck, compile, the roadmap index, complexity, and both skill frontmatter checks passed.
Read the compiled QA guide to verify both Firestore routes and the local overlay exception.

## Review corrections

Lookup-only requests now use the existing read-only pending and show commands in the checkout
that hosted the overlay. Claim and resolve remain for authorized batch handling. Added a focused
test for Firestore-first intake, the two Firebase project choices and the read-only local route.
The test failed when run against the previous guide, then passed with the corrected guide.
All 131 focused tests passed. Typecheck, compile, roadmap index, complexity and both skill
validators passed again.

## Independent review

The first Factory reviewer found that the local fallback could reserve or resolve a batch during inspection and that the existing tests allowed the Firestore-first guidance to regress. The correction uses read-only local commands and adds a routing regression test that fails on the old guide. A fresh reviewer cleared both fixes on the exact candidate with no new findings. The reviewer verified the committed routing assertions with native Node and inspected the CLI and store. The author ran all 131 focused Vitest checks.

```morpheus-review
{
  "version": 2,
  "base": "c39ea6253931464c5a3521ba4c405eee14fd8e59",
  "reviewed": "3389adff3b4d40cf41a28aaabb310db9f5822435",
  "covered": "b82cf3fdd291c8bdb8cf048f611a22f8096f3337",
  "authorSession": "01a1fb82-04ac-7af0-aa4f-7d383254c3ab",
  "reviewerSession": "01a1fb89-dda6-79c1-8e8c-246633ac2d20",
  "risk": "normal",
  "elapsedMinutes": 4.375866666666667,
  "timing": {
    "source": "runner",
    "durationMs": 262552,
    "evidence": "Factory Fleet run f03d906e-43fe-4501-a9d6-23341d8865c4, admission a2b728bf-f0b9-4dd5-99a3-2d2c7d39c9c5. MacBook Pro, Codex GPT-6.2 Sol Standard via studio-codex, launch and cleanup verified. Private review SHA-256 025a12cee953f55c89c1ba4b33a3b4f0542f6c22525df99a2cf07dde853951cb."
  },
  "outcome": "complete",
  "summary": "The first Factory reviewer found that the local fallback could reserve or resolve a batch during inspection and that the existing tests allowed the Firestore-first guidance to regress. The correction uses read-only local commands and adds a routing regression test that fails on the old guide. A fresh reviewer cleared both fixes on the exact candidate with no new findings. The reviewer verified the committed routing assertions with native Node and inspected the CLI and store. The author ran all 131 focused Vitest checks.",
  "contextRead": [
    "AGENTS.md",
    "docs/runbooks/independent-review.md",
    "docs/runbooks/test-quality.md",
    ".agent/context-core.md",
    ".agent/decisions.md",
    ".agent/learned.md",
    "hq/product/roadmap/MO-26-11-20-16.32.36-find-submitted-qa-feedback.md",
    "docs/runbooks/qa-comments.md",
    "architecture.md",
    ".agent/worklog/2026-10-09-queue-qa-comment-batches.md",
    ".agent/worklog/2026-11-20-add-qa-batch-notes.md",
    "hq/product/roadmap/MO-26-11-20-13.23.42-add-qa-batch-notes.md",
    ".agent/worklog/2026-11-15-ship-web-qa-comments.md",
    "qa/acceptance/production-web-qa.md",
    ".agent/worklog/2026-11-20-find-submitted-qa-feedback.md"
  ],
  "findings": [
    {
      "id": "QA-LOOKUP-01",
      "severity": "substantive",
      "description": "The new lookup instructions send desktop-overlay readers to step 4, which directs them to claim batches in order and resolve them after answering. If an operator asks to inspect one just-submitted local batch while a responder is draining the queue, following that link can reserve an unrelated older batch or move a batch out of pending just for answering the lookup. A claim survives the reader's exit and can stop the intended responder from receiving that batch.",
      "paths": [
        "src/qa/guide.ts",
        "src/qa/store.ts"
      ],
      "disposition": "fixed",
      "response": "Directed lookup-only requests to the existing pending/show commands in the hosting checkout. Explicitly reserved claim/resolve for authorized batch handling. Both skill copies and the CLI guide use the read-only route."
    },
    {
      "id": "QA-LOOKUP-02",
      "severity": "substantive",
      "description": "The focused tests check provider parity and unchanged preview instructions, not the delivered routing contract. The pre-change guide satisfies every existing guide content assertion. Reverting all matching skill copies, their template and the guide together would leave parity green while directing submitted live feedback back to the local overlay.",
      "paths": [
        "tests/qa-preview.test.ts"
      ],
      "disposition": "fixed",
      "response": "Added a routing regression covering Firestore first, both project selections, and the explicit/fallback read-only local routes. The legacy guide failed the new test and the corrected guide passed all 131 focused tests."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "01a1fb90-6bbc-7c41-ab09-0a33a5755ed2",
      "commit": "b82cf3fdd291c8bdb8cf048f611a22f8096f3337",
      "base": "360d540369010f72eb7af46f3b20b3815a1c19fa",
      "scopeReason": "Review the read-only lookup and regression corrections after integrating the latest trusted trunk. The trunk merge introduced no QA path changes.",
      "handoff": {
        "reason": "The first Fleet session was terminal and bound to the original published revision. A fresh session received the exact corrected candidate and both earlier findings.",
        "findings": [
          "QA-LOOKUP-01",
          "QA-LOOKUP-02"
        ]
      },
      "outcome": "cleared",
      "elapsedMinutes": 3.8798166666666667,
      "timing": {
        "source": "runner",
        "durationMs": 232789,
        "evidence": "Factory Fleet run 18a557cb-a03c-4026-a55e-1437ff92ee1c, admission 2e1f058c-7024-4c8e-81a8-259f3e0ea44d. MacBook Pro, Codex GPT-6.2 Sol Standard via studio-codex, launch and cleanup verified. Private review SHA-256 303cac94dcd60dde82198c3eb2b4e398a413673e6214f3c01da90ddc824c6d2d."
      },
      "summary": "Verified that pending/show only list and read the local queue, and that the exact committed guidance checks fail with both earlier versions. The published source, compiled guide, and both skill copies agree. No new findings."
    }
  ]
}
```
