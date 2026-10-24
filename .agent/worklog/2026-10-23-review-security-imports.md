# Review attested Security import candidates

Chris approved a Morpheus-only review service using the existing Manager App and Claude token.
The normal Manager bot-lane skip and protected-path self-review restrictions remain intact. The
new reviewer receives contents read; its separate deterministic apply job receives issues write
to comment and label, but no contents write or merge route. Security's reconciler retains merge
authority and requires its own exact-head candidate attestation, the Manager App comment, holds,
required checks and branch protection.

The first CI proposal added a prerequisite proof job and `labeled` event to the global CI
workflow. Automatic approval review rejected that action because it could block unrelated PRs;
the rejected edit did not execute. The implementation instead uses the existing review-metadata
workflow's `labeled` event and leaves ordinary CI untouched. The reused PR checker
accepts its proof input only in Morpheus, while the isolated proof job checks both App identities,
head, repository opt-in and changed-file scope.

Focused tests: `pnpm exec vitest run tests/security-import-review.test.ts tests/check.test.ts
tests/cli-check.test.ts tests/workflows.test.ts` — 295 passed. After independent review findings,
`pnpm exec vitest run tests/security-import-review.test.ts tests/workflows.test.ts tests/check-pr.test.ts`
passed 167 tests. The first re-run found two old workflow assertions that expected only one metadata
job and the old exact condition; both were updated for the new proof prerequisite and explicit
`always()` that keeps unrelated metadata checks running. `pnpm compile` and
`pnpm morpheus pm index` passed. `pnpm typecheck` fails only on the existing main-branch import
`gray-matter` in `tests/agentic-cto-skill.test.ts`; the separately reviewed #461 repairs it but
is still an unmerged draft awaiting authorization. Full suite and independent review await a
green base and complete draft packet. Independent review of head `49b48a52` blocked clearance:
forbidden first path components could pass; the model checkout could differ from the live attested
head; the extra conventions workflow duplicated the required status; and a transient hold never
retried. The current repair checks each path segment, rejects a stale reviewer checkout, uses the
existing metadata workflow, and allows one bounded same-head hold retry. Re-review is pending.

The second review found that an unrestricted model shell could run candidate code with the
long-lived Claude token in its environment. The review step now uses pinned Claude CLI restricted
and safe modes with only Read, Glob and Grep tools; it has no GitHub token, no Bash, no MCP, and
does not write the decision itself. A deterministic step captures the exact-head diff, verified
test-merge check results, and official OSV/npm provenance in a dedicated credential-free packet
directory before the model receives its token; it extracts strict JSON afterward. A missing,
pending, failing or stale prerequisite check prevents the model review from starting. The model never
executes target tests; CI owns that proof. Focused tests (295), syntax check, and diff check passed
after this fix. The reviewer also identified plural/related credential and trading path names;
both Security and Manager validators now exclude those path forms and test them.

The final reviewer response conditionally cleared head `3b78af48` if the packet directory,
verified test-merge parent and check gate, and OSV/npm evidence were implemented within the
named workflow/script/test/runbook files. The focused security review/workflow tests passed 168
cases after these changes; `node --check scripts/security-import-review.mjs` and `git diff --check`
passed. A direct npm registry request for the scoped `@11ty/gray-matter@3.0.0` endpoint returned
the exact package/version and a distribution integrity value. No live private caller was run.

## Independent review record

The high-risk independent review found protected-path, exact-head checkout, duplicate-check, hold-retry and reviewer-credential flaws. The same reviewer cleared the fixes conditionally; the final packet and test-merge guards satisfy its named paths and focused evidence. Typecheck and full CI remain pending the separate #461 repair.

