import XCTest
@testable import BorgDock

/// The desktop's `services/ci-failures/__tests__/lens.test.ts`, case for case, over the server's group facts. The server
/// keeps no classifications or resolved groups, so the desktop's cases for those have no counterpart.
final class CiLensTests: XCTestCase {
    static func group(
        _ id: String, prKeys: [String], baseRuns: [Int] = [], prJobIds: [Int], tier: CiGroupFacts.Tier = .high, repos: [String] = ["acme/app"],
        passedOnRetry: Int = 0, catalogIds: [String] = [], failedSteps: [String] = []
    ) -> CiFailureGroup {
        CiFailureGroup(
            id: id, title: id, signal: "", location: nil, firstFailedAt: "", lastFailedAt: "", failures: 1, branches: [], claim: nil,
            facts: CiGroupFacts(tier: tier, repos: repos, prKeys: prKeys, prJobIds: prJobIds, baseRuns: baseRuns, runCount: 2,
                                passedOnRetry: passedOnRetry, catalogIds: catalogIds, failedSteps: failedSteps)
        )
    }

    /// Shared by pull requests 1 and 2, also on master: not their doing.
    private let onMaster = group("master", prKeys: ["acme/app#1", "acme/app#2"], baseRuns: [41], prJobIds: [11, 21])
    /// Shared by pull requests 2 and 3 only: may be theirs.
    private let sharedOnly = group("shared", prKeys: ["acme/app#2", "acme/app#3"], prJobIds: [22, 31])

    /// Pull request `number` in `repo` with these failed jobs (job 0: a commit status) and maybe more failed checks.
    private func pr(_ number: Int, failing jobs: [Int], repo: String = "app", extraFailed: [String] = []) throws -> PrSummary {
        let failed: [[String: Any]] = jobs.map { ["name": "job \($0)", "jobId": $0 == 0 ? NSNull() : $0, "runId": 1, "runNumber": NSNull(), "completedAt": NSNull()] }
            + extraFailed.map { ["name": $0, "jobId": NSNull(), "runId": NSNull(), "runNumber": NSNull(), "completedAt": NSNull()] }
        return try samplePR(number, repo: repo, failed: failed.count, extra: ["failedChecks": failed])
    }

    // MARK: - outsideCauseOf

    func testReadsTheStrongestHypothesisThatSaysThePullRequestDidNotCauseIt() {
        XCTAssertEqual(CiLens.outsideCause(onMaster), .baseBranch)
        XCTAssertEqual(CiLens.outsideCause(Self.group("f", prKeys: [], prJobIds: [], passedOnRetry: 1)), .flaky)
        XCTAssertEqual(CiLens.outsideCause(Self.group("i", prKeys: [], prJobIds: [], catalogIds: ["dns"])), .infrastructure)
        XCTAssertEqual(CiLens.outsideCause(Self.group("s", prKeys: [], prJobIds: [], failedSteps: ["Set up job", "Run actions/checkout@v4"])), .infrastructure)
        XCTAssertNil(CiLens.outsideCause(Self.group("t", prKeys: [], prJobIds: [], failedSteps: ["Set up job", "Run tests"])))
        XCTAssertNil(CiLens.outsideCause(sharedOnly))
    }

    func testSaysItInAPhrase() {
        XCTAssertEqual(CiCause.baseBranch.outsideText(branch: "main"), "also fails on main")
    }

    // MARK: - prCiLens

    private var index: CiLens.JobIndex { CiLens.index([onMaster, sharedOnly]) }

    func testNamesTheSharedGroupOfAFailedCheckAndThePullRequestsItBlocks() throws {
        let lens = CiLens.lens(try pr(1, failing: [11]), index, blocked: ["master": 2])
        XCTAssertEqual(lens?.groups.map(\.id), ["master"])
        XCTAssertEqual(lens?.blockedCount, 2)
        XCTAssertEqual(lens?.outsideCause, .baseBranch)
    }

    func testIsNotNotCausedWhenOneFailedCheckMayBeThePullRequestsOwn() throws {
        let lens = CiLens.lens(try pr(2, failing: [21, 22]), index)
        XCTAssertEqual(lens?.groups.map(\.id).sorted(), ["master", "shared"])
        XCTAssertNil(lens?.outsideCause)
    }

