# Shared Swift packages

Morpheus publishes native code that several apps share as Swift package products. SwiftPM reads a
dependency's manifest only from the repository root, so the root `Package.swift` declares every
product, and all products share this repository's SemVer release tags.

| Product | Source | Tests |
|---|---|---|
| `MorpheusScreenQA` | `packages/swift/ScreenQA/Sources/MorpheusScreenQA` | `packages/swift/ScreenQA/Tests/MorpheusScreenQATests` |

## Package boundary

- **Opt-in products.** An app links only the products it names; adding a product changes no
  existing consumer. Each product is independent, with its own source and tests under
  `packages/swift/<Package>/`.
- **Apple frameworks only.** The manifest declares no package dependencies, so a Morpheus pin
  never adds third-party code to a consumer's `Package.resolved`. A dependency would be an
  architecture decision, recorded before it lands, and CI would then require a committed
  `Package.resolved` beside the manifest.
- **One toolchain contract.** Swift tools 6.2, Swift 5 language mode, iOS 18 minimum, and the same
  `swiftSettings` for every target: main-actor default isolation and the upcoming features listed
  in the manifest.
- **Generic code only.** Package source, tests and fixtures carry no app identifiers, private
  data or credentials; app-specific configuration stays in the app.

## Schemes and adding a product

While `MorpheusScreenQA` is the only product, Xcode generates one automatic scheme named after the
package, so the package is named `MorpheusScreenQA` and that scheme runs its tests. With a second
product, Xcode generates one scheme per product, whose test actions are empty, plus
`<package name>-Package`, which runs every test target. Whoever adds the second product renames
the package, if wanted, and moves the CI caller's `scheme` to the `-Package` scheme in the same
pull request. The package name is display-only: consumers identify the package by its URL
(`morpheus`).

## Continuous integration

`.github/workflows/swift-packages.yml` calls the reusable `ios-ci.yml` with `swift-package: true`
and the repository root as its working directory. The package uses the same Xcode selection,
simulator ownership, locked build-for-testing/test-without-building split, retries and evidence
as an app; xcodebuild opens the manifest instead of a project. It runs Xcode 27.2 on an
iOS 26.5 simulator, on runners carrying the `xcode-27.2` label, and needs no secrets.

The direct Mac lane runs once the repository is private and enrolled on the Mac pool. It covers
pushes to `main` and same-repository pull requests that affect the package or native workflow.
While Morpheus is public, the Mac pool enrolls only the private validation repository for this
lane. A maintainer starts its thin workflow against an exact reviewed Morpheus commit. The
private caller pins this reusable workflow and passes the public repository and source SHA to it,
then the maintainer records the result on the corresponding Morpheus pull request. The Mac
registers its one-job runner in the private caller's repository using its existing on-host login.
Public forks have no route to that runner through their workflow definitions.

## Consuming and changing a package

Apps declare `https://github.com/cpheinrich/morpheus` with a version requirement, in
`Package.swift` or an Xcode package reference, and commit the resulting `Package.resolved`. Pin
release tags only; a branch or revision pin is not supported.

A behavior change that more than one app would share is made here, not in the app: claim a
Morpheus roadmap item and open a pull request, or, without write access, file a sanitized issue and
link it from the app's item. The app updates its pin after a tagged release contains the change.
The `morpheus-swift-packages` skill (`morpheus skills guide morpheus-swift-packages`) is the
step-by-step procedure that agents in every project follow.
