import Foundation

/// A section of the Work tab: an ADO state, a verdict tone, or a sprint.
struct WorkLane: Identifiable, Equatable {
    enum Kind: Equatable {
        case state(String)
        case verdict(Tone)
        case sprint(String)
    }

    let kind: Kind
    let title: String
    let entries: [WorkEntry]

    var id: String { title }
}

/// The Work tab's lanes: states in walk order (yours first when you placed them), one lane per verdict tone, or one per
/// sprint. Pure, for tests.
enum WorkLanes {
    static func build(_ entries: [WorkEntry], walk: Walk?, grouping: WorkGrouping, order: [String], currentSprint: String?) -> [WorkLane] {
        let byState = LaneOrder.apply(order, to: stateLanes(entries, walk: walk))
        let ordered = byState.flatMap(\.entries)
        switch grouping {
        case .state:
            return byState
        case .verdict:
            return Tone.allCases.sorted { $0.rank < $1.rank }.compactMap { tone in
                let laneEntries = ordered.filter { ($0.verdict?.tone ?? .mute) == tone }
                return laneEntries.isEmpty ? nil : WorkLane(kind: .verdict(tone), title: verdictTitle(tone), entries: laneEntries)
            }
        case .sprint:
            return sprintOrder(Set(ordered.map(\.item.sprint)), current: currentSprint).map { sprint in
                let title = sprint.isEmpty ? "No sprint" : SprintName.display(sprint)
                return WorkLane(kind: .sprint(sprint), title: title, entries: ordered.filter { $0.item.sprint == sprint })
            }
        }
    }

    /// One lane per state: the walk's states first, in walk order, then any other state in the order its items come.
    /// Items keep the walk's order (most urgent first); items the walk doesn't hold follow by verdict.
    static func stateLanes(_ entries: [WorkEntry], walk: Walk?) -> [WorkLane] {
        let walkRank = Dictionary((walk?.lanes.flatMap(\.itemIds) ?? []).enumerated().map { ($1, $0) }, uniquingKeysWith: { first, _ in first })
        var states = walk?.lanes.map(\.state) ?? []
        for entry in entries where !states.contains(entry.item.state) { states.append(entry.item.state) }
        let ranked = entries.enumerated().map { offset, entry in
            (entry: entry, key: [walkRank[entry.id] == nil ? 1 : 0, walkRank[entry.id] ?? 0, entry.verdict?.tone.rank ?? Tone.allCases.count, offset])
        }
        return states.compactMap { state in
            let laneEntries = ranked.filter { $0.entry.item.state == state }
                .sorted { $0.key.lexicographicallyPrecedes($1.key) }
                .map(\.entry)
            return laneEntries.isEmpty ? nil : WorkLane(kind: .state(state), title: state, entries: laneEntries)
        }
    }

    static func verdictTitle(_ tone: Tone) -> String {
        switch tone {
        case .bad: "Needs you"
        case .warn: "Needs a look"
        case .ok: "Ready"
        case .run: "Running"
        case .mute: "Quiet"
        }
    }

    /// The current sprint first, then the others newest first, items without a sprint last.
    private static func sprintOrder(_ sprints: Set<String>, current: String?) -> [String] {
        sprints.sorted { a, b in
            if a == current || b == current { return a == current }
            if a.isEmpty || b.isEmpty { return b.isEmpty && !a.isEmpty }
            return a.localizedStandardCompare(b) == .orderedDescending
        }
    }
}

/// What an item of yours asks of you, for the briefing and for which lanes open by default.
enum WorkAttention: Equatable {
    /// QA sent it back.
    case failedQA
    /// A person (Needs Human) or an agent (a question, a plan, an approval) waits on your answer.
    case asks
    /// An agent finished its turn or stopped with an error.
    case yourTurn
    case running
    case none

    static func of(_ entry: WorkEntry) -> WorkAttention {
        guard let overview = entry.overview else { return .none }
        if entry.item.state.localizedCaseInsensitiveContains("failed") { return .failedQA }
        let status = overview.threads.first { $0.status.isOpen }?.status
        if entry.item.state == "Needs Human" || [.question, .plan, .approval].contains(status) { return .asks }
        if status == .yourTurn || status == .failed { return .yourTurn }
        if overview.threads.contains(where: { $0.status == .running }) { return .running }
        return .none
    }

    var needsYou: Bool { self == .failedQA || self == .asks || self == .yourTurn }
}

