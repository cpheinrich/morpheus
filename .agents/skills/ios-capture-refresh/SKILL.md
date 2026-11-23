---
name: ios-capture-refresh
description: Refresh private iOS app navigation and product research captures after frontend changes or for a published App Store build. Use for synthetic route replay, study export, and capture provenance, not app distribution.
---

# Refresh iOS app captures

Use the app repository's capture workflow, route definitions, and tests. Keep project-specific
commands, fixture data, release records, and captures in the authorized private project. Do not
set up credentials, distribution, or a new capture service.

## Choose the evidence source

- **Frontend candidate:** Build and run the project revision in its simulator capture workflow.
  Record the revision, observed version and build, simulator model and OS, and capture time.
  Label the study as simulator candidate evidence even if its version matches a published release.
- **Verified App Store install:** Use an authorized device with the app installed from the App
  Store. Obtain the published version **and build** from project-provided release evidence and
  match the app identity and both values against the installed binary before recording a verified
  study. Record the install source, observed version and build, device and OS, capture time, and
  private release evidence reference. A public listing, source tag, CI build, or TestFlight install
  alone does not prove the App Store install. If provenance or either value is missing or the
  values disagree, report the gap and leave the verified study unchanged.

Keep the two evidence types in separate studies; never promote a simulator study to release
evidence or fill gaps in a release study with simulator captures.

## Replay and validate

1. Start from the project's documented clean fixture state. Replay the affected routes with
   synthetic accounts and data using supported app controls. Record entry state, actions,
   transitions, and resulting states; capture screenshots and accessibility output from the same
   states. Omit views or exports that expose real data and record protected, unreachable, or
   unobserved states as gaps rather than inventing results.
2. When the frontend changes, update the project's navigation definitions, capture routes, and
   capture tests together. Preserve stable screen, control, and transition IDs for unchanged
   semantics; add or retire IDs when their meaning changes and update dependent references. Rerun
   the affected replay tests and check that they still reach the expected states.
3. Use the existing exporter to create a new private schema v1 study directory. In `study.json`,
   keep the app version and evidence status accurate, reference the stable IDs, and inventory every
   asset by safe relative path, content type, byte count, and SHA-256 of its final bytes. Keep only
   listed assets alongside the manifest.
4. Run `morpheus product-research validate <study-directory>`. Fix any schema, reference, path,
   inventory, size, or hash failure before handing off. This verifies the study files, not release
   provenance. Report the private study ID, evidence type, exact version/build, route coverage and
   gaps, and validation result. Keep captures private; this workflow does not authorize upload or
   publication.
