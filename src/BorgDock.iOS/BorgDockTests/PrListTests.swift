import XCTest
@testable import BorgDock

/// The Pull requests list: the desktop's facts, groups, order, tabs and Filter values (`services/pr-list/__tests__`),
/// plus the phone's folds, runs, track and Review all.
final class PrListTests: XCTestCase {
    private let me: Set<String> = [listMe]
    private let ctx = PrQuery.Context(logins: [listMe], now: samplePRNow)

    private func numbers(_ facts: [PrFacts]) -> [Int] { facts.map(\.pr.number) }

    // MARK: - Facts

    func testBucketsFollowTheDesktop() throws {
        XCTAssertEqual(try listFacts(author: "mira", requested: [listMe]).bucket, .yourTurn, "your review")
        XCTAssertEqual(try listFacts(checks: listRed).bucket, .yourTurn, "yours, failing")
        XCTAssertEqual(try listFacts(reviews: [("mira", "commented")]).bucket, .yourTurn, "comments on yours")
        XCTAssertEqual(try listFacts(extra: ["mergeable": "conflicting"]).bucket, .yourTurn, "conflicts on yours")
        XCTAssertEqual(try listFacts(author: "mira", checks: listRed).bucket, .failing)
        XCTAssertEqual(try listFacts(author: "mira", reviews: [("jules", "approved")]).bucket, .ready)
        XCTAssertEqual(try listFacts(author: "mira").bucket, .waiting)
        XCTAssertEqual(try listFacts(author: "mira", draft: true, requested: [listMe]).bucket, .draft, "a draft is never your turn")
    }

    func testYouApprovingThisHeadEndsYourTurn() throws {
        let approved = try listFacts(author: "mira", requested: [listMe], extra: ["latestReviews": [["login": "Koen", "state": "approved", "commitSha": "abc"]]])
        XCTAssertFalse(approved.waitingOnMe)
        let pushedSince = try listFacts(author: "mira", requested: [listMe], extra: ["latestReviews": [["login": "koen", "state": "approved", "commitSha": "old"]]])
        XCTAssertTrue(pushedSince.waitingOnMe)
    }

    func testTheNextStepSaysWhoActs() throws {
        XCTAssertEqual(try listFacts(draft: true).next.label, "Finish the draft")
        XCTAssertEqual(try listFacts(author: "mira", requested: [listMe]).next, NextStep(label: "Your review", waitingOn: .you, tone: .you))
        XCTAssertEqual(try listFacts(author: "mira", extra: ["mergeable": "conflicting"]).next.label, "Conflicts · mira")
        XCTAssertEqual(try listFacts(author: "mira", checks: listRed).next.waitingOn, .author)
        XCTAssertEqual(try listFacts(author: "mira", checks: listRunning).next.waitingOn, .ci)
        XCTAssertEqual(try listFacts(reviews: [("mira", "approved")]).next.label, "Merge")
        XCTAssertEqual(try listFacts(author: "mira", requested: ["jules"], teams: ["web"]).next.label, "Review · jules, @web")
        XCTAssertEqual(try listFacts().next.label, "Request a review")
        XCTAssertEqual(try listFacts(author: "mira").next.label, "Needs a reviewer")
    }

    func testAnOlderServerWithoutReviewsStillDecodes() throws {
        let pr = try samplePR(1, author: "mira", extra: ["approvedBy": ["jules"]])
        XCTAssertNil(pr.latestReviews)
        XCTAssertEqual(pr.reviewStatus, .approved)
        XCTAssertEqual(PrFacts(pr, PrFactsContext(logins: me, now: samplePRNow)).bucket, .ready)
    }

    // MARK: - Groups

    func testFixedGroupingsKeepTheirOrder() throws {
        let facts = [
            try listFacts(number: 1, author: "mira", draft: true),
            try listFacts(number: 2, author: "mira"),
            try listFacts(number: 3, author: "mira", reviews: [("jules", "approved")]),
            try listFacts(number: 4, author: "mira", requested: [listMe]),
        ]
        let groups = PrGroups.group(facts, by: .status, showEmpty: false)
        XCTAssertEqual(groups.map(\.key), ["status:yourTurn", "status:waiting", "status:ready", "status:draft"])
        XCTAssertEqual(groups.map { numbers($0.facts) }, [[4], [2], [3], [1]])
        XCTAssertEqual(groups.first?.hint, PrStatusBucket.yourTurn.hint)
        XCTAssertEqual(PrGroups.group([], by: .review, showEmpty: true).map(\.label), ReviewKey.allCases.map(\.label))
        XCTAssertEqual(PrGroups.group([], by: .size, showEmpty: false), [])
    }