/// "2 failed QA · 2 questions · 4 running": the Work tab's subtitle, what asks something in red and yellow.
enum WorkBriefing {
    static func parts(_ entries: [WorkEntry]) -> [WalkDisplay.BriefingPart] {
        let attention = entries.map(WorkAttention.of)
        func count(_ kind: WorkAttention) -> Int { attention.filter { $0 == kind }.count }
        let parts = [
            (count(.failedQA), "failed QA", "failed QA", Tone?.some(.bad)),
            (count(.asks), "question", "questions", .warn),
            (count(.yourTurn), "your turn", "your turn", .bad),
            (count(.running), "running", "running", nil),
        ]
        .filter { $0.0 > 0 }
        .map { WalkDisplay.BriefingPart(text: "\($0.0) \($0.0 == 1 ? $0.1 : $0.2)", tone: $0.3) }
        return parts.isEmpty ? [WalkDisplay.BriefingPart(text: "Nothing needs you", tone: nil)] : parts
    }
}

/// How a row reads: two lines (AB#, verdict, title, then the latest message or the evidence), or one line for an item
/// that needs nothing from you.
enum WorkRowLayout: Equatable {
    enum Detail: Equatable {
        case message(by: String, text: String)
        case evidence([Evidence])
        case none
    }

    case twoLines(Detail)
    /// Glyph, title and a trailing note: "waiting on review · 2 d", "Lena", "Unassigned".
    case oneLine(trailing: String)

    static func of(_ entry: WorkEntry, showsState: Bool = false, now: Date = .now) -> WorkRowLayout {
        guard let overview = entry.overview, let verdict = entry.verdict else {
            let firstName = entry.item.assignedTo?.split(separator: " ").first.map(String.init)
            let owner = entry.item.assignedToMe ? "You" : firstName ?? "Unassigned"
            return .oneLine(trailing: showsState ? "\(entry.item.state) · \(owner)" : owner)
        }
        let attention = WorkAttention.of(entry)
        let latest = WalkDisplay.latest(for: overview)
        if verdict.tone == .mute && !attention.needsYou {
            let age = CompactTime.ago(latest?.at, now: now)
            return .oneLine(trailing: [phrase(verdict.label), age].filter { !$0.isEmpty }.joined(separator: " · "))
        }
        let evidence = WalkDisplay.evidence(for: overview)
        let message = latest.map { Detail.message(by: $0.by, text: WalkDisplay.oneLine($0.text)) }
        let pullRequestSpeaks = evidence.contains { ($0.kind == .pr || $0.kind == .merged) && $0.tone != nil }
        if attention.needsYou, let message { return .twoLines(message) }
        if pullRequestSpeaks { return .twoLines(.evidence(evidence)) }
        if let message { return .twoLines(message) }
        return .twoLines(evidence.isEmpty ? .none : .evidence(evidence))
    }

    /// "Waiting on review" → "waiting on review".
    static func phrase(_ label: String) -> String {
        label.prefix(1).lowercased() + label.dropFirst()
    }

    var isOneLine: Bool {
        if case .oneLine = self { return true }
        return false
    }
}

/// What an open lane shows: every row that asks something, a few quiet ones, and "5 more waiting on review".
enum LaneRows {
    static let quietShown = 2

    static func visible(_ lane: WorkLane, expanded: Bool, showsState: Bool = false) -> (shown: [WorkEntry], hidden: [WorkEntry]) {
        let quiet = lane.entries.filter { WorkRowLayout.of($0, showsState: showsState).isOneLine }
        guard !expanded, quiet.count > quietShown + 1 else { return (lane.entries, []) }
        let hidden = Set(quiet.dropFirst(quietShown).map(\.id))
        return (lane.entries.filter { !hidden.contains($0.id) }, lane.entries.filter { hidden.contains($0.id) })
    }

    /// "5 more waiting on review" when they share a verdict, else "5 more".
    static func moreLabel(_ hidden: [WorkEntry]) -> String {
        let phrases = Set(hidden.map { $0.verdict.map { WorkRowLayout.phrase($0.label) } ?? "" })
        if phrases.count == 1, let phrase = phrases.first, !phrase.isEmpty { return "\(hidden.count) more \(phrase)" }
        return "\(hidden.count) more"
    }

