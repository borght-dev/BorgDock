import XCTest
@testable import BorgDock

/// The server's `test/github-focus.test.ts`, case for case: a pull request lands in the same bucket, with the same
/// reason and score, whichever side places it.
final class FocusRulesTests: XCTestCase {
    private func context(
        teams: [String] = [], snoozes: [String: Date] = [:], reviewRequests: [String: String] = [:]
    ) -> FocusContext {
        FocusContext(login: "koen", teams: teams, now: Fake.now, staleAfterDays: 7, snoozes: snoozes, reviewRequests: reviewRequests)
    }

    private func reason(_ text: String, _ tone: Tone, _ icon: PrReasonIcon) -> PrReason { PrReason(text: text, tone: tone, icon: icon) }

    func testAReviewRequestedFromYouNeedsYouWithWhoAskedAndWhen() {
        let pr = Fake.record(Fake.pullRequest(requested: ["koen"]))
        let asked = context(reviewRequests: ["acme/shop#1": Fake.ago(Fake.hours(5))])
        XCTAssertEqual(FocusRules.bucket(for: pr, asked), .you)
        XCTAssertEqual(FocusRules.reason(for: pr, asked), reason("Sanne asked for your review 5 h ago.", .warn, .review))
    }

    func testADraftNeverNeedsYouNotEvenWithYourReviewRequested() {
        let pr = Fake.record(Fake.pullRequest(draft: true, requested: ["koen"]))
        XCTAssertEqual(FocusRules.bucket(for: pr, context()), .wait)
        XCTAssertEqual(FocusRules.reason(for: pr, context()).text, "Draft, Sanne is still working on it.")
        let failingDraft = Fake.record(Fake.pullRequest(author: "koen", draft: true, checks: [Fake.checkRun(.init(name: "build", conclusion: "FAILURE"))]))
        XCTAssertEqual(FocusRules.bucket(for: failingDraft, context()), .wait)
    }

    func testATeamRequestCountsWhenYouAreOnTheTeamNamedInTheReason() {
        let pr = Fake.record(Fake.pullRequest(teams: ["acme/Platform"]))
        XCTAssertEqual(FocusRules.bucket(for: pr, context()), .wait)
        let mine = context(teams: ["platform"])
        XCTAssertEqual(FocusRules.bucket(for: pr, mine), .you)
        XCTAssertTrue(FocusRules.reason(for: pr, mine).text.hasPrefix("Sanne asked the platform team for a review"))
    }

    func testAReReviewCountsTheCommitsSinceYourReview() {
        let pr = Fake.record(Fake.pullRequest(headSha: "c4", requested: ["koen"], reviews: [.init(login: "koen", state: "COMMENTED", sha: "c1")], commits: ["c1", "c2", "c3", "c4"]))
        XCTAssertEqual(FocusRules.reason(for: pr, context()), reason("Sanne asked you to look again, 3 new commits since your review.", .warn, .rerun))
    }

    func testApprovingTheHeadEndsTheWaitOnYouANewerHeadBringsItBack() {
        let approved = Fake.record(Fake.pullRequest(requested: ["koen"], reviews: [.init(login: "koen", state: "APPROVED")]))
        XCTAssertFalse(approved.isWaitingOnMe("koen", teams: []))
        let moved = Fake.record(Fake.pullRequest(headSha: "new", requested: ["koen"], reviews: [.init(login: "koen", state: "APPROVED", sha: "old")]))
        XCTAssertTrue(moved.isWaitingOnMe("koen", teams: []))
    }

