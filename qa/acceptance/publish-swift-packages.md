# Shared Swift packages and iOS CI

- The root SwiftPM manifest exposes Screen QA as an opt-in iOS library. The
  library includes the current screenshot editor, launcher, batch notes, and
  handoff behavior, and reads drafts written before these changes.
- The published package uses Apple frameworks and synthetic tests. Hosts
  provide service configuration and credentials through their own integration.
- The reusable iOS workflow runs the native package tests on a short-lived
  self-hosted Mac VM. Existing Xcode project callers keep their build and
  test contract. Public fork workflows are subject to maintainer approval
  and the package workflow skips forks while using the private runner pool.
- Managed project scaffolding and skill sync expose upstream package
  navigation, app configuration, upstream PRs, and issue filing as applicable.
- A semantic version tag points to the reviewed protected merge. Consumer
  adoption is tracked separately using an explicit dependency and product.
