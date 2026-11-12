import Foundation

/// The sections of a work item's page. Mockup: design/ios-flow, section 08.
enum ItemSection: String, CaseIterable, Identifiable {
    case qaNotes, pullRequests, agents, description, reproSteps, acceptance, details, developerNotes, activity

    var id: String { rawValue }

    var title: String {
        switch self {
        case .qaNotes: "QA notes"
        case .pullRequests: "Pull requests"
        case .agents: "Agents"
        case .description: "Description"
        case .reproSteps: "Repro steps"
        case .acceptance: "Acceptance criteria"
        case .details: "Details"
        case .developerNotes: "Developer notes"
        case .activity: "Activity"
        }
    }
}

/// Which sections an item shows and in what order. What decides the next step leads: QA's notes on a failed item, the
/// agent's question, the pull requests in review; otherwise the description. Pure, for tests.
enum ItemLayout {
    static let restOrder: [ItemSection] = [.qaNotes, .pullRequests, .agents, .description, .reproSteps, .acceptance, .details, .developerNotes, .activity]

    static func lead(state: String, agentAsks: Bool, available: Set<ItemSection>) -> ItemSection? {
        let name = state.lowercased()
        let candidates: [ItemSection] = if name.contains("failed") {
            [.qaNotes, .description, .reproSteps]
        } else if agentAsks || name == "needs human" {
            [.agents, .qaNotes, .description, .reproSteps]
        } else if name.contains("review") {
            [.pullRequests, .description, .reproSteps]
        } else {
            [.description, .reproSteps]
        }
        return candidates.first(where: available.contains)
    }

    static func sections(state: String, agentAsks: Bool, available: Set<ItemSection>) -> [ItemSection] {
        let lead = lead(state: state, agentAsks: agentAsks, available: available)
        return (lead.map { [$0] } ?? []) + restOrder.filter { $0 != lead && available.contains($0) }
    }

    /// The jump chips: QA notes, Description (the description or the repro steps, whichever comes first), Acceptance,
    /// Details, Activity with its count.
    static func jumps(_ sections: [ItemSection], activityCount: Int) -> [JumpBar.Item] {
        let text = sections.first { $0 == .description || $0 == .reproSteps }
        return sections.compactMap { section in
            switch section {
            case .qaNotes: JumpBar.Item(id: section.id, title: "QA notes")
            case .description, .reproSteps: section == text ? JumpBar.Item(id: section.id, title: "Description") : nil
            case .acceptance: JumpBar.Item(id: section.id, title: "Acceptance")
            case .details: JumpBar.Item(id: section.id, title: "Details")
            case .activity: JumpBar.Item(id: section.id, title: "Activity", count: activityCount)
            case .pullRequests, .agents, .developerNotes: nil
            }
        }
    }
}

/// An item's way through its workflow: one segment per state, done in accent, where it failed in red, plus a line
/// from its history: "Back from QA twice · in Testing Failed for 1 day".
struct WorkflowTrack: Equatable {
    enum Mark: Equatable {
        case done, current, failed, held, todo
    }

    struct Step: Equatable {
        let label: String
        let mark: Mark
    }

    let steps: [Step]
    let note: String?

    static func of(_ item: WorkItemSummary, history: [ItemHistoryEvent], now: Date = .now) -> WorkflowTrack {
        let path = item.workflow.filter { !isSideState($0) }
        let enteredCurrent = history.first { $0.kind == .state && $0.to == item.state }
        let index = position(of: item.state, in: path, enteredFrom: enteredCurrent?.from)
        let currentMark: Mark = item.state.lowercased().contains("failed") ? .failed : isSideState(item.state) ? .held : .current
        let steps = path.enumerated().map { offset, state in
            let mark: Mark = switch index {
            case let index? where offset < index: .done
            case let index? where offset == index: currentMark
            default: .todo
            }
            return Step(label: shortName(state), mark: mark)
        }
        return WorkflowTrack(steps: steps, note: historyNote(item, history: history, entered: enteredCurrent, now: now))
    }

    /// Where a state sits on the path. A side state sits where the item left the path ("Testing" for Testing Failed).
    private static func position(of state: String, in path: [String], enteredFrom: String?) -> Int? {
        if let index = path.firstIndex(of: state) { return index }
        if let enteredFrom, let index = path.firstIndex(of: enteredFrom) { return index }
        let name = state.lowercased()
        return path.firstIndex { name.hasPrefix($0.lowercased()) && name.count > $0.count }
    }