    func testYourOwnPullRequestFailingChecksChangesRequestedAndCommentsNeedYou() {
        let failing = Fake.record(Fake.pullRequest(author: "koen", checks: [
            Fake.checkRun(.init(name: "e2e", conclusion: "FAILURE")), Fake.checkRun(.init(name: "unit", conclusion: "TIMED_OUT")), Fake.checkRun(.init(name: "lint")),
        ]))
        XCTAssertEqual(FocusRules.bucket(for: failing, context()), .you)
        XCTAssertEqual(FocusRules.reason(for: failing, context()), reason("Your PR, 2 checks failing.", .bad, .failing))
        let changes = Fake.record(Fake.pullRequest(author: "koen", reviews: [.init(login: "mira", state: "CHANGES_REQUESTED")]))
        XCTAssertEqual(FocusRules.reason(for: changes, context()).text, "Changes requested on your PR.")
        let comments = Fake.record(Fake.pullRequest(author: "koen", reviews: [.init(login: "mira", state: "COMMENTED")]))
        XCTAssertEqual(FocusRules.reason(for: comments, context()).text, "Comments on your PR to answer.")
    }

    func testApprovedGreenAndMergeableIsReady() {
        let pr = Fake.record(Fake.pullRequest(author: "koen", reviews: [.init(login: "mira", state: "APPROVED")], checks: [
            Fake.checkRun(.init(name: "a")), Fake.checkRun(.init(name: "b")), Fake.checkRun(.init(name: "c", conclusion: "SKIPPED")),
        ]))
        XCTAssertEqual(FocusRules.bucket(for: pr, context()), .ready)
        XCTAssertEqual(FocusRules.reason(for: pr, context()), reason("Approved by mira, all 2 checks passed.", .ok, .approved))
        let conflicting = Fake.record(Fake.pullRequest(author: "koen", mergeable: "CONFLICTING", reviews: [.init(login: "mira", state: "APPROVED")]))
        XCTAssertEqual(FocusRules.bucket(for: conflicting, context()), .wait)
    }

    func testStaleWinsOverAReviewRequestAndSaysHowLong() {
        let pr = Fake.record(Fake.pullRequest(updatedAgo: Fake.days(12), requested: ["koen"]))
        XCTAssertEqual(FocusRules.bucket(for: pr, context()), .stale)
        XCTAssertEqual(FocusRules.reason(for: pr, context()), reason("No update in 12 days.", .mute, .clock))
    }

    func testASnoozedReviewWaitsUntilTheSnoozeRunsOut() {
        let pr = Fake.record(Fake.pullRequest(requested: ["koen"]))
        let snoozed = context(snoozes: ["acme/shop#1": Fake.now.addingTimeInterval(Fake.hours(10))])
        XCTAssertEqual(FocusRules.bucket(for: pr, snoozed), .wait)
        XCTAssertEqual(FocusRules.reason(for: pr, snoozed).text, "Snoozed until tomorrow.")
        XCTAssertEqual(FocusRules.bucket(for: pr, context(snoozes: ["acme/shop#1": Fake.now.addingTimeInterval(-1)])), .you)
    }

    func testWaitingOnOthersSaysWhoOrWhat() {
        XCTAssertEqual(FocusRules.reason(for: Fake.record(Fake.pullRequest(draft: true)), context()).text, "Draft, Sanne is still working on it.")
        XCTAssertEqual(FocusRules.reason(for: Fake.record(Fake.pullRequest(mergeable: "CONFLICTING")), context()), reason("Sanne's PR has merge conflicts.", .bad, .conflict))
        let running = Fake.record(Fake.pullRequest(author: "koen", checks: [
            Fake.checkRun(.init(name: "a")), Fake.checkRun(.init(name: "b", conclusion: nil, status: "IN_PROGRESS")),
        ]))
        XCTAssertEqual(FocusRules.reason(for: running, context()), reason("Checks running, 1 of 2 done.", .run, .clock))
        let autoMerge = Fake.record(Fake.pullRequest(author: "koen", autoMerge: true, checks: [Fake.checkRun(.init(name: "b", conclusion: nil, status: "QUEUED"))]))
        XCTAssertEqual(FocusRules.reason(for: autoMerge, context()).icon, .merge)
        XCTAssertEqual(FocusRules.reason(for: Fake.record(Fake.pullRequest(requested: ["mira"])), context()).text, "Sanne's PR, waiting on mira.")
        XCTAssertEqual(FocusRules.reason(for: Fake.record(Fake.pullRequest(author: "bob", authorName: nil)), context()).text, "bob's PR, not assigned to you.")
    }

