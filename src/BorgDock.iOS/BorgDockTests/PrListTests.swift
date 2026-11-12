import XCTest
@testable import BorgDock

/// The Pull requests tab: the pills, search, order, groups that fold, and Review all.
final class PrListTests: XCTestCase {
    private let me: Set<String> = ["koen"]

    func testPillsMatchTheirBuckets() throws {
        let prs = [
            try samplePR(1, mine: true, failed: 1),
            try samplePR(2, bucket: "you"),
            try samplePR(3, bucket: "ready"),
            try samplePR(4, extra: ["approvedBy": ["koen"]]),
            try samplePR(5),
        ]
        let query = PrListQuery(myLogins: me)
        XCTAssertEqual(PrListFilter.allCases.map(\.title), ["All", "Your turn", "Mine", "Failing", "Ready", "Waiting"])
        XCTAssertEqual(PrListFilter.allCases.map { query.count($0, in: prs) }, [5, 1, 1, 1, 1, 2])
        XCTAssertEqual(PrListQuery(filter: .failing).visible(prs).map(\.number), [1])
    }

    func testWaitingIsWhatInvolvesYouAndWaitsOnSomeoneElse() throws {
        XCTAssertTrue(try samplePR(1, mine: true).isWaitingOnOthers(myLogins: me), "yours under review")
        XCTAssertTrue(try samplePR(2, extra: ["reviewedHeadSha": "old"]).isWaitingOnOthers(myLogins: me), "you reviewed it")
        XCTAssertTrue(try samplePR(3, extra: ["approvedBy": ["Koen"]]).isWaitingOnOthers(myLogins: me), "you approved it")
        XCTAssertFalse(try samplePR(4).isWaitingOnOthers(myLogins: me), "a teammate's pull request you never touched")
        XCTAssertFalse(try samplePR(5, mine: true, draft: true).isWaitingOnOthers(myLogins: me), "a draft waits on its author")
        XCTAssertFalse(try samplePR(6, mine: true, bucket: "you").isWaitingOnOthers(myLogins: me))
    }

