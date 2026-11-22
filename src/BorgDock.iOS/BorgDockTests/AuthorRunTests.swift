import XCTest
@testable import BorgDock

/// The desktop's `services/__tests__/author-run.test.ts`, case for case, then what the phone adds: Review all, the end
/// card's two offers and a red pull request a shared CI failure clears.
final class AuthorRunTests: XCTestCase {
    private let me: Set<String> = ["me"]
    private let e2e = "Deploy & Test / E2E Shard 1/4"
    private let advisory = "E2E reproducer advisory"

    /// Robin's pull request `number`, opened on the `number`th of November, head `sha-<number>`.
    private func pr(_ number: Int, author: String = "robin", failed: [String] = [], jobs: [Int]? = nil, repo: String = "shop", extra: [String: Any] = [:]) throws -> PrSummary {
        var fields: [String: Any] = [
            "createdAt": String(format: "2026-11-%02dT10:00:00Z", number), "headSha": "sha-\(number)", "baseRef": "main",
            "failedChecks": failed.enumerated().map { index, name -> [String: Any] in
                ["name": name, "jobId": jobs?[index] ?? NSNull(), "runId": NSNull(), "runNumber": NSNull(), "completedAt": NSNull()]
            },
        ]
        fields.merge(extra) { _, new in new }
        return try samplePR(number, repo: repo, author: author, failed: failed.count, extra: fields)
    }

    private func approved(by login: String, at sha: String) -> [String: Any] {
        ["latestReviews": [["login": login, "state": "approved", "commitSha": sha]]]
    }

    private var outsideReport: E2eReport {
        E2eReport(commentId: "1", url: "", createdAt: "", failed: [], complete: true, smokeFailed: false, runNumber: 15274, runId: nil)
    }

    /// The report clears the shard it reports on.
    private var outside: E2eLookup { .read(E2eRead(verdict: .outside(tests: [], shared: false, report: outsideReport), covers: [e2e])) }

    // MARK: - authorCandidates

    func testListsTheAuthorsOpenPullRequestsOldestFirstWithoutDraftsOrOnesIApprovedAtTheirHead() throws {
        let prs = [
            try pr(3), try pr(1), try pr(2, extra: ["isDraft": true]), try pr(4, author: "sam"),
            try pr(5, extra: approved(by: "me", at: "sha-5")), try pr(6, extra: approved(by: "me", at: "older")),
        ]
        XCTAssertEqual(AuthorRun.candidates(prs, author: "Robin", myLogins: me).map(\.number), [1, 3, 6])
    }

    func testNeverRunsOverMyOwnPullRequests() throws {
        XCTAssertTrue(AuthorRun.candidates([try pr(1, author: "me")], author: "me", myLogins: me).isEmpty)
    }

    // MARK: - runFit

    func testHoldsAPullRequestWithConflictsOrAFailingCheckOfItsOwn() throws {
        XCTAssertEqual(AuthorRun.fit(try pr(1, extra: ["mergeable": "conflicting"]), e2e: .none, outsideCause: nil),
                       .held(reason: .conflicts, why: "Has merge conflicts"))
        XCTAssertEqual(AuthorRun.fit(try pr(1, failed: ["Build & Test API", e2e]), e2e: outside, outsideCause: nil),
                       .held(reason: .failing, why: "Build & Test API fails"))
    }

    func testMergesAGreenOrRunningPullRequestTheUsualWay() throws {
        XCTAssertEqual(AuthorRun.fit(try pr(1), e2e: .none, outsideCause: nil), .ready(bypass: nil))
    }

    func testMergesPastE2eFailuresTheReportClearsAndWaitsWhileItIsRead() throws {
        let red = try pr(1, failed: [e2e])
        XCTAssertEqual(AuthorRun.fit(red, e2e: outside, outsideCause: nil), .ready(bypass: "0 E2E tests failed, none in specs this PR touches"))
        XCTAssertEqual(AuthorRun.fit(red, e2e: .reading, outsideCause: nil), .checking)
        let introduced = E2eLookup.read(E2eRead(verdict: .introduced(tests: [], report: outsideReport), covers: [e2e]))
        guard case .held(.e2e, _) = AuthorRun.fit(red, e2e: introduced, outsideCause: nil) else { return XCTFail("held for its E2E test") }
    }

    func testHoldsAFailingCheckTheReportDoesntCoverThoughItsNameSaysE2e() throws {
        let red = try pr(1, failed: [e2e, advisory])
        XCTAssertEqual(AuthorRun.fit(red, e2e: outside, outsideCause: nil), .held(reason: .failing, why: "E2E reproducer advisory fails"))
        XCTAssertEqual(AuthorRun.fit(red, e2e: .reading, outsideCause: nil), .checking, "while the report is read, an E2E-looking check might still be covered")
    }

    func testMergesPastRelatedFailuresThatAlsoFailOnTheBaseBranch() throws {
        XCTAssertEqual(AuthorRun.fit(try pr(1, failed: ["Lint"]), e2e: .none, outsideCause: .baseBranch),
                       .ready(bypass: "Not this PR's failure: also fails on main"))
    }

    // MARK: - planAuthorRun

    func testHoldsChangesRequestedEvenWhenChecksPassOrFailuresAreUnrelated() throws {
        let blocked = try pr(1, extra: ["reviewDecision": "changes_requested"])
        XCTAssertEqual(AuthorRun.fit(blocked, e2e: .none, outsideCause: .baseBranch), .held(reason: .changesRequested, why: "Changes requested"))
        XCTAssertTrue(AuthorRun.plan([blocked]) { AuthorRun.fit($0, e2e: .none, outsideCause: nil) }.queue.isEmpty)
    }