```morpheus-review
{
  "version": 2,
  "base": "0a4722e7c2f6aa259174e56af7b638dd953e7be5",
  "reviewed": "49b48a524c7f285d723a3e46cb3750f229b5232d",
  "covered": "9c11df5f76e37bb2b0fac730a71e7429b54f13aa",
  "authorSession": "01a16b36-9afe-71b4-978b-43ac2a11400a",
  "reviewerSession": "/root/security_review_only_pr465",
  "risk": "high",
  "elapsedMinutes": 2.5040833333333334,
  "timing": {
    "source": "runner",
    "durationMs": 150245,
    "evidence": "Codex read_thread reviewer thread 01a16b78-aab8-7275-b9da-5b99ffda2018, initial turn 01a16b78-adce-72b0-b45a-c11866721030: startedAt 2026-10-24T01:13:54Z, completedAt 01:16:24Z, durationMs 150245."
  },
  "outcome": "complete",
  "summary": "The high-risk independent review found protected-path, exact-head checkout, duplicate-check, hold-retry and reviewer-credential flaws. The same reviewer cleared the fixes conditionally; the final packet and test-merge guards satisfy its named paths and focused evidence. Typecheck and full CI remain pending the separate #461 repair.",
  "findings": [
    {
      "id": "SI-1",
      "severity": "substantive",
      "description": "The first path component of credential, auth and trading source files could pass the candidate path exclusion.",
      "paths": [
        "scripts/security-import-review.mjs",
        "tests/security-import-review.test.ts"
      ],
      "disposition": "fixed",
      "response": "Reject all reserved path families on every component, including plural and related names; tests exercise the forbidden boundaries and an ordinary source path."
    },
    {
      "id": "SI-2",
      "severity": "substantive",
      "description": "The model checkout could differ from the live attested PR head, allowing a review of one commit to clear another.",
      "paths": [
        "scripts/security-import-review.mjs",
        ".github/workflows/security-import-review.yml"
      ],
      "disposition": "fixed",
      "response": "Require checked-out HEAD to equal the attested live candidate head before preparing the model prompt; apply rechecks head and decision."
    },
    {
      "id": "SI-3",
      "severity": "substantive",
      "description": "A separate conventions workflow produced a duplicate required check context that could conflict with branch protection.",
      "paths": [
        ".github/workflows/review-metadata.yml",
        ".github/workflows/security-import-pr-check.yml",
        "tests/workflows.test.ts"
      ],
      "disposition": "fixed",
      "response": "Remove the duplicate workflow and use the existing review-metadata labeled event with a narrow proof prerequisite and always() preserving ordinary PR checks."
    },
    {
      "id": "SI-4",
      "severity": "substantive",
      "description": "A transient review hold permanently suppressed another same-head attempt.",
      "paths": [
        "scripts/security-import-review.mjs",
        "tests/security-import-review.test.ts"
      ],
      "disposition": "fixed",
      "response": "Allow one bounded same-head hold retry; findings still require a new candidate head."
    },
    {
      "id": "SI-5",
      "severity": "substantive",
      "description": "The unrestricted reviewer shell could execute candidate code with the long-lived Claude token, and a broad temp directory could expose token-bearing scratch files.",
      "paths": [
        ".github/workflows/security-import-review.yml",
        "scripts/security-import-review.mjs"
      ],
      "disposition": "fixed",
      "response": "Use restricted safe-mode read-only tools, omit GH_TOKEN, disable shell/write/MCP/permission bypass, and expose only a dedicated credential-free packet directory.",
      "condition": {
        "paths": [
          ".github/workflows/security-import-review.yml",
          "scripts/security-import-review.mjs",
          "tests/security-import-review.test.ts",
          "tests/workflows.test.ts",
          "docs/runbooks/gh-manager.md"
        ],
        "evidence": "The reviewer required a credential-free packet directory and verified test-merge parents and current CI, with missing/pending/failing checks refused, plus OSV/npm provenance. Run focused security-review/workflow tests, script syntax check and git diff check."
      },
      "conditionMet": "Commit 9c11df5 changed only the five reviewer-named paths plus this worklog after 3b78af48. The restricted model has Read/Glob/Grep only, no GH_TOKEN, Bash, Write, MCP or permission bypass, and --add-dir names only the dedicated credential-free packet directory. The Security App receipt stays on candidate head; node/pm checks come from a test merge whose parents must match live base/head, and absent/pending/failing/stale checks block model launch. Official OSV and exact npm-version evidence is fetched before the model step. Focused tests passed 168/168, including wrong/stale parents and missing/pending/failing/valid checks; node --check scripts/security-import-review.mjs and git diff --check passed. The official npm version endpoint returned @11ty/gray-matter 3.0.0 with integrity. No live caller was run."
    },
    {
      "id": "SI-6",
      "severity": "substantive",
      "description": "A head-only or prematurely captured CI packet could either miss pull-request test-merge checks or permanently record findings while CI was pending; the read-only reviewer also needed advisory and registry provenance.",
      "paths": [
        ".github/workflows/security-import-review.yml",
        "scripts/security-import-review.mjs",
        "tests/security-import-review.test.ts"
      ],
      "disposition": "fixed",
      "response": "Verify the test merge has current base/head parents, require its node and PM checks to succeed before review, and supply official OSV/npm evidence before model launch.",
      "condition": {
        "paths": [
          ".github/workflows/security-import-review.yml",
          "scripts/security-import-review.mjs",
          "tests/security-import-review.test.ts",
          "tests/workflows.test.ts",
          "docs/runbooks/gh-manager.md"
        ],
        "evidence": "The reviewer required a credential-free packet directory and verified test-merge parents and current CI, with missing/pending/failing checks refused, plus OSV/npm provenance. Run focused security-review/workflow tests, script syntax check and git diff check."
      },
      "conditionMet": "Commit 9c11df5 changed only the five reviewer-named paths plus this worklog after 3b78af48. The restricted model has Read/Glob/Grep only, no GH_TOKEN, Bash, Write, MCP or permission bypass, and --add-dir names only the dedicated credential-free packet directory. The Security App receipt stays on candidate head; node/pm checks come from a test merge whose parents must match live base/head, and absent/pending/failing/stale checks block model launch. Official OSV and exact npm-version evidence is fetched before the model step. Focused tests passed 168/168, including wrong/stale parents and missing/pending/failing/valid checks; node --check scripts/security-import-review.mjs and git diff --check passed. The official npm version endpoint returned @11ty/gray-matter 3.0.0 with integrity. No live caller was run."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/security_review_only_pr465",
      "commit": "91a01507d99172c35f70402bfcab729c4ef802a5",
      "outcome": "blocked",
      "elapsedMinutes": 2.3916833333333334,
      "timing": {
        "source": "runner",
        "durationMs": 143501,
        "evidence": "Codex read_thread reviewer thread 01a16b78-aab8-7275-b9da-5b99ffda2018, follow-up turn 01a16b81-f1b2-7659-bf3f-c16528272e66: startedAt 2026-10-24T01:24:00Z, completedAt 01:26:24Z, durationMs 143501."
      },
      "summary": "SI-1 through SI-4 were resolved; the reviewer found the new substantive SI-5 credential exposure in the unrestricted model step."
    },
    {
      "reviewerSession": "/root/security_review_only_pr465",
      "commit": "3b78af485dcc68073d07f5e706fe1bf5449d0bed",
      "outcome": "cleared",
      "elapsedMinutes": 2.4439166666666665,
      "timing": {
        "source": "runner",
        "durationMs": 146635,
        "evidence": "Codex read_thread reviewer thread 01a16b78-aab8-7275-b9da-5b99ffda2018, final follow-up turn 01a16b85-27a2-7253-9304-87d464079b7c: startedAt 2026-10-24T01:27:31Z, completedAt 01:29:57Z, durationMs 146635."
      },
      "summary": "SI-1 through SI-5 were resolved. The reviewer conditionally cleared packet isolation, current test-merge prerequisite checks and official provenance within five named paths; the author satisfied those conditions at covered commit 9c11df5."
    }
  ]
}
```
