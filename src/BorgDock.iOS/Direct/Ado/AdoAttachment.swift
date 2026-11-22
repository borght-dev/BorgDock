import Foundation

/// The attachment an ADO URL points at (an image in rich text, an AttachedFile relation): the server's `adoAttachment`.
/// There is no signing here: without a server the attachment keeps its ADO address, and the app adds the credential
/// when it loads one (`AdoWorkItems.authorization(for:)`).
struct AdoAttachment: Sendable, Equatable {
    /// Lower-cased.
    let guid: String
    /// The `fileName` the URL carries, at most 255 UTF-16 units.
    let name: String?

    private static let addressPattern = AdoPattern(
        #"/_apis/wit/attachments/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\?([^#]*))?"#,
        caseInsensitive: true
    )
    private static let longestName = 255

    /// Nil for anything that isn't an attachment's address.
    init?(url: String) {
        guard let match = Self.addressPattern.firstMatch(in: url), let guid = match[1] else { return nil }
        let name = AdoText.trim(Self.queryValue("fileName", in: match[2] ?? "") ?? "")
        self.guid = guid.lowercased()
        self.name = name.isEmpty ? nil : AdoText.prefix(name, utf16: Self.longestName)
    }

    /// `url` with this file name in its query, unless it names one already: ADO serves an attachment under the name
    /// it is asked for.
    static func address(_ url: String, named name: String) -> String {
        if AdoAttachment(url: url)?.name != nil { return url }
        return url + (url.contains("?") ? "&" : "?") + "fileName=" + AdoText.encodeURIComponent(name)
    }

    /// The first value of `name` in a query, as `URLSearchParams.get` reads it: `+` is a space.
    private static func queryValue(_ name: String, in query: String) -> String? {
        for pair in query.split(separator: "&") {
            let parts = pair.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
            guard let key = parts.first, decoded(key) == name else { continue }
            return parts.count > 1 ? decoded(parts[1]) : ""
        }
        return nil
    }

    private static func decoded(_ text: Substring) -> String {
        let spaced = text.replacingOccurrences(of: "+", with: " ")
        return spaced.removingPercentEncoding ?? spaced
    }
}