    func testIsNotNotCausedWhenAFailedCheckIsInNoGroup() throws {
        XCTAssertNil(CiLens.lens(try pr(1, failing: [11, 99]), index)?.outsideCause)
    }

    func testCountsAFailedCommitStatusAsThePullRequestsOwn() throws {
        XCTAssertNil(CiLens.lens(try pr(1, failing: [11, 0]), index)?.outsideCause)
    }

    func testIsNotNotCausedWhenFewerFailedJobsCameThanFailedChecks() throws {
        XCTAssertNil(CiLens.lens(try pr(1, failing: [11], extraFailed: ["lint"]), index)?.outsideCause)
    }

    func testIsNilWithoutASharedFailedCheck() throws {
        XCTAssertNil(CiLens.lens(try pr(5, failing: [51]), index))
        XCTAssertNil(CiLens.lens(try pr(5, failing: []), index))
    }

    func testNeverMatchesAJobIdFromAnotherRepository() throws {
        XCTAssertNil(CiLens.lens(try pr(1, failing: [11], repo: "other"), index))
    }

    func testLeavesMediumAndUnsharedGroupsOut() throws {
        let quiet = CiLens.index([
            Self.group("medium", prKeys: ["acme/app#1", "acme/app#2"], baseRuns: [41], prJobIds: [11, 21], tier: .medium),
            Self.group("alone", prKeys: ["acme/app#2"], prJobIds: [22]),
        ])
        XCTAssertNil(CiLens.lens(try pr(2, failing: [21, 22]), quiet))
    }

    // MARK: - blockedPrsByGroup

    func testListsTheOpenPullRequestsWhoseCurrentFailedChecksAreInEachGroup() throws {
        let blocked = CiLens.blockedPrs([onMaster, sharedOnly], [
            try pr(1, failing: [11]),
            try pr(2, failing: [21, 22]),
            // #3 was pushed: its new job passed, the old failure is history.
            try pr(3, failing: []),
        ])
        XCTAssertEqual(blocked["master"]?.map(\.number), [1, 2])
        XCTAssertEqual(blocked["shared"]?.map(\.number), [2])
    }

    // MARK: - The list's facts

    func testARedPullRequestOnlySharedFailuresHoldIsNotYourTurnAndBlockedByCi() throws {
        let mine = try samplePR(1, repo: "app", author: "koen", failed: 1, extra: ["failedChecks": [["name": "job 11", "jobId": 11, "runId": 1, "runNumber": NSNull(), "completedAt": NSNull()]]])
        let lookup = CiLens.lookup([onMaster], [mine])
        let facts = PrFacts(mine, PrFactsContext(logins: ["koen"], now: samplePRNow, ciOf: lookup))
        XCTAssertEqual(facts.ci, PrCiFacts(blocked: 1, outside: true))
        XCTAssertFalse(facts.yourTurn)
        XCTAssertEqual(facts.bucket, .failing)
        XCTAssertEqual(facts.next, NextStep(label: "Blocked by shared CI", waitingOn: .ci, tone: .block))
        XCTAssertEqual(PrCiFacts(blocked: 1, outside: true).markerText(base: "main"), "not this PR")
        XCTAssertEqual(PrCiFacts(blocked: 3, outside: false).markerText(base: "main"), "shared ×3")

        let partly = try samplePR(2, repo: "app", author: "koen", failed: 2, extra: ["failedChecks": [
            ["name": "job 21", "jobId": 21, "runId": 1, "runNumber": NSNull(), "completedAt": NSNull()],
            ["name": "lint", "jobId": 29, "runId": 1, "runNumber": NSNull(), "completedAt": NSNull()],
        ]])
        let own = PrFacts(partly, PrFactsContext(logins: ["koen"], now: samplePRNow, ciOf: CiLens.lookup([onMaster], [partly])))
        XCTAssertEqual(own.ci, PrCiFacts(blocked: 1, outside: false))
        XCTAssertTrue(own.yourTurn, "a shared failure that is partly its own")
        XCTAssertEqual(own.next.label, "Fix checks")
    }
}
