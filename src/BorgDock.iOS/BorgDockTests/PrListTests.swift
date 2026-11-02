import XCTest
@testable import BorgDock

/// The Pull requests tab: the desktop list's filters, search, order and groups.
final class PrListTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func iso(hoursAgo: Double) -> String { now.addingTimeInterval(-hoursAgo * 3600).formatted(.iso8601) }

    private func pr(
        _ number: Int,
        repo: String = "shop",
        author: String = "sanne",
        mine: Bool = false,
        draft: Bool = false,
        bucket: String = "wait",
        failed: Int = 0,
        updatedHoursAgo: Double = 1,
        title: String? = nil
    ) throws -> PrSummary {
        let json: [String: Any] = [
            "owner": "acme", "repo": repo, "number": number, "key": "acme/\(repo)#\(number)", "account": "koen",
            "title": title ?? "Change \(number)", "url": "https://github.com/acme/\(repo)/pull/\(number)",
            "author": ["login": author, "name": author.capitalized + " Example", "avatarUrl": NSNull()],
            "isMine": mine, "isDraft": draft, "state": "open", "headRef": "feature-\(number)", "baseRef": "master", "headSha": "abc",
            "createdAt": iso(hoursAgo: 48), "updatedAt": iso(hoursAgo: updatedHoursAgo), "mergedAt": NSNull(),
            "additions": 10, "deletions": 2, "changedFiles": 1, "labels": [],
            "checks": ["total": 2, "passed": 2 - failed, "failed": failed, "pending": 0, "skipped": 0, "segments": []],
            "reviewDecision": NSNull(), "approvedBy": [], "mergeable": "mergeable", "bucket": bucket,
            "reason": ["text": "", "tone": "mute", "icon": "review"], "workItemIds": [61000 + number],
            "snoozedUntil": NSNull(), "autoMerge": false, "reviewedHeadSha": NSNull(),
        ]
        return try JSONDecoder().decode(PrSummary.self, from: JSONSerialization.data(withJSONObject: json))
    }

    func testFiltersMatchTheDesktopControl() throws {
        let prs = [
            try pr(1, mine: true, failed: 1),
            try pr(2, bucket: "you"),
            try pr(3),
        ]
        let query = PrListQuery()
        XCTAssertEqual(query.count(.all, in: prs), 3)
        XCTAssertEqual(query.count(.needsYou, in: prs), 1)
        XCTAssertEqual(query.count(.mine, in: prs), 1)
        XCTAssertEqual(query.count(.failing, in: prs), 1)
        XCTAssertEqual(PrListQuery(filter: .failing).visible(prs).map(\.number), [1])
    }

    func testSearchMatchesEveryWordAcrossTitleBranchAuthorAndWorkItem() throws {
        let prs = [try pr(1, author: "tom", title: "Basket timeout"), try pr(2, title: "Basket colours")]
        XCTAssertEqual(PrListQuery(search: "basket tom").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "feature-2").visible(prs).map(\.number), [2])
        XCTAssertEqual(PrListQuery(search: "AB#61001").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "#2").visible(prs).map(\.number), [2])
    }

    func testHideDraftsAppliesToCountsToo() throws {
        let prs = [try pr(1, draft: true), try pr(2)]
        let query = PrListQuery(hideDrafts: true)
        XCTAssertEqual(query.visible(prs).map(\.number), [2])
        XCTAssertEqual(query.count(.all, in: prs), 1)
    }

    func testMineFirstDraftsLastThenNewestUpdate() throws {
        let prs = [
            try pr(1, updatedHoursAgo: 1),
            try pr(2, draft: true, updatedHoursAgo: 0.5),
            try pr(3, mine: true, updatedHoursAgo: 10),
            try pr(4, updatedHoursAgo: 0.2),
        ]
        XCTAssertEqual(PrListQuery(grouping: .flat).groups(prs).flatMap(\.pullRequests).map(\.number), [3, 4, 1, 2])
    }

    func testNeedsYouIsPinnedAboveAuthorGroupsOnlyForAll() throws {
        let prs = [
            try pr(1, author: "tom", bucket: "you"),
            try pr(2, author: "tom"),
            try pr(3, author: "koen", mine: true),
            try pr(4, author: "sanne", updatedHoursAgo: 2),
            try pr(5, author: "sanne", updatedHoursAgo: 0.5),
        ]
        let groups = PrListQuery().groups(prs)
        XCTAssertEqual(groups.map(\.title), ["Needs you", "You", "Sanne Example", "Tom Example"])
        XCTAssertEqual(groups.map { $0.pullRequests.map(\.number) }, [[1], [3], [5, 4], [2]])
        XCTAssertFalse(PrListQuery(filter: .mine).groups(prs).contains { $0.id == PrListQuery.needsYouGroupId })
    }

    func testRepositoryGroupsPutReposWithYourPullRequestsFirst() throws {
        let prs = [try pr(1, repo: "api"), try pr(2, repo: "web", mine: true), try pr(3, repo: "docs")]
        XCTAssertEqual(PrListQuery(grouping: .repository).groups(prs).map(\.title), ["acme/web", "acme/api", "acme/docs"])
    }
}
