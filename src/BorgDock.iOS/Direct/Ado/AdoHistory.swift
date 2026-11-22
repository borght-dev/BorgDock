import Foundation

/// An item's revisions as the page's history: the port of the server's `ado/history.ts`.
enum AdoHistory {
    /// How the item got here, newest first: created, state moves, assignments and GitHub pull requests linked. The
    /// current revision's `revisedDate` is ADO's far future, so each change is dated by its ChangedDate.
    static func events(of updates: [AdoUpdate]) -> [ItemHistoryEvent] {
        var events: [(event: ItemHistoryEvent, rev: Int)] = []
        for update in updates {
            let fields = update.fields ?? [:]
            let at = text(fields["System.ChangedDate"]?.newValue) ?? text(fields["System.CreatedDate"]?.newValue) ?? update.revisedDate ?? ""
            let by = name(of: fields["System.ChangedBy"]?.newValue) ?? name(of: update.revisedBy) ?? "Unknown"
            if update.rev == 1 {
                events.append((ItemHistoryEvent(at: at, by: by, kind: .created, from: nil, to: text(fields["System.State"]?.newValue)), update.rev))
            } else {
                if let state = fields["System.State"], state.newValue != state.oldValue {
                    events.append((ItemHistoryEvent(at: at, by: by, kind: .state, from: text(state.oldValue), to: text(state.newValue)), update.rev))
                }
                if let assigned = fields["System.AssignedTo"], name(of: assigned.newValue) != name(of: assigned.oldValue) {
                    events.append((ItemHistoryEvent(at: at, by: by, kind: .assigned, from: name(of: assigned.oldValue), to: name(of: assigned.newValue)), update.rev))
                }
            }
            for link in AdoItem.pullRequestLinks(in: update.relations?.added) {
                events.append((ItemHistoryEvent(at: at, by: by, kind: .pullRequest, from: nil, to: nil, pullRequest: link.number), update.rev))
            }
        }
        return events.enumerated()
            .sorted { later, earlier in
                if later.element.event.at != earlier.element.event.at { return later.element.event.at > earlier.element.event.at }
                if later.element.rev != earlier.element.rev { return later.element.rev > earlier.element.rev }
                return later.offset > earlier.offset
            }
            .map(\.element.event)
    }

    private static let address = AdoPattern(#"\s*<[^>]*>\z"#)

    /// A person: an identity's display name, or a `Name <address>` text without its address.
    private static func name(of value: AdoValue?) -> String? {
        if case .string(let text) = value {
            let name = address.replacing(in: text, with: "")
            return name.isEmpty ? nil : name
        }
        let name = value?["displayName"]?.string
        return name?.isEmpty == false ? name : nil
    }

    private static func text(_ value: AdoValue?) -> String? {
        guard let text = value?.string, !text.isEmpty else { return nil }
        return text
    }
}