    /// A folded lane in one line: "2 CI red · 7 waiting on review", "4 agents running". What asks something keeps its
    /// tone; the rest is counted under its most common verdict.
    static func summary(_ lane: WorkLane) -> [WalkDisplay.BriefingPart] {
        var parts: [WalkDisplay.BriefingPart] = []
        let asking = lane.entries.compactMap(\.verdict).filter { $0.tone == .bad || $0.tone == .warn }
        var labels: [String] = []
        for verdict in asking.sorted(by: { $0.tone.rank < $1.tone.rank }) where !labels.contains(verdict.label) { labels.append(verdict.label) }
        for label in labels {
            let matching = asking.filter { $0.label == label }
            parts.append(.init(text: "\(matching.count) \(label)", tone: matching[0].tone))
        }
        let running = lane.entries.filter { $0.verdict?.tone == .run }.count
        if running > 0 { parts.append(.init(text: "\(running) \(running == 1 ? "agent" : "agents") running", tone: nil)) }
        let rest = lane.entries.filter { $0.verdict.map { $0.tone == .ok || $0.tone == .mute } ?? true }
        if !rest.isEmpty {
            let phrases = rest.compactMap { $0.verdict.map { WorkRowLayout.phrase($0.label) } }
            let common = phrases.max { a, b in
                let (countA, countB) = (phrases.filter { $0 == a }.count, phrases.filter { $0 == b }.count)
                return countA != countB ? countA < countB : phrases.firstIndex(of: a)! > phrases.firstIndex(of: b)!
            }
            parts.append(.init(text: "\(rest.count) \(common ?? (rest.count == 1 ? "item" : "items"))", tone: nil))
        }
        return parts
    }

    /// A lane opens by default when something in it asks you: QA sent it back, someone asks, an agent finished.
    static func needsYou(_ lane: WorkLane) -> Bool {
        lane.entries.contains { WorkAttention.of($0).needsYou }
    }
}

/// Which lanes you folded or opened, kept on the phone. A choice holds while the lane's need for you stays what it was
/// when you made it, so a new failure opens a lane you had folded.
struct LaneFolds: Equatable {
    private struct Choice: Equatable {
        let open: Bool
        let whileNeedsYou: Bool
    }

    private var choices: [String: Choice] = [:]

    init(stored: String) {
        for line in stored.split(separator: "\n") {
            let parts = line.split(separator: "\t", omittingEmptySubsequences: false).map(String.init)
            guard parts.count == 3 else { continue }
            choices[parts[0]] = Choice(open: parts[1] == "1", whileNeedsYou: parts[2] == "1")
        }
    }

    var stored: String {
        choices.keys.sorted().map { key in
            let choice = choices[key]!
            return "\(key)\t\(choice.open ? 1 : 0)\t\(choice.whileNeedsYou ? 1 : 0)"
        }
        .joined(separator: "\n")
    }

    func isOpen(_ lane: WorkLane) -> Bool {
        let needsYou = LaneRows.needsYou(lane)
        guard let choice = choices[lane.id], choice.whileNeedsYou == needsYou else { return needsYou }
        return choice.open
    }

    mutating func set(_ lane: WorkLane, open: Bool) {
        choices[lane.id] = Choice(open: open, whileNeedsYou: LaneRows.needsYou(lane))
    }
}

/// A lane's colour and symbol, for its header dot and its folded row.
enum LaneHue: Equatable {
    case red, yellow, blue, accent, green, merged, gray

    static func of(_ lane: WorkLane) -> (hue: LaneHue, symbol: String) {
        switch lane.kind {
        case .verdict(let tone):
            switch tone {
            case .bad: (.red, "xmark")
            case .warn: (.yellow, "exclamationmark")
            case .ok: (.green, "checkmark")
            case .run: (.blue, "cpu")
            case .mute: (.gray, "moon")
            }
        case .sprint: (.accent, "calendar")
        case .state(let state): of(state: state)
        }
    }

    static func of(state: String) -> (hue: LaneHue, symbol: String) {
        let name = state.lowercased()
        func has(_ words: String...) -> Bool { words.contains { name.contains($0) } }
        if has("fail") { return (.red, "xmark") }
        if has("human", "answer", "hold", "block") { return (.yellow, "questionmark") }
        if has("review") { return (.blue, "eye") }
        if has("progress", "active", "dev", "committed") { return (.accent, "cpu") }
        if has("qa", "test", "resolved") { return (.merged, "checklist") }
        if has("done", "closed") { return (.green, "checkmark") }
        return (.gray, "circle.dashed")
    }
}
