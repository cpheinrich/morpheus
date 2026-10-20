---
roadmap: MO-26-10-19-22.11.49
---

# Google account selectors on approved evidence URLs

Evo PR558's eighteen final screenshots use immutable public Google Storage objects,
each with the email account selector required by the settled Google-link policy.
The visual-evidence checker rejected every query, including that selector. Three
new acceptance cases, including the actual screenshot URL, reproduced the failure
before the implementation change.

The existing approved-prefix matcher now permits exactly one email-valued
`authuser` only for `storage.googleapis.com`. HTTPS, exact origin and path prefix,
strict descendant paths, credentials and fragment checks remain. Other providers
remain query-free. Signed URLs, extra query keys, duplicate/empty/numeric/malformed
selectors and sibling buckets remain rejected. The approved prefix schema and
consumer configuration are unchanged. Reused native URL parsing and the existing
Zod email validator; no new generic module or dependency was necessary.

Graph evidence: Tier 2, project `Users-chrisheinrich-code-morpheus`, generation
`2026-10-20T04:22:01Z`. The exact matcher snippet and both-direction trace identify
`evidenceUrls` as the caller. Coverage metadata matched source/check/init files
with no recorded gaps; the gh-manager evidence test's line145 parse gap was read
directly. Task-worktree changes were inspected through source and Git diffs.

Validation:

- `pnpm exec vitest run tests/check.test.ts -t "accepts one email account selector"`
  failed all three new cases before the source correction.
- `pnpm exec vitest run tests/check.test.ts tests/init.test.ts tests/gh-manager-evidence.test.ts`:
  216 passed. This covers the checker, scaffold defaults and evidence publication dependents.
- Four deliberate mutants were killed: permit all queries (14 failing cases),
  permit any provider (1), permit duplicates (4), and skip email validation (5).
  Restored the exact source, regenerated JavaScript and reran the focused tests.
- `pnpm typecheck`, `pnpm compile`, `pnpm morpheus pm index` and
  `git diff --check` passed.
- The compiled checker accepted all 18 actual URLs in the caller's
  `/tmp/evo-ui-final-evidence/evidence.json` under its unchanged approved bucket prefix.

No UI or native behavior changed. The URL acceptance probe does not claim image
content review, live CI acceptance or a TestFlight delivery. CI owns the full
repository suite; it was not rerun locally. Independent review is pending.
