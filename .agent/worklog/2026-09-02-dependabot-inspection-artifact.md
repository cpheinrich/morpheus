# Dependabot inspection artifact

- The first live Lakina trigger inspected its target successfully and then failed because
  `actions/upload-artifact` excludes dot-prefixed directories by default.
- Enabled `include-hidden-files` only for the exact `.dependabot-maintainer` path and added a
  workflow-contract test.
- No pull request was changed by the failed run; delivery never started.