    func testAuthorsGoYouFirstThenMostPullRequestsThenLogin() throws {
        let facts = try [("Sasha", 1), ("mira", 2), ("jules", 3), ("mira", 4), (listMe, 5), ("jules", 6)].map { try listFacts(number: $0.1, author: $0.0) }
        let groups = PrGroups.group(facts, by: .author, showEmpty: false)
        XCTAssertEqual(groups.map(\.key), ["author:koen", "author:jules", "author:mira", "author:sasha"])
        XCTAssertEqual(groups.map(\.displayTitle), ["You", "Jules Example", "Mira Example", "Sasha Example"])
    }

    func testRepositoriesWithYoursComeFirstThenByName() throws {
        let facts = try [("web", "mira"), ("web", "mira"), ("shop", "mira"), ("shop", listMe), ("billing", "mira"), ("api", listMe)].enumerated()
            .map { try listFacts(number: $0.offset + 1, repo: $0.element.0, author: $0.element.1) }
        XCTAssertEqual(PrGroups.group(facts, by: .repo, showEmpty: false).map(\.label), ["acme/api", "acme/shop", "acme/billing", "acme/web"])
    }

    func testFreeGroupingsPutTheNoneGroupLast() throws {
        let facts = [
            try listFacts(number: 1, extra: ["labels": []]),
            try listFacts(number: 2, extra: ["labels": [["name": "ui", "color": "fff"], ["name": "bug", "color": "fff"]]]),
            try listFacts(number: 3, extra: ["labels": [["name": "bug", "color": "fff"]]]),
        ]
        let groups = PrGroups.group(facts, by: .label, showEmpty: false)
        XCTAssertEqual(groups.map(\.label), ["bug", "No label"], "a pull request with several labels is grouped under the first")
        XCTAssertEqual(numbers(groups[0].facts), [2, 3])
    }

    func testPinnedYourTurnAndGroupsInsideGroups() throws {
        let facts = [
            try listFacts(number: 1, repo: "web", author: "mira", requested: [listMe]),
            try listFacts(number: 2, repo: "web", author: "mira"),
            try listFacts(number: 3, repo: "api", author: "jules"),
        ]
        var display = PrDisplay()
        display.groupBy = .repo
        let pinned = PrGroups.build(facts, display: display, pin: display.pinsYourTurn)
        XCTAssertEqual(pinned.map(\.key), [PrGroups.yourTurnKey, "repo:acme/api", "repo:acme/web"])
        XCTAssertEqual(numbers(pinned[2].facts), [2], "a pinned pull request leaves its group")
        display.groupBy = .status
        XCTAssertFalse(display.pinsYourTurn, "status already leads with Your turn")
        display.subGroupBy = .repo
        let nested = PrGroups.build(facts, display: display, pin: false)
        XCTAssertEqual(nested.map(\.key), ["status:yourTurn", "status:waiting"])
        XCTAssertEqual(nested[1].subgroups.map(\.key), ["status:waiting/repo:acme/api", "status:waiting/repo:acme/web"])
        display.subGroupBy = .status
        XCTAssertTrue(PrGroups.build(facts, display: display, pin: false).allSatisfy(\.subgroups.isEmpty), "the same grouping twice is one level")
    }

    func testQuietGroupsFoldWhenAsked() throws {
        let groups = PrGroups.group([try listFacts(number: 1, author: "mira"), try listFacts(number: 2, author: "jules", requested: [listMe])], by: .author, showEmpty: false)
        XCTAssertEqual(groups.map(\.quiet), [false, true])
        XCTAssertEqual(groups.map { PrGroups.isFolded($0, folds: GroupFolds(), collapseQuiet: true) }, [false, true])
        XCTAssertEqual(groups.map { PrGroups.isFolded($0, folds: GroupFolds(), collapseQuiet: false) }, [false, false])
    }

    // MARK: - Order

    func testPriorityIsBucketThenScoreThenOldest() throws {
        let facts = [
            try listFacts(number: 1, author: "mira", extra: ["priorityScore": 5]),
            try listFacts(number: 2, author: "mira", extra: ["priorityScore": 20]),
            try listFacts(number: 3, author: "mira", requested: [listMe]),
            try listFacts(number: 4, author: "mira", extra: ["priorityScore": 5, "createdAt": sampleISO(hoursAgo: 300)]),
        ]
        XCTAssertEqual(numbers(PrGroups.sort(facts, by: .priority, .desc)), [3, 2, 4, 1])
    }

