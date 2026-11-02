import Foundation

/// GET /api/widgets (shared/src/borgdock.ts `WidgetSnapshot`): what the widgets show. The app writes it to the
/// App Group; the widget extension only reads it.
struct WidgetSnapshot: Codable, Hashable, Sendable {
    struct FocusRow: Codable, Hashable, Sendable, Identifiable {
        /// `owner/repo#number`.
        let key: String
        let number: Int
        let title: String
        let segments: [CheckState]
        /// "2 h", "40m", "1 d".
        let age: String

        var id: String { key }
    }

    struct Focus: Codable, Hashable, Sendable {
        let needYou: Int
        let ready: Int
        let waiting: Int
        let top: [FocusRow]
    }

    struct Agents: Codable, Hashable, Sendable {
        let waitingOnYou: Int
        let running: Int
    }

    enum MasterState: String, Codable, Hashable, Sendable {
        case ok, failing, unknown

        init(from decoder: Decoder) throws {
            self = MasterState(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .unknown
        }
    }

    struct Master: Codable, Hashable, Sendable {
        let state: MasterState
        let repo: String?
        let job: String?
        let since: String?
        let prsHit: Int
        let claimedBy: String?

        var sinceDate: Date? { since.flatMap(ISODates.parse) }
    }

    let generatedAt: String
    let focus: Focus
    let agents: Agents
    let master: Master

    var generatedDate: Date? { ISODates.parse(generatedAt) }

    /// What the widget gallery and a fresh install show before the app has read the server.
    static let placeholder = WidgetSnapshot(
        generatedAt: ISODates.format(.now),
        focus: Focus(needYou: 3, ready: 2, waiting: 5, top: [
            FocusRow(key: "shop/shop#3712", number: 3712, title: "Checkout: keep the basket on a payment timeout", segments: [.success, .success, .failure, .failure], age: "2 h"),
            FocusRow(key: "borght-dev/BorgDock#108", number: 108, title: "Activity: one summary per burst", segments: [.success, .success, .success, .success], age: "40m"),
            FocusRow(key: "shop/orders#2291", number: 2291, title: "Orders: fix VAT rounding on refunds", segments: [.success, .success, .success, .pending], age: "1 d"),
        ]),
        agents: Agents(waitingOnYou: 2, running: 4),
        master: Master(state: .failing, repo: "shop/shop", job: "e2e / checkout", since: ISODates.format(.now.addingTimeInterval(-24 * 60)), prsHit: 3, claimedBy: "Lars Janssen")
    )
}

/// The snapshot as a file in the App Group container, so the app and the widget extension read the same bytes.
struct WidgetSnapshotStore: Sendable {
    let fileURL: URL?

    static let fileName = "widget-snapshot.json"

    init(directory: URL? = AppGroup.containerURL) {
        fileURL = directory?.appendingPathComponent(Self.fileName)
    }

    func load() -> WidgetSnapshot? {
        guard let fileURL, let data = try? Data(contentsOf: fileURL) else { return nil }
        return try? JSONDecoder().decode(WidgetSnapshot.self, from: data)
    }

    /// Returns false when the snapshot didn't change, so callers can skip reloading timelines.
    @discardableResult
    func save(_ snapshot: WidgetSnapshot) throws -> Bool {
        guard let fileURL else { throw CocoaError(.fileNoSuchFile) }
        if load() == snapshot { return false }
        let data = try JSONEncoder().encode(snapshot)
        try data.write(to: fileURL, options: .atomic)
        return true
    }
}

/// The server's ISO 8601 times, with and without fractional seconds.
enum ISODates {
    static func parse(_ text: String) -> Date? {
        let fractional = Date.ISO8601FormatStyle(includingFractionalSeconds: true)
        if let date = try? fractional.parse(text) { return date }
        return try? Date.ISO8601FormatStyle().parse(text)
    }

    static func format(_ date: Date) -> String {
        date.formatted(Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}

/// `borgdock://` links the extensions open. The app's `Router.handle` reads them.
enum BorgDockLink {
    /// `owner/repo#12` → borgdock://pr/owner/repo/12.
    static func pullRequest(key: String) -> URL? {
        let parts = key.split(separator: "#", maxSplits: 1)
        guard parts.count == 2, Int(parts[1]) != nil else { return nil }
        let names = parts[0].split(separator: "/", maxSplits: 1)
        guard names.count == 2 else { return nil }
        return URL(string: "borgdock://pr/\(escape(names[0]))/\(escape(names[1]))/\(parts[1])")
    }

    static func item(_ id: Int) -> URL { URL(string: "borgdock://item/\(id)")! }
    static func thread(_ id: String) -> URL { URL(string: "borgdock://thread/\(escape(id))")! }
    static func tab(_ name: String) -> URL { URL(string: "borgdock://tab/\(name)")! }
    static func workstream(_ id: String) -> URL { URL(string: "borgdock://workstream/\(escape(id))")! }
    static let capture = URL(string: "borgdock://capture")!

    private static func escape(_ part: some StringProtocol) -> String {
        String(part).addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? String(part)
    }
}
