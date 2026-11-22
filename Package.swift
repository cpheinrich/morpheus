// swift-tools-version: 6.2

// Shared native packages published from Morpheus. SwiftPM reads a dependency's manifest from the
// repository root, so every package lives under this one manifest and every product shares the
// repository's release tags. Each product is opt-in: a consumer links only the products it names.
// Products use Apple frameworks only; a dependency here would reach every consumer's lock.
// While MorpheusScreenQA is the only product, Xcode names the one automatic scheme after the
// package, so the package carries the product's name. See docs/swift-packages.md.

import PackageDescription

let swiftSettings: [SwiftSetting] = [
    .defaultIsolation(MainActor.self),
    .enableUpcomingFeature("MemberImportVisibility"),
    .enableUpcomingFeature("DisableOutwardActorInference"),
    .enableUpcomingFeature("GlobalActorIsolatedTypesUsability"),
    .enableUpcomingFeature("InferIsolatedConformances"),
    .enableUpcomingFeature("InferSendableFromCaptures"),
    .enableUpcomingFeature("NonisolatedNonsendingByDefault"),
]

let package = Package(
    name: "MorpheusScreenQA",
    platforms: [.iOS(.v18)],
    products: [
        .library(name: "MorpheusScreenQA", targets: ["MorpheusScreenQA"]),
    ],
    targets: [
        .target(
            name: "MorpheusScreenQA",
            path: "packages/swift/ScreenQA/Sources/MorpheusScreenQA",
            swiftSettings: swiftSettings
        ),
        .testTarget(
            name: "MorpheusScreenQATests",
            dependencies: ["MorpheusScreenQA"],
            path: "packages/swift/ScreenQA/Tests/MorpheusScreenQATests",
            swiftSettings: swiftSettings
        ),
    ],
    swiftLanguageModes: [.v5]
)
