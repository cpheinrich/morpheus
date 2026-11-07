---
date: 2026-11-07
roadmap: MO-26-11-07-09.06.30
agent: codex
tags: [engineering]
---
# Clear the iOS QA comment composer after Enter

Enter now saves the pin and closes the editor. The saved text stays in the list and can be reopened, edited, and sent. The send and Escape handlers keep their existing save behavior.

The Playwright WebKit regression first failed because the composer still contained “First chart.” After the fix, Chromium and WebKit both passed the original save, edit, reload, and batch submission assertions. The 43 focused Vitest cases, typecheck, generated build, and roadmap index passed. Complexity passed at the enforced CCN limit of 15 across two changed functions. The final compiled overlay was also checked against a live simulator stream with synthetic content, including screenshots before and after pressing Enter.
