// swift-tools-version: 5.8
import PackageDescription

let package = Package(
    name: "aphex-swift",
    platforms: [
        .macOS(.v12)
    ],
    products: [
        .executable(
            name: "aphex-swift",
            targets: ["aphex-swift"])
    ],
    dependencies: [
        .package(url: "https://github.com/apple/swift-argument-parser", from: "1.2.0")
    ],
    targets: [
        .executableTarget(
            name: "aphex-swift",
            dependencies: [
                .product(name: "ArgumentParser", package: "swift-argument-parser")
            ],
            path: "Sources")
    ]
)
