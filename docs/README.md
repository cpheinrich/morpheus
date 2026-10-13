# Engineering documentation

Structure per [`architecture.md` §15](../architecture.md): `runbooks/` holds how to do
operational things — the steps a human performs in consoles the CLI cannot reach. The markdown
here is canonical; anything rendered elsewhere is a view.

Keep runbooks about *doing*: decisions and their reasons belong in `architecture.md` and
`.agent/decisions.md`, and a runbook that restates them will drift from both.

## Operational runbooks

- [Morpheus Security dependency remediation](runbooks/osv-maintenance.md) — policy, GitHub App
  permissions, repository adoption, incident handling, and clean-run verification.
- [Independent review](runbooks/independent-review.md) — reviewer dispatch and durable evidence.
- [Consumer authentication](runbooks/consumer-auth.md) — Firebase-backed consumer accounts.
- [Research library](runbooks/research-library.md) — deterministic private publication.
- [iOS simulator cleanup](runbooks/ios-simulator-cleanup.md) — bounded host recovery.
- [QA comment batches](runbooks/qa-comments.md) — local tap→comment→send batches agents can poll.

## Agent procedures

Moved out of `AGENTS.md` on 2026-10-07 so every session stops loading them; `AGENTS.md` keeps the
one-line rule and says when to read each.

- [Project-management workflow](runbooks/pm-workflow.md) — claims, ids, blocking, PR contents, merging.
- [Context freshness](runbooks/context-freshness.md) — gated commands, offline, forks, hooks, receipts.
- [Device bootstrap](runbooks/device-bootstrap.md) — CLI auto-update consent and codebase-memory.
- [What makes a test count](runbooks/test-quality.md) — test quality and mutation testing.
- [The inbox cycle](runbooks/inbox-cycle.md) — writing, answering and archiving inboxes.
- [Building a website](runbooks/website.md) — `web init`, consumer auth, Firebase Google sign-in.
- [Folder documentation](runbooks/folder-readmes.md) — when a folder gets a README.
- [Command reference](runbooks/cli-commands.md) — the full `morpheus` command list.
- [GitHub Manager](runbooks/gh-manager.md) — the scheduled pull-request sweeper.
