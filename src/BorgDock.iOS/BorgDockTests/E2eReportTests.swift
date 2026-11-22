import XCTest
@testable import BorgDock

/// The desktop's `services/e2e/__tests__/report.test.ts`, case for case.
final class E2eReportTests: XCTestCase {
    private let url = "https://github.com/acme/shop/pull/7#issuecomment-1"
    private let createdAt = "2026-11-05T05:00:00Z"

    private let failedBody = [
        "## E2E Test Results",
        "",
        "**Environment:** https://staging-2.example.com | **Smoke:** Passed | **E2E:** 2 failed | **Flaky:** 1",
        "**Run:** #15271 | 2026-11-05 04:20:41 UTC",
        "",
        "| Total | Passed | Failed | Flaky | Skipped | Pass Rate |",
        "|-------|--------|--------|-------|---------|-----------|",
        "| 313 | 307 | 2 | 1 | 0 | 98.1% |",
        "",
        "### Failed Tests",
        "| File | Test | Error |",
        "|------|------|-------|",
        "| `assets/calendar-dates.spec.ts` | UTC > @AB4242 picking a day keeps it | `Timeout 15000ms exceeded` |",
        "| `orders/order-list.spec.ts` | filters by status | `Error: expect(locator).toBeVisible() \\| failed` |",
        "",
        "<details><summary>Debug context</summary>",
        "",
        "| File | Test |",
        "|------|------|",
        "| `not/this.spec.ts` | nor this |",
        "</details>",
    ].joined(separator: "\n")

    private func parse(_ body: String) -> E2eReport? { E2eReport.parse(body, commentId: "1", url: url, createdAt: createdAt) }

    private func report(_ change: (inout E2eReport) -> Void = { _ in }) -> E2eReport {
        var report = parse(failedBody)!
        change(&report)
        return report
    }

    private let none = E2eEvidence(changedFiles: [], workItemIds: [], otherReports: [:])

    // MARK: - parseE2eReport

    func testReadsTheFailedTestsTableAndTheRunStatus() throws {
        let parsed = try XCTUnwrap(parse(failedBody))
        XCTAssertEqual(parsed.failed, [
            E2eFailedTest(file: "assets/calendar-dates.spec.ts", test: "UTC > @AB4242 picking a day keeps it", error: "Timeout 15000ms exceeded"),
            E2eFailedTest(file: "orders/order-list.spec.ts", test: "filters by status", error: "Error: expect(locator).toBeVisible() | failed"),
        ])
        XCTAssertTrue(parsed.complete)
        XCTAssertFalse(parsed.smokeFailed)
        XCTAssertEqual(parsed.url, url)
        XCTAssertEqual(parsed.runNumber, 15271)
        XCTAssertNil(parsed.runId)
    }

    func testReadsTheWorkflowRunTheReportLinksTo() {
        let body = failedBody + "\n[View workflow run](https://github.com/acme/shop/actions/runs/41966891152)"
        XCTAssertEqual(parse(body)?.runId, 41966891152)
    }

    func testMarksARunWhoseShardsDidNotAllReportAsIncomplete() {
        let body = failedBody.replacingOccurrences(of: "**E2E:** 2 failed", with: "**E2E:** Failed (incomplete test results)")
        XCTAssertEqual(parse(body)?.complete, false)
    }

    func testIgnoresOtherComments() {
        XCTAssertNil(parse("## Deployment Preview\n**Environment:** `staging-7`"))
    }

    // MARK: - isE2eCheck

    func testMatchesE2eShardJobsNotUnrelatedNames() {
        XCTAssertTrue(E2eReport.isE2eCheck("Deploy & Test (staging-7) / E2E Shard 4/4"))
        XCTAssertFalse(E2eReport.isE2eCheck("Build & Test API / Test API (shard 6)"))
        XCTAssertFalse(E2eReport.isE2eCheck("sharee2econfig"))
        XCTAssertTrue(E2eReport.isE2eCheck("e2e · chromium 2/4"), "the phone fixture's name")
    }

    // MARK: - coveredChecks

    private let shard = "Deploy & Test (staging-2) / E2E Shard 4/4"
    private let advisory = "E2E reproducer advisory"
    private var jobs: [FailedCheck] {
        [
            FailedCheck(name: shard, jobId: 1, runId: 41966891152, runNumber: 15271, completedAt: nil),
            FailedCheck(name: advisory, jobId: 2, runId: 41966891100, runNumber: 9120, completedAt: nil),
        ]
    }

