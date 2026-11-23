import Foundation
import Synchronization
@testable import BorgDock

/// Azure DevOps for the acme shop: item 61021 as the server's `test/item-detail.test.ts` has it, in the JSON ADO sends.
enum AdoFixture {
    typealias JSON = [String: Any]

    static let guid = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
    static let shopRepositoryId = "a1b2c3d4-0000-4000-8000-000000000001"
    static let token = "pat-for-tests"
    static let connection = AdoConnection(organizationURL: URL(string: "https://dev.azure.com/acme")!, project: "Shop", credential: .personalAccessToken(token))

    static let reproSteps = "Already **markdown** ![shot](https://dev.azure.com/acme/0f1e/_apis/wit/attachments/\(guid)?fileName=shot.png)"

    /// As ADO lists them: per category, in no useful order.
    static let states: [[String: String]] = [
        ["name": "Ready For QA", "category": "Resolved"],
        ["name": "New", "category": "Proposed"],
        ["name": "Removed", "category": "Removed"],
        ["name": "Code Review", "category": "Resolved"],
        ["name": "Testing", "category": "InProgress"],
        ["name": "Development In Progress", "category": "InProgress"],
        ["name": "Done", "category": "Completed"],
        ["name": "Testing Failed", "category": "InProgress"],
    ]
    static let workflow = ["New", "Development In Progress", "Testing", "Testing Failed", "Code Review", "Ready For QA", "Done"]

    static func fields(id: Int, type: String = "Product Backlog Item", state: String = "Testing Failed", title: String? = nil) -> JSON {
        [
            "System.Id": id, "System.TeamProject": "Shop", "System.WorkItemType": type, "System.Title": title ?? "Item \(id)", "System.State": state,
            "System.IterationPath": "Shop\\Service Pack 5.2.8", "System.Tags": "checkout; rounding",
            "System.AssignedTo": ["displayName": "Koen", "uniqueName": "koen@example.com"], "System.ChangedDate": "2026-11-11T08:00:00Z",
            "Microsoft.VSTS.Common.Priority": 2,
        ]
    }

    /// One item as ADO sends it.
    static func raw(_ id: Int, _ fields: JSON) -> JSON {
        ["id": id, "fields": fields]
    }

    /// What `workitemsbatch` answers; `NSNull()` stands for an item it left out.
    static func batch(_ items: [Any]) -> AdoStubURLProtocol.Answer {
        .json(["value": items] as JSON)
    }

    static var item: JSON {
        var fields = Self.fields(id: 61021, title: "Totals off by a cent")
        fields["System.Description"] = "<div>Totals are off by a cent.<br><img src=\"https://dev.azure.com/acme/0f1e/_apis/wit/attachments/\(guid)?fileName=invoice.png\"></div>"
        fields["Microsoft.VSTS.Common.AcceptanceCriteria"] = "<ul><li>Basket</li><li>Invoice</li></ul>"
        fields["Microsoft.VSTS.TCM.ReproSteps"] = reproSteps
        fields["Custom.QANotes"] = "<div>Invoice export still rounds per order.</div>"
        fields["Microsoft.VSTS.Scheduling.StoryPoints"] = 3
        fields["System.AreaPath"] = "Shop\\Checkout"
        let relations: [JSON] = [
            ["rel": "System.LinkTypes.Hierarchy-Reverse", "url": "https://dev.azure.com/acme/_apis/wit/workItems/60990"],
            ["rel": "AttachedFile", "url": "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)", "attributes": ["name": "invoice-export.png", "resourceSize": 245_760] as JSON],
            ["rel": "ArtifactLink", "url": "vstfs:///GitHub/PullRequest/\(shopRepositoryId)%2f412", "attributes": ["name": "GitHub Pull Request"]],
            ["rel": "ArtifactLink", "url": "vstfs:///GitHub/PullRequest/\(shopRepositoryId.uppercased())%2F380"],
        ]
        var item = raw(61021, fields)
        item["relations"] = relations
        item["multilineFieldsFormat"] = ["Microsoft.VSTS.TCM.ReproSteps": "markdown"]
        return item
    }

