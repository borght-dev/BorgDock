import XCTest
@testable import BorgDock

/// The overview's rules, with the made-up acme shop of design/review-app/mockups.html.
final class LedgerTests: XCTestCase {
    private static let now = Date(timeIntervalSince1970: 1_795_000_000)
    private static func ago(hours: Double) -> String { GitHubTime.iso(now.addingTimeInterval(-hours * 3600)) }

    private let people = [
        "priya": Person(login: "priya", name: "Priya Shah", avatarUrl: nil),
        "tom": Person(login: "tom", name: "Tom Berg", avatarUrl: nil),
        "ines": Person(login: "ines", name: "Ines Duarte", avatarUrl: nil),
        "sam": Person(login: "sam", name: "Sam Okafor", avatarUrl: nil),
        "kv": Person(login: "kv", name: "Koen Example", avatarUrl: nil),
    ]

    private var context: LedgerContext { LedgerContext(logins: ["kv"], teams: ["checkout"], now: Self.now, people: people) }

    private func pr(
        _ number: Int, by author: String = "priya", repo: String = "shop", title: String = "Round totals per line", draft: Bool = false,
        state: PrState = .open, updated: Double = 2, created: Double = 48, passed: Int = 3, failed: [String] = [], pending: Int = 0,
        mergeable: Mergeable = .mergeable, requested: [String] = [], teams: [String] = [], reviews: [PrLatestReview] = [],
        reviewedHead: String? = nil, requestedAt: Double? = nil, snoozedFor: Double? = nil, workItems: [Int] = [], failedAt: Double = 1
    ) -> PrSummary {
        let checks = CheckSummary(total: passed + failed.count + pending, passed: passed, failed: failed.count, pending: pending, skipped: 0, segments: [])
        return PrSummary(
            owner: "acme", repo: repo, number: number, key: "acme/\(repo)#\(number)", account: "kv", title: title,
            url: "https://github.com/acme/\(repo)/pull/\(number)", author: people[author] ?? Person(login: author, name: nil, avatarUrl: nil),
            isMine: author == "kv", isDraft: draft, state: state, headRef: "feat/branch-\(number)", baseRef: "main", headSha: "head\(number)",
            createdAt: Self.ago(hours: created), updatedAt: Self.ago(hours: updated), mergedAt: state == .merged ? Self.ago(hours: updated) : nil,
            additions: 40, deletions: 12, changedFiles: 3, labels: [], checks: checks, reviewDecision: nil,
            approvedBy: reviews.filter { $0.state == .approved }.map(\.login), mergeable: mergeable, bucket: .wait,
            reason: PrReason(text: "", tone: .mute, icon: .clock), workItemIds: workItems,
            snoozedUntil: snoozedFor.map { GitHubTime.iso(Self.now.addingTimeInterval($0 * 3600)) }, autoMerge: false, reviewedHeadSha: reviewedHead,
            requestedReviewerLogins: requested, requestedTeams: teams, latestReviews: reviews, priorityScore: nil,
            failedChecks: failed.map { FailedCheck(name: $0, jobId: 1, runId: 1, runNumber: 1, completedAt: Self.ago(hours: failedAt)) },
            reviewRequestedAt: requestedAt.map(Self.ago(hours:))
        )
    }

    private func review(_ login: String, _ state: PrLatestReview.State, hoursAgo: Double = 3, sha: String? = nil) -> PrLatestReview {
        PrLatestReview(login: login, state: state, commitSha: sha, submittedAt: Self.ago(hours: hoursAgo))
    }

    private func row(_ pr: PrSummary) -> LedgerRow { Ledger.row(for: pr, context) }

    // MARK: To review

    func testAReviewAskedOfYouNamesWhoAsked() {
        let row = row(pr(412, requested: ["kv"], requestedAt: 96))
        XCTAssertEqual(row.section, .toReview)
        XCTAssertEqual(row.reason, LedgerReason(kind: .asked, text: "Priya asked"))
        XCTAssertEqual(row.edge, .review)
        XCTAssertNil(row.reasonTone, "a routine reason reads grey")
        XCTAssertEqual(LedgerAge.text(since: row.since, now: Self.now), "4 d")
    }

