import Foundation

/// The ADO and branch rules the app shares with the web client (web/src/helpers.ts).
enum WorkflowRules {
    private static let inProgressNames = ["Development In Progress", "In Progress", "Active"]

    /// The state an item moves to when an agent starts on it.
    static func inProgressState(for item: WorkItemSummary) -> String {
        inProgressNames.first(where: item.workflow.contains)
            ?? (item.workflow.count > 1 ? item.workflow[1] : item.state)
    }

    /// The state move to offer at start, or nil when the item is already there.
    static func startMoveTarget(for item: WorkItemSummary) -> String? {
        let target = inProgressState(for: item)
        return target == item.state ? nil : target
    }

    private static let stopWords: Set<String> = [
        "the", "and", "a", "an", "for", "of", "to", "before", "in", "on", "every", "com", "is", "but", "with",
    ]

    /// `feat/` for PBIs, `chore/` for Tasks, `fix/` otherwise, then `<id>-<first 4 meaningful title words>`.
    static func branchName(for item: WorkItemSummary) -> String {
        let prefix = switch item.type {
        case .pbi: "feat"
        case .task: "chore"
        default: "fix"
        }
        let words = shortTitle(item.title)
            .lowercased()
            .split(whereSeparator: { !(("a"..."z").contains($0) || ("0"..."9").contains($0)) })
            .map(String.init)
            .filter { !stopWords.contains($0) && !isLongNumber($0) }
        return "\(prefix)/\(item.id)-\(words.prefix(4).joined(separator: "-"))"
    }

    static func fillPrompt(_ template: String, item: WorkItemSummary) -> String {
        template
            .replacingOccurrences(of: "{id}", with: String(item.id))
            .replacingOccurrences(of: "{title}", with: item.title)
            .replacingOccurrences(of: "{branch}", with: branchName(for: item))
    }

    private static let mainPath = ["New", "To Do", "Development In Progress", "In Progress", "Code Review", "Ready For QA", "Done"]

    /// Real workflows can have 20 states; show the main path plus the current state and the suggested target.
    static func trackStates(for item: WorkItemSummary, target: String?) -> [String] {
        let flow = item.workflow
        var main = mainPath.filter(flow.contains)
        if main.count < 3 || flow.count <= 7 { return flow }
        for extra in [item.state, target].compactMap({ $0 }) where flow.contains(extra) && !main.contains(extra) {
            main.append(extra)
        }
        return main.sorted { (flow.firstIndex(of: $0) ?? 0) < (flow.firstIndex(of: $1) ?? 0) }
    }

    static func shortState(_ state: String) -> String {
        switch state {
        case "Development In Progress": "In Progress"
        case "Ready For QA": "Ready for QA"
        default: state
        }
    }

    static func shortTitle(_ title: String) -> String {
        title.hasPrefix("Horizon | ") ? String(title.dropFirst("Horizon | ".count)) : title
    }

    private static func isLongNumber(_ word: String) -> Bool {
        word.count >= 4 && word.allSatisfy(\.isNumber)
    }
}
