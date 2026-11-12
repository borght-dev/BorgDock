import Foundation

/// How the Work tab groups items into lanes: per ADO state, per verdict, or per sprint.
enum WorkGrouping: String, CaseIterable, Identifiable {
    case state, verdict, sprint

    var id: String { rawValue }

    var title: String {
        switch self {
        case .state: "State"
        case .verdict: "Verdict"
        case .sprint: "Sprint"
        }
    }
}

/// The order you gave the Work tab's states, kept on the phone as one state per line.
enum LaneOrder {
    static func decode(_ stored: String) -> [String] {
        stored.split(separator: "\n").map(String.init).filter { !$0.isEmpty }
    }

    static func encode(_ states: [String]) -> String {
        states.joined(separator: "\n")
    }

    /// Lanes you placed come first, in your order; the others keep their walk order after them.
    static func apply(_ order: [String], to lanes: [WorkLane]) -> [WorkLane] {
        let position = Dictionary(order.enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
        return lanes.enumerated()
            .sorted { a, b in
                switch (position[a.element.title], position[b.element.title]) {
                case let (x?, y?): x < y
                case (.some, nil): true
                case (nil, .some): false
                case (nil, nil): a.offset < b.offset
                }
            }
            .map(\.element)
    }

    /// The states the order sheet lists: yours first, then the walk's (empty ones too), then any other state with items.
    static func states(saved: [String], overview: Overview?) -> [String] {
        let known = (overview?.walk?.lanes.map(\.state) ?? []) + (overview?.items.map(\.item.state) ?? [])
        var seen = Set<String>()
        return (saved + known).filter { seen.insert($0).inserted }
    }
}
