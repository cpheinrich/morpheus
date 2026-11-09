---
date: 2026-11-09
roadmap: MO-26-11-09-15.32.39
tags: [engineering]
---

# Keep an unstructured Claude result out of live status

Issue #613 showed a resumed worker still running after an unstructured provider result, while the fallback made it appear to need input. The fallback is now private until the worker exits. A later structured report wins. Otherwise exit yields a failure diagnostic. Existing structured reports, actual control requests and exit handling retain their paths.

The Manager regression verifies the public state, question and result before exit, then checks terminal status with and without a later report. All 12 focused Manager and Claude tests passed, as did the Factory source check, root typecheck, compile, PM index and enforced complexity.