    func testCommitsAfterYourReviewMakeItAReReview() {
        let row = row(pr(377, by: "tom", requested: ["kv"], reviews: [review("kv", .commented, sha: "old")], reviewedHead: "old", requestedAt: 26))
        XCTAssertEqual(row.reason, LedgerReason(kind: .reReview, text: "Re-review"))
        XCTAssertEqual(row.edge, .attention)
        XCTAssertEqual(row.reasonTone, .attention)
    }

    func testARequestToYourTeamNamesTheTeam() {
        let row = row(pr(383, by: "ines", teams: ["acme/checkout"], requestedAt: 2))
        XCTAssertEqual(row.section, .toReview)
        XCTAssertEqual(row.reason, LedgerReason(kind: .teamAsked, text: "@checkout asked"))
    }

    func testADependencyBotSaysWhatItIs() {
        XCTAssertEqual(row(pr(399, by: "dependabot", requested: ["kv"])).reason.text, "Dependency update")
        XCTAssertEqual(row(pr(399, by: "renovate[bot]")).section, .alsoOpen)
        XCTAssertTrue(DependencyBot.isBot("dependabot[bot]"))
        XCTAssertFalse(DependencyBot.isBot("renovate-fan"))
    }

    func testSomeoneElsesDraftNeverEntersToReview() {
        let row = row(pr(376, by: "ines", draft: true, requested: ["kv"]))
        XCTAssertEqual(row.section, .alsoOpen)
        XCTAssertEqual(row.reason.text, "Draft")
        XCTAssertNil(row.edge)
    }

    func testAnApprovalOfThisHeadEndsTheWait() {
        let approved = pr(405, by: "sam", requested: ["kv"], reviews: [review("kv", .approved, sha: "head405")])
        XCTAssertEqual(row(approved).section, .alsoOpen)
        XCTAssertEqual(row(approved).reason.text, "You approved")
    }

    // MARK: Yours

    func testYourFailingChecksComeByName() {
        let row = row(pr(409, by: "kv", failed: ["e2e · chromium 2/4", "lint"], failedAt: 2))
        XCTAssertEqual(row.section, .needsYou)
        XCTAssertEqual(row.reason, LedgerReason(kind: .failing, text: "e2e, lint fail"))
        XCTAssertEqual(row.edge, .failing)
        XCTAssertEqual(LedgerAge.text(since: row.since, now: Self.now), "2 h")
    }

    func testManyOrLongCheckNamesBecomeACount() {
        XCTAssertEqual(Ledger.failingText(pr(1, by: "kv", failed: ["build", "unit", "lint"])), "3 checks fail")
        XCTAssertEqual(Ledger.failingText(pr(1, by: "kv", failed: ["lint"])), "lint fails")
        XCTAssertEqual(Ledger.failingText(pr(1, by: "kv", failed: ["Analyze the bundle for regressions"])), "1 check fails")
        XCTAssertEqual(Ledger.shortCheckName("e2e / checkout (chromium)"), "e2e")
    }

    func testAFailureSharedWithOthersWaitsInsteadOfNeedingYou() {
        var shared = context
        shared.failsOutside = { _ in true }
        let row = Ledger.row(for: pr(409, by: "kv", failed: ["e2e"]), shared)
        XCTAssertEqual(row.section, .waiting)
        XCTAssertEqual(row.reason.kind, .sharedFailure)
    }

    func testConflictsChangesAndCommentsNeedYou() {
        let conflict = row(pr(406, by: "kv", mergeable: .conflicting))
        XCTAssertEqual(conflict.reason, LedgerReason(kind: .conflicts, text: "Conflicts with main"))
        XCTAssertEqual(conflict.edge, .failing)

        let changes = row(pr(371, by: "kv", reviews: [review("tom", .changesRequested, hoursAgo: 24)]))
        XCTAssertEqual(changes.reason, LedgerReason(kind: .changesRequested, text: "Tom wants changes"))
        XCTAssertEqual(changes.edge, .attention)
        XCTAssertEqual(LedgerAge.text(since: changes.since, now: Self.now), "1 d")

        let comment = row(pr(90, by: "kv", repo: "payments", reviews: [review("ines", .commented, hoursAgo: 4)]))
        XCTAssertEqual(comment.reason, LedgerReason(kind: .commented, text: "Ines commented"))
        XCTAssertEqual(comment.edge, .review)
        XCTAssertEqual(comment.section, .needsYou)
    }

