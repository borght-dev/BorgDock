import XCTest
@testable import BorgDock

/// The pure cases of the server's `test/item-detail.test.ts`: ADO's links, an item's history and which pull requests
/// belong to it. Same inputs, same answers; add a case on both sides.
final class AdoItemPullRequestsTests: XCTestCase {
    private let guid = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
    private let shopRepositoryId = "a1b2c3d4-0000-4000-8000-000000000001"

    func testAdoPullRequestLinksCarryAdosRepositoryIdInEitherCaseOfTheEncodedSlash() {
        XCTAssertEqual(AdoPullRequestLink(artifactURL: "vstfs:///GitHub/PullRequest/\(shopRepositoryId.uppercased())%2f412"), AdoPullRequestLink(repositoryId: shopRepositoryId, number: 412))
        XCTAssertEqual(AdoPullRequestLink(artifactURL: "vstfs:///GitHub/PullRequest/\(shopRepositoryId)%2F7"), AdoPullRequestLink(repositoryId: shopRepositoryId, number: 7))
        XCTAssertNil(AdoPullRequestLink(artifactURL: "vstfs:///Git/Commit/x%2fy"))
    }

    func testHistoryCreatedStateMovesAssignmentsAndLinkedPullRequestsNewestFirst() throws {
        let updates = try JSONDecoder().decode([AdoUpdate].self, from: Data("""
        [
          { "rev": 1, "revisedBy": { "displayName": "Lena" }, "revisedDate": "2026-11-01T09:00:00Z", "fields": {
            "System.State": { "newValue": "New" }, "System.CreatedDate": { "newValue": "2026-11-01T09:00:00Z" }, "System.ChangedDate": { "newValue": "2026-11-01T09:00:00Z" },
            "System.AssignedTo": { "newValue": { "displayName": "Koen" } } } },
          { "rev": 2, "revisedBy": { "displayName": "Priya" }, "fields": { "System.ChangedDate": { "oldValue": "2026-11-01T09:00:00Z", "newValue": "2026-11-08T10:00:00Z" } },
            "relations": { "added": [
              { "rel": "ArtifactLink", "url": "vstfs:///GitHub/PullRequest/\(shopRepositoryId)%2f412" },
              { "rel": "AttachedFile", "url": "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)" } ] } },
          { "rev": 3, "revisedBy": { "displayName": "Koen" }, "fields": {
            "System.ChangedDate": { "newValue": "2026-11-09T10:00:00Z" }, "System.State": { "oldValue": "Code Review", "newValue": "Testing" },
            "System.AssignedTo": { "oldValue": { "displayName": "Koen" }, "newValue": { "displayName": "Lena" } } } },
          { "rev": 4, "revisedBy": { "displayName": "Lena" }, "revisedDate": "9999-01-01T00:00:00Z", "fields": {
            "System.ChangedDate": { "newValue": "2026-11-11T08:00:00Z" }, "System.State": { "oldValue": "Testing", "newValue": "Testing Failed" },
            "System.Title": { "oldValue": "a", "newValue": "b" } } }
        ]
        """.utf8))
        XCTAssertEqual(AdoHistory.events(of: updates), [
            ItemHistoryEvent(at: "2026-11-11T08:00:00Z", by: "Lena", kind: .state, from: "Testing", to: "Testing Failed"),
            ItemHistoryEvent(at: "2026-11-09T10:00:00Z", by: "Koen", kind: .assigned, from: "Koen", to: "Lena"),
            ItemHistoryEvent(at: "2026-11-09T10:00:00Z", by: "Koen", kind: .state, from: "Code Review", to: "Testing"),
            ItemHistoryEvent(at: "2026-11-08T10:00:00Z", by: "Priya", kind: .pullRequest, from: nil, to: nil, pullRequest: 412),
            ItemHistoryEvent(at: "2026-11-01T09:00:00Z", by: "Lena", kind: .created, from: nil, to: "New"),
        ])
    }

