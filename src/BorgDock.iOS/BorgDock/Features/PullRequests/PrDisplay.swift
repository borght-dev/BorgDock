import Foundation

/// The desktop's `services/pr-list/display.ts`: how the list shows its pull requests. One value, so a saved view keeps
/// it whole and Display can tell when it differs from the default. The phone has no layout or table columns; it keeps
/// the desktop's as it read them (`desktopFields`), so a view written on the phone loses none of the desktop's settings.
enum PrGroupBy: String, CaseIterable, Identifiable, Sendable {
    case status, author, repo, review, waiting, workItem, label, base, age, size, none

    var id: String { rawValue }

    var label: String {
        switch self {
        case .status: "Status"
        case .author: "Author"
        case .repo: "Repository"
        case .review: "Review state"
        case .waiting: "Waiting on"
        case .workItem: "Work item"
        case .label: "Label"
        case .base: "Base branch"
        case .age: "Age"
        case .size: "Size"
        case .none: "No grouping"
        }
    }

    var hint: String? {
        switch self {
        case .status: "Your turn, failing, waiting, ready, draft"
        case .review: "Awaiting you, changes requested, approved…"
        case .waiting: "Who acts next: you, the author, reviewers, CI"
        case .workItem: "By the AB# it names"
        case .age: "Opened today, this week, this month, older"
        case .size: "XS to XL by lines changed"
        default: nil
        }
    }
}

enum PrSortBy: String, CaseIterable, Identifiable, Sendable {
    case priority, updated, created, title, size

    var id: String { rawValue }

    var label: String {
        switch self {
        case .priority: "Priority"
        case .updated: "Last updated"
        case .created: "Created"
        case .title: "Title"
        case .size: "Size"
        }
    }

    var hint: String? {
        switch self {
        case .priority: "Your turn first, then ready, failing, waiting"
        case .size: "Lines changed"
        default: nil
        }
    }

    var defaultDir: SortDir { self == .title ? .asc : .desc }

    /// "Newest first", "A to Z", "Largest first", "Most urgent first".
    func directionLabel(_ dir: SortDir) -> String {
        switch self {
        case .title: dir == .asc ? "A to Z" : "Z to A"
        case .priority: dir == .desc ? "Most urgent first" : "Least urgent first"
        case .size: dir == .desc ? "Largest first" : "Smallest first"
        case .updated, .created: dir == .desc ? "Newest first" : "Oldest first"
        }
    }
}

enum SortDir: String, Sendable { case asc, desc }

struct PrDisplay: Equatable, Sendable {
    var groupBy = PrGroupBy.status
    /// Groups inside each group; `.none` for one level.
    var subGroupBy = PrGroupBy.none
    var sortBy = PrSortBy.priority
    var sortDir = SortDir.desc
    /// A "Your turn" group above the groups (tab All; not with Status, Author or no grouping).
    var pinYourTurn = true
    /// Groups with nothing for you start folded.
    var collapseQuiet = false
    /// Fixed groupings (status, review, waiting, age, size) keep their empty groups.
    var showEmptyGroups = false
    /// The desktop's fields the phone doesn't use (layout, columns, and whatever a newer desktop adds), as read.
    var desktopFields: [String: JSONValue] = PrDisplay.desktopDefaults

    /// What the desktop starts a new display with: its table and default columns.
    static let desktopDefaults: [String: JSONValue] = [
        "layout": .string("table"),
        "columns": .array(["checks", "reviews", "next", "size", "updated"].map(JSONValue.string)),
    ]

    static let `default` = PrDisplay()

    /// Pin Your turn applies to this grouping (the desktop's `pinsYourTurn`; the phone is never a board).
    var pinsYourTurn: Bool { pinYourTurn && groupBy != .status && groupBy != .author && groupBy != .none }
}

extension PrDisplay: Codable {
    private static let known: Set<String> = ["groupBy", "subGroupBy", "sortBy", "sortDir", "pinYourTurn", "collapseQuiet", "showEmptyGroups"]

    /// The desktop's `sanitizeDisplay`: a missing or unknown value takes the default.
    init(from decoder: Decoder) throws {
        let object = try decoder.singleValueContainer().decode([String: JSONValue].self)
        let base = PrDisplay()
        func string(_ key: String) -> String? { if case .string(let value)? = object[key] { value } else { nil } }
        func flag(_ key: String, _ fallback: Bool) -> Bool { if case .bool(let value)? = object[key] { value } else { fallback } }
        groupBy = string("groupBy").flatMap(PrGroupBy.init) ?? base.groupBy
        subGroupBy = string("subGroupBy").flatMap(PrGroupBy.init) ?? base.subGroupBy
        sortBy = string("sortBy").flatMap(PrSortBy.init) ?? base.sortBy
        sortDir = string("sortDir").flatMap(SortDir.init) ?? (sortBy == base.sortBy ? base.sortDir : sortBy.defaultDir)
        pinYourTurn = flag("pinYourTurn", base.pinYourTurn)
        collapseQuiet = flag("collapseQuiet", base.collapseQuiet)
        showEmptyGroups = flag("showEmptyGroups", base.showEmptyGroups)
        desktopFields = object.filter { !Self.known.contains($0.key) }
    }

    func encode(to encoder: Encoder) throws {
        var object = desktopFields
        object["groupBy"] = .string(groupBy.rawValue)
        object["subGroupBy"] = .string(subGroupBy.rawValue)
        object["sortBy"] = .string(sortBy.rawValue)
        object["sortDir"] = .string(sortDir.rawValue)
        object["pinYourTurn"] = .bool(pinYourTurn)
        object["collapseQuiet"] = .bool(collapseQuiet)
        object["showEmptyGroups"] = .bool(showEmptyGroups)
        var container = encoder.singleValueContainer()
        try container.encode(object)
    }
}

/// Any JSON value, for fields the phone keeps without reading them.
enum JSONValue: Codable, Hashable, Sendable {
    case null
    case bool(Bool)
    case number(Double)
    case string(String)
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if container.decodeNil() { self = .null }
        else if let value = try? container.decode(Bool.self) { self = .bool(value) }
        else if let value = try? container.decode(Double.self) { self = .number(value) }
        else if let value = try? container.decode(String.self) { self = .string(value) }
        else if let value = try? container.decode([JSONValue].self) { self = .array(value) }
        else { self = .object(try container.decode([String: JSONValue].self)) }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .null: try container.encodeNil()
        case .bool(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .string(let value): try container.encode(value)
        case .array(let value): try container.encode(value)
        case .object(let value): try container.encode(value)
        }
    }
}
