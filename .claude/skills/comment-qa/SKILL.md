---
name: comment-qa
description: Run the app or website for interactive comment QA — the person pins comments on the running app and you act on them. The iOS app runs in a simulator and the website in its local dev server, both shown through one QA overlay page that Claude, Codex and Grok all open. Use for "QA the app", "QA the site", "comment QA", "web comments", "ios-qa", "run the iOS app so I can leave comments", or to check or stop a QA preview.
---

# Comment QA

Run `morpheus qa guide` and follow it. It prints the instructions that ship with the installed
CLI, so they always match the commands you will run.

The short form:

1. From this checkout: `morpheus qa preview web start` for the website, or
   `morpheus qa preview ios start` for the iOS app. Each starts the comment overlay with it.
   `morpheus qa preview web help` and `morpheus qa preview ios help` show what this project
   declares in `morpheus.json` under `qa.web` and `qa.ios`.
2. Open the `QA overlay` URL it prints — Claude in the Browser pane, Codex in its in-app browser
   panel, Grok or any agent without a panel with `open <url>`. Every agent uses this one page.
3. To keep this chat free, configure `local/qa-comments/responder.json` and run `morpheus qa comments responder start` in a separate process. It serially claims and resolves batches with one agent identity. See `morpheus qa guide` for checkout ownership and session-end steps.
4. `morpheus qa preview web stop` (or `ios stop`) ends the preview and the overlay together.

If `morpheus qa preview` is unknown, or has no `web`, the installed CLI predates it: run
`morpheus self update`.
