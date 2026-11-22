---
name: morpheus-swift-packages
description: Change, debug, add or update a shared Morpheus Swift package (such as MorpheusScreenQA) in an app. Use before editing behavior that comes from a Morpheus package product, adding one, or changing its version pin in Package.swift, an Xcode package reference or Package.resolved.
---

# Morpheus Swift packages

Morpheus publishes opt-in Swift package products from the root `Package.swift` of
`https://github.com/cpheinrich/morpheus`. Every product shares the repository's SemVer release
tags, uses Apple frameworks only, and keeps its source and tests under `packages/swift/<Package>/`.
The package is upstream code: a fix belongs in Morpheus, where every app receives it.

## 1. Locate what the app actually uses

1. **Declaration.** Find the requirement: `.package(url: "https://github.com/cpheinrich/morpheus", ...)`
   in a `Package.swift`, or an `XCRemoteSwiftPackageReference` for that URL in an
   `*.xcodeproj/project.pbxproj`. Note the version rule and which products each target links.
2. **Installed version.** Read the `morpheus` pin in the committed `Package.resolved`: its
   `version` and `revision` are what CI builds. A branch or revision pin is not a supported state;
   treat it as a defect to fix.
3. **Upstream at that version.** Read the product's declaration in Morpheus's `Package.swift` and
   its sources and tests under `packages/swift/` at the pinned tag, not at `main`:
   `git clone --depth 1 --branch <tag> https://github.com/cpheinrich/morpheus`, or browse
   `https://github.com/cpheinrich/morpheus/tree/<tag>/packages/swift`. Never read or edit Xcode's
   `SourcePackages` checkout as if it were source.
4. **Newest compatible release.** Before changing anything, list releases with
   `git ls-remote --tags https://github.com/cpheinrich/morpheus` (or
   `gh release list -R cpheinrich/morpheus`) and read the notes between the pin and the newest tag
   the version rule allows. If a newer release already fixes it, the change is a pin update.

## 2. Decide where the change belongs

- **The package already supports it.** Configuration, a public API the app has not used, or the
  app's own integration: change the app. That is an ordinary app change with the app's tests.
- **Shared behavior is wrong or missing.** Change Morpheus, not the app's copy of it:
  - With write access (`gh api repos/cpheinrich/morpheus --jq .permissions.push` prints `true`),
    claim a Morpheus roadmap item in a Morpheus checkout and open the pull request there, with the
    package's tests.
  - Without it, search `https://github.com/cpheinrich/morpheus/issues` for the problem, and file a
    sanitized issue only when none exists: the product, pinned version, expected and actual
    behavior, and a minimal reproduction. Leave out private identifiers, user data, credentials,
    internal URLs and app screenshots.
  - Link the Morpheus issue or pull request from the app's roadmap item. If the app's work cannot
    proceed without it, block that item with `morpheus pm block <ID> --needs "<Morpheus link> released"`.

Never copy, vendor, fork or locally patch package source, add a local path override, or add a
second implementation of the shared behavior in the app. A workaround in one app hides the defect
from every other.

## 3. Update the pin only after a tagged release

Once Morpheus has merged the change and tagged a release that contains it:

1. Raise the requirement to that release in `Package.swift` or the Xcode package reference.
2. Resolve with the app's toolchain (for example `xcodebuild -resolvePackageDependencies`) and
   confirm the `morpheus` pin in `Package.resolved` names that tag's version and revision.
3. Commit the declaration and `Package.resolved` together, run the app's focused tests for the
   affected screens, and resume a blocked app item with `morpheus pm resume <ID>`.

Do not pin an untagged commit or a branch to get a change sooner.
