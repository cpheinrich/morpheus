---
id: MO-26-07-29-011
title: "Post the staging URL into the PR description automatically"
status: backlog
priority: P1
goal: MO-G-2026-Q3-01
owner: agent
prs: []
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-011` to `MO-26-07-29-011` (MO-057). References to `MO-011` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

The desired review workflow is: every PR carries a link to a staging deploy in its
**description**, not buried in a bot comment. Vercel's GitHub app already comments the
preview URL, but a comment scrolls away and a description does not.

## Approach

A step in `web-ci` (or a small companion workflow) that waits for the Vercel deployment to
reach `READY`, then patches the PR description with the URL under a marked block, the same
splice pattern `pm index` uses for README tables.

Needs a Vercel token in Actions secrets — worth doing as part of MO-012's credential pass.

Interim: the Vercel bot comment carries the URL, and I patch the description by hand.
