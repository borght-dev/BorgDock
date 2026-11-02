import Foundation
#if canImport(ActivityKit)
import ActivityKit
#endif

/// shared/src/borgdock.ts `AgentActivityState`: the server pushes the same JSON as the activity's content state.
struct AgentActivityState: Codable, Hashable, Sendable {
    enum Status: String, Codable, Hashable, Sendable {
        case running, waiting, done, failed

        init(from decoder: Decoder) throws {
            self = Status(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .running
        }
    }

    var step: String
    var stepIndex: Int
    var stepCount: Int
    var status: Status
    /// ISO 8601, as the server sends it; ActivityKit would read a `Date` as seconds since 2001.
    var startedAt: String

    var startDate: Date { ISODates.parse(startedAt) ?? .now }
    var isSettled: Bool { status == .done || status == .failed }

    /// "step 4 of 6"
    var stepLabel: String { stepCount > 0 ? "step \(min(stepIndex, stepCount)) of \(stepCount)" : "" }
}

/// shared/src/borgdock.ts `ChecksActivityState`.
struct ChecksActivityState: Codable, Hashable, Sendable {
    var passed: Int
    var failed: Int
    var pending: Int
    var total: Int

    /// Passed, failed or skipped.
    var finished: Int { max(total - pending, 0) }
    var fraction: Double { total > 0 ? Double(finished) / Double(total) : 0 }
    var tone: Tone { failed > 0 ? .bad : pending > 0 ? .warn : .ok }
}

#if canImport(ActivityKit)
/// An agent's T3 thread while it runs: the compact timer, the expanded step and progress.
struct AgentActivityAttributes: ActivityAttributes {
    typealias ContentState = AgentActivityState

    let threadId: String
    let itemId: Int?
    /// "Refund email sent twice"
    let title: String
    /// "mac-mini"
    let machine: String

    /// "AB#60988 · mac-mini"
    var context: String {
        [itemId.map { "AB#\($0)" }, machine.isEmpty ? nil : machine].compactMap { $0 }.joined(separator: " · ")
    }
}

/// A pull request's checks while they run.
struct ChecksActivityAttributes: ActivityAttributes {
    typealias ContentState = ChecksActivityState

    /// `owner/repo#number`
    let prKey: String
    let number: Int
    let title: String
}
#endif