    func testHistoryNamesAPersonWrittenWithAnAddressAndDatesAChangeWithoutAChangedDate() throws {
        let updates = try JSONDecoder().decode([AdoUpdate].self, from: Data("""
        [
          { "rev": 1, "revisedDate": "2026-11-01T09:00:00Z", "fields": { "System.ChangedBy": { "newValue": "Lena Example <lena@example.com>" } } },
          { "rev": 2, "revisedDate": "2026-11-02T09:00:00Z", "fields": { "System.State": { "oldValue": "New", "newValue": "New" }, "System.AssignedTo": { "newValue": "Priya Example <priya@example.com>" } } }
        ]
        """.utf8))
        XCTAssertEqual(AdoHistory.events(of: updates), [
            ItemHistoryEvent(at: "2026-11-02T09:00:00Z", by: "Unknown", kind: .assigned, from: nil, to: "Priya Example"),
            ItemHistoryEvent(at: "2026-11-01T09:00:00Z", by: "Lena Example", kind: .created, from: nil, to: nil),
        ], "a state that didn't change is no move")
    }

    private func candidate(
        _ number: Int, repository: String = "acme/shop", title: String? = nil, branch: String? = nil, state: PullRequestState = .open,
        mentions: [Int] = [], onItemThread: Bool = false
    ) -> AdoCandidatePullRequest {
        AdoCandidatePullRequest(
            repository: repository, number: number, url: "https://github.com/\(repository)/pull/\(number)", title: title ?? "Change \(number)", branch: branch,
            state: state, isDraft: false, checks: nil, author: "Priya", updatedAt: "2026-11-08T10:00:00Z", mentions: mentions, onItemThread: onItemThread
        )
    }

    func testPullRequestsItsOwnFirstAPlanPrOnSeveralItemsIsSharedNumbersFromAdoCountOnlyInAKnownRepository() {
        let rows = AdoItemPullRequests.rows(
            itemId: 61021,
            links: [AdoPullRequestLink(repositoryId: shopRepositoryId, number: 398), AdoPullRequestLink(repositoryId: "unknown-repo", number: 77)],
            myItems: [
                AdoLinkedItem(id: 61021, links: []),
                AdoLinkedItem(id: 61022, links: [AdoPullRequestLink(repositoryId: shopRepositoryId, number: 398)]),
                AdoLinkedItem(id: 61023, links: []),
            ],
            candidates: [
                candidate(398, title: "Checkout totals plan", mentions: [61022, 61023]),
                candidate(412, title: "Round totals per line AB#61021", state: .merged),
                candidate(420, title: "Tidy the invoice export", branch: "fix/61021-invoice"),
                candidate(430, title: "Unrelated"),
                candidate(77, repository: "globex/portal", title: "Same number, other repository"),
                candidate(501, title: "Mentions it in the body", mentions: [61021]),
                candidate(502, title: "Names AB#61022 too", mentions: [61021, 61022]),
            ],
            repositories: [shopRepositoryId: "acme/shop"]
        )
        XCTAssertEqual(rows.map(\.number), [420, 412, 502, 501, 398])
        XCTAssertEqual(rows.map(\.own), [true, true, false, false, false])
        XCTAssertEqual(rows.map(\.shared), [false, false, false, false, true])
        XCTAssertEqual(rows.first?.repository, "acme/shop")
    }

    func testAThreadOnTheItemLinksItsPullRequestByNumberAloneAsTheOverviewDoesOnlyThere() {
        let rows = AdoItemPullRequests.rows(
            itemId: 61021, links: [AdoPullRequestLink(repositoryId: "unknown-repo", number: 9)],
            candidates: [candidate(9, title: "Agent work", onItemThread: true), candidate(9, repository: "globex/portal")],
            repositories: [:]
        )
        XCTAssertEqual(rows.map(\.url), ["https://github.com/acme/shop/pull/9"])
    }

