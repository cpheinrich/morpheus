# Morpheus Security dependency remediation

<p align="center">
  <img src="../assets/morpheus-security-badge.png" width="180" alt="Morpheus Security badge">
</p>

Morpheus Security is a deterministic GitHub-native pipeline. It needs no Codex heartbeat, local
host, OpenAI key, paid service, or other model. Its public source and policy live in
[`cpheinrich/morpheus-security`](https://github.com/cpheinrich/morpheus-security); a separate
private operations repository holds the scheduled caller, credential, logs, and raw receipts.
Installed repositories opt in through a committed policy file; they do not hold the App key or a
repository-owned schedule.

## Policy summary

- **Advisories:** act on every active, non-withdrawn OSV finding and every open GitHub Dependabot
  alert; deduplicate aliases rather than treating the feeds as competing authorities.
- **Change shape:** one dependency per pull request and at most one open bot PR per lockfile.
- **Proof:** require official-registry provenance, retained integrity metadata, a dependency-only
  diff, and a clean candidate OSV rescan for the exact package/advisory pair.
- **Merge:** attest the exact validated head, then merge on a later run only after every explicitly
  configured check passes. A failing check or explicit project hold leaves the PR open.
- **Schedule:** reconcile every six hours and allow manual dispatch. A clean main-branch scan
  after the merge is the completion receipt.
- **Separation:** Dependabot alerts remain an advisory input, but Dependabot security-fix PRs are
  disabled after adoption. Routine non-security upgrades remain a separate maintenance lane.
- **Malware:** patch `MAL-*` findings immediately and leave an issue in the affected repository
  open until a human records safe completion status for exposure assessment, credential rotation,
  containment, and clean remediation.

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
webhook permission. The App id and private key live only as encrypted Actions secrets in the
private operations repository, with an offline recovery copy in the operator's credential vault.
Target repositories never receive the private key. Each run mints one short-lived token scoped to
the affected repository, including its Issues permission for malware incident records.

The App's canonical identity is [`morpheus-security-badge.png`](../assets/morpheus-security-badge.png).
The registered homepage points to the standalone repository. Public registration permits explicit
installation across personal and organization accounts. It is centrally operated by GitHub
Actions and is not listed in GitHub Marketplace.

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

Each pull request updates one dependency in one lockfile. At most one bot PR is open per lockfile.
Separate lockfiles can progress independently when they share an affected dependency and advisory.
The creation run writes an App-owned Check Run attestation for the exact validated head. A later run validates that attestation and every configured check before atomically merging
only that head. If strict protection makes a candidate stale, the bot closes it, refreshes and
verifies the live default branch, and recreates the update with all evidence rerun. The bot
retries an unresolved GitHub merge state within a run and logs the outcome and any blocker in
the private job log and step summary.

The exact App login, marker, and dependency-only diff receive a narrow
independent-review and roadmap-authoring waiver. It does not waive branch protection. A failed
configured check or project hold leaves the PR open. Human-authored PRs never receive the waiver.

To pause a bot PR, commit an explicit hold in `.github/morpheus-security.json`. An attested draft
with merge policy enabled and no applicable hold or outstanding import-only review is marked ready
by the bot. A later run checks CI and GitHub protection before merging.

```json
{
  "version": 1,
  "holds": [
    { "dependency": "example", "advisory": "GHSA-example", "reason": "incompatible runtime" }
  ],
  "requiredChecks": ["test"]
}
```

The default has no holds. Unsupported lockfiles, scoped npm overrides that leave the affected
version installed, and advisories without published fixes stay open in the private run receipt.
The sweep can still try a later candidate.

An optional `importOnlyCompatibility: true` adds a narrower replacement lane after the engine,
review-only Manager workflow and both private caller pins are deployed. Morpheus is the first
eligible repository. The engine's reviewed mapping names one advisory, vulnerable package,
replacement registry package and exact version. A missing mapping leaves the finding open.
The candidate changes only direct dependency manifests, their lockfile, and at most eight source
files with twenty literal import substitutions. Policy, credential, trading and workflow paths,
call-site logic and all other text changes are rejected. For Morpheus,
`compatibilityGeneratedDist: true` permits only deterministic TypeScript output corresponding to
the changed sources; it does not authorize an arbitrary build script or generated directory.

The Security App attests the exact validated candidate head and stops. A distinct Manager App
session reviews it with a read-only target token; its apply job publishes a head-bound comment,
without editing or merging the candidate. The existing review-metadata workflow reruns the
ordinary conventions checker on the review label after verifying both App receipts. Security's later reconciliation requires the
clear review, the current mapping and opt-in, holds, all named successful checks, branch
protection and a head-SHA-guarded merge. Lakina and Evo retain the existing dependency-only
policy unless their maintainers separately opt in. No new App permission or credential transfer
is part of this option.

List in `requiredChecks` only checks that report success for exact bot PRs. Morpheus's
`agent-review / delivery` check is intentionally skipped for that lane: GitHub branch protection
still requires the reported check, while the security bot's success-only gate must omit it.

## Package-manager adapters

Detection is cross-ecosystem because OSV scans repository lockfiles. Delivery uses small native
adapters for npm `package-lock.json`, pnpm `pnpm-lock.yaml`, and Python `uv.lock`. npm and pnpm
scripts are disabled, their subprocess environment contains no App token or registry credentials,
and changed pnpm integrity must match live npmjs release metadata. uv builds are disabled and
changed artifacts must be hashed PyPI releases.

## Malicious-package incidents

Any `MAL-*` finding is prioritized for remediation and upserts one issue per repository, package,
and MAL advisory. The issue has `security-incident`, `dependency-malware`, `automated`, and
`needs-exposure-review`; the remediation PR says **Related**, never **Closes**. The issue stays open
until a human records safe completion status for installation/execution exposure assessment,
credential rotation, containment, and clean remediation. The issue always lives in the affected
repository. In a public repository it lists only the advisory, dependency, affected
manifests/versions, and a completion checklist; credentials and sensitive investigation details
remain in a private system.

## Operations

The private caller starts from the reviewed `config/approved-repositories.json` allowlist, confirms
each exact repository's App installation, and requires a valid `.github/morpheus-security.json` on
the target's live default branch. This keeps an unknown public installation inert. Each run retains
its before scan, candidate scan, and plan receipt privately for 30 days. A clean run means
both OSV and the GitHub alert input contained no actionable finding. After merge, the next
scheduled or manually dispatched main scan must be clean for that package and advisory. GitHub
must close the alert based on the merged dependency graph.

## Adopt in a repository

1. Enable GitHub Dependabot alerts, but leave automatic security-fix PRs on until the replacement
   has completed its first clean run.
2. Install the `morpheus-security` App on only the adopting repository. Installation grants access
   but never reveals the App key.
3. Have a trusted maintainer add the exact `owner/name` to the standalone repository's reviewed
   `config/approved-repositories.json` allowlist.
4. Add `.github/morpheus-security.json` with `version: 1`, explicit holds, and exact
   `requiredChecks`. Malware incident issues are filed in this repository; never place credentials
   or sensitive investigation details in a public issue.
5. Let the central six-hour schedule run, or have a maintainer dispatch it. A later run merges a
   validated PR after its configured checks pass; continue until the main-branch receipt is clean
   and the corresponding GitHub alert closes.
6. Only then disable Dependabot automatic security-fix PRs. Keep Dependabot alerts enabled because
   they are one of this pipeline's advisory inputs.

An operator who does not want the central maintainers to hold installation authority can fork the
standalone repository, register a separate App, and store that App's id and private key once in a
private operations repository of their own.

If a previous bot PR is still open for a lockfile, reconciliation waits on it unless its base is
stale or conflicted; then it is closed and recreated from verified current state. A project-policy
hold is durable: the run reports it and leaves the existing PR untouched until policy changes.
