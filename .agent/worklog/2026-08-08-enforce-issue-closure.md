---
date: 2026-08-08
roadmap: MO-26-08-08-21.30.49
outcome: shipped
---

# Make issue closure an enforced claim

The issue audit found two completed issues still open. GitHub had not failed: the merged pull
requests never told it those issues were complete. The missing layer was intent Morpheus could
enforce before merge.

Closing every issue number a roadmap item mentions would be worse than the stale list. An item can
cite an earlier failure, a related follow-up, or a partial dependency without resolving it. The
frontmatter now carries `issues:` only for work the item promises to finish. `check pr` requires a
native closing keyword for each declared number, leaving GitHub to perform the close on merge.

`--issue` is singular because one issue per item is the ordinary path. The stored field is plural
because consolidation is legitimate and the check must prove every promised issue closes, not just
the first. Invalid values are refused before the item is written.

The important negative test is a mention: `Related to #70. Closes #700.` must not satisfy issue 70.
Without it, a boundary bug would make the new enforcement look green in precisely the state it was
created to catch.

Independent review caught three gaps before merge. The template's HTML guidance counted as Test
plan content and its literal `None.` pre-satisfied Open questions; section validation now ignores
comments and the template leaves both sections genuinely empty. Closing syntax inside inline or
fenced code also counted as intent, while `_Resolves #70_` was rejected because regex treats an
underscore as a word character. The matcher now strips code and uses an alphanumeric boundary.

The same review pointed out that creation-only linking did not help pre-existing board work. That
was especially relevant to this audit, where most issues already map to roadmap items. `pm
link-issue <ID> <number>` now performs a targeted, idempotent frontmatter update under the same
context-freshness gate, and the generated roadmap exposes the issue column so closure intent is
reviewable before the PR check reads it.