    func testAnAdoRepositoryIdIsLearnedFromAPullRequestWithItsNumberThatNamesTheItem() {
        let links = [AdoPullRequestLink(repositoryId: shopRepositoryId, number: 412), AdoPullRequestLink(repositoryId: "b-repo", number: 5)]
        let learned = AdoItemPullRequests.learnRepositories(itemId: 61021, links: links, candidates: [
            candidate(412, title: "Round totals AB#61021"),
            candidate(5, title: "Names nothing"),
            candidate(5, repository: "globex/portal", title: "AB#61021 here"),
            candidate(5, repository: "globex/api", title: "AB#61021 there"),
        ], known: [:])
        XCTAssertEqual(learned, [shopRepositoryId: "acme/shop"], "two repositories with #5 naming the item: not learned")
    }

    func testAnAttachmentUrlNamesItsGuidAndFile() {
        XCTAssertEqual(
            AdoAttachment(url: "https://dev.azure.com/acme/0f1e/_apis/wit/attachments/\(guid.uppercased())?fileName=invoice%20export.png").map { [$0.guid, $0.name] },
            [guid, "invoice export.png"]
        )
        XCTAssertNil(AdoAttachment(url: "https://example.com/logo.png"))
    }

    // MARK: Only here

    func testATitleOrBranchNamesAnItemByItsNumberAsAWord() {
        XCTAssertTrue(AdoItemPullRequests.names("Round totals AB#61021", item: 61021))
        XCTAssertTrue(AdoItemPullRequests.names("AB61021 round totals", item: 61021))
        XCTAssertTrue(AdoItemPullRequests.names("fix/61021-invoice", item: 61021))
        XCTAssertTrue(AdoItemPullRequests.names("61021", item: 61021))
        XCTAssertFalse(AdoItemPullRequests.names("Order 161021 is late", item: 61021), "inside a longer number")
        XCTAssertFalse(AdoItemPullRequests.names("AB#610210", item: 61021))
        XCTAssertFalse(AdoItemPullRequests.names("v61021 release", item: 61021), "glued to a word that isn't AB")
        XCTAssertFalse(AdoItemPullRequests.names("fix/61021_invoice", item: 61021), "an underscore is part of the word")
    }

    func testChecksReadAsOneWordAndAGitHubAddressNamesItsRepository() {
        func checks(total: Int, failed: Int = 0, pending: Int = 0) -> CheckSummary {
            CheckSummary(total: total, passed: total - failed - pending, failed: failed, pending: pending, skipped: 0, segments: [])
        }
        XCTAssertNil(AdoItemPullRequests.checksLabel(checks(total: 0)))
        XCTAssertEqual(AdoItemPullRequests.checksLabel(checks(total: 3, failed: 2, pending: 1)), "failing")
        XCTAssertEqual(AdoItemPullRequests.checksLabel(checks(total: 3, pending: 1)), "pending")
        XCTAssertEqual(AdoItemPullRequests.checksLabel(checks(total: 3)), "passing")
        XCTAssertEqual(AdoItemPullRequests.repository(ofURL: "https://github.com/acme/shop.web/pull/412/files"), "acme/shop.web")
        XCTAssertNil(AdoItemPullRequests.repository(ofURL: "https://example.com/acme/shop/pull/412"))
    }

    func testOneRowPerPullRequestTheFirstSourceWinsAndAKnownStateBeatsUnknown() {
        var fromAThread = candidate(412, title: "", branch: "fix/61021-round-totals", state: .unknown, onItemThread: true)
        fromAThread.author = nil
        let merged = AdoItemPullRequests.merge([fromAThread, candidate(412, title: "Round totals per line", state: .merged, mentions: [61021])])
        XCTAssertEqual(merged.count, 1)
        XCTAssertEqual(merged.first?.title, "Round totals per line")
        XCTAssertEqual(merged.first?.branch, "fix/61021-round-totals")
        XCTAssertEqual(merged.first?.state, .merged)
        XCTAssertEqual(merged.first?.author, "Priya")
        XCTAssertEqual(merged.first?.mentions, [61021])
        XCTAssertEqual(merged.first?.onItemThread, true)
    }
}
