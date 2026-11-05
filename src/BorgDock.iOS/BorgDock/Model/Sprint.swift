import Foundation

/// A backlog item in the current sprint (`SprintItem` in `shared/src/api.ts`). Finished items stay in, so progress
/// can count them.
struct SprintItem: Decodable, Hashable, Sendable, Identifiable {
    let item: WorkItemSummary
    /// When the item last changed state.
    let stateChangedAt: String?
    /// When it reached a Completed state; nil while it is open.
    let finishedAt: String?

    var id: Int { item.id }

    private enum CodingKeys: String, CodingKey {
        case stateChangedAt, finishedAt
    }

    init(item: WorkItemSummary, stateChangedAt: String?, finishedAt: String?) {
        self.item = item
        self.stateChangedAt = stateChangedAt
        self.finishedAt = finishedAt
    }

    /// The server sends the summary's fields and the two dates side by side.
    init(from decoder: Decoder) throws {
        item = try WorkItemSummary(from: decoder)
        let container = try decoder.container(keyedBy: CodingKeys.self)
        stateChangedAt = try container.decodeIfPresent(String.self, forKey: .stateChangedAt)
        finishedAt = try container.decodeIfPresent(String.self, forKey: .finishedAt)
    }
}

/// GET /api/sprint: the team's current sprint and every backlog item in it, whoever has it.
struct Sprint: Decodable, Hashable, Sendable {
    /// As work items show it: "5.2.8".
    let name: String
    let path: String
    let startDate: String?
    let finishDate: String?
    let items: [SprintItem]
    let generatedAt: String
}
