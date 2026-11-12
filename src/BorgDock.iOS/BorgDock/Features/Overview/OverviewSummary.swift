import Foundation

/// The bays' counts, for older servers that send no walk briefing.
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
    /// The thread the item talks about: the one that needs you, else the newest.
    var currentThread: ThreadSummary? {
        threads.first { $0.status.needsYouLabel != nil } ?? threads.first
    }

    var openThread: ThreadSummary? {
        threads.first { $0.status.isOpen }
    }
}
