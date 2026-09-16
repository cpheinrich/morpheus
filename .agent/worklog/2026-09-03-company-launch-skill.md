---
date: 2026-09-03
roadmap: MO-26-09-03-02.13.44
agent: codex
---

# Company launch skill

Added a cross-provider skill for the greenfield workflow proven while launching
Morpheus Enterprises: optional domain purchase, Morpheus repository bootstrap,
GCP/Firebase provisioning, Google Auth and allowlist sync, Vercel monorepo setup,
DNS, deployment, and end-to-end acceptance.

The workflow keeps deterministic work in existing Morpheus commands and records
the non-obvious boundaries: inventory before create, Firebase Terms before IAM
debugging, explicit Vercel Root Directory, credentials staying out of project
repositories, and human gates for payments, passwords, MFA, and legal identity.

## Independent review (2026-09-16)

The PR sat unreviewed and conflicting for two weeks after the author-managed review contract
landed, so a fresh session resumed the task, merged current trunk, and ran the review.

Independent normal-risk review of 1532db7e6286cb51e34fb1b7d07e1ff73f25ca1a completed in 3 minutes with one substantive and two minor findings. Step 7 of the skill made a local, .git-stripped CLI deploy the durable production path when Vercel's commit-author check blocks Git-triggered deploys, contradicting the vercel-deploy.yml decision and leaving nothing to trace a release to; the authorization paragraph let an agent infer the employee allowlist; and the skip-tests waiver ignored the existing shipped-skills tests. The author fixed all three in a3ac206 — production goes through the token-based reusable workflow from merged trunk, the allowlist joins the do-not-invent list, and tests pin the skill's guards — and integrated trunk at 3aaa3f5 in 2966abbc3178ad6a3c08eeabc0ad38b01f49925a. The same reviewer's follow-up cleared the fixes and the integration in 1 minute, raising one new minor finding: the fixed step says the scaffolded CI already calls vercel-deploy.yml, but init scaffolds no such caller. That sentence is deferred to a follow-on item rather than edited after clearance, so the record stays exact. Not verified: the skill has not been run against a fresh launch since the edit.

```morpheus-review
{
  "version": 1,
  "base": "5a096dcdd7559aa62c81c8da0241253da68040bd",
  "reviewed": "1532db7e6286cb51e34fb1b7d07e1ff73f25ca1a",
  "covered": "2966abbc3178ad6a3c08eeabc0ad38b01f49925a",
  "authorSession": "7721007e-1b81-586e-8ac8-39c717a85b5f",
  "reviewerSession": "claude-review-209-0402",
  "risk": "normal",
  "elapsedMinutes": 3,
  "outcome": "complete",
  "summary": "Independent normal-risk review of 1532db7e6286cb51e34fb1b7d07e1ff73f25ca1a completed in 3 minutes with one substantive and two minor findings. Step 7 of the skill made a local, .git-stripped CLI deploy the durable production path when Vercel's commit-author check blocks Git-triggered deploys, contradicting the vercel-deploy.yml decision and leaving nothing to trace a release to; the authorization paragraph let an agent infer the employee allowlist; and the skip-tests waiver ignored the existing shipped-skills tests. The author fixed all three in a3ac206 — production goes through the token-based reusable workflow from merged trunk, the allowlist joins the do-not-invent list, and tests pin the skill's guards — and integrated trunk at 3aaa3f5 in 2966abbc3178ad6a3c08eeabc0ad38b01f49925a. The same reviewer's follow-up cleared the fixes and the integration in 1 minute, raising one new minor finding: the fixed step says the scaffolded CI already calls vercel-deploy.yml, but init scaffolds no such caller. That sentence is deferred to a follow-on item rather than edited after clearance, so the record stays exact. Not verified: the skill has not been run against a fresh launch since the edit.",
  "findings": [
    { "id": "LC-F1", "severity": "substantive", "description": "Step 7 made a local CLI deploy from a .git-stripped copy the durable production workflow when Vercel's commit-author membership check blocks Git-triggered deploys, contradicting the vercel-deploy.yml decision and AGENTS.md's reviewed-source release rule.", "paths": [".claude/skills/launch-company/SKILL.md"], "disposition": "fixed", "response": "Production now goes through the token-based reusable vercel-deploy.yml from merged trunk; the author-check block is worked around by wiring it, not by a local deploy; a local vercel deploy is limited to a one-time preview or bootstrap, never --prod and never from a .git-stripped copy (a3ac206)." },
    { "id": "LC-F2", "severity": "minor", "description": "The skip-tests waiver claimed instructions-only, but tests/voice.test.ts already pins shipped skills and launch-company was not in it.", "paths": ["tests/voice.test.ts"], "disposition": "fixed", "response": "launch-company joins the frontmatter loop with four assertions pinning inventory-before-create, the explicit-allowlist rule, Firebase Terms before IAM, vercel-deploy.yml / never --prod / Root Directory, and no credentials in the repository. The waiver is removed from the PR body." },
    { "id": "LC-F3", "severity": "minor", "description": "The authorization paragraph did not list the employee allowlist among things not to invent, so access sync could mint claims for inferred handles.", "paths": [".claude/skills/launch-company/SKILL.md"], "disposition": "fixed", "response": "The paragraph now says the request does not authorize inventing the allowlist and access sync runs only against handles the user explicitly supplied (a3ac206)." },
    { "id": "LC-F4", "severity": "minor", "description": "The fixed step 7 says vercel-deploy.yml is the workflow the scaffolded CI calls on merge to main, but init scaffolds no such caller, so an agent may assume deploys are wired.", "paths": [".claude/skills/launch-company/SKILL.md"], "disposition": "deferred", "response": "Raised in the follow-up after clearance; editing the skill now would change a covered path. Deferred to a follow-on roadmap item that rewords the sentence to 'add a project workflow that calls vercel-deploy.yml on push to main (init does not scaffold it)'." }
  ],
  "followUp": {
    "reviewerSession": "claude-review-209-0402",
    "commit": "2966abbc3178ad6a3c08eeabc0ad38b01f49925a",
    "base": "3aaa3f59bff04820cefd44a56c771cb2cd1439d6",
    "scopeReason": "Trunk advanced to 3aaa3f5 (PRs #246 and #179) after the initial review; strict branch protection requires integration, so the one same-session follow-up covered the F1-F3 fixes and the integration merge together.",
    "outcome": "cleared",
    "elapsedMinutes": 1,
    "summary": "Follow-up cleared 2966abb: F1-F3 fixed as described and matching vercel-deploy.yml and the decisions record; the merge with 3aaa3f5 carries only this PR's five files with the architecture.md section 7.1 bullets both kept; voice tests (38) and typecheck pass. One new minor finding (LC-F4) on the wording of the fixed step."
  }
}
```