    func testTheScoreRanksReviewsYouOweAndYourRedBuildsAboveTheRestOthersDraftsScoreNothing() {
        let owed = FocusRules.score(of: Fake.record(Fake.pullRequest(requested: ["koen"])), context(reviewRequests: ["acme/shop#1": Fake.ago(Fake.hours(30))]))
        let red = FocusRules.score(of: Fake.record(Fake.pullRequest(author: "koen", checks: [Fake.checkRun(.init(name: "e2e", conclusion: "FAILURE"))])), context())
        XCTAssertEqual(owed, 15 + 8)
        XCTAssertGreaterThanOrEqual(red, 20)
        XCTAssertEqual(FocusRules.score(of: Fake.record(Fake.pullRequest()), context()), 0)
        XCTAssertEqual(FocusRules.score(of: Fake.record(Fake.pullRequest(draft: true, requested: ["koen"])), context()), 0)
    }

    func testFocusOrderBucketThenScoreThenTheOldestUpdate() {
        let rows = [
            FocusRules.Rank(bucket: .wait, score: 50, updatedAt: Fake.ago(1), size: 1),
            FocusRules.Rank(bucket: .you, score: 10, updatedAt: Fake.ago(1), size: 1),
            FocusRules.Rank(bucket: .you, score: 30, updatedAt: Fake.ago(1), size: 1),
            FocusRules.Rank(bucket: .you, score: 30, updatedAt: Fake.ago(Fake.hours(5)), size: 1),
        ]
        let sorted = rows.sorted(by: FocusRules.comesFirst)
        XCTAssertEqual(sorted.map { "\($0.bucket.rawValue) \($0.score) \($0.updatedAt)" }, [
            "you 30 \(Fake.ago(Fake.hours(5)))", "you 30 \(Fake.ago(1))", "you 10 \(Fake.ago(1))", "wait 50 \(Fake.ago(1))",
        ])
    }

    func testCheckSummaryPutsFailuresFirstAndCapsTheBarAtTwelve() {
        let checks: [Any] = (0..<14).map { Fake.checkRun(.init(name: "ok\($0)")) }
            + [Fake.checkRun(.init(name: "bad", conclusion: "FAILURE")), Fake.checkRun(.init(name: "skip", conclusion: "SKIPPED"))]
        let summary = FocusRules.checkSummary(Fake.record(Fake.pullRequest(checks: checks)).checks)
        XCTAssertEqual(summary.total, 16)
        XCTAssertEqual(summary.failed, 1)
        XCTAssertEqual(summary.skipped, 1)
        XCTAssertEqual(summary.segments.count, 12)
        XCTAssertEqual(summary.segments.first, .failure)
    }

    func testARerunReplacesTheEarlierAttemptOfTheSameCheck() {
        var rerun = Fake.checkRun(.init(name: "e2e", id: 2))
        rerun["startedAt"] = Fake.ago(Fake.hours(1))
        let record = Fake.record(Fake.pullRequest(checks: [Fake.checkRun(.init(name: "e2e", conclusion: "FAILURE", id: 1)), rerun]))
        XCTAssertEqual(record.checks.map(\.id), [2])
        XCTAssertEqual(record.checks.map(\.state), [.success])
    }

    func testWorkItemsComeFromABInTheTitleOrBodyAndFromTheBranch() {
        XCTAssertEqual(FocusRules.workItemIds(title: "Fix totals AB#60379", body: "Also ab#123", headRef: "feat/61000-totals").sorted(), [123, 60379, 61000])
        XCTAssertEqual(FocusRules.workItemIds(title: "x", body: "", headRef: "main"), [])
        XCTAssertEqual(PrKey(owner: "acme", repo: "shop", number: 7).key, "acme/shop#7")
    }
}
