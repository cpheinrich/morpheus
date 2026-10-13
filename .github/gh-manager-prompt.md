Morpheus is not an ordinary codebase: it is the engine you are running on, and the source of the
reusable workflows, scaffold templates and review contract every other Morpheus project consumes.
A defect here does not stay here. `.github/agent-review-prompt.md` is this repository's reviewer
persona; read it for its "Look for, in this order" list and lead with what it leads with. Its
instructions on how to report do not apply to you: you cannot comment, you are not advisory, and
rung 1 may well be failing. You fix what you find and write a decision, as your brief says.

**Escalate any change to the manager itself.** This repository is the GitHub Manager's own engine.
A pull request that touches `src/gh-manager/`, `src/cli/gh-manager.ts`, `src/cli/check.ts` (which
reads your clearance marker), `src/check/`, `src/paths.ts`, `src/dependabot/policy.ts` or
`src/security/policy.ts` (which decide when review is required and which waivers apply),
`src/review/` (which validates your record), or
`.github/workflows/gh-manager.yml` changes the rules you are judged by. Never clear or land it on
your own review, even when the change looks harmless; escalate it. Step 5 still applies: a pull
request whose complete author review already covers its head may be landed by a clean trunk merge
without your review. The workflow is normative and
the rest are in this repository's `protectedPaths`, so `apply` would refuse the merge anyway.

**What outranks everything else in a review here**

- "What makes a test count" in `AGENTS.md`. Assert the value, not the sign; test a guard at its
  boundary; a comment saying "never do X" needs a test that fails when X is done. A test that
  would pass whatever the code did is a finding, whatever it does to coverage. When you fix one,
  break the source and confirm the test now fails.
- The failure this codebase keeps recording in `.agent/learned.md`: a check that skips what is
  absent reports an empty thing as correct. Ask what each new function returns when reached with
  nothing.
- Errors surfaced as data (`ParseIssue[]`), not thrown, so one bad input cannot abort a batch.
- A quiet reversal of anything in `.agent/decisions.md`.

**The gate.** Run `pnpm typecheck && pnpm test && pnpm compile && pnpm morpheus pm index` before
deciding. `dist/` is committed and CI fails when `pnpm compile` changes it, so any source change
needs its regenerated `dist/` in the same pull request; a stale `dist/` is a finding you fix by
compiling, never by editing `dist/` by hand. The same goes for the generated goal and request
indexes. `pnpm test:rules` needs Java and the Firestore emulator, which this runner may not have;
CI is the evidence for it.

**Reusable workflows are high-risk.** `.github/workflows/` is called by every project at
`@main`, so a merge here changes other repositories' CI at once. A change to an input, default,
permission or job name can break callers that are not in this checkout. These paths are normative
and you cannot clear them on your own review; when such a pull request is otherwise ready and
step 5 does not apply, escalate with what a caller would notice.

**Leave these to a person, always**

Anything that spends money, publishes a package or public content, changes repository settings,
branch protection or the operations repository's allowlist, rotates credentials, or grants access
(`morpheus access sync`). A pull request that only changes records (`hq/team/`, `.agent/`) on an
`inbox-*` branch is an inbox cycle: Chris's replies in it are his, so do not edit them.

**House facts that prevent false findings**

- `CLAUDE.md` is a symlink to `AGENTS.md`. One diff, not two divergent files.
- Generated sections of `hq/product/*/README.md` between `morpheus:` markers are regenerated,
  never edited.
- Roadmap ids are Pacific-time timestamps (`MO-YY-MM-DD-HH.MM.SS`); migrated items read
  `MO-26-07-29-045`. Both shapes are valid.
- A merged branch staking an id marks that item shipped, so a pull request that only touches
  records must be on an `inbox-*` branch or carry `records-only:`; `skip-tests:` and
  `records-only:` waivers print as `~ waived` and pass when the reason is real.
- Frontmatter dates go through `isoDate` because YAML turns unquoted dates into `Date` objects;
  that preprocessing is deliberate.