    static var comments: [JSON] {[
        ["id": 3, "text": "<div>Vera · test-report — 14 checks passed, <b>1 failed</b>.</div>", "createdDate": "2026-11-11T09:00:00Z", "createdBy": ["displayName": "Koen"]],
        ["id": 2, "text": "Fix is in **#412**.", "format": "markdown", "createdDate": "2026-11-08T11:00:00Z", "createdBy": ["displayName": "Koen"]],
    ]}

    static var updates: [JSON] {[
        ["rev": 1, "revisedBy": ["displayName": "Lena"], "fields": ["System.ChangedDate": ["newValue": "2026-11-01T09:00:00Z"], "System.State": ["newValue": "New"]]],
    ]}

    /// The signed-in account; its address differs from the item's in case only.
    private static var account: JSON {
        ["providerDisplayName": "Koen", "properties": ["Account": ["$type": "System.String", "$value": "Koen@Example.com"]]]
    }

    /// Everything the page of item 61021 reads, keyed `METHOD path`.
    static var itemPage: [String: AdoStubURLProtocol.Answer] {
        [
            "GET /acme/_apis/wit/workitems/61021": .json(item),
            "GET /acme/_apis/wit/workItems/61021/updates": .json(["value": updates]),
            "GET /acme/Shop/_apis/wit/workItems/61021/comments": .json(["comments": comments]),
            "GET /acme/Shop/_apis/wit/workitemtypes/Product Backlog Item/states": .json(["value": states]),
            "GET /acme/_apis/connectionData": .json(["authenticatedUser": account]),
            "POST /acme/_apis/wit/workitemsbatch": batch([raw(60990, ["System.Id": 60990, "System.Title": "Checkout totals", "System.WorkItemType": "Epic"])]),
        ]
    }

    /// Answers from `table`; anything it doesn't list is ADO's 404.
    static func serve(_ table: [String: AdoStubURLProtocol.Answer]) {
        AdoStubURLProtocol.respond { request in table["\(request.method) \(request.path)"] ?? .notFound }
    }

    static let failingChecks = CheckSummary(total: 3, passed: 1, failed: 2, pending: 0, skipped: 0, segments: [])
    static let noChecks = CheckSummary(total: 0, passed: 0, failed: 0, pending: 0, skipped: 0, segments: [])

    /// A pull request of acme/shop as GitHub reports it.
    static func pullRequest(_ number: Int, title: String? = nil, state: PrState = .open, workItemIds: [Int] = [], checks: CheckSummary = failingChecks) -> PrSummary {
        PrSummary(
            owner: "acme", repo: "shop", number: number, key: "acme/shop#\(number)", account: "koen", title: title ?? "Change \(number)",
            url: "https://github.com/acme/shop/pull/\(number)", author: Person(login: "priya", name: "Priya", avatarUrl: nil), isMine: false, isDraft: false,
            state: state, headRef: "feat/\(number)", baseRef: "main", headSha: "h", createdAt: "2026-11-01T00:00:00Z", updatedAt: "2026-11-08T10:00:00Z",
            mergedAt: nil, additions: 1, deletions: 1, changedFiles: 1, labels: [], checks: checks, reviewDecision: nil, approvedBy: [], mergeable: .mergeable,
            bucket: .you, reason: PrReason(text: "", tone: .ok, icon: .review), workItemIds: workItemIds, snoozedUntil: nil, autoMerge: false,
            reviewedHeadSha: nil, requestedReviewerLogins: nil, requestedTeams: nil, latestReviews: nil, priorityScore: nil, failedChecks: nil
        )
    }
}

/// What a `@Sendable` closure saw, for a test to read back.
final class AdoRecorder<Value: Sendable>: Sendable {
    private let values = Mutex<[Value]>([])

    func add(_ value: Value) { values.withLock { $0.append(value) } }

    var all: [Value] { values.withLock { $0 } }
}
