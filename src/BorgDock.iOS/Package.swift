// swift-tools-version: 6.0
import Foundation
import PackageDescription

// The parts of the iPhone apps that need no UIKit, as a package: the models and the code that reads GitHub and Azure
// DevOps straight from the phone (`Direct/`). `swift test` here runs `DirectTests/` on the Mac in seconds, without a
// simulator. The app targets compile the very same files (project.yml); nothing depends on this package.

let sources = [
    "BorgDock/Model/API.swift",
    "BorgDock/Model/Backends.swift",
    "BorgDock/Model/GitHub.swift",
    "BorgDock/Model/Platform.swift",
    "BorgDock/Model/PrKey.swift",
    "BorgDock/Model/PrSummaryFacts.swift",
    "BorgDock/Features/Ledger/Ledger.swift",
    "BorgDock/Networking/APIError.swift",
    "Shared/Model/Shared.swift",
    "Direct",
]

/// Everything beside the sources: the rest of the apps, the other targets and build output (`-derivedDataPath build`).
/// Left in, SwiftPM warns about every file it has no rule for and trips over the resources in build output.
func everythingBeside(_ sources: [String], in directory: String = "") -> [String] {
    let root = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
    let children = (try? FileManager.default.contentsOfDirectory(atPath: root.appendingPathComponent(directory).path)) ?? []
    return children.sorted().filter { !$0.hasPrefix(".") && $0 != "Package.swift" }.flatMap { child -> [String] in
        let path = directory.isEmpty ? child : "\(directory)/\(child)"
        if sources.contains(path) { return [] }
        return sources.contains { $0.hasPrefix(path + "/") } ? everythingBeside(sources, in: path) : [path]
    }
}

let package = Package(
    name: "BorgDockCore",
    platforms: [.macOS(.v15), .iOS("26.0")],
    targets: [
        .target(name: "BorgDock", path: ".", exclude: everythingBeside(sources), sources: sources),
        .testTarget(name: "DirectTests", dependencies: ["BorgDock"], path: "DirectTests"),
    ]
)
