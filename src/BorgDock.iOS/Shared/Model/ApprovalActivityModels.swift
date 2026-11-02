import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// An approval Quick Review holds back for its Undo window. The app starts and ends this activity itself (no
/// pushes), so the dates stay `Date`s.
struct ApprovalActivityState: Codable, Hashable, Sendable {
    enum Phase: String, Codable, Hashable, Sendable {
        /// Counting down; Undo still takes it back.
        case holding
        /// GitHub has the review.
        case posted
    }

    var phase: Phase
    var startedAt: Date
    /// When the review posts unless it's undone.
    var postsAt: Date

    var window: ClosedRange<Date> { startedAt...max(startedAt, postsAt) }
}

#if canImport(ActivityKit)
/// "✓ Approving #3712 … Undo" in the Dynamic Island while an approval waits out its Undo window.
struct ApprovalActivityAttributes: ActivityAttributes {
    typealias ContentState = ApprovalActivityState

    /// The hold's id, which Undo hands back to the app.
    let holdId: String
    /// `owner/repo#number`
    let prKey: String
    let number: Int
    /// The pull request's title, when the app knows it.
    let title: String?

    /// "Approving #3712"
    var label: String { "Approving #\(number)" }
}
#endif

/// borgdock://approval/<hold id>/undo: what tapping the compact island opens. Interactive buttons only work
/// expanded and on the lock screen; the compact view's tap opens the app with this link instead.
enum ApprovalUndoLink {
    static func url(holdId: String) -> URL {
        URL(string: "borgdock://approval/\(holdId)/undo")!
    }

    /// The hold id from a link `url(holdId:)` made; nil for anything else.
    static func holdId(from url: URL) -> String? {
        let parts = url.pathComponents.filter { $0 != "/" }
        guard url.scheme == "borgdock", url.host() == "approval", parts.count == 2, parts[1] == "undo", !parts[0].isEmpty else { return nil }
        return parts[0]
    }
}
