import Foundation

/// Which items the Work tab shows: yours (the overview), the team's sprint, the sprint's unassigned items, Up next, or
/// a saved ADO query. Stored as one string, so the tab opens where you left it. Mockup: design/ios-flow, section 07.
enum WorkScope: Hashable {
    case mine, sprint, unassigned, upNext
    case query(id: String, name: String)

    init(stored: String) {
        switch stored {
        case "sprint": self = .sprint
        case "unassigned": self = .unassigned
        case "upNext": self = .upNext
        default:
            let parts = stored.split(separator: "\t", maxSplits: 2, omittingEmptySubsequences: false).map(String.init)
            self = parts.count == 3 && parts[0] == "query" ? .query(id: parts[1], name: parts[2]) : .mine
        }
    }

    var stored: String {
        switch self {
        case .mine: "mine"
        case .sprint: "sprint"
        case .unassigned: "unassigned"
        case .upNext: "upNext"
        case .query(let id, let name): "query\t\(id)\t\(name)"
        }
    }

    /// The pill and the subtitle: "Mine", "Sprint 23", "Unassigned", "Up next", the query's name.
    func title(sprint: String?) -> String {
        switch self {
        case .mine: "Mine"
        case .sprint: sprint.map(SprintName.display) ?? "Sprint"
        case .unassigned: "Unassigned"
        case .upNext: "Up next"
        case .query(_, let name): name
        }
    }

    /// The Show sheet's wording: "Unassigned in Sprint 23".
    func longTitle(sprint: String?) -> String {
        guard self == .unassigned else { return title(sprint: sprint) }
        return sprint.map { "Unassigned in \(SprintName.display($0))" } ?? "Unassigned in the sprint"
    }
}

enum SprintName {
    /// "23" → "Sprint 23". A name that already says Sprint stays as it is.
    static func display(_ name: String) -> String {
        name.lowercased().hasPrefix("sprint") ? name : "Sprint \(name)"
    }

    /// "6 d left" until the sprint's last day, "last day", or nil once it ended or without a finish date.
    static func left(_ sprint: Sprint?, now: Date = .now, calendar: Calendar = .current) -> String? {
        guard let finish = ISODate.parse(sprint?.finishDate) else { return nil }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: now), to: calendar.startOfDay(for: finish)).day ?? 0
        if days < 0 { return nil }
        return days == 0 ? "last day" : "\(days) d left"
    }
}

/// An item on the Work tab: its ADO summary and, when it is one of yours, what the overview knows about it.
struct WorkEntry: Identifiable, Hashable {
    let item: WorkItemSummary
    /// Nil for an item that isn't in your overview: it gets no verdict and no agent.
    let overview: ItemOverview?

    var id: Int { item.id }

    var verdict: Verdict? { overview.map(WalkDisplay.verdict) }
}

/// The items a scope holds, open ones only. Pure, for tests.
enum WorkEntries {
    /// Nil while the scope's source (the overview, the sprint, the query) hasn't loaded yet.
    static func of(_ scope: WorkScope, overview: Overview?, sprint: Sprint?, queryItems: [WorkItemSummary]?) -> [WorkEntry]? {
        let known = Dictionary((overview?.items ?? []).map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first })
        let summaries: [WorkItemSummary]?
        switch scope {
        case .mine:
            return overview.map { $0.items.filter { isOpen($0.item) }.map { WorkEntry(item: $0.item, overview: $0) } }
        case .upNext:
            return overview.map { $0.items.filter { $0.queuedAt != nil && isOpen($0.item) }.map { WorkEntry(item: $0.item, overview: $0) } }
        case .sprint:
            summaries = sprint?.items.map(\.item)
        case .unassigned:
            summaries = sprint?.items.map(\.item).filter { $0.assignedTo == nil }
        case .query:
            summaries = queryItems
        }
        return summaries?.filter(isOpen).map { item in
            let entry = known[item.id]
            return WorkEntry(item: entry?.item ?? item, overview: entry)
        }
    }

    private static func isOpen(_ item: WorkItemSummary) -> Bool {
        item.stateCategory != .completed && item.stateCategory != .removed
    }
}
