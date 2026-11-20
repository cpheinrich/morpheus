# iOS App Store version reconciliation

This credential-free action gates delivery on the candidate being ahead of the public App Store
listing. See the [nightly workflow contract](../../../architecture.md#18-distribution-three-mechanisms)
for opt-in and exact-source requirements. The check writes its `status`, `current-version`,
`store-version` and `next-version` outputs before failing on `bump-required` or `behind`.
An invalid or unavailable lookup emits no plan. Keep the gate blocking in delivery jobs; use
the read-only CLI directly in the separate caller-owned repair process.

Use Node 22+ and a reviewed Morpheus checkout. Pass exactly one of `--version` (literal) and
`--project-file` (for a project with homogeneous literal marketing settings):

```sh
node "$MORPHEUS/.github/actions/ios-app-store-version/version.mjs" plan \
  --app-id "$APP_ID" --bundle-id "$BUNDLE_ID" --storefront us --project-file "$PROJECT_FILE"
```

`plan` reads Apple's public iTunes Lookup API and emits one JSON line with `status`,
`currentVersion`, `storeVersion`, and `nextVersion`. Two- and three-component decimal versions
compare with an implicit zero patch; leading zeros are rejected. Equality proposes a patch bump
without carry (`1.0` to `1.0.1`). Only pass `--component minor` or `--component major` when explicitly
authorized; those choices reset lower components. `ahead` and `behind` return `nextVersion: null`.
On `behind` hold and reconcile manually; do not use `apply` to skip to an arbitrary store version.

Only for `bump-required`, claim a repair from the verified candidate in the app repository, then
apply the plan's `currentVersion` and `nextVersion` on that branch:

```sh
node "$MORPHEUS/.github/actions/ios-app-store-version/version.mjs" apply \
  --project-file "$PROJECT_FILE" --from-version "$CURRENT_VERSION" --to-version "$NEXT_VERSION"
```

`apply` checks the exact source literal and a strictly forward target; it rejects missing,
mixed marketing, conditional, or indirect assignments. It updates all direct project marketing
assignments and zeroes all direct numeric `CURRENT_PROJECT_VERSION` assignments in one file
replacement. Reapplying the exact completed target with all build settings `0` makes no write.
This does not edit `.xcconfig` files or resolve inherited build settings. Inspect the diff, test
it, obtain fresh independent review, and land a protected PR. Admit the newly verified merged
SHA and run the gate again. Neither command pushes, opens a PR, publishes, or allocates upload
build numbers.
