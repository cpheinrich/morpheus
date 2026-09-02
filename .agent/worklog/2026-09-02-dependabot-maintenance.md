# Automated Dependabot maintenance

- Opened upstream issue #196 and linked it to MO-26-09-02-16.24.01.
- Added a reusable policy-first Dependabot workflow with read-only Codex triage and a separate
  credential-free delivery job.
- Added exact bot/file-scope handling to `check pr` so machine-generated dependency PRs do not
  need human-authored bodies or roadmap branches.
- Added policy, convention, and workflow-contract tests. A first live read-only inspection found
  that `gh pr view` normalizes the App author and that Lakina prefixes Dependabot titles; the
  implementation now verifies identity from the REST pull-request record and parses both title
  forms.
- Live delivery is exercised from Lakina after both shared and caller workflows merge.
