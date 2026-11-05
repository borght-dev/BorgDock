import Foundation

/// What the states walk shows, from `Overview.walk` and `ItemOverview.walk` (the server ports the desktop's
/// `verdict.ts` and `walk.ts`). Older servers send no walk; the bays stand in for it then. Pure, for tests.
enum WalkDisplay {
    /// A section of the Work tab: an ADO state, or a status when grouped by status.
    struct Lane: Identifiable, Equatable {
        let title: String
        let entries: [ItemOverview]
        let tone: Tone?
        let summary: String
        var id: String { title }
    }

    struct BriefingPart: Equatable {
        let text: String
        let tone: Tone?
    }

    /// One lane per ADO state in walk order. Items the overview doesn't hold are skipped, empty lanes dropped.
    static func lanes(_ overview: Overview) -> [Lane] {
        let byId = Dictionary(overview.items.map { ($0.item.id, $0) }, uniquingKeysWith: { first, _ in first })
        if let walk = overview.walk {
            return walk.lanes.compactMap { lane in
                let entries = lane.itemIds.compactMap { byId[$0] }
                return entries.isEmpty ? nil : Lane(title: lane.state, entries: entries, tone: lane.tone, summary: lane.summary)
            }
        }
        var order: [String] = []
        var groups: [String: [ItemOverview]] = [:]
        for entry in overview.items where entry.item.stateCategory != .completed && entry.item.stateCategory != .removed {
            if groups[entry.item.state] == nil { order.append(entry.item.state) }
            groups[entry.item.state, default: []].append(entry)
        }
        return order.map { state in
            let entries = groups[state, default: []].sorted { verdict(for: $0).tone.rank < verdict(for: $1).tone.rank }
            return Lane(title: state, entries: entries, tone: entries.map { verdict(for: $0).tone }.min { $0.rank < $1.rank }, summary: "")
        }
    }

    /// The Work tab's lanes as you sorted them: states in your order (the rest in walk order after them), or one lane
    /// per status, most urgent first, each holding its items in that same state order.
    static func lanes(_ overview: Overview, grouping: WorkGrouping, order: [String]) -> [Lane] {
        let byState = LaneOrder.apply(order, to: lanes(overview))
        guard grouping == .status else { return byState }
        let ordered = byState.flatMap(\.entries)
        return Tone.allCases.sorted { $0.rank < $1.rank }.compactMap { tone in
            let entries = ordered.filter { verdict(for: $0).tone == tone }
            return entries.isEmpty ? nil : Lane(title: statusTitle(tone), entries: entries, tone: tone, summary: "")
        }
    }

    /// A status lane's header.
    static func statusTitle(_ tone: Tone) -> String {
        switch tone {
        case .bad: "Needs you"
        case .warn: "Needs a look"
        case .ok: "Ready"
        case .run: "Running"
        case .mute: "Quiet"
        }
    }

    static func briefing(_ overview: Overview) -> Walk.Briefing {
        if let briefing = overview.walk?.briefing { return briefing }
        let summary = OverviewSummary(overview)
        return Walk.Briefing(needYou: summary.waiting, outOfSync: summary.drift, running: summary.running)
    }

    /// "2 need you · 3 out of sync · 4 agents running"; the first in red when anything needs you.
    static func briefingParts(_ briefing: Walk.Briefing) -> [BriefingPart] {
        if briefing.needYou == 0 && briefing.outOfSync == 0 && briefing.running == 0 {
            return [BriefingPart(text: "Nothing needs you", tone: nil)]
        }
        return [
            BriefingPart(text: "\(briefing.needYou) need\(briefing.needYou == 1 ? "s" : "") you", tone: briefing.needYou > 0 ? .bad : nil),
            BriefingPart(text: "\(briefing.outOfSync) out of sync", tone: nil),
            BriefingPart(text: "\(briefing.running) \(briefing.running == 1 ? "agent" : "agents") running", tone: nil),
        ]
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