    func testSearchMatchesEveryWordAcrossTitleBranchAuthorAndWorkItem() throws {
        let prs = [try samplePR(1, author: "tom", title: "Basket timeout"), try samplePR(2, title: "Basket colours")]
        XCTAssertEqual(PrListQuery(search: "basket tom").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "feature-2").visible(prs).map(\.number), [2])
        XCTAssertEqual(PrListQuery(search: "AB#61001").visible(prs).map(\.number), [1])
        XCTAssertEqual(PrListQuery(search: "#2").visible(prs).map(\.number), [2])
    }

    func testHiddenDraftsLeaveTheCountsToo() throws {
        let prs = [try samplePR(1, draft: true), try samplePR(2)]
        let query = PrListQuery(showDrafts: false)
        XCTAssertEqual(query.visible(prs).map(\.number), [2])
        XCTAssertEqual(query.count(.all, in: prs), 1)
    }

    func testWaitingLongestPutsTheOldestFirstYoursFirstDraftsLast() throws {
        let prs = [
            try samplePR(1, extra: ["createdAt": sampleISO(hoursAgo: 10)]),
            try samplePR(2, draft: true, extra: ["createdAt": sampleISO(hoursAgo: 90)]),
            try samplePR(3, mine: true, extra: ["createdAt": sampleISO(hoursAgo: 1)]),
            try samplePR(4, extra: ["createdAt": sampleISO(hoursAgo: 50)]),
        ]
        let flat = PrListQuery(grouping: .flat, sort: .waiting)
        XCTAssertEqual(flat.groups(prs).flatMap(\.pullRequests).map(\.number), [3, 4, 1, 2])
        var others = flat
        others.mineFirst = false
        XCTAssertEqual(others.groups(prs).flatMap(\.pullRequests).map(\.number), [4, 1, 3, 2])
    }

    func testSmallestFirstCountsAddedAndRemovedLines() throws {
        let prs = [
            try samplePR(1, extra: ["additions": 50, "deletions": 50]),
            try samplePR(2, extra: ["additions": 5, "deletions": 1]),
            try samplePR(3, extra: ["additions": 40, "deletions": 0]),
        ]
        XCTAssertEqual(PrListQuery(grouping: .flat, sort: .smallest).groups(prs).flatMap(\.pullRequests).map(\.number), [2, 3, 1])
    }

    func testTheAgeOnARowIsWhatTheListSortsBy() throws {
        let pr = try samplePR(1, updatedHoursAgo: 2)
        XCTAssertEqual(PrListSort.waiting.shownDate(pr), pr.createdAt)
        XCTAssertEqual(PrListSort.newest.shownDate(pr), pr.createdAt)
        XCTAssertEqual(PrListSort.updated.shownDate(pr), pr.updatedAt)
    }

    func testNoGroupIsPinnedAboveTheAuthorsAndYoursComeFirst() throws {
        let prs = [
            try samplePR(1, author: "tom", bucket: "you", extra: ["createdAt": sampleISO(hoursAgo: 20)]),
            try samplePR(2, author: "tom", extra: ["createdAt": sampleISO(hoursAgo: 30)]),
            try samplePR(3, author: "koen", mine: true),
            try samplePR(4, author: "sanne", extra: ["createdAt": sampleISO(hoursAgo: 90)]),
            try samplePR(5, author: "sanne", extra: ["createdAt": sampleISO(hoursAgo: 5)]),
        ]
        let groups = PrListQuery().groups(prs)
        XCTAssertEqual(groups.map(\.title), ["You", "Sanne Example", "Tom Example"], "groups follow their longest-waiting pull request")
        XCTAssertEqual(groups.map { $0.pullRequests.map(\.number) }, [[3], [4, 5], [2, 1]])
        XCTAssertEqual(groups.map(\.id), ["author:koen", "author:sanne", "author:tom"])
        XCTAssertTrue(groups[1].namesAuthor)
    }

    func testRepositoryGroupsPutReposWithYourPullRequestsFirst() throws {
        let prs = [try samplePR(1, repo: "api"), try samplePR(2, repo: "web", mine: true), try samplePR(3, repo: "docs")]
        XCTAssertEqual(PrListQuery(grouping: .repository, sort: .title).groups(prs).map(\.title), ["acme/web", "acme/api", "acme/docs"])
    }

    func testStatusGroupsGoYourTurnReadyWaitingStale() throws {
        let prs = [
            try samplePR(1, bucket: "stale"),
            try samplePR(2, bucket: "wait"),
            try samplePR(3, bucket: "ready"),
            try samplePR(4, bucket: "you"),
        ]
        let groups = PrListQuery(grouping: .status).groups(prs)
        XCTAssertEqual(groups.map(\.title), ["Your turn", "Ready to merge", "Waiting on others", "Stale"])
        XCTAssertEqual(groups.map(\.id), ["status:you", "status:ready", "status:wait", "status:stale"])
    }

    func testDependencyUpdatesBecomeOneGroupAtTheEnd() throws {
        let prs = [
            try samplePR(1, author: "dependabot[bot]", extra: ["createdAt": sampleISO(hoursAgo: 99)]),
            try samplePR(2, author: "tom"),
            try samplePR(3, author: "app/renovate"),
        ]
        let together = PrListQuery(grouping: .repository).groups(prs)
        XCTAssertEqual(together.map(\.title), ["acme/shop", "Dependency updates"])
        XCTAssertEqual(together.last?.pullRequests.map(\.number), [1, 3])
        XCTAssertEqual(PrListQuery(grouping: .repository, dependenciesTogether: false).groups(prs).map(\.title), ["acme/shop"])
        XCTAssertEqual(PrListQuery(grouping: .flat).groups(prs).count, 1, "without groups there is nothing to gather")
    }

    func testDependencyBotsWithEverySpelling() throws {
        for login in ["dependabot", "dependabot[bot]", "app/dependabot", "renovate[bot]", "Renovate"] {
            XCTAssertTrue(try samplePR(1, author: login).isDependencyUpdate, login)
        }
        XCTAssertFalse(try samplePR(1, author: "renovator").isDependencyUpdate)
    }

    func testAFoldedGroupSaysWhatNeedsAttentionFirst() throws {
        let yours = [
            try samplePR(1, mine: true, failed: 1),
            try samplePR(2, mine: true, failed: 2),
            try samplePR(3, mine: true, bucket: "ready"),
        ]
        XCTAssertEqual(PrGroupSummary.parts(yours, now: samplePRNow), [
            PrGroupSummary.Part(text: "2 failing", alert: true), PrGroupSummary.Part(text: "1 ready to merge"),
        ])
        let toms = [try samplePR(4, bucket: "you"), try samplePR(5, extra: ["createdAt": sampleISO(hoursAgo: 50)])]
        XCTAssertEqual(PrGroupSummary.parts(toms, now: samplePRNow).map(\.text), ["1 asks you", "oldest 2 d"])
        XCTAssertEqual(PrGroupSummary.parts([try samplePR(6)], now: samplePRNow).map(\.text), ["oldest 2 d"])
    }

    func testReviewAllRunsTheAuthorsPullRequestsYouCanApproveOldestFirst() throws {
        let prs = [
            try samplePR(1, author: "priya", extra: ["createdAt": sampleISO(hoursAgo: 10)]),
            try samplePR(2, author: "priya", extra: ["createdAt": sampleISO(hoursAgo: 200)]),
            try samplePR(3, author: "priya", failed: 1),
            try samplePR(4, author: "priya", extra: ["mergeable": "conflicting"]),
            try samplePR(5, author: "priya", extra: ["reviewDecision": "changes_requested"]),
            try samplePR(6, author: "priya", draft: true),
            try samplePR(7, author: "priya", extra: ["approvedBy": ["koen"], "reviewedHeadSha": "abc"]),
            try samplePR(8, author: "priya", extra: ["approvedBy": ["koen"], "reviewedHeadSha": "older"]),
            try samplePR(9, author: "tom"),
        ]
        XCTAssertEqual(AuthorRun.queue(prs, author: "Priya", myLogins: me).map(\.number), [2, 8, 1])
        XCTAssertTrue(AuthorRun.queue(prs, author: "koen", myLogins: me).isEmpty, "never your own")
    }

    func testGroupsFoldByDefaultUntilYouOpenThemAndSurviveAsOneLineEach() {
        var folds = GroupFolds(rawValue: "author:tom\nrepo:acme/shop")
        XCTAssertTrue(folds.isFolded("repo:acme/shop", byDefault: false), "older builds stored folded groups only")
        XCTAssertTrue(folds.isFolded("author:sam", byDefault: true), "untouched groups follow the default")
        XCTAssertFalse(folds.isFolded("author:sam", byDefault: false))
        folds.toggle("author:sam", byDefault: true)
        XCTAssertFalse(folds.isFolded("author:sam", byDefault: true), "opened stays open in the folded-by-default view")
        folds.toggle("author:tom", byDefault: false)
        XCTAssertEqual(folds.rawValue, "+author:sam\n+author:tom\n-repo:acme/shop")
        XCTAssertEqual(GroupFolds(rawValue: folds.rawValue), folds)
        folds.fold(["author:sam", "author:tom"])
        XCTAssertEqual(folds.rawValue, "-author:sam\n-author:tom\n-repo:acme/shop")
        XCTAssertEqual(GroupFolds(rawValue: ""), GroupFolds())
    }

    func testFoldedGroupsNextToEachOtherShareACard() {
        let groups = ["a", "b", "c", "d", "e"].map { PrListGroup(id: $0, title: $0, kind: .all, pullRequests: []) }
        let runs = GroupRun.runs(groups) { $0.id != "c" }
        XCTAssertEqual(runs.map(\.id), ["folded:a,b", "c", "folded:d,e"])
        XCTAssertEqual(GroupRun.runs(groups) { _ in false }.count, 5)
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
