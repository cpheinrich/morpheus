---
name: comment-qa
description: Find submitted iOS and live web QA feedback in Firestore, or run interactive comment QA for a local website or simulator. Use for QA comments, submitted snapshots, and starting, checking, or stopping a QA preview.
---

# Comment QA

For feedback that was already submitted, check Firestore first. Use the submitting website's
Firebase project for live web feedback and the reporting build's Firebase project for in-app
iOS feedback. Run `morpheus qa guide` for the lookup steps and read any batch-level Notes first.

## Local preview and overlay inbox

Use the local queue directly when the person identifies a desktop preview overlay. If the
submission source is unclear, check Firestore first and look in the local inbox when a local
send is plausible. For lookup only, use `morpheus qa comments pending` and
`morpheus qa comments show <batchId>` from the checkout that hosted the overlay.

Run `morpheus qa guide` for the local workflow. The guide ships with the CLI, so its instructions
match the commands you run. Read any batch-level Notes before handling individual comments.

The short form:

**One branch until the person ends the session.** Commit each batch's changes locally on the
one claimed branch for this QA session. Do not push, open a PR, start independent review or run
CI per batch: even a draft PR push starts CI. Ship the changes together only when the person
says the session is done. Tell them before rebuilding or relaunching the preview, or reloading
or navigating their overlay tab.

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
