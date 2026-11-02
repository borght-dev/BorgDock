import SwiftUI

/// The sections of My work, in the order Koen reads them.
enum OverviewSection: String, CaseIterable, Identifiable {
    case waiting, drift, working, next, idle, paused, unlinked, handed

    var id: String { rawValue }

    var title: String {
        switch self {
        case .waiting: "Waiting on you"
        case .drift: "Out of sync"
        case .working: "Agents working"
        case .next: "Up next"
        case .idle: "Not started"
        case .paused: "Paused"
        case .unlinked: "Threads without a work item"
        case .handed: "Handed off"
        }
    }

    var shortTitle: String { self == .unlinked ? "Unlinked threads" : title }

    var hint: String {
        switch self {
        case .waiting: "An agent asked something, proposed a plan or finished its turn."
        case .drift: "ADO and the agent disagree. Nothing changes in ADO until you confirm."
        case .working: "Running now. Nothing to do."
        case .next: "You queued these. No agent yet."
        case .idle: "Assigned to you. No agent has touched them."
        case .paused: "An agent worked on these. Nothing is running now."
        case .unlinked: "Open T3 threads that no ADO item knows about."
        case .handed: "Code Review, QA or later. Someone else has the next move."
        }
    }

    var bay: Bay? { Bay(rawValue: rawValue) }

    var lamp: Color { bay?.lamp ?? Palette.Signal.idle }

    /// How many strips show before "Show N more"; nil shows all.
    var visibleLimit: Int? {
        switch self {
        case .idle: 5
        default: nil
        }
    }

    var startsCollapsed: Bool { self == .handed }
}

struct OverviewSummary: Equatable {
    let waiting: Int
    let drift: Int
    let running: Int

    init(_ overview: Overview) {
        waiting = overview.items.filter { $0.bay == .waiting }.count
        drift = overview.items.filter { $0.bay == .drift }.count
        running = overview.items.filter { $0.bay == .working }.count
    }
}

extension ItemOverview {
    /// The thread the strip talks about: the one that needs Koen, else the newest.
    var currentThread: ThreadSummary? {
        threads.first { $0.status.needsYouLabel != nil } ?? threads.first
    }

    var openThread: ThreadSummary? {
        threads.first { $0.status.isOpen }
    }
}

enum OverviewSorting {
    static func items(in bay: Bay, of overview: Overview) -> [ItemOverview] {
        let items = overview.items.filter { $0.bay == bay }
        switch bay {
        case .waiting, .working, .paused:
            return items.sorted { lastActivity($0) > lastActivity($1) }
        case .drift:
            return items.sorted { a, b in
                let (aMoves, bMoves) = (a.suggestion?.to != nil, b.suggestion?.to != nil)
                return aMoves != bMoves ? aMoves : rank(a) < rank(b)
            }
        case .next:
            return items.sorted { ($0.queuedAt ?? "") < ($1.queuedAt ?? "") }
        case .idle, .handed:
            return items.sorted { rank($0) < rank($1) }
        }
    }

    private static func lastActivity(_ entry: ItemOverview) -> String {
        entry.currentThread?.lastActivityAt ?? ""
    }

    /// Priority first (unset last), then the earliest due date, then the newest item.
    private static func rank(_ entry: ItemOverview) -> (Int, String, Int) {
        (entry.item.priority ?? 99, entry.item.dueDate ?? "9999", -entry.item.id)
    }
}
