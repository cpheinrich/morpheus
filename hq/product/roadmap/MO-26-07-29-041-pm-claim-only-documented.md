---
id: MO-26-07-29-041
title: "pm claim is the only documented way to start work"
status: shipped
priority: P2
owner: agent
prs: [34]
created: 2026-07-29
updated: 2026-07-29
---

> Migrated from `MO-041` to `MO-26-07-29-041` (MO-057). References to `MO-041` in git
> history, commit messages and merged pull requests still resolve — the old number is
> the last field of the new id.

## Context

Hand-naming a branch has failed `check pr` three times, always identically: the branch cited an
id whose item did not exist yet.

The rule against it was already written down each time, so a fourth restatement is not the fix.
Two things were actually wrong. The specification still *showed* the old shape — §12.3 step 2 read
"work happens on a branch named `rm-<id>-<slug>`", which is the wrong prefix and, more to the
point, the wrong verb: nobody names it, `pm claim` derives it. And `check pr` reported the
violation without naming the recovery, at the one moment someone is definitely reading.

## Approach

Leave no documented path that starts anywhere but `pm claim`, and name the recovery command in
both `check pr` failures.

Deliberately *not* a new enforcement mechanism. A pre-push hook or a `pm start` shortcut both
change the surface to solve what is a documentation and error-message problem, and
`.agent/decisions.md` already records the stopping rule: name it well enough that a fresh agent
reads it correctly, then document the rest.
