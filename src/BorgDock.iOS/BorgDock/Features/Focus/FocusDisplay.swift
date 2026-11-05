import Foundation

/// Short ages and durations as the mockups write them: "40 min", "2 h", "1 d", "4 m 12 s".
enum ShortTime {
    static func age(_ iso: String?, now: Date = .now) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
        if minutes < 1 { return "now" }
        if minutes < 60 { return "\(minutes) min" }
        if minutes < 60 * 24 { return "\(minutes / 60) h" }
        return "\(minutes / 1440) d"
    }

    static func duration(_ seconds: Int?) -> String {
        guard let seconds, seconds >= 0 else { return "" }
        if seconds < 60 { return "\(seconds) s" }
        if seconds < 3600 { return seconds % 60 == 0 ? "\(seconds / 60) m" : "\(seconds / 60) m \(seconds % 60) s" }
        return "\(seconds / 3600) h \(seconds % 3600 / 60) m"
    }

    /// "12 s" since the last sync, for the pill next to the avatar.
    static func since(_ date: Date?, now: Date = .now) -> String {
        guard let date else { return "–" }
        let seconds = Int(max(0, now.timeIntervalSince(date)))
        if seconds < 60 { return "\(seconds) s" }
        if seconds < 3600 { return "\(seconds / 60) min" }
        return "\(seconds / 3600) h"
    }

    /// "20:21" today, "Tue 20:21" this week, else "29 Oct".
    static func clock(_ iso: String?, now: Date = .now, calendar: Calendar = .current) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let time = date.formatted(.dateTime.hour(.twoDigits(amPM: .omitted)).minute(.twoDigits))
        if calendar.isDate(date, inSameDayAs: now) { return time }
        if now.timeIntervalSince(date) < 6 * 86400 { return date.formatted(.dateTime.weekday(.abbreviated)) + " " + time }
        return date.formatted(.dateTime.day().month(.abbreviated))
    }
}

/// A chip on a pull request card or header.
struct PrChip: Hashable {
    enum Style: Hashable { case tone(Tone), accent }

    let text: String
    let style: Style
    var systemImage: String?
    /// Shows a running dot in front.
    var running = false
}

extension PrSummary {
    var repoLabel: String {
        var label = "#\(number)"
        if isMine { label += " · yours" }
        if isDraft { label += " · draft" }
        return label
    }

    var canMerge: Bool { state == .open && !isDraft && mergeable == .mergeable && checks.failed == 0 }

    var checksChip: PrChip? {
        if checks.failed > 0 { return PrChip(text: "\(checks.failed) failing", style: .tone(.bad)) }
        if checks.pending > 0 { return PrChip(text: "\(checks.pending) running", style: .tone(.run), running: true) }
        if mergeable == .conflicting || checks.total == 0 { return nil }
        return PrChip(text: bucket == .ready ? "\(checks.passed) pass" : "Checks pass", style: .tone(.ok))
    }

    /// The card's chips, most telling first, at most three.
    var cardChips: [PrChip] {
        var chips: [PrChip] = []
        if let checksChip { chips.append(checksChip) }
        if mergeable == .conflicting {
            chips.append(PrChip(text: "Conflicts", style: .tone(.warn), systemImage: "exclamationmark.triangle"))
        }
        if autoMerge { chips.append(PrChip(text: "Auto-merge", style: .accent)) }
        if let id = workItemIds.first {
            chips.append(PrChip(text: "AB#\(id)", style: .accent))
        } else if !approvedBy.isEmpty, bucket != .ready {
            chips.append(PrChip(text: approvedBy.count == 1 ? "1 approval" : "\(approvedBy.count) approvals", style: .tone(.mute)))
        }
        return Array(chips.prefix(3))
    }

    /// The commit title GitHub suggests for a squash.
    var squashTitle: String { "\(title) (#\(number))" }

    var branchURL: URL? { URL(string: url) }
}

extension PrReason {
    var systemImage: String {
        switch icon {
        case .review: "eye"
        case .rerun: "arrow.counterclockwise"
        case .comment: "text.bubble"
        case .approved: "checkmark.circle"
        case .failing: "xmark.circle"
        case .clock: "clock"
        case .conflict: "exclamationmark.triangle"
        case .merge: "arrow.triangle.merge"
        }
    }
}

extension CheckSummary {
    /// "2 failed · 1 running · 15 passed"
    var sentence: String {
        var parts: [String] = []
        if failed > 0 { parts.append("\(failed) failed") }
        if pending > 0 { parts.append("\(pending) running") }
        if passed > 0 { parts.append("\(passed) passed") }
        if skipped > 0 { parts.append("\(skipped) skipped") }
        return parts.isEmpty ? "No checks" : parts.joined(separator: " · ")
    }
}

extension String {
    /// The first 7 characters of a commit sha.
    var shortSha: String { String(prefix(7)) }

    /// "src/checkout/BasketRecovery.tsx" → ("src/checkout/", "BasketRecovery.tsx")
    var splitPath: (folder: String, name: String) {
        guard let slash = lastIndex(of: "/") else { return ("", self) }
        return (String(self[...slash]), String(self[index(after: slash)...]))
    }
}

/// The first paragraph of a Markdown body for the overview, without images, HTML comments or headings.
enum DescriptionExcerpt {
    static func excerpt(_ markdown: String) -> String {
        let cleaned = markdown
            .replacingOccurrences(of: #"<!--[\s\S]*?-->"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"<img[^>]*>"#, with: "", options: .regularExpression)
        let paragraphs = cleaned.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty && !$0.hasPrefix("#") }
        return paragraphs.first ?? ""
    }
}