    func testOrdersRunEitherWayAndTiesGoToTheHigherNumber() throws {
        let facts = [
            try listFacts(number: 1, title: "beta", extra: ["additions": 50, "deletions": 50, "createdAt": sampleISO(hoursAgo: 10)]),
            try listFacts(number: 2, title: "Alpha", extra: ["additions": 5, "deletions": 1, "createdAt": sampleISO(hoursAgo: 90)]),
            try listFacts(number: 3, title: "gamma", extra: ["additions": 5, "deletions": 1, "createdAt": sampleISO(hoursAgo: 50)]),
        ]
        XCTAssertEqual(numbers(PrGroups.sort(facts, by: .size, .asc)), [3, 2, 1])
        XCTAssertEqual(numbers(PrGroups.sort(facts, by: .created, .asc)), [2, 3, 1])
        XCTAssertEqual(numbers(PrGroups.sort(facts, by: .created, .desc)), [1, 3, 2])
        XCTAssertEqual(numbers(PrGroups.sort(facts, by: .title, .asc)), [2, 1, 3])
        XCTAssertEqual(PrSortBy.priority.directionLabel(.desc), "Most urgent first")
        XCTAssertEqual(PrSortBy.created.directionLabel(.asc), "Oldest first")
    }

    // MARK: - Tabs and counts

    func testTabsCountWithoutTheQueryAndSavedViewsWithTheirOwn() throws {
        let facts = [
            try listFacts(number: 1, checks: listRed),
            try listFacts(number: 2, author: "mira", requested: [listMe]),
            try listFacts(number: 3, author: "mira", reviews: [("jules", "approved")]),
            try listFacts(number: 4, author: "mira", updatedHoursAgo: 10 * 24),
        ]
        let saved = SavedPrView(id: "v1", name: "Mira", filter: .all, query: "author:mira", display: PrDisplay())
        let model = PrListModel(.init(facts: facts, logins: me, now: samplePRNow, view: .all, query: "repo:nope", display: PrDisplay(), savedViews: [saved]))
        XCTAssertEqual(PrViewKey.allCases.map { model.counts[$0] }, [4, 2, 1, 1, 1, 1])
        XCTAssertEqual(model.savedCounts["v1"], 3)
        XCTAssertTrue(model.rows.isEmpty)
        XCTAssertEqual(PrViewKey.allCases.map(\.pillLabel), ["All", "Your turn", "Mine", "Failing", "Ready", "Stale"])

        let hidden = PrListModel(.init(facts: facts, logins: me, now: samplePRNow, view: .all, query: "", hideFailing: true, display: PrDisplay()))
        XCTAssertEqual(hidden.counts[.all], 3)
        XCTAssertEqual(hidden.counts[.failing], 1, "Failing still counts them")
        XCTAssertEqual(numbers(PrListModel(.init(facts: facts, logins: me, now: samplePRNow, view: .failing, query: "", hideFailing: true, display: PrDisplay())).rows), [1])
    }

    // MARK: - Filter values and chips

    func testFilterValuesCountAndNameTheirPeople() throws {
        let facts = [try listFacts(number: 1, author: "priya"), try listFacts(number: 2, author: "priya"), try listFacts(number: 3)]
        let authors = PrFacets.values(.author, in: facts, ctx: ctx)
        XCTAssertEqual(authors.map(\.label), ["Priya Example", "You"])
        XCTAssertEqual(authors.map(\.count), [2, 1])
        XCTAssertEqual(PrFacets.values(.checks, in: facts, ctx: ctx).map(\.count), [0, 0, 0, 3, 0], "fixed values keep their zeros")
        XCTAssertEqual(PrFacets.values(.ab, in: facts, ctx: ctx).first?.label, "AB#61001")
        let shared = [try listFacts(number: 1, repo: "shop"), try listFacts(number: 2, repo: "shop", extra: ["owner": "globex", "key": "globex/shop#2"])]
        XCTAssertEqual(Set(PrFacets.values(.repo, in: shared, ctx: ctx).map(\.label)), ["acme/shop", "globex/shop"], "a name two owners share keeps its owner")
    }

    func testChipsReadInTheDesktopsWords() {
        let names = ["priya": "Priya Shah", "tom": "Tom Berg"]
        XCTAssertEqual(PrFacets.chip(QueryTerm(.checks, ["failing"], negate: true)).op, "is not")
        XCTAssertEqual(PrFacets.chip(QueryTerm(.checks, ["failing"], negate: true)).values, "failing")
        let authors = PrFacets.chip(QueryTerm(.author, ["priya", "tom"], negate: true), name: { names[$0] })
        XCTAssertEqual("\(authors.field) \(authors.op) \(authors.values)", "Author is none of Priya Shah, Tom Berg")
        XCTAssertEqual(PrFacets.chip(QueryTerm(.repo, ["shop", "storefront"])).op, "is any of")
    }

    // MARK: - Display

