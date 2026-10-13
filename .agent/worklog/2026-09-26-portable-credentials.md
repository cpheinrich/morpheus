---
roadmap: MO-26-09-26-21.04.19
---
# Portable credentials companions

Lifted the Lakina pilot into shared Morpheus commands and offline scaffolding. Default to one
ignored clone per consuming project, while supporting shared remotes and optional shared physical
checkouts. Metadata is tracked; values remain in the private companion. Setup never replaces
PATH launchers. Sync is explicit, default-branch-only and fast-forward-only. Old origins migrate
only with declared aliases and matching GitHub IDs. No credentials or provider actions used in tests.

Validation: TypeScript check, full Vitest suite, compile and PM index; focused fixtures cover
relative/worktree paths, symlinks, ignore/tracked guards, overrides, private/denied clone behavior,
explicit empty-store provisioning, identity-checked renames, sync, child arguments and injection.
Native Node/Git/Bash orchestration avoids changing legacy shell semantics; dotenv was considered.

Graph MCP was unavailable. The installed graph checker reported no exact-checkout index; the
idempotent repair refused activation because active CBM sessions could not be stopped safely.
Used targeted source reads of CLI dispatch, scaffolding, templates and companion wrappers instead.
Existing unrelated roadmap edits in the primary checkout were preserved. Independent review completed below.

## Independent review

Independent review found CRED-001: a new empty remote lacked origin/HEAD after its initial push, so sync failed immediately after setup --create. The author established the remote default branch and added a create-then-sync regression. The same reviewer cleared the fix after rerunning all 16 focused tests. Review used source fallback because graph tools/index were unavailable; only synthetic credentials were exercised.

```morpheus-review
{
  "version": 1,
  "base": "a82104aab4560eb8e87deda684189472058eb8b8",
  "reviewed": "9122e82c8c92cb4d61032882eda6830d6b5252ea",
  "covered": "cb26bbdea92264909b340b4381f891b2e462fa44",
  "authorSession": "01a0de46-ec21-7443-b9c8-87fd481a7db9",
  "reviewerSession": "/root/portable_credentials_reviewer",
  "risk": "high",
  "elapsedMinutes": 2,
  "outcome": "complete",
  "summary": "Independent review found CRED-001: a new empty remote lacked origin/HEAD after its initial push, so sync failed immediately after setup --create. The author established the remote default branch and added a create-then-sync regression. The same reviewer cleared the fix after rerunning all 16 focused tests. Review used source fallback because graph tools/index were unavailable; only synthetic credentials were exercised.",
  "findings": [
    {
      "id": "CRED-001",
      "severity": "substantive",
      "description": "Newly created companions cannot sync because origin/HEAD is absent after cloning the empty remote.",
      "paths": [
        "src/credentials/index.ts",
        "tests/credentials.test.ts",
        "dist/credentials/index.js",
        "dist/credentials/index.js.map"
      ],
      "disposition": "fixed",
      "response": "Setup now establishes origin/HEAD after the initial push; create-then-sync regression and all 16 focused tests pass. Same reviewer cleared the fix."
    }
  ],
  "followUps": [
    {
      "reviewerSession": "/root/portable_credentials_reviewer",
      "commit": "cb26bbdea92264909b340b4381f891b2e462fa44",
      "outcome": "cleared",
      "elapsedMinutes": 0.3,
      "summary": "CRED-001 fixed; immediate sync and origin/HEAD assertions pass. All 16 focused tests passed; generated code matches. No additional findings."
    }
  ]
}
```
