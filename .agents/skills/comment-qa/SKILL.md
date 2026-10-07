---
name: comment-qa
description: Run the app for interactive comment QA — the person pins comments on the running app and you act on them. Today that is the iOS app in a simulator, shown through one QA overlay page that Claude, Codex and Grok all open. Use for "QA the app", "comment QA", "ios-qa", "run the iOS app so I can leave comments", or to check or stop a QA preview.
---

# Comment QA

Run `morpheus qa guide` and follow it. It prints the instructions that ship with the installed
CLI, so they always match the commands you will run.

The short form:

1. `morpheus qa preview ios start` from this checkout builds it, boots a simulator this checkout
   owns, launches the app, and starts the comment overlay. `morpheus qa preview ios help` lists
   this project's launch modes, which it declares in `morpheus.json` under `qa.ios`.
2. Open the `QA overlay` URL it prints — Claude in the Browser pane, Codex in its in-app browser
   panel, Grok or any agent without a panel with `open <url>`. Every agent uses this one page.
3. Watch `morpheus qa comments pending` and act on each batch, then resolve it.
4. `morpheus qa preview ios stop` ends the preview and the overlay together.

If `morpheus qa preview` is unknown, the installed CLI predates it: run `morpheus self update`.