    func testADisplayKeepsTheDesktopsFieldsAndFillsWhatIsMissing() throws {
        let json = #"{"layout":"board","groupBy":"repo","sortBy":"title","columns":["checks"],"futureField":{"a":1},"pinYourTurn":"yes"}"#
        let display = try JSONDecoder().decode(PrDisplay.self, from: Data(json.utf8))
        XCTAssertEqual(display.groupBy, .repo)
        XCTAssertEqual(display.sortDir, .asc, "a missing direction is the order's own")
        XCTAssertTrue(display.pinYourTurn, "a wrong type takes the default")
        let written = try JSONSerialization.jsonObject(with: JSONEncoder().encode(display)) as? [String: Any]
        XCTAssertEqual(written?["layout"] as? String, "board")
        XCTAssertEqual(written?["columns"] as? [String], ["checks"])
        XCTAssertNotNil(written?["futureField"])
        XCTAssertEqual(try JSONDecoder().decode(PrDisplay.self, from: JSONEncoder().encode(display)), display)
        XCTAssertEqual(try JSONDecoder().decode(PrDisplay.self, from: Data("{}".utf8)).groupBy, .status, "the desktop's default")
    }

    // MARK: - Phone parts

    func testAFoldedGroupSaysWhatNeedsAttentionFirst() throws {
        let yours = [try listFacts(number: 1, checks: listRed), try listFacts(number: 2, checks: listRed), try listFacts(number: 3, reviews: [("mira", "approved")])]
        XCTAssertEqual(PrGroupSummary.parts(yours, now: samplePRNow), [
            PrGroupSummary.Part(text: "2 failing", alert: true), PrGroupSummary.Part(text: "1 ready to merge"),
        ])
        let asks = [try listFacts(number: 4, author: "tom", requested: [listMe]), try listFacts(number: 5, author: "tom")]
        XCTAssertEqual(PrGroupSummary.parts(asks, now: samplePRNow).map(\.text), ["1 asks you", "oldest 2 d"])
    }

    func testWaitingIsWhatInvolvesYouAndWaitsOnSomeoneElse() throws {
        XCTAssertTrue(try samplePR(1, mine: true).isWaitingOnOthers(myLogins: me), "yours under review")
        XCTAssertTrue(try samplePR(2, extra: ["reviewedHeadSha": "old"]).isWaitingOnOthers(myLogins: me), "you reviewed it")
        XCTAssertFalse(try samplePR(4).isWaitingOnOthers(myLogins: me), "a teammate's pull request you never touched")
        XCTAssertFalse(try samplePR(5, mine: true, draft: true).isWaitingOnOthers(myLogins: me), "a draft waits on its author")
    }

    func testGroupsFoldByDefaultUntilYouOpenThemAndSurviveAsOneLineEach() {
        var folds = GroupFolds(rawValue: "author:tom\nrepo:acme/shop")
        XCTAssertTrue(folds.isFolded("repo:acme/shop", byDefault: false), "older builds stored folded groups only")
        XCTAssertTrue(folds.isFolded("author:sam", byDefault: true), "untouched groups follow the default")
        folds.toggle("author:sam", byDefault: true)
        XCTAssertFalse(folds.isFolded("author:sam", byDefault: true))
        folds.toggle("author:tom", byDefault: false)
        XCTAssertEqual(folds.rawValue, "+author:sam\n+author:tom\n-repo:acme/shop")
        XCTAssertEqual(GroupFolds(rawValue: folds.rawValue), folds)
    }

    func testFoldedGroupsNextToEachOtherShareACard() throws {
        let groups = PrGroups.group(try (1...5).map { try listFacts(number: $0, author: "a\($0)") }, by: .author, showEmpty: false)
        let runs = GroupRun.runs(groups) { $0.key != groups[2].key }
        XCTAssertEqual(runs.count, 3)
        XCTAssertEqual(GroupRun.runs(groups) { _ in false }.count, 5)
    }

    func testTheTrackShowsWhereAPullRequestIsStuck() throws {
        let toReview = try samplePR(1, bucket: "you")
        XCTAssertEqual(toReview.track, [
            PrTrackStep(label: "Checks", mark: .done), PrTrackStep(label: "Your review", mark: .yours), PrTrackStep(label: "Merge", mark: .open),
        ])
        let failing = try samplePR(2, mine: true, bucket: "you", failed: 1)
        XCTAssertEqual(failing.track[0].label, "1 failing")
        let ready = try samplePR(4, mine: true, bucket: "ready", extra: ["reviewDecision": "approved", "approvedBy": ["sanne", "tom"]])
        XCTAssertEqual(ready.track.map(\.label), ["Checks", "2 approvals", "Ready"])
    }
}