    func testKeepsTheOrderAndSplitsReadyHeldAndStillChecking() throws {
        let plan = AuthorRun.plan([try pr(1), try pr(2, extra: ["mergeable": "conflicting"]), try pr(3)]) {
            $0.number == 3 ? .checking : AuthorRun.fit($0, e2e: .none, outsideCause: nil)
        }
        XCTAssertEqual(plan.queue.map(\.number), [1])
        XCTAssertEqual(plan.held.map(\.pr.number), [2])
        XCTAssertEqual(plan.checking.map(\.number), [3])
    }

    // MARK: - The phone's

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
        let world = RunWorld(prs: prs, e2e: [:], groups: [])
        let plan = AuthorRun.plan(AuthorRun.candidates(prs, author: "Priya", myLogins: ["koen"]), fit: world.fit)
        XCTAssertEqual(plan.queue.map(\.number), [2, 8, 1])
        XCTAssertEqual(plan.held.map(\.pr.number), [3, 4, 5])
        XCTAssertEqual(plan.held.map(\.why), ["A check fails", "Has merge conflicts", "Changes requested"], "an older server's red pull request stays out")
        XCTAssertTrue(AuthorRun.candidates(prs, author: "koen", myLogins: ["koen"]).isEmpty, "never your own")
    }

    func testARedPullRequestASharedFailureOnTheBaseBranchClearsJoinsTheRun() throws {
        let cleared = try pr(1, failed: ["build / web"], jobs: [11])
        let own = try pr(2, failed: ["lint"], jobs: [21])
        let group = CiLensTests.group("on-main", prKeys: ["acme/shop#1", "acme/shop#7"], baseRuns: [41], prJobIds: [11, 71], repos: ["acme/shop"])
        let world = RunWorld(prs: [cleared, own], e2e: [:], groups: [group])
        let plan = AuthorRun.plan([cleared, own], fit: world.fit)
        XCTAssertEqual(plan.queue.map(\.number), [1])
        XCTAssertEqual(world.fit(cleared), .ready(bypass: "Not this PR's failure: also fails on main"))
        XCTAssertEqual(plan.held, [HeldPr(pr: own, reason: .failing, why: "lint fails")])
    }

    func testNextFromTheAuthorPrefersPassingChecksThenTheOldestUnblocked() throws {
        let prs = [
            try pr(1, failed: ["lint"]), try pr(2, extra: ["mergeable": "conflicting"]), try pr(3), try pr(4),
            try pr(5, author: "sam"),
        ]
        XCTAssertEqual(AuthorRun.nextFromAuthor(prs, author: "robin", myLogins: me, handled: [])?.number, 3)
        XCTAssertEqual(AuthorRun.nextFromAuthor(prs, author: "robin", myLogins: me, handled: ["acme/shop#3"])?.number, 4)
        XCTAssertEqual(AuthorRun.nextFromAuthor(prs, author: "robin", myLogins: me, handled: ["acme/shop#3", "acme/shop#4"])?.number, 1, "then the red one")
    }

    func testReviewNextIsTheNextByPriorityFromAnyoneElse() throws {
        let asksYou = try pr(9, author: "sam", failed: ["lint"])
        let green = try pr(8, author: "tom")
        let robins = try pr(3)
        let mine = try pr(4, author: "me")
        let all = [robins, mine, green, asksYou]
        XCTAssertEqual(AuthorRun.nextByPriority(reviews: [asksYou], prs: all, except: "robin", myLogins: me, handled: [])?.number, 8,
                       "passing checks first, the way the desktop orders Quick Review")
        XCTAssertEqual(AuthorRun.nextByPriority(reviews: [asksYou], prs: all, except: "robin", myLogins: me, handled: ["acme/shop#8"])?.number, 9)
        XCTAssertNil(AuthorRun.nextByPriority(reviews: [], prs: [robins, mine], except: "robin", myLogins: me, handled: []), "never yours, never the same author")
    }

    func testTheHighlightedButtonGoesToTheSameAuthorUnlessOnlyTheOtherPasses() throws {
        let green = try pr(1)
        let red = try pr(2, failed: ["lint"])
        XCTAssertTrue(ReviewEndSummary.prefersAuthor(author: green, next: green))
        XCTAssertTrue(ReviewEndSummary.prefersAuthor(author: red, next: red))
        XCTAssertFalse(ReviewEndSummary.prefersAuthor(author: red, next: green))
        XCTAssertFalse(ReviewEndSummary.prefersAuthor(author: nil, next: green))
    }

    func testTheEndCardCountsWhatYouDecided() {
        let summary = ReviewEndSummary([.approved, .approved, .commented, .skipped])
        XCTAssertEqual(summary.title, "Review complete")
        XCTAssertEqual(summary.detail(heldApprovals: 2), "3 PRs reviewed. Approvals post when their Undo runs out.")
        XCTAssertEqual(ReviewEndSummary([.approved]).detail(heldApprovals: 1), "1 PR reviewed. The approval posts when its Undo runs out.")
        let walk = ReviewEndSummary([.walked])
        XCTAssertEqual(walk.title, "Walk-through complete")
        XCTAssertEqual(walk.detail(heldApprovals: 0), "1 of your PRs walked through.")
    }
}
