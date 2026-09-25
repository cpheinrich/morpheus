# Morpheus Security dependency remediation

<p align="center">
  <img src="../assets/morpheus-security-badge.png" width="180" alt="Morpheus Security badge">
</p>

Morpheus Security is a deterministic GitHub-native pipeline. It needs no Codex heartbeat, local
host, OpenAI key, or other model. Its public source, policy, and reusable workflow live in
[`cpheinrich/morpheus-security`](https://github.com/cpheinrich/morpheus-security). A managed
repository calls an exact reviewed commit nightly and may dispatch it manually.

## Policy summary

- **Advisories:** act on every active, non-withdrawn OSV finding and every open GitHub Dependabot
  alert; deduplicate aliases rather than treating the feeds as competing authorities.
- **Change shape:** one dependency per pull request and at most one open bot PR per lockfile.
- **Proof:** require official-registry provenance, retained integrity metadata, a dependency-only
  diff, and a clean candidate OSV rescan for the exact package/advisory pair.
- **Merge:** attest the exact validated head, then merge on a later run only after every explicitly
  configured check passes. A failing check or explicit project hold leaves the PR open.
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

The public-but-unlisted `morpheus-security` GitHub App uses one-hour installation tokens. It has
metadata read, statuses read, checks/contents/pull requests/issues write, and Dependabot alerts
read. It has no administration, Actions, secrets, workflow, organization, account, OAuth, or
webhook permission. The caller stores the App id and private key as encrypted repository secrets.
The maintainers install their App only on repositories they control. Outside operators use the
public source with an App and private key they register and retain themselves.

The App's canonical identity is [`morpheus-security-badge.png`](../assets/morpheus-security-badge.png).
The registered homepage points to the standalone repository. Public registration permits explicit
installation across the maintainers' personal and organization accounts; it is not a hosted
service and is not listed in GitHub Marketplace.

GitHub scopes a private App registration to its owning account. Repository administration in a
different organization is not enough to install it there: a multi-account rollout needs either one
private registration per account or a single public-but-unlisted registration that each account
installs on explicitly selected repositories. Treat that as an ownership decision, not a setup
shortcut.

### Exact repository permissions

| Permission | Access |
|---|---|
| Metadata | Read |
| Checks | Read and write |
| Commit statuses | Read |
| Dependabot alerts | Read |
| Contents | Read and write |
| Issues | Read and write |
| Pull requests | Read and write |

No organization or account permissions are granted. OAuth user authorization, Device Flow, and
webhooks remain disabled.

## Pull-request and merge policy

One dependency is one pull request. At most one bot PR is open for a lockfile at a time, so two
updates cannot race the same lock graph; independent lockfiles may progress concurrently. The
creation run writes an App-owned Check Run attestation for the exact validated head and never
merges. A later run validates that attestation and every configured check before atomically merging
only that head. If strict protection makes a candidate stale, the bot closes it, refreshes and
verifies the live default branch, and recreates the update with all evidence rerun.

The exact App login, marker, branch namespace, and dependency-only diff receive a narrow
independent-review and roadmap-authoring waiver. It does not waive branch protection. A failed
configured check or project hold leaves the PR open. Human-authored PRs never receive the waiver.

Projects may put explicit holds in `.github/morpheus-security.json`:

```json
{
  "version": 1,
  "holds": [
    { "dependency": "example", "advisory": "GHSA-example", "reason": "incompatible runtime" }
  ],
  "requiredChecks": ["test"],
  "incidentRepository": null
}
```

The default has no holds. A hold is visible policy, not model judgment. Unsupported package-manager
remediation or an advisory with no safe fixed version fails the run and preserves the evidence; it
does not dismiss or ignore the advisory.

## Package-manager adapters

Detection is cross-ecosystem because OSV scans repository lockfiles. Delivery uses small native
adapters for npm `package-lock.json`, pnpm `pnpm-lock.yaml`, and Python `uv.lock`. npm and pnpm
scripts are disabled, their subprocess environment contains no App token or registry credentials,
and changed pnpm integrity must match live npmjs release metadata. uv builds are disabled and
changed artifacts must be hashed PyPI releases. Unsupported lockfiles fail closed.

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
2. Install the `morpheus-security` App on only the adopting repository and same-owner private
   incident repository, when configured. Outside operators register their own App.
3. Add `MORPHEUS_SECURITY_APP_ID` and `MORPHEUS_SECURITY_PRIVATE_KEY` as encrypted repository
   secrets. The private key is never committed and is removed from the provisioning machine after
   the secret is verified.
4. Add `.github/morpheus-security.json` with `version: 1`, explicit holds, exact `requiredChecks`,
   and a private `incidentRepository` when a public repository cannot safely hold malware detail.
5. Add a repository-owned nightly/manual caller. Pin both the reusable workflow reference and its
   `security-sha` input to the same reviewed standalone commit:

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
       uses: cpheinrich/morpheus-security/.github/workflows/security-remediation.yml@<reviewed-sha>
       with:
         security-sha: <reviewed-sha>
         config-file: .github/morpheus-security.json
       secrets:
         app_id: ${{ secrets.MORPHEUS_SECURITY_APP_ID }}
         app_private_key: ${{ secrets.MORPHEUS_SECURITY_PRIVATE_KEY }}
   ```

6. Dispatch once manually. After each dependency PR's required checks pass, dispatch again to merge
   it. Continue until the main-branch receipt is clean and the corresponding GitHub alert closes.
7. Only then disable Dependabot automatic security-fix PRs. Keep Dependabot alerts enabled because
   they are one of this pipeline's advisory inputs.

If a previous bot PR is still open for a lockfile, reconciliation waits on it unless its base is
stale or conflicted; then it is closed and recreated from verified current state. A project-policy
hold is durable: the run reports it and leaves the existing PR untouched until policy changes.