    func testApprovedGreenAndMergeableIsReady() {
        let ready = row(pr(401, by: "kv", reviews: [review("tom", .approved)]))
        XCTAssertEqual(ready.section, .ready)
        XCTAssertEqual(ready.reason, LedgerReason(kind: .approved, text: "Tom approved"))
        XCTAssertEqual(ready.edge, .ready)
        // A repository without checks has nothing to wait for.
        XCTAssertEqual(row(pr(12, by: "kv", passed: 0, reviews: [review("sam", .approved)])).section, .ready)
        // GitHub hasn't said yet whether it merges.
        XCTAssertEqual(row(pr(13, by: "kv", mergeable: .unknown, reviews: [review("sam", .approved)])).section, .waiting)
    }

    func testYoursThatWaitSayOnWhom() {
        XCTAssertEqual(row(pr(407, by: "kv", requested: ["sam"])).reason.text, "Waiting on Sam")
        XCTAssertEqual(row(pr(380, by: "kv", requested: ["tom", "ines"])).reason.text, "Waiting on Tom, Ines")
        XCTAssertEqual(row(pr(381, by: "kv", requested: ["tom", "ines"], teams: ["web"])).reason.text, "Waiting on Tom +2")
        XCTAssertEqual(row(pr(52, by: "kv", pending: 2, requested: ["sam"])).reason.text, "Checks running")
        XCTAssertEqual(row(pr(411, by: "kv", draft: true)).reason.text, "Draft")
        XCTAssertEqual(row(pr(411, by: "kv", draft: true)).section, .waiting)
        XCTAssertEqual(row(pr(14, by: "kv")).reason.text, "No reviewer yet")
    }

    func testWhatYouAskedForWaitsOnTheAuthor() {
        let row = row(pr(396, by: "priya", reviews: [review("kv", .changesRequested, sha: "head396")]))
        XCTAssertEqual(row.section, .waiting)
        XCTAssertEqual(row.reason.text, "You asked for changes")
        XCTAssertNil(row.edge)
    }

    // MARK: Sections

    func testSectionsOrderAndCount() {
        let ledger = Ledger([
            pr(31, by: "sam", requested: ["kv"], requestedAt: 5),
            pr(412, requested: ["kv"], requestedAt: 96),
            pr(405, by: "sam", requested: ["kv"], requestedAt: 72),
            pr(90, by: "kv", reviews: [review("ines", .commented, hoursAgo: 4)]),
            pr(371, by: "kv", reviews: [review("tom", .changesRequested, hoursAgo: 24)]),
            pr(409, by: "kv", failed: ["e2e", "lint"]),
            pr(401, by: "kv", reviews: [review("tom", .approved)]),
            pr(407, by: "kv", requested: ["sam"]),
            pr(89, by: "sam", repo: "payments", requested: ["ines"]),
            pr(50, by: "tom", repo: "infra", updated: 1, reviews: [review("sam", .approved)]),
        ], context)

        XCTAssertEqual(ledger.rows(in: .toReview).map(\.pr.number), [412, 405, 31], "longest wait first")
        XCTAssertEqual(ledger.rows(in: .needsYou).map(\.pr.number), [409, 371, 90], "failures, then changes, then comments")
        XCTAssertEqual(ledger.rows(in: .ready).map(\.pr.number), [401])
        XCTAssertEqual(ledger.rows(in: .waiting).map(\.pr.number), [407])
        XCTAssertEqual(ledger.involving, 8)
        XCTAssertEqual(ledger.reviewQueue.map(\.number), [412, 405, 31])
        XCTAssertEqual(ledger.repositories.map(\.name), ["acme/infra", "acme/payments"], "newest activity first")
    }

    func testASnoozedRowLeavesTheOverviewAndSearchStillFindsIt() {
        let snoozed = pr(412, requested: ["kv"], snoozedFor: 10)
        XCTAssertTrue(Ledger([snoozed], context).allRows.isEmpty)
        XCTAssertEqual(Ledger([snoozed], context, includeSnoozed: true).rows(in: .toReview).count, 1)
        XCTAssertEqual(Ledger([pr(412, requested: ["kv"], snoozedFor: -1)], context).rows(in: .toReview).count, 1, "a snooze that ran out")
    }

