# Dependabot REST check evidence

- Cloud dry run `33697557178` failed because `gh pr view --json statusCheckRollup` expands GraphQL
  workflow-run fields that the Actions integration token cannot read.
- Replaced the GraphQL view with pull-request, check-runs, and combined-status REST endpoints.
- Check contexts are collapsed to the latest observation; no checks still means not passing.
- The dry run made no pull-request changes.
