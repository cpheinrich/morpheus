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
repository suite; it was not rerun locally.

## Independent review

Independent Opus review cleared the Google Storage account-selector fix at 86bb327ca813ca81930922ccbf73f5eb81622596 with no substantive findings. Its 44 focused visual-evidence tests passed. The reviewer noted a nonblocking bare-URL punctuation limitation, deferred to MO-26-10-19-22.17.10; the actual 18 Markdown screenshot links pass under the unchanged approved prefix. No native build, pixel review or TestFlight completion is claimed by this validation.

The reviewer also observed that an empty trailing query separator is ignored by native URL parsing and is harmless; exactly one decoded account-selector entry is still required. Review had no permission denials. The only post-review addition before coverage is the newly filed incidental follow-up item; no code changed.

```morpheus-review
{
  "version": 2,
  "base": "e5b9747512b2df90624bc7cf87878548f84da088",
  "reviewed": "86bb327ca813ca81930922ccbf73f5eb81622596",
  "covered": "15c2e23268722549ac6b2334eaea50e771e909a2",
  "authorSession": "01a15749-6c98-79d1-a8f9-9adf2f14deb9",
  "reviewerSession": "0899197a-dc37-4b08-a23a-fdfdcbc4c609",
  "risk": "high",
  "elapsedMinutes": 1.5312,
  "timing": {
    "source": "runner",
    "durationMs": 91872,
    "evidence": "Native Opus reviewer session 0899197a-dc37-4b08-a23a-fdfdcbc4c609; /tmp/morpheus-evidence-authuser-review-timing.json measured the invocation from 2026-10-20T05:15:04.256810+00:00 through 2026-10-20T05:16:36.129545+00:00 (PID32995, exit0). Raw monotonic measurement 91872.0849579986ms; recorded at integer-millisecond precision required by the schema."
  },
  "outcome": "complete",
  "summary": "Independent Opus review cleared the Google Storage account-selector fix at 86bb327ca813ca81930922ccbf73f5eb81622596 with no substantive findings. Its 44 focused visual-evidence tests passed. The reviewer noted a nonblocking bare-URL punctuation limitation, deferred to MO-26-10-19-22.17.10; the actual 18 Markdown screenshot links pass under the unchanged approved prefix. No native build, pixel review or TestFlight completion is claimed by this validation.",
  "findings": [
    {
      "id": "VE-001",
      "severity": "incidental",
      "description": "At src/check/visual-evidence.ts:149, HTTPS_URL captures immediately trailing prose punctuation as part of a bare URL. A final period after an email account selector then fails email validation. The reviewer explicitly classified this as a nonblocking usability edge; Markdown-linked screenshots are unaffected.",
      "paths": [
        "src/check/visual-evidence.ts"
      ],
      "disposition": "deferred",
      "roadmap": "MO-26-10-19-22.17.10",
      "response": "Preserved existing extraction behavior and the narrow provider/query guards. Filed the dedicated backlog item for intentional punctuation handling without changing legitimate object names or query admission; all 18 actual Markdown image links pass. No implementation was added after the reviewed commit."
    }
  ]
}
```
