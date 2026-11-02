import Foundation

/// The code a BorgDock desktop shows to link to this account: scanned as
/// `borgdock://link-desktop?server=<url>&code=<code>`, or typed. Unlike a machine's pairing code it carries no
/// secret: the desktop gets its session only after this signed-in iPhone approves the code.
struct DesktopLink: Hashable, Sendable {
    /// The server the desktop talks to; nil when the code was typed.
    let server: URL?
    /// "ABCD-EFGH"
    let code: String

    init(server: URL?, code: String) {
        self.server = server
        self.code = code
    }

    init?(url: URL) {
        guard url.scheme == "borgdock", url.host() == "link-desktop",
              let items = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems,
              let code = items.first(where: { $0.name == "code" })?.value.flatMap(Self.normalize)
        else { return nil }
        self.init(server: items.first { $0.name == "server" }?.value.flatMap(ServerSettings.normalize), code: code)
    }

    /// "abcd efgh" → "ABCD-EFGH". The server compares codes without separators.
    init?(typedCode: String) {
        guard let code = Self.normalize(typedCode) else { return nil }
        self.init(server: nil, code: code)
    }

    /// Crockford's reading (O is 0, I and L are 1), grouped in fours. Nil when too short to be a code.
    static func normalize(_ text: String) -> String? {
        let characters = Array(PairingLink.typedCharacters(text))
        guard characters.count >= 6 else { return nil }
        return stride(from: 0, to: characters.count, by: 4)
            .map { String(characters[$0..<min($0 + 4, characters.count)]) }
            .joined(separator: "-")
    }

    /// False when the desktop talks to another server than this iPhone: approving would link it to the wrong account.
    func matches(server current: URL) -> Bool {
        guard let server else { return true }
        return server == ServerSettings.normalize(current.absoluteString)
    }
}