    /// Testing Failed, Needs Human, On Hold: places an item waits outside its path.
    static func isSideState(_ state: String) -> Bool {
        let name = state.lowercased()
        return ["failed", "needs human", "on hold", "blocked", "awaiting", "removed"].contains { name.contains($0) }
    }

    /// "Development In Progress" → "Dev", "Code Review" → "Review", "Plan Review" → "Plan".
    static func shortName(_ state: String) -> String {
        let known = [
            "development in progress": "Dev", "in progress": "Dev", "committed": "Dev", "code review": "Review",
            "plan review": "Plan", "ready for qa": "QA", "ready for test": "QA", "to do": "To do",
        ]
        if let short = known[state.lowercased()] { return short }
        return state.count <= 9 ? state : String(state.split(separator: " ").first ?? Substring(state))
    }

    private static func historyNote(_ item: WorkItemSummary, history: [ItemHistoryEvent], entered: ItemHistoryEvent?, now: Date) -> String? {
        let returns = history.filter { $0.kind == .state && ($0.to ?? "").lowercased().contains("failed") }.count
        var parts: [String] = []
        if returns > 0 { parts.append("back from QA \(times(returns))") }
        if let since = ISODate.parse(entered?.at) { parts.append("in \(item.state) for \(duration(from: since, to: now))") }
        guard !parts.isEmpty else { return nil }
        let line = parts.joined(separator: " · ")
        return line.prefix(1).uppercased() + line.dropFirst()
    }

    static func times(_ count: Int) -> String {
        switch count {
        case 1: "once"
        case 2: "twice"
        default: "\(count) times"
        }
    }

    /// "12 minutes", "5 hours", "1 day", "3 days".
    static func duration(from start: Date, to end: Date) -> String {
        let minutes = max(0, Int(end.timeIntervalSince(start) / 60))
        func plural(_ value: Int, _ unit: String) -> String { "\(value) \(unit)\(value == 1 ? "" : "s")" }
        if minutes < 60 { return plural(max(1, minutes), "minute") }
        if minutes < 24 * 60 { return plural(minutes / 60, "hour") }
        return plural(minutes / 1440, "day")
    }
}

/// Comments and history in one list, newest first. Pure, for tests.
enum ItemActivity {
    enum Filter: String, CaseIterable, Identifiable {
        case all, comments, changes
        var id: String { rawValue }
        var title: String { rawValue.prefix(1).uppercased() + rawValue.dropFirst() }
    }

    enum Entry: Equatable, Identifiable {
        case comment(ItemComment, CommentAuthor)
        case event(ItemHistoryEvent)

        var at: String {
            switch self {
            case .comment(let comment, _): comment.at
            case .event(let event): event.at
            }
        }

        var id: String {
            switch self {
            case .comment(let comment, _): "c-\(comment.id.map(String.init) ?? comment.at)"
            case .event(let event): "e-\(event.at)-\(event.kind.rawValue)-\(event.to ?? "")"
            }
        }
    }

    static func entries(comments: [ItemComment], history: [ItemHistoryEvent], filter: Filter, me: String?) -> [Entry] {
        let notes = filter == .changes ? [] : comments.map { Entry.comment($0, CommentAuthor.of($0, me: me)) }
        let changes = filter == .comments ? [] : history.map(Entry.event)
        return (notes + changes).enumerated()
            .sorted { a, b in
                let (dateA, dateB) = (ISODate.parse(a.element.at) ?? .distantPast, ISODate.parse(b.element.at) ?? .distantPast)
                return dateA != dateB ? dateA > dateB : a.offset < b.offset
            }
            .map(\.element)
    }

    /// "Testing → Testing Failed", "PR #412 linked", "Assigned to you", "Created".
    static func title(_ event: ItemHistoryEvent, me: String?) -> String {
        switch event.kind {
        case .state:
            if let from = event.from { return "\(from) → \(event.to ?? "?")" }
            return "Moved to \(event.to ?? "?")"
        case .pullRequest:
            return event.pullRequest.map { "PR #\($0) linked" } ?? "Pull request linked"
        case .assigned:
            guard let to = event.to else { return "Unassigned" }
            return isMe(to, me) ? "Assigned to you" : "Assigned to \(CommentAuthor.displayName(to).name)"
        case .created:
            return "Created"
        }
    }

    /// Who made the change: "Lena", "you".
    static func actor(_ event: ItemHistoryEvent, me: String?) -> String {
        isMe(event.by, me) ? "you" : CommentAuthor.displayName(event.by).name
    }

