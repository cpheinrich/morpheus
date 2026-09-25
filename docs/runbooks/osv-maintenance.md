# Morpheus Security dependency remediation

<p align="center">
  <img src="../assets/morpheus-security-badge.png" width="180" alt="Morpheus Security badge">
</p>

Morpheus Security is a deterministic GitHub-native pipeline. It needs no Codex heartbeat, local
host, OpenAI key, or other model. A managed repository calls
`.github/workflows/security-remediation.yml` nightly and may dispatch it manually.

## Policy summary

- **Advisories:** act on every active, non-withdrawn OSV finding and every open GitHub Dependabot
  alert; deduplicate aliases rather than treating the feeds as competing authorities.
- **Change shape:** one dependency per pull request and at most one open bot PR per lockfile.
- **Proof:** require official-registry provenance, retained integrity metadata, a dependency-only
  diff, and a clean candidate OSV rescan for the exact package/advisory pair.
- **Merge:** enable auto-merge only after the deterministic gates pass; ordinary protected-branch
  checks remain final authority. A failing check or explicit project hold leaves the PR open.
- **Schedule:** reconcile nightly and allow manual dispatch. A later clean main-branch run, not the
  creation or merge of a PR, is the completion receipt.
- **Separation:** Dependabot alerts remain an advisory input, but Dependabot security-fix PRs are
  disabled after adoption. Routine non-security upgrades remain a separate maintenance lane.
- **Malware:** patch `MAL-*` findings immediately and leave a private incident issue open until a
  human records exposure, credential rotation, and containment.

## Trust boundary

The pipeline combines two advisory inputs:

- every active, non-withdrawn result returned by the pinned OSV Scanner;
- every open GitHub Dependabot alert, used as an independent reviewed-advisory feed.

Aliases are deduplicated by ecosystem, package, and advisory identity. Advisory prose is data,
never an instruction. The candidate must resolve through the package manager's official registry,
retain lockfile integrity hashes, change only recognized dependency manifests/lockfiles, and remove
the exact package/advisory pair on a second OSV scan. A registry-to-git, URL, or local-path source
change fails closed.

The private `morpheus-security` GitHub App uses one-hour installation tokens. It has metadata read,
Actions/checks/statuses read, Dependabot alerts read, and contents/pull requests/issues write. It
has no administration, secrets, workflow, organization, account, OAuth, or webhook permission.
The caller stores the App id and private key as encrypted repository secrets.

The App's canonical identity is [`morpheus-security-badge.png`](../assets/morpheus-security-badge.png).
The registered homepage points to this repository; the App is private and should be installed only
on repositories that have explicitly adopted this policy.

GitHub scopes a private App registration to its owning account. Repository administration in a
different organization is not enough to install it there: a multi-account rollout needs either one
private registration per account or a single public-but-unlisted registration that each account
installs on explicitly selected repositories. Treat that as an ownership decision, not a setup
shortcut.

### Exact repository permissions

| Permission | Access |
|---|---|
| Metadata | Read |
| Actions | Read |
| Checks | Read |
| Commit statuses | Read |
| Dependabot alerts | Read |
| Contents | Read and write |
| Issues | Read and write |
| Pull requests | Read and write |

No organization or account permissions are granted. OAuth user authorization, Device Flow, and
webhooks remain disabled.

## Pull-request and merge policy

One dependency is one pull request. At most one bot PR is open for a lockfile at a time, so two
updates cannot race the same lock graph; independent lockfiles may progress concurrently. A later
nightly run reconciles an existing bot PR before opening new work. Every PR carries the exact
advisories, old/fixed versions, resolver strategy, lockfile, and the marker
`<!-- morpheus-security-update -->`.

The exact App login plus marker plus dependency-only diff receives a narrow independent-review and
roadmap-authoring waiver. It does not waive branch protection. GitHub auto-merge remains blocked
until every repository-required test, policy, and deployment check succeeds. A failed check or
project hold leaves the PR open; the next run does not create a duplicate. Human-authored PRs are
never auto-merged under the bot waiver.

Projects may put explicit holds in `.github/morpheus-security.json`:

```json
{
  "version": 1,
  "holds": [
    { "dependency": "example", "advisory": "GHSA-example", "reason": "incompatible runtime" }
  ],
  "incidentRepository": null
}
```

The default has no holds. A hold is visible policy, not model judgment. Unsupported package-manager
remediation or an advisory with no safe fixed version fails the run and preserves the evidence; it
does not dismiss or ignore the advisory.

## Package-manager adapters

Detection is cross-ecosystem because OSV scans repository lockfiles. Delivery uses small native
adapters. The first production adapters are npm `package-lock.json` and Python `uv.lock`; additional
lockfile adapters can be added without changing advisory trust, PR, or merge policy. npm first asks
the existing dependency graph for a compatible transitive update; only when the parent range cannot
reach the fixed release does it add an exact root override, which CI must prove compatible. It never
substitutes an unrelated parent major update merely because that happens to remove the vulnerable
package.

## Malicious-package incidents

Any `MAL-*` finding is prioritized for remediation and upserts one issue per repository, package,
and MAL advisory. The issue has `security-incident`, `dependency-malware`, `automated`, and
`needs-exposure-review`; the remediation PR says **Related**, never **Closes**. The issue stays open
until a human records installation/execution exposure, credential rotation, and containment. A
private project uses its own issue tracker. A public project must configure a private central
`incidentRepository` or the run fails before publishing sensitive incident detail.

## Operations

Each run retains its before scan, candidate scan, and plan receipt for 30 days. A clean run means
both OSV and the GitHub alert input contained no actionable finding. A successful PR is not final
evidence: after merge, the next nightly/manual main scan must be clean for that package/advisory,
and the GitHub alert must close from the merged graph rather than by manual dismissal.

## Adopt in a repository

1. Enable GitHub Dependabot alerts, but leave automatic security-fix PRs on until the replacement
   has completed its first clean run.
2. Install the private `morpheus-security` App on only the adopting repository.
3. Add `MORPHEUS_SECURITY_APP_ID` and `MORPHEUS_SECURITY_PRIVATE_KEY` as encrypted repository
   secrets. The private key is never committed and is removed from the provisioning machine after
   the secret is verified.
4. Add `.github/morpheus-security.json` with `version: 1`, explicit holds, and a private
   `incidentRepository` when a public repository cannot safely hold malware incident detail.
5. Add a repository-owned nightly/manual caller. Pin both the reusable workflow reference and its
   `morpheus-sha` input to the same reviewed Morpheus commit:

   ```yaml
   name: Security remediation

   on:
     schedule:
       - cron: "43 10 * * *"
     workflow_dispatch:

   permissions:
     contents: read

   jobs:
     remediate:
       uses: cpheinrich/morpheus/.github/workflows/security-remediation.yml@<reviewed-sha>
       with:
         morpheus-sha: <reviewed-sha>
         config-file: .github/morpheus-security.json
       secrets:
         app_id: ${{ secrets.MORPHEUS_SECURITY_APP_ID }}
         app_private_key: ${{ secrets.MORPHEUS_SECURITY_PRIVATE_KEY }}
   ```

6. Dispatch once manually. Follow each dependency PR through required checks and auto-merge, then
   dispatch again until the main-branch receipt is clean and the corresponding GitHub alert closes.
7. Only then disable Dependabot automatic security-fix PRs. Keep Dependabot alerts enabled because
   they are one of this pipeline's advisory inputs.

If a previous bot PR is still open for a lockfile, reconciliation updates or waits on that PR; it
does not open a duplicate. A project-policy hold is also durable: the run reports it and leaves the
existing PR untouched until the versioned policy changes.
