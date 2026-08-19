---
date: 2026-08-18
roadmap: MO-26-08-18-22.59.53
agent: claude
---

# Findings land inline on the diff

Chris asked why the reviewer posts one big block instead of inline comments. The answer was in the
persona, not the code: the action exposes `mcp__github_inline_comment__create_inline_comment` and
the workflow has always allowlisted it, but "How to report" said "post a single review comment"
and called inline "the exception". The model was doing as told.

Rewrote that section: findings go inline, self-contained (each is read alone); the tracking
comment becomes a verdict — `file:line` summary of every finding, plus anything not about a
specific diff line, plus the sentinel.

Three constraints shaped the wording, all discovered by reading the consumers of the old format
before changing it:

1. **`assessReviewDelivery` proves delivery from the tracking comment alone.** Inline comments are
   pull-request review comments — a different API object the delivery job never fetches. A review
   that is *only* inline comments would read as undelivered, so the persona says that explicitly
   and forbids the sentinel in inline comments.
2. **The re-review gate reads `pathsMentioned` from the prior tracking comment.** If findings moved
   inline without the verdict's `file:line` summary, a push answering a finding would stop being
   recognised as one. The summary keeps the gate's input intact.
3. **The inline tool anchors only inside the diff.** A finding about untouched code either fails to
   post or lands on the nearest diff line, where it reads as being about that line — so out-of-diff
   findings stay in the verdict with their `file:line` in prose.

No code change; no test change (nothing pins the persona's prose, verified by grep). The live
test is this PR's own review — the first one assembled from the new persona — which should arrive
as inline comments plus a short verdict, and still pass the delivery job.

Evo's persona carries the same "How to report" section and gets the same rewrite in its own PR.
