import Foundation

/// Parses the contract's ISO 8601 timestamps, with or without fractional seconds.
enum ISODate {
    static func parse(_ text: String?) -> Date? {
        guard let text else { return nil }
        if let date = try? Date(text, strategy: .iso8601) { return date }
        return try? Date(text, strategy: Date.ISO8601FormatStyle(includingFractionalSeconds: true))
    }
}

enum RelativeTime {
    /// "just now", "12m ago", "3h ago", "2d ago", matching the web app.
    static func ago(_ iso: String?, now: Date = .now) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let minutes = max(0, now.timeIntervalSince(date) / 60)
        if minutes < 1 { return "just now" }
        if minutes < 60 { return "\(Int(minutes.rounded()))m ago" }
        if minutes < 60 * 24 { return "\(Int((minutes / 60).rounded()))h ago" }
        return "\(Int((minutes / 1440).rounded()))d ago"
    }
}

struct DueDate: Equatable {
    let label: String
    let overdue: Bool

    init?(_ item: WorkItemSummary, now: Date = .now) {
        guard let date = ISODate.parse(item.dueDate) else { return nil }
        label = "Due " + date.formatted(.dateTime.day().month(.abbreviated))
        overdue = date < now
    }
}

extension ItemType {
    /// Short label on strips.
    func label(typeName: String) -> String {
        self == .other ? typeName : rawValue
    }

    /// Sentence-case label on the detail screen.
    func longName(typeName: String) -> String {
        switch self {
        case .bug: "Bug"
        case .pbi: "Product backlog item"
        case .qi: "Quality improvement"
        case .task: "Task"
        case .other: typeName
        }
    }
}

extension WorkItemSummary {
    var typeAndPriority: String {
        let type = self.type.label(typeName: typeName)
        return priority.map { "\(type) P\($0)" } ?? type
    }

    var sprintLabel: String? {
        if sprint.isEmpty { return nil }
        return sprint == "Backlog" ? "Backlog" : "Sprint \(sprint)"
    }
}

extension ThreadStatus {
    /// The red status line on a strip when the agent waits on Koen.
    var needsYouLabel: String? {
        switch self {
        case .question: "Agent asks"
        case .plan: "Plan to review"
        case .approval: "Needs approval"
        case .yourTurn: "Your turn"
        case .failed: "Agent failed"
        case .running, .settled, .unknown: nil
        }
    }

    var sentence: String {
        switch self {
        case .question: "Asked you a question"
        case .plan: "Proposed a plan"
        case .approval: "Needs your approval"
        case .yourTurn: "Finished its turn"
        case .failed: "Stopped with an error"
        case .running: "Running"
        case .settled: "Settled"
        case .unknown: "Status unknown"
        }
    }

    var isOpen: Bool { self != .settled }
}

extension ThreadSummary {
    var needsYouLabel: String? {
        if status == .question, questions.count > 1 { return "Agent asks \(questions.count) things" }
        return status.needsYouLabel
    }
}

enum ModelName {
    /// "claude-opus-5-5" → "Claude Opus 5.5". Other slugs stay as T3 reports them.
    static func display(_ slug: String) -> String {
        let parts = slug.split(separator: "-").map(String.init)
        guard parts.first == "claude", parts.count >= 2 else { return slug }
        let words = parts.dropFirst().prefix { !$0.allSatisfy(\.isNumber) }.map(\.capitalized)
        let version = parts.dropFirst(1 + words.count).prefix { $0.allSatisfy(\.isNumber) }.joined(separator: ".")
        return (["Claude"] + words + (version.isEmpty ? [] : [version])).joined(separator: " ")
    }
}

extension PullRequestState {
    var label: String {
        switch self {
        case .open: "Open"
        case .merged: "Merged"
        case .closed: "Closed"
        case .unknown: "Unknown"
        }
    }
}
