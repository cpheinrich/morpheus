# Engineering documentation

Structure per [`architecture.md` §15](../architecture.md): `runbooks/` holds how to do
operational things — the steps a human performs in consoles the CLI cannot reach. The markdown
here is canonical; anything rendered elsewhere is a view.

Keep runbooks about *doing*: decisions and their reasons belong in `architecture.md` and
`.agent/decisions.md`, and a runbook that restates them will drift from both.

## Operational runbooks

- [Morpheus Security dependency remediation](runbooks/osv-maintenance.md) — policy, GitHub App
  permissions, repository adoption, incident handling, and clean-run verification.
- [Independent review](runbooks/independent-review.md) — reviewer dispatch and durable evidence.
- [Consumer authentication](runbooks/consumer-auth.md) — Firebase-backed consumer accounts.
- [Research library](runbooks/research-library.md) — deterministic private publication.
- [iOS simulator cleanup](runbooks/ios-simulator-cleanup.md) — bounded host recovery.
