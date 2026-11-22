// swift-tools-version: 6.0
import PackageDescription

// The parts of the iPhone apps that need no UIKit, as a package: the models and the code that reads GitHub and Azure
// DevOps straight from the phone (`Direct/`). `swift test` here runs `DirectTests/` on the Mac in seconds, without a
// simulator. The app targets compile the very same files (project.yml); nothing depends on this package.
let package = Package(
    name: "BorgDockCore",
    platforms: [.macOS(.v15), .iOS("26.0")],
    targets: [
        .target(
            name: "BorgDock",
            path: ".",
            exclude: ["BorgDockWidgets", "BorgDockNotificationContent", "BorgDockTests", "BorgDockUITests", "BorgDockReview", "project.yml", "testflight.sh", "ExportOptions.plist", "README.md"],
            sources: [
                "BorgDock/Model/API.swift",
                "BorgDock/Model/Backends.swift",
                "BorgDock/Model/GitHub.swift",
                "BorgDock/Model/Platform.swift",
                "BorgDock/Model/PrKey.swift",
                "BorgDock/Networking/APIError.swift",
                "Shared/Model/Shared.swift",
                "Direct",
            ]
        ),
        .testTarget(name: "DirectTests", dependencies: ["BorgDock"], path: "DirectTests"),
    ]
)
