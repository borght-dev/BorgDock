import Foundation

/// How this phone signs in to Azure DevOps. Its encoded form holds the secret: keep it in the Keychain, never in a log
/// or in `UserDefaults`.
enum AdoCredential: Sendable, Equatable {
    /// A personal access token: Basic, with an empty user name.
    case personalAccessToken(String)
    /// An access token from a Microsoft sign-in.
    case bearer(String)

    /// The `Authorization` header's value.
    var authorization: String {
        switch self {
        case .personalAccessToken(let token): "Basic " + Data((":" + token).utf8).base64EncodedString()
        case .bearer(let token): "Bearer " + token
        }
    }
}

extension AdoCredential: Codable {
    private enum CodingKeys: String, CodingKey { case kind, secret }
    private enum Kind: String, Codable { case personalAccessToken, bearer }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        let secret = try container.decode(String.self, forKey: .secret)
        switch try container.decode(Kind.self, forKey: .kind) {
        case .personalAccessToken: self = .personalAccessToken(secret)
        case .bearer: self = .bearer(secret)
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .personalAccessToken(let secret):
            try container.encode(Kind.personalAccessToken, forKey: .kind)
            try container.encode(secret, forKey: .secret)
        case .bearer(let secret):
            try container.encode(Kind.bearer, forKey: .kind)
            try container.encode(secret, forKey: .secret)
        }
    }
}

/// Printing a credential, or a connection that holds one, never shows the secret: not in `print`, a string
/// interpolation, the debugger's description or `dump`.
extension AdoCredential: CustomStringConvertible, CustomDebugStringConvertible, CustomReflectable {
    var description: String {
        switch self {
        case .personalAccessToken: "personal access token (hidden)"
        case .bearer: "bearer token (hidden)"
        }
    }

    var debugDescription: String { description }

    var customMirror: Mirror { Mirror(self, children: [:]) }
}

/// One Azure DevOps organization as one account reads it.
struct AdoConnection: Sendable, Equatable, Codable {
    /// `https://dev.azure.com/acme`
    let organizationURL: URL
    /// The project an item belongs to when it doesn't name its own.
    let project: String
    let credential: AdoCredential

    /// The organization's address without a trailing slash; every API path goes under it.
    var root: String {
        let address = organizationURL.absoluteString
        return address.hasSuffix("/") ? String(address.dropLast()) : address
    }

    private static let guid = AdoPattern(#"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\z"#, caseInsensitive: true)

    /// Whether `url` is an attachment of this organization: `<organization>[/<project>]/_apis/wit/attachments/<guid>` at
    /// the organization's own scheme, host and port. Besides the API's own requests these are the only addresses the
    /// credential may go to, so anything that doesn't have exactly this shape is refused.
    func ownsAttachment(_ url: URL) -> Bool {
        guard let theirs = URLComponents(url: url, resolvingAgainstBaseURL: true),
              let ours = URLComponents(url: organizationURL, resolvingAgainstBaseURL: true),
              let scheme = theirs.scheme?.lowercased(), scheme == ours.scheme?.lowercased(),
              let host = theirs.host?.lowercased(), !host.isEmpty, host == ours.host?.lowercased(),
              Self.port(of: theirs) == Self.port(of: ours),
              theirs.user == nil, theirs.password == nil,
              let organization = Self.segments(of: ours.percentEncodedPath),
              let path = Self.segments(of: theirs.percentEncodedPath)
        else { return false }
        let tail = Array(path.dropFirst(organization.count))
        guard Array(path.prefix(organization.count)) == organization, tail.count == 4 || tail.count == 5 else { return false }
        let attachment = tail.suffix(4)
        return attachment.prefix(3).elementsEqual(["_apis", "wit", "attachments"]) && Self.guid.isFound(in: attachment.last ?? "")
    }

    private static func port(of components: URLComponents) -> Int? {
        components.port ?? ["https": 443, "http": 80][components.scheme?.lowercased() ?? ""]
    }

    /// A path's segments, decoded and lower-cased (ADO's paths ignore case). Nil for a path with `.`, `..`, an empty
    /// segment or an encoded slash in it: such a path can end up somewhere else than it reads.
    private static func segments(of percentEncodedPath: String) -> [String]? {
        var pieces = percentEncodedPath.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
        if pieces.first?.isEmpty == true { pieces.removeFirst() }
        if pieces.last?.isEmpty == true { pieces.removeLast() }
        var segments: [String] = []
        for piece in pieces {
            guard let segment = piece.removingPercentEncoding, !segment.isEmpty, segment != ".", segment != "..",
                  !segment.contains("/"), !segment.contains("\\")
            else { return nil }
            segments.append(segment.lowercased())
        }
        return segments
    }
}
