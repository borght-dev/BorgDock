import XCTest
@testable import BorgDock

/// The Pull requests tab: the desktop list's filters, search, order and groups.
final class PrListTests: XCTestCase {
    func testFiltersMatchTheDesktopControl() throws {
        let prs = [
            try samplePR(1, mine: true, failed: 1),
            try samplePR(2, bucket: "you"),
            try samplePR(3),
        ]
        let query = PrListQuery()
        XCTAssertEqual(query.count(.all, in: prs), 3)
        XCTAssertEqual(query.count(.needsYou, in: prs), 1)
        XCTAssertEqual(query.count(.mine, in: prs), 1)
        XCTAssertEqual(query.count(.failing, in: prs), 1)
        XCTAssertEqual(PrListQuery(filter: .failing).visible(prs).map(\.number), [1])
    }

    func testSearchMatchesEveryWordAcrossTitleBranchAuthorAndWorkItem() throws {
        let prs = [try samplePR(1, author: "tom", title: "Basket timeout"), try samplePR(2, title: "Basket colours")]
        XCTAssertEqual(PrListQuery(search: "basket tom").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "feature-2").visible(prs).map(\.number), [2])
        XCTAssertEqual(PrListQuery(search: "AB#61001").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "#2").visible(prs).map(\.number), [2])
    }

    func testHideDraftsAppliesToCountsToo() throws {
        let prs = [try samplePR(1, draft: true), try samplePR(2)]
        let query = PrListQuery(hideDrafts: true)
        XCTAssertEqual(query.visible(prs).map(\.number), [2])
        XCTAssertEqual(query.count(.all, in: prs), 1)
    }

    func testMineFirstDraftsLastThenNewestUpdate() throws {
        let prs = [
            try samplePR(1, updatedHoursAgo: 1),
            try samplePR(2, draft: true, updatedHoursAgo: 0.5),
            try samplePR(3, mine: true, updatedHoursAgo: 10),
            try samplePR(4, updatedHoursAgo: 0.2),
        ]
        XCTAssertEqual(PrListQuery(grouping: .flat).groups(prs).flatMap(\.pullRequests).map(\.number), [3, 4, 1, 2])
    }

    func testNeedsYouIsPinnedAboveAuthorGroupsOnlyForAll() throws {
        let prs = [
            try samplePR(1, author: "tom", bucket: "you"),
            try samplePR(2, author: "tom"),
            try samplePR(3, author: "koen", mine: true),
            try samplePR(4, author: "sanne", updatedHoursAgo: 2),
            try samplePR(5, author: "sanne", updatedHoursAgo: 0.5),
        ]
        let groups = PrListQuery().groups(prs)
        XCTAssertEqual(groups.map(\.title), ["Needs you", "You", "Sanne Example", "Tom Example"])
        XCTAssertEqual(groups.map { $0.pullRequests.map(\.number) }, [[1], [3], [5, 4], [2]])
        XCTAssertFalse(PrListQuery(filter: .mine).groups(prs).contains { $0.id == PrListQuery.needsYouGroupId })
    }

    func testRepositoryGroupsPutReposWithYourPullRequestsFirst() throws {
        let prs = [try samplePR(1, repo: "api"), try samplePR(2, repo: "web", mine: true), try samplePR(3, repo: "docs")]
        XCTAssertEqual(PrListQuery(grouping: .repository).groups(prs).map(\.title), ["acme/web", "acme/api", "acme/docs"])
    }

    func testStatusGroupsGoNeedsYouReadyWaitingStale() throws {
        let prs = [
            try samplePR(1, bucket: "stale"),
            try samplePR(2, bucket: "wait"),
            try samplePR(3, bucket: "ready"),
            try samplePR(4, bucket: "you"),
            try samplePR(5, mine: true, bucket: "wait"),
        ]
        let groups = PrListQuery(grouping: .status).groups(prs)
        XCTAssertEqual(groups.map(\.title), ["Needs you", "Ready to merge", "Waiting on others", "Stale"])
        XCTAssertEqual(groups.map { $0.pullRequests.map(\.number) }, [[4], [3], [5, 2], [1]])
        XCTAssertEqual(groups.first?.id, PrListQuery.needsYouGroupId, "the pinned group's icon")
        XCTAssertNil(groups.first { $0.title == "Needs you" && $0.id != PrListQuery.needsYouGroupId }, "not pinned twice")
    }

    func testTheTrackShowsWhereAPullRequestIsStuck() throws {
        let toReview = try samplePR(1, bucket: "you")
        XCTAssertEqual(toReview.track, [
            PrTrackStep(label: "Checks", mark: .done), PrTrackStep(label: "Your review", mark: .yours), PrTrackStep(label: "Merge", mark: .open),
        ])
        let failing = try samplePR(2, mine: true, bucket: "you", failed: 1)
        XCTAssertEqual(failing.track.map(\.mark), [.failed, .open, .open])
        XCTAssertEqual(failing.track[0].label, "1 failing")
        let changes = try samplePR(3, mine: true, extra: ["reviewDecision": "changes_requested"])
        XCTAssertEqual(changes.track[1], PrTrackStep(label: "Changes", mark: .attention))
        let ready = try samplePR(4, mine: true, bucket: "ready", extra: ["reviewDecision": "approved", "approvedBy": ["sanne", "tom"]])
        XCTAssertEqual(ready.track.map(\.label), ["Checks", "2 approvals", "Ready"])
        let conflicting = try samplePR(5, extra: ["mergeable": "conflicting", "approvedBy": ["sanne"]])
        XCTAssertEqual(conflicting.track.map(\.label), ["Checks", "Approved", "Conflicts"], "an approval counts without branch protection")
        let auto = try samplePR(6, extra: ["autoMerge": true, "checks": ["total": 3, "passed": 1, "failed": 0, "pending": 2, "skipped": 0, "segments": []]])
        XCTAssertEqual(auto.track.map(\.mark), [.running, .open, .running])
    }
}