    /// Red into a failed state, green for a linked pull request, blue for an assignment, accent for other moves.
    static func hue(_ event: ItemHistoryEvent) -> LaneHue {
        switch event.kind {
        case .state: (event.to ?? "").lowercased().contains("failed") ? .red : .accent
        case .pullRequest: .green
        case .assigned: .blue
        case .created: .gray
        }
    }

    static func isMe(_ name: String, _ me: String?) -> Bool {
        guard let me, !me.isEmpty else { return false }
        return CommentAuthor.displayName(name).name.caseInsensitiveCompare(me) == .orderedSame
    }
}

/// Who wrote a comment, as Activity shows it: "Lena" with the role "QA", "You", or Vera with the report's kind when the
/// comment starts "Vera · test report —" (whoever's account posted it, as on the desktop).
struct CommentAuthor: Equatable {
    let name: String
    let role: String?
    /// "test report" for a Vera comment; nil otherwise.
    let veraKind: String?
    let isYou: Bool
    /// The comment's markdown without Vera's prefix.
    let body: String

    static func of(_ comment: ItemComment, me: String?) -> CommentAuthor {
        let text = comment.markdown ?? comment.text
        if let vera = vera(text) {
            return CommentAuthor(name: "Vera", role: nil, veraKind: vera.kind, isYou: false, body: vera.body)
        }
        let display = displayName(comment.by)
        let isYou = ItemActivity.isMe(comment.by, me)
        return CommentAuthor(name: isYou ? "You" : display.name, role: display.role, veraKind: nil, isYou: isYou, body: text)
    }

    /// "Vera · test report — 14 checks passed" → ("test report", "14 checks passed"). Bold markers around the prefix
    /// are allowed.
    static func vera(_ text: String) -> (kind: String, body: String)? {
        let pattern = #"^\s*\**\s*Vera\s*·\s*([^—–*\n]+?)\s*\**\s*[—–]\s*"#
        guard let match = text.range(of: pattern, options: .regularExpression) else { return nil }
        let prefix = String(text[match])
        let kind = prefix.replacingOccurrences(of: #"^\s*\**\s*Vera\s*·\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s*\**\s*[—–]\s*$"#, with: "", options: .regularExpression)
        return (kind, String(text[match.upperBound...]))
    }

    /// "Lena (QA)" → ("Lena", "QA"); "Mara Visser" → ("Mara Visser", nil).
    static func displayName(_ by: String) -> (name: String, role: String?) {
        guard let open = by.lastIndex(of: "("), by.hasSuffix(")") else { return (by, nil) }
        let name = by[..<open].trimmingCharacters(in: .whitespaces)
        let role = by[by.index(after: open)..<by.index(before: by.endIndex)].trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? (by, nil) : (name, role.isEmpty ? nil : role)
    }
}

/// The details grid: two columns, the wide cells (parent, tags, area) span both. Pure, for tests.
struct ItemDetailCell: Equatable, Identifiable {
    enum Value: Equatable {
        case text(String)
        case person(String, isYou: Bool)
        case parent(ItemParent)
        case tags([String])
    }

    let label: String
    let value: Value
    var wide = false

    var id: String { label }

    static func cells(_ item: WorkItemSummary, detail: ItemDetail?, sprint: Sprint?, now: Date = .now) -> [ItemDetailCell] {
        var cells: [ItemDetailCell] = [
            ItemDetailCell(label: "Assigned to", value: item.assignedTo.map { .person($0, isYou: item.assignedToMe) } ?? .text("Nobody")),
            ItemDetailCell(label: "Sprint", value: .text(sprintText(item, sprint: sprint, now: now))),
            ItemDetailCell(label: "Priority", value: .text(item.priority.map(String.init) ?? "None")),
        ]
        if let effort = detail?.effort { cells.append(ItemDetailCell(label: "Effort", value: .text(effort.formatted(.number.precision(.fractionLength(0...1)))))) }
        if let due = DueDate(item) { cells.append(ItemDetailCell(label: "Due", value: .text(due.label.replacingOccurrences(of: "Due ", with: "")))) }
        if cells.count % 2 == 1 { cells[cells.count - 1].wide = true }
        if let parent = detail?.parent { cells.append(ItemDetailCell(label: "Parent", value: .parent(parent), wide: true)) }
        if !item.tags.isEmpty { cells.append(ItemDetailCell(label: "Tags", value: .tags(item.tags), wide: true)) }
        if let area = detail?.areaPath, !area.isEmpty {
            cells.append(ItemDetailCell(label: "Area", value: .text(area.replacingOccurrences(of: "\\", with: " › ")), wide: true))
        }
        return cells
    }

