import Foundation

/// Where the BorgDock server lives. Stored in UserDefaults; a DEBUG launch argument can override it.
enum ServerSettings {
    /// The build's server (`BORGDOCK_SERVER_URL`, which deploy sets from the server's publicOrigin), else a local one.
    static let defaultURL = (Bundle.main.object(forInfoDictionaryKey: "BorgDockServerURL") as? String).flatMap(normalize)
        ?? URL(string: "http://127.0.0.1:8797")!
    private static let key = "serverURL"

    static func current(defaults: UserDefaults = .standard) -> URL {
        if let override = LaunchOverrides.server { return override }
        return defaults.string(forKey: key).flatMap(normalize) ?? defaultURL
    }

    static func save(_ url: URL, defaults: UserDefaults = .standard) {
        defaults.set(url.absoluteString, forKey: key)
    }

    /// Accepts "host:port" or a full URL; returns an http(s) URL without a trailing slash.
    static func normalize(_ text: String) -> URL? {
        var trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }
        if !trimmed.contains("://") { trimmed = "https://" + trimmed }
        while trimmed.hasSuffix("/") { trimmed.removeLast() }
        guard let url = URL(string: trimmed),
              let scheme = url.scheme?.lowercased(), ["http", "https"].contains(scheme),
              let host = url.host(), !host.isEmpty
        else { return nil }
        return url
    }

    /// "my-mac.tailnet.ts.net:10000" for display.
    static func displayName(_ url: URL) -> String {
        let host = url.host() ?? url.absoluteString
        let port = url.port.map { ":\($0)" } ?? ""
        let scheme = url.scheme == "http" ? "http://" : ""
        return scheme + host + port + url.path()
    }
}

/// Simulator testing without passkeys: `-BorgDockServer <url> -BorgDockToken <token>`.
/// `-BorgDockRoute` opens a screen at launch for screenshots. None of this exists in Release builds.
enum LaunchOverrides {
    #if DEBUG
    static var server: URL? { value(after: "-BorgDockServer").flatMap(ServerSettings.normalize) }
    static var token: String? { value(after: "-BorgDockToken") }
    static var route: String? { value(after: "-BorgDockRoute") }

    private static func value(after flag: String) -> String? {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        let value = arguments[index + 1].trimmingCharacters(in: .whitespacesAndNewlines)
        return value.isEmpty ? nil : value
    }
    #else
    static let server: URL? = nil
    static let token: String? = nil
    static let route: String? = nil
    #endif
}
