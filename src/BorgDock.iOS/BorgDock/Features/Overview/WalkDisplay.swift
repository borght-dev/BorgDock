import Foundation

/// What the states walk says about an item, from `ItemOverview.walk` (the server ports the desktop's `verdict.ts`).
/// Older servers send no walk; the bays stand in for it then. Pure, for tests.
enum WalkDisplay {
    /// A piece of a sentence in its tone: "2 failed QA" in red.
    struct BriefingPart: Equatable {
        let text: String
        let tone: Tone?
    }

    static func briefing(_ overview: Overview) -> Walk.Briefing {
        if let briefing = overview.walk?.briefing { return briefing }
        let summary = OverviewSummary(overview)
        return Walk.Briefing(needYou: summary.waiting, outOfSync: summary.drift, running: summary.running)
    }

    static func verdict(for entry: ItemOverview) -> Verdict {
        if let verdict = entry.walk?.verdict { return verdict }
        switch entry.bay {
        case .waiting: return Verdict(label: entry.currentThread?.needsYouLabel ?? "Waiting on you", tone: .bad)
        case .drift: return Verdict(label: "Out of sync", tone: .warn)
        case .working: return Verdict(label: "Agent on it", tone: .run)
        case .next: return Verdict(label: "Up next", tone: .mute)
        case .handed: return Verdict(label: "Handed on", tone: .ok)
        case .paused: return Verdict(label: "Paused", tone: .mute)
        case .idle: return Verdict(label: "No agent", tone: .mute)
        }
    }

    static func evidence(for entry: ItemOverview) -> [Evidence] {
        if let evidence = entry.walk?.evidence { return evidence }
        var evidence: [Evidence] = []
        if let pr = entry.pullRequest {
            evidence.append(pr.state == .merged
                ? Evidence(label: "#\(pr.number) merged", tone: .ok, kind: .merged)
                : Evidence(label: "#\(pr.number) \(pr.state.label.lowercased())", tone: nil, kind: .pr))
        }
        if let thread = entry.openThread {
            evidence.append(Evidence(label: thread.branch ?? thread.worktree, tone: nil, kind: .agent))
        }
        return evidence
    }

    static func latest(for entry: ItemOverview) -> LatestMessage? {
        if let walk = entry.walk { return walk.latest }
        guard let thread = entry.currentThread, let text = thread.lastAgentMessage else { return nil }
        return LatestMessage(by: "Agent", text: text, at: thread.lastActivityAt, source: .agent)
    }

    /// The message on one line: markdown markers and line breaks dropped.
    static func oneLine(_ text: String) -> String {
        text.replacingOccurrences(of: "#", with: "")
            .replacingOccurrences(of: "**", with: "")
            .split(whereSeparator: \.isNewline)
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    static func symbol(for kind: EvidenceKind, tone: Tone?) -> String? {
        switch kind {
        case .pr: tone == .ok ? "checkmark" : "arrow.triangle.pull"
        case .merged: "arrow.triangle.merge"
        case .agent: "cpu"
        case .due: "calendar"
        case .priority: "flag"
        case .other: nil
        }
    }

    /// The items "Fix out of sync" hands to one agent run: the ones whose ADO state lags their evidence.
    static func outOfSyncItemIds(_ overview: Overview) -> [Int] {
        overview.items.filter { $0.bay == .drift }.map(\.item.id)
    }

    static func activeItemIds(_ overview: Overview) -> [Int] {
        overview.items.filter { $0.item.stateCategory == .inProgress || $0.item.stateCategory == .resolved || $0.bay != .idle }.map(\.item.id)
    }
}