    /// Pairs of normal cells; a wide cell is a row of its own.
    static func rows(_ cells: [ItemDetailCell]) -> [[ItemDetailCell]] {
        var rows: [[ItemDetailCell]] = []
        for cell in cells {
            if !cell.wide, let last = rows.last, last.count == 1, !last[0].wide {
                rows[rows.count - 1].append(cell)
            } else {
                rows.append([cell])
            }
        }
        return rows
    }

    /// "Sprint 23 · 6 d left" when it's the current sprint and its end is known.
    static func sprintText(_ item: WorkItemSummary, sprint: Sprint?, now: Date) -> String {
        guard !item.sprint.isEmpty else { return "None" }
        let name = SprintName.display(item.sprint)
        guard let sprint, sprint.name == item.sprint, let left = SprintName.left(sprint, now: now) else { return name }
        return "\(name) · \(left)"
    }
}

/// A linked pull request's way in when Focus doesn't know it: checks, review, merge from what ADO's link carries.
enum ItemPullRequestTrack {
    static func steps(_ pr: ItemPullRequest) -> [PrTrackStep] {
        switch pr.state {
        case .merged: return [PrTrackStep(label: "Merged", mark: .done)]
        case .closed: return [PrTrackStep(label: "Closed", mark: .open)]
        case .open, .unknown: break
        }
        let checks = (pr.checks ?? "").lowercased()
        let checkStep: PrTrackStep = if ["fail", "error"].contains(where: checks.contains) {
            PrTrackStep(label: "Checks failing", mark: .failed)
        } else if ["pending", "running", "progress", "queued"].contains(where: checks.contains) {
            PrTrackStep(label: "Running", mark: .running)
        } else if ["success", "pass"].contains(where: checks.contains) {
            PrTrackStep(label: "Checks", mark: .done)
        } else {
            PrTrackStep(label: "No checks", mark: .open)
        }
        return [checkStep, PrTrackStep(label: "Review", mark: .open), PrTrackStep(label: pr.isDraft ? "Draft" : "Merge", mark: .open)]
    }

    /// "acme/shop" → "shop".
    static func repositoryName(_ pr: ItemPullRequest) -> String {
        if let repository = pr.repository, let name = repository.split(separator: "/").last { return String(name) }
        return PrKey(pullRequestURL: pr.url)?.repo ?? ""
    }
}

/// Rich text split around its images, so an attachment shows as its own card: "![invoice-export.png](/api/…)".
enum RichText {
    enum Block: Equatable {
        case markdown(String)
        case image(alt: String, url: String)
    }

    static func blocks(_ markdown: String) -> [Block] {
        var blocks: [Block] = []
        var text: [String] = []
        func flush() {
            let chunk = text.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
            if !chunk.isEmpty { blocks.append(.markdown(chunk)) }
            text = []
        }
        for line in markdown.components(separatedBy: "\n") {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if let image = image(trimmed) {
                flush()
                blocks.append(image)
            } else {
                text.append(line)
            }
        }
        flush()
        return blocks
    }

    /// A line that is only an image: `![alt](url)` or `<img src="url" alt="alt">`.
    private static func image(_ line: String) -> Block? {
        if line.hasPrefix("!["), line.hasSuffix(")"), let middle = line.range(of: "](") {
            let alt = String(line[line.index(line.startIndex, offsetBy: 2)..<middle.lowerBound])
            let url = String(line[middle.upperBound..<line.index(before: line.endIndex)]).split(separator: " ").first.map(String.init) ?? ""
            return url.isEmpty ? nil : .image(alt: alt, url: url)
        }
        if line.lowercased().hasPrefix("<img"), let src = attribute("src", in: line) {
            return .image(alt: attribute("alt", in: line) ?? "", url: src)
        }
        return nil
    }

    private static func attribute(_ name: String, in tag: String) -> String? {
        guard let range = tag.range(of: #"\#(name)\s*=\s*"([^"]*)""#, options: [.regularExpression, .caseInsensitive]) else { return nil }
        let value = tag[range].split(separator: "\"", omittingEmptySubsequences: false)
        return value.count > 1 ? String(value[1]) : nil
    }
}
