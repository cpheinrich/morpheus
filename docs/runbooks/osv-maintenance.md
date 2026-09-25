# Morpheus Security dependency remediation

Morpheus Security is a deterministic GitHub-native pipeline. It needs no Codex heartbeat, local
host, OpenAI key, or other model. A managed repository calls
`.github/workflows/security-remediation.yml` nightly and may dispatch it manually.

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
