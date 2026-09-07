# Dependabot commit-status read access

- The cloud dry run reached REST check-runs successfully but GitHub rejected the combined commit
  status endpoint with `403 Resource not accessible by integration`.
- Added the endpoint's explicit `statuses: read` scope to inspection and delivery only; the
  read-only Codex job remains unchanged.
- Added a workflow contract assertion covering both sources of required-check evidence.