    func testAMergedPullRequestHasItsOwnSection() {
        let row = row(pr(390, by: "tom", state: .merged))
        XCTAssertEqual(row.section, .merged)
        XCTAssertEqual(row.reasonTone, .merged)
    }

    // MARK: Columns

    func testAge() {
        func age(_ hours: Double) -> String { LedgerAge.text(since: Self.now.addingTimeInterval(-hours * 3600), now: Self.now) }
        XCTAssertEqual(age(0.005), "now")
        XCTAssertEqual(age(20.0 / 60), "20 m")
        XCTAssertEqual(age(5.2), "5 h")
        XCTAssertEqual(age(23 * 24 + 3), "23 d")
        XCTAssertFalse(LedgerAge.isOld(since: Self.now.addingTimeInterval(-6.9 * 86_400), now: Self.now))
        XCTAssertTrue(LedgerAge.isOld(since: Self.now.addingTimeInterval(-7 * 86_400), now: Self.now))
    }

    func testCheckBarGivesEachStateItsShareAndKeepsASliverVisible() {
        func checks(_ passed: Int, _ failed: Int, _ pending: Int, skipped: Int = 0) -> CheckSummary {
            CheckSummary(total: passed + failed + pending + skipped, passed: passed, failed: failed, pending: pending, skipped: skipped, segments: [])
        }
        XCTAssertEqual(LedgerChecks.parts(checks(24, 0, 0)), [.init(state: .success, width: 40)])
        XCTAssertEqual(LedgerChecks.parts(checks(0, 0, 0)), [])
        XCTAssertEqual(LedgerChecks.parts(checks(0, 0, 0, skipped: 2)), [.init(state: .skipped, width: 40)])

        // One failure in twenty-four would be 1.6 points wide; it gets six, and the bar stays 40 with its gap.
        let oneRed = LedgerChecks.parts(checks(23, 1, 0))
        XCTAssertEqual(oneRed.map(\.state), [.success, .failure])
        XCTAssertEqual(oneRed[1].width, 6, accuracy: 0.001)
        XCTAssertEqual(oneRed.reduce(0) { $0 + $1.width } + 2, 40, accuracy: 0.001)

        let three = LedgerChecks.parts(checks(10, 1, 1))
        XCTAssertEqual(three.map(\.state), [.success, .pending, .failure])
        XCTAssertEqual(three.reduce(0) { $0 + $1.width } + 4, 40, accuracy: 0.001)
        XCTAssertTrue(three.allSatisfy { $0.width >= 6 - 0.001 })

        let even = LedgerChecks.parts(checks(2, 0, 2))
        XCTAssertEqual(even.map(\.width), [19, 19])
    }

    // MARK: Search

    func testSearchMatchesWordsAndChips() {
        let refund = row(pr(88, by: "ines", repo: "payments", title: "Refunds for split payments", requested: ["kv"], workItems: [60871]))
        let mine = row(pr(409, by: "kv", title: "Cache price lists", draft: true, failed: ["lint"]))
        func matches(_ text: String, _ filters: Set<LedgerFilter> = [], _ row: LedgerRow) -> Bool {
            LedgerSearch(text: text, filters: filters).matches(row, now: Self.now)
        }
        XCTAssertTrue(matches("refund", [], refund))
        XCTAssertTrue(matches("REFUND split", [], refund))
        XCTAssertTrue(matches("#88", [], refund))
        XCTAssertTrue(matches("ines", [], refund))
        XCTAssertTrue(matches("ab#60871", [], refund))
        XCTAssertTrue(matches("acme/payments", [], refund))
        XCTAssertFalse(matches("refund basket", [], refund))
        XCTAssertFalse(matches("", [.mine], refund))
        XCTAssertTrue(matches("", [.mine, .drafts, .failing], mine))
        XCTAssertFalse(matches("", [.stale], mine))
        XCTAssertTrue(matches("", [.stale], row(pr(79, by: "ines", updated: 23 * 24))))
        XCTAssertFalse(matches("", [.merged], refund))
        XCTAssertTrue(matches("", [.merged], row(pr(390, by: "tom", state: .merged))))
        XCTAssertTrue(LedgerSearch().isEmpty)
    }
}
