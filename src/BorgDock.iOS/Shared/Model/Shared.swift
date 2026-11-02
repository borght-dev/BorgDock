import Foundation

/// The state of one CI check, as GitHub reports it after BorgDock normalises it (shared/src/api.ts `CheckState`).
enum CheckState: String, Codable, Sendable, CaseIterable {
    case success, failure, pending, neutral, skipped
}

/// Identifiers shared by the app and its extensions.
enum AppGroup {
    /// From Info.plist (`BorgDockAppGroup`), so the app and every extension agree with the entitlements.
    static let identifier: String = Bundle.main.object(forInfoDictionaryKey: "BorgDockAppGroup") as? String ?? "group.dev.borght.borgdock"

    static var containerURL: URL? {
        FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: identifier)
    }

    static var defaults: UserDefaults {
        UserDefaults(suiteName: identifier) ?? .standard
    }
}
