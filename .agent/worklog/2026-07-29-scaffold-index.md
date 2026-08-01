---
date: 2026-07-29
agent: claude
roadmap: MO-26-07-29-036
outcome: shipped
summary: A scaffolded project failed its own pm index --check; third variant of the same failure.
---

## The bug

`init` wrote product READMEs with bare index markers. The generator writes `_Nothing here yet._`
between them even for an empty artifact, so every freshly scaffolded project was already stale and
failed `pm index --check` on the first push.

## Third variant of one failure

- MO-008: the scaffolded inbox failed `inbox validate`
- MO-032: the scaffolded `node-ci` job failed on a repo with no pnpm lockfile
- MO-036: the scaffolded index failed `pm index --check`

Each time I added a test, and each time the test asserted something narrower than the claim. MO-008's
test says *the files it writes satisfy the validators*. The claim that matters is **the repository it
produces passes the checks its own CI runs**, and those are not the same sentence — the first is
about content, the second includes generated state and workflow wiring.

The new test asserts the second: regenerate each index and require that nothing changes, which is
literally what `--check` does in CI.

## And the mistake that is now three-for-three

I hand-named all three retrofit branches — `cph-001-…`, `hb-001-…`, `lk-001-…` — without creating
the roadmap items, so `check pr` failed on ids that did not exist. AGENTS.md says never to do this,
for exactly this reason, and it has now happened three times.

The rule is not the problem; remembering it at the moment of `git checkout -b` is. Worth considering
whether `pm claim` should be the only documented way to start work, with the manual path removed
from muscle memory entirely.