    func testCoversOnlyTheJobsOfTheRunTheReportIsAbout() {
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: [shard, advisory], failedJobs: jobs, report: report()), [shard])
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: [shard, advisory], failedJobs: jobs, report: report { $0.runNumber = nil; $0.runId = 41966891152 }), [shard])
    }

    func testCoversNothingWhenTheE2eRunPassedAndOnlyTheAdvisoryFailed() {
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: [advisory], failedJobs: [jobs[1]], report: report()), [])
    }

    func testFallsBackToE2eLookingNamesWithoutAReportOrRunDetails() {
        let names = [shard, advisory]
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: names, failedJobs: jobs, report: nil), Set(names))
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: names, failedJobs: [], report: report()), Set(names))
        XCTAssertEqual(E2eReport.coveredChecks(failedNames: names, failedJobs: jobs, report: report { $0.runNumber = nil; $0.runId = nil }), Set(names))
    }

    // MARK: - e2eVerdict

    func testBlamesThePullRequestForAFailingSpecItChanges() {
        let verdict = E2eVerdict.of(report(), E2eEvidence(changedFiles: ["web/e2e/tests/assets/calendar-dates.spec.ts", "web/src/Calendar.tsx"], workItemIds: [], otherReports: [:]))
        guard case .introduced = verdict else { return XCTFail("\(verdict)") }
        XCTAssertEqual(verdict.tests.map(\.cause), [.changed, .untouched])
    }

    func testBlamesThePullRequestForATestTaggedWithOneOfItsWorkItems() {
        let verdict = E2eVerdict.of(report(), E2eEvidence(changedFiles: [], workItemIds: [4242], otherReports: [:]))
        guard case .introduced = verdict else { return XCTFail("\(verdict)") }
        XCTAssertEqual(verdict.tests.first?.cause, .tagged)
    }

    func testClearsFailuresInSpecsThePullRequestLeavesAlone() {
        let verdict = E2eVerdict.of(report(), E2eEvidence(changedFiles: ["web/src/Other.tsx"], workItemIds: [], otherReports: [:]))
        guard case .outside(_, let shared, _) = verdict else { return XCTFail("\(verdict)") }
        XCTAssertFalse(shared)
        XCTAssertEqual(verdict.text, "2 E2E tests failed, none in specs this PR touches")
    }

    func testNamesTheOtherPullRequestsASharedFailureAlsoBreaks() {
        let one = report { $0.failed = Array($0.failed.dropFirst()) }
        let verdict = E2eVerdict.of(one, E2eEvidence(changedFiles: [], workItemIds: [], otherReports: [12: one]))
        guard case .outside(_, let shared, _) = verdict else { return XCTFail("\(verdict)") }
        XCTAssertTrue(shared)
        XCTAssertEqual(verdict.tests.first?.alsoFailsOn, [12])
    }

    func testCannotClearAPullRequestThatChangesE2eHelpersUnlessEveryFailureIsShared() {
        let verdict = E2eVerdict.of(report(), E2eEvidence(changedFiles: ["web/e2e/fixtures/api/orderApi.ts"], workItemIds: [], otherReports: [:]))
        guard case .unclear(.helpersChanged, _, _, _) = verdict else { return XCTFail("\(verdict)") }
    }

    func testCannotClearAPartialRunABrokenDeploymentOrAMissingReport() {
        func reason(_ verdict: E2eVerdict) -> E2eUnclearReason? {
            if case .unclear(let reason, _, _, _) = verdict { return reason }
            return nil
        }
        XCTAssertEqual(reason(E2eVerdict.of(report { $0.complete = false }, none)), .incomplete)
        XCTAssertEqual(reason(E2eVerdict.of(report { $0.smokeFailed = true }, none)), .smokeFailed)
        XCTAssertEqual(reason(E2eVerdict.of(report { $0.failed = [] }, none)), .noFailedTests)
        XCTAssertEqual(reason(E2eVerdict.of(nil, none)), .noReport)
    }

    // MARK: - Reading (load.ts)

    func testOnlyAReportPostedAfterTheFailedE2eJobsCounts() throws {
        let pr = try samplePR(7, failed: 1, extra: ["failedChecks": [
            ["name": shard, "jobId": 70, "runId": 41966891152, "runNumber": 15271, "completedAt": "2026-11-05T04:30:00Z"],
        ]])
        let since = try XCTUnwrap(E2eReports.since(pr))
        XCTAssertEqual(since, ISODate.parse("2026-11-05T04:29:00Z"), "a minute of slack for GitHub's clocks")
        let old = PrComment(id: "old", author: Person(login: "bot", name: nil, avatarUrl: nil), body: failedBody, at: "2026-11-04T09:00:00Z", reactions: [])
        let new = PrComment(id: "new", author: Person(login: "bot", name: nil, avatarUrl: nil), body: failedBody, at: "2026-11-05T05:00:00Z", reactions: [])
        let chat = PrComment(id: "chat", author: Person(login: "sam", name: nil, avatarUrl: nil), body: "Looks good", at: "2026-11-05T06:00:00Z", reactions: [])
        XCTAssertEqual(E2eReports.latestReport([new, old, chat], url: pr.url, since: since)?.commentId, "new")
        XCTAssertNil(E2eReports.latestReport([old, chat], url: pr.url, since: since), "a report of an earlier push never judges the new head")
    }

    func testTheVerdictWaitsForTheReportAndReadsNeighboursForSharedFailures() throws {
        let failed: [String: Any] = ["name": shard, "jobId": 70, "runId": NSNull(), "runNumber": 15271, "completedAt": "2026-11-05T04:30:00Z"]
        let pr = try samplePR(7, failed: 1, extra: ["failedChecks": [failed]])
        let other = try samplePR(12, failed: 1, extra: ["failedChecks": [failed]])
        XCTAssertEqual(E2eReports.lookup(pr, entries: [:], prs: [pr, other]), .reading)
        XCTAssertEqual(E2eReports.lookup(try samplePR(8), entries: [:], prs: []), .none)

        let one = report { $0.failed = Array($0.failed.dropFirst()) }
        let entries: [String: E2eReports.Entry] = [
            pr.key: .init(key: E2eReports.entryKey(pr), status: .ready, report: one, files: ["web/src/Other.tsx"], workItemIds: []),
            other.key: .init(key: E2eReports.entryKey(other), status: .ready, report: one, files: nil, workItemIds: []),
        ]
        guard case .read(let read) = E2eReports.lookup(pr, entries: entries, prs: [pr, other]) else { return XCTFail("read") }
        XCTAssertEqual(read.covers, [shard])
        guard case .outside(_, let shared, _) = read.verdict else { return XCTFail("\(read.verdict)") }
        XCTAssertTrue(shared, "#12 fails the same test")
        XCTAssertEqual(E2eReports.neighbours(pr, [pr, other]).map(\.number), [12])
    }
}
