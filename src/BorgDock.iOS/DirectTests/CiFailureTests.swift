import XCTest
@testable import BorgDock

/// The server's `test/github-ci.test.ts` against the Swift port, with the same logs (`CiLogs`) and expectations, so
/// a log reads and groups the same on both sides. After them: what only the phone has, the document it keeps.
final class CiFailureTests: XCTestCase {
    private func signals(_ log: String, failedStep: String? = nil) -> [CiSignal] {
        CiLog.extract(log, failedStep: failedStep).signals
    }

    // MARK: Reading a log

    func testVitestTheAssertionTheTestAndTheSourceLocation() throws {
        let first = try XCTUnwrap(signals(CiLogs.vitestFailure).first)
        XCTAssertEqual(first.kind, .test)
        XCTAssertEqual(first.parser, "vitest")
        XCTAssertEqual(first.testId, "src/services/__tests__/cart.test.ts > cart > applies the discount")
        XCTAssertEqual(first.message, "AssertionError: expected 100 to be 90 // Object.is equality")
        XCTAssertEqual(first.errorClass, "AssertionError")
        XCTAssertEqual(first.path, "src/services/__tests__/cart.test.ts")
        XCTAssertEqual(first.line, 24)
    }

    func testPlaywrightTheTotalsFirstEachFailedTestOnceWithItsRetries() throws {
        let signals = signals(CiLogs.playwrightRetries)
        XCTAssertEqual(signals.first?.kind, .summary)
        let failure = try XCTUnwrap(signals.dropFirst().first)
        XCTAssertEqual(failure.testId, "tests/checkout.spec.ts › Checkout › applies a discount code")
        XCTAssertEqual(failure.params, "chromium")
        XCTAssertEqual(failure.message, "Error: expect(locator).toHaveText(expected) failed")
        XCTAssertGreaterThan(failure.repeats, 1)
    }

    func testTypescriptRustcDotnetNpmDockerAndCargoLogsEachNameWhatFailed() throws {
        let tsc = try XCTUnwrap(signals(CiLogs.tscErrors).first)
        XCTAssertEqual([tsc.parser, tsc.code, tsc.path], ["typescript", "TS2322", "src/services/cart.ts"])
        XCTAssertEqual(tsc.line, 14)
        let rustc = try XCTUnwrap(signals(CiLogs.rustcCompileError).first)
        XCTAssertEqual([rustc.parser, rustc.message], ["rustc", "mismatched types"])
        let dotnet = try XCTUnwrap(signals(CiLogs.dotnetXunit).first)
        XCTAssertEqual(dotnet.testId, "Shop.Orders.Tests.PricingTests.Applies_volume_discount")
        XCTAssertEqual(dotnet.message, "Assert.Equal() Failure: Values differ")
        let npm = try XCTUnwrap(signals(CiLogs.npmE404).first)
        XCTAssertEqual(npm.kind, .tooling)
        XCTAssertEqual(npm.code, "E404")
        let docker = try XCTUnwrap(signals(CiLogs.dockerBuildFailure).first)
        XCTAssertEqual([docker.parser, docker.path], ["docker", "Dockerfile"])
        XCTAssertEqual(docker.line, 9)
        let cargo = try XCTUnwrap(signals(CiLogs.cargoTestPanic).first)
        XCTAssertEqual([cargo.parser, cargo.errorClass], ["cargo-test", "assert_eq"])
    }

    func testALogNoParserKnowsFallsBackToItsErrorLineInsideTheFailedStep() {
        let extraction = CiLog.extract(CiLogs.networkGeneric, failedStep: "Run node scripts/fetch-registry-metadata.mjs")
        XCTAssertTrue(extraction.stepFound)
        XCTAssertEqual(extraction.signals.map(\.message), ["Error: getaddrinfo ENOTFOUND registry.npmjs.org"])
    }

    func testOnlyTheFailedStepIsReadEarlierStepsErrorsDidNotFailTheJob() {
        let two = [
            "##[group]Run bun run lint", "src/old.ts(1,1): error TS1005: x expected.", "##[endgroup]",
            "##[group]Run bun run test", "src/app.ts(2,3): error TS2322: Type string is not assignable to type number.", "##[error]Process completed with exit code 1.",
            "##[group]Post job cleanup", "error: something in cleanup",
        ].map { "2026-10-31T10:00:00.0000000Z \($0)" }.joined(separator: "\n")
        XCTAssertEqual(signals(two, failedStep: "Run bun run test").map(\.path), ["src/app.ts"])
        XCTAssertEqual(signals(two, failedStep: "bun run test").map(\.path), ["src/app.ts"])
        XCTAssertEqual(signals(two).map(\.path), ["src/old.ts", "src/app.ts"])
    }

    func testSignalsAreCappedClippedAndTheTotalsComeFirst() {
        let lines = [" 3 failed"] + (0..<40).map { "src/f\($0).ts(1,1): error TS2322: \(String(repeating: "x", count: 400))" }
        let signals = signals(lines.joined(separator: "\n"))
        XCTAssertEqual(signals.count, CiSignal.maxPerJob)
        XCTAssertEqual(signals.first?.message.unicodeScalars.count, CiSignal.maxLineCharacters)
    }

    func testTheSanitizerRemovesTokensCookiesCredentialsInURLsAndHomeFolders() {
        let scrub = CiSanitizer.scrub
        XCTAssertEqual(scrub("token ghp_abcdefghijklmnopqrstuvwxyz0123456789 used"), "token [REDACTED:github-token] used")
        XCTAssertEqual(scrub("Authorization: Bearer abc.def.ghi-123"), "Authorization: [REDACTED]")
        XCTAssertEqual(scrub("Cookie: session=abc; other=def"), "Cookie: [REDACTED]")
        XCTAssertEqual(scrub("git clone https://user:s3cret@github.com/a/b"), "git clone https://[REDACTED]@github.com/a/b")
        XCTAssertEqual(scrub("https://x.blob.core.windows.net/a?sv=2021&sig=AbC%2Fdef&se=2026"), "https://x.blob.core.windows.net/a?sv=2021&sig=[REDACTED]&se=2026")
        XCTAssertEqual(scrub("/Users/koen/dev/a.ts and /home/koen/a.ts"), "/Users/<user>/dev/a.ts and /home/<user>/a.ts")
        XCTAssertEqual(scrub("/home/runner/work/app/app/src/a.ts"), "/home/runner/work/app/app/src/a.ts")
        let ordinary = "src/app.ts(12,5): error TS2322: Type string is not assignable to type number.\nExpected: 200 Received: 503"
        XCTAssertEqual(scrub(ordinary), ordinary)
    }

    func testTheSameFailureOnTwoRunnersHasOneFingerprintABareFailedNeverGroups() throws {
        let runA = "FAIL  src/cart.test.ts > cart > total\nAssertionError: expected 100 to be 90 at /home/runner/work/shop/shop/src/cart.ts:12:5 in 34ms\n⎯⎯⎯"
        let runB = "FAIL  src/cart.test.ts > cart > total\nAssertionError: expected 100 to be 90 at /Users/runner/work/shop/shop/src/cart.ts:12:5 in 51ms\n⎯⎯⎯"
        let a = CiGroups.read(log: runA, failedStep: nil, workflow: "CI")
        let b = CiGroups.read(log: runB, failedStep: nil, workflow: "CI")
        XCTAssertEqual(a.tier, .high)
        XCTAssertNotNil(a.fingerprint)
        XCTAssertEqual(a.fingerprint, b.fingerprint)
        let generic = try XCTUnwrap(signals("Error: the deploy failed").first)
        XCTAssertEqual(CiFingerprint.of(generic, failedStep: "Deploy", workflow: nil)?.tier, .low)
    }

    func testAFingerprintsHashHasTheDigitsJavaScriptGives() {
        // What `hashText` of the server's `ci/fingerprint.ts` answers for the same text.
        XCTAssertEqual(CiFingerprint.hash(""), "0bdcb81aee8d83")
        XCTAssertEqual(CiFingerprint.hash("test:vitest:src/cart.test.ts > cart > total"), "11c1ee380cf6e8")
        XCTAssertEqual(CiFingerprint.hash("Ünïcödé ✓ 😀 text"), "1fd72034af18ee", "by UTF-16 code unit, as JavaScript counts")
    }

    // MARK: Groups

    private static let vitestRead = CiGroups.read(log: CiLogs.vitestFailure, failedStep: "Run bun run test", workflow: "CI")

    /// A read failure of the vitest log on acme/shop#1, with what a case changes.
    private func failure(
        jobId: Int, runId: Int? = nil, headSha: String = "sha", branch: String = "feat/x", prKey: String? = "acme/shop#1", checkName: String = "test",
        failedStep: String? = "Run bun run test", failedAt: String = "2026-10-31T10:00:00Z"
    ) -> JobFailure {
        let read = Self.vitestRead
        return JobFailure(
            jobId: jobId, repo: "acme/shop", runId: runId ?? jobId * 10, headSha: headSha, branch: branch, prKey: prKey, checkName: checkName, workflow: "CI",
            failedStep: failedStep, failedAt: failedAt, readAt: "2026-10-31T10:05:00Z", status: .read, error: nil, signals: read.signals,
            fingerprint: read.fingerprint, tier: read.tier, title: read.title
        )
    }

    func testOneGroupPerFingerprintAcrossPullRequestsAndTheBaseBranchBaseFirstWithItsSuspect() throws {
        let jobs = [
            failure(jobId: 1, headSha: "m1", branch: "main", prKey: nil, failedAt: "2026-10-30T09:00:00Z"),
            failure(jobId: 2, prKey: "acme/shop#1", failedAt: "2026-10-31T09:00:00Z"),
            failure(jobId: 3, branch: "feat/y", prKey: "acme/shop#2", failedAt: "2026-10-31T11:00:00Z"),
            // An attempt that has since been rerun green, and a closed pull request: neither is live.
            failure(jobId: 4, prKey: "acme/shop#1", failedAt: "2026-10-29T09:00:00Z"),
            failure(jobId: 5, prKey: "acme/shop#9"),
        ]
        let mira = Person(login: "mira", name: "Mira", avatarUrl: nil)
        let groups = CiGroups.build(jobs, CiGroups.Context(
            openPrs: ["acme/shop#1": .init(title: "Totals", failingJobs: [2]), "acme/shop#2": .init(title: "Discounts", failingJobs: [3])],
            baseBranches: ["acme/shop:main": .init(suspect: CiSuspect(sha: "m1", message: "Round totals"), runIds: [10])],
            claims: [CiGroups.id(of: try XCTUnwrap(jobs[0].fingerprint)): CiClaim(by: mira, at: "2026-10-31T11:30:00Z", note: "on it")]
        ))
        XCTAssertEqual(groups.count, 1)
        let group = try XCTUnwrap(groups.first)
        XCTAssertEqual(group.failures, 3)
        XCTAssertEqual(group.firstFailedAt, "2026-10-30T09:00:00Z")
        XCTAssertEqual(group.lastFailedAt, "2026-10-31T11:00:00Z")
        XCTAssertEqual(group.branches.map { $0.prKey ?? $0.branch }, ["main", "acme/shop#1", "acme/shop#2"])
        XCTAssertEqual(group.branches.first?.suspect, CiSuspect(sha: "m1", message: "Round totals"))
        XCTAssertTrue(group.signal.hasPrefix("AssertionError: expected 100 to be 90"))
        XCTAssertEqual(group.location, "src/services/__tests__/cart.test.ts:24")
        XCTAssertEqual(group.claim?.note, "on it")

        let onPr = CiGroups.checkFailure(of: jobs[1], in: groups) { _, _ in "2026-10-30T08:00:00Z" }
        XCTAssertEqual(onPr.groupId, group.id)
        XCTAssertFalse(onPr.newInThisPr)
        XCTAssertEqual(onPr.alsoOnBase, AlsoOnBase(since: "2026-10-30T08:00:00Z", claimedBy: mira))
        XCTAssertEqual(onPr.step, "Run bun run test")
        XCTAssertEqual(onPr.summary, "AssertionError: expected 100 to be 90 // Object.is equality")
        XCTAssertEqual(onPr.snippet?.contains("expected 100 to be 90"), true)
    }

    func testAGroupCarriesTheDesktopStoresFactsOverEveryKeptFailureNotOnlyTheLiveOnes() throws {
        let jobs = [
            failure(jobId: 1, runId: 100, headSha: "m1", branch: "main", prKey: nil, failedAt: "2026-10-30T09:00:00Z"),
            failure(jobId: 2, runId: 20, headSha: "h1", prKey: "acme/shop#1"),
            // Passed when rerun on the same commit: flaky.
            failure(jobId: 3, runId: 21, headSha: "h1", prKey: "acme/shop#1", checkName: "unit"),
            // A pull request that has closed since still counts toward shared.
            failure(jobId: 4, runId: 40, prKey: "acme/shop#9", failedStep: "Set up job"),
        ]
        let groups = CiGroups.build(jobs, CiGroups.Context(
            openPrs: ["acme/shop#1": .init(title: "Totals", failingJobs: [2], headSha: "h1", passingChecks: ["unit"])]
        ))
        let group = try XCTUnwrap(groups.first)
        XCTAssertEqual(group.branches.map(\.prKey), ["acme/shop#1"])
        XCTAssertEqual(group.facts, CiGroupFacts(
            tier: .high,
            repos: ["acme/shop"],
            prKeys: ["acme/shop#1", "acme/shop#9"],
            prJobIds: [2, 3, 4],
            baseRuns: [100],
            runCount: 4,
            passedOnRetry: 1,
            catalogIds: [],
            failedSteps: ["Run bun run test", "Set up job"]
        ))
    }

    func testAFailureOnlyThisPullRequestHasIsNewInItAnUnreadableLogSaysWhy() {
        let only = failure(jobId: 7)
        let groups = CiGroups.build([only], CiGroups.Context(openPrs: ["acme/shop#1": .init(title: "x", failingJobs: [7])]))
        let view = CiGroups.checkFailure(of: only, in: groups)
        XCTAssertTrue(view.newInThisPr)
        XCTAssertNil(view.alsoOnBase)
        var unreadable = failure(jobId: 8)
        unreadable.status = .unavailable
        unreadable.error = "GitHub has no log for this job."
        unreadable.signals = []
        unreadable.fingerprint = nil
        unreadable.tier = nil
        let missing = CiGroups.checkFailure(of: unreadable, in: groups)
        XCTAssertEqual(missing.summary, "GitHub has no log for this job.")
        XCTAssertNil(missing.snippet)
        XCTAssertNil(missing.groupId)
    }

    // MARK: What the phone keeps

    func testTheDocumentKeepsWhatTheScreensShowOfAJobItsFirstFailureAndTheSnippetsLines() throws {
        let read = failure(jobId: 1)
        XCTAssertGreaterThan(read.signals.count, 1, "the log names several failures")
        var memory = CiMemory()
        memory.save(read)
        let kept = try XCTUnwrap(memory.job(1))
        XCTAssertEqual(kept.signals.map(\.message), ["AssertionError: expected 100 to be 90 // Object.is equality"])
        XCTAssertLessThanOrEqual(kept.signals[0].excerpt.count, CiGroups.snippetLines)
        XCTAssertEqual(kept.fingerprint, read.fingerprint)
        XCTAssertEqual(CiGroups.checkFailure(of: kept, in: []), CiGroups.checkFailure(of: read, in: []), "a kept job shows as the read one did")
    }

    func testFailuresOlderThanTwoWeeksAreForgottenUnlessStillRedAndAClaimGoesWithItsGroup() throws {
        let now = try Date("2026-10-31T12:00:00Z", strategy: .iso8601)
        var memory = CiMemory()
        memory.save(failure(jobId: 1, failedAt: "2026-10-10T09:00:00Z"))
        memory.save(failure(jobId: 2, failedAt: "2026-10-30T09:00:00Z"))
        let group = CiGroups.id(of: try XCTUnwrap(memory.job(1)?.fingerprint))
        memory.setClaim(CiClaim(by: Person(login: "koen", name: nil, avatarUrl: nil), at: "2026-10-31T11:30:00Z", note: nil), on: group)

        var stillRed = memory
        stillRed.prune(now: now, live: [1])
        XCTAssertEqual(stillRed.failures.map(\.jobId), [1, 2], "red now: forgetting it would read its log again every poll")

        memory.prune(now: now, live: [])
        XCTAssertEqual(memory.failures.map(\.jobId), [2])
        XCTAssertNotNil(memory.claims[group], "job 2 is the same failure: its group is still there")
        memory.prune(now: now.addingTimeInterval(CiMemory.retention), live: [])
        XCTAssertTrue(memory.failures.isEmpty)
        XCTAssertTrue(memory.claims.isEmpty)
    }

    func testPastItsLimitTheDocumentDropsTheOldestFailuresFirst() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        var memory = CiMemory()
        for job in 1...(CiMemory.maxJobs + 5) {
            memory.save(failure(jobId: job, failedAt: GitHubTime.iso(now.addingTimeInterval(TimeInterval(job)))))
        }
        memory.prune(now: now, live: [1])
        XCTAssertEqual(memory.failures.count, CiMemory.maxJobs)
        XCTAssertEqual(memory.failures.prefix(2).map(\.jobId), [1, 7], "the oldest five go, but not the one that is red now")
    }

    func testADocumentReadUnderOtherFingerprintRulesIsForgotten() throws {
        let store = MemoryStore()
        var memory = CiMemory()
        memory.save(failure(jobId: 1))
        store.set(memory, forKey: CiMemory.storeKey)
        XCTAssertEqual(CiMemory.kept(in: store).failures.map(\.jobId), [1])

        var document = try XCTUnwrap(store.data(forKey: CiMemory.storeKey).flatMap { try JSONSerialization.jsonObject(with: $0) } as? [String: Any])
        document["rules"] = CiFingerprint.version - 1
        store.set(try JSONSerialization.data(withJSONObject: document), forKey: CiMemory.storeKey)
        XCTAssertTrue(CiMemory.kept(in: store).failures.isEmpty, "its fingerprints would never match what is read now")
    }

    // MARK: The log tail

    private func tail(_ answer: GitHubFake.Answer, redirected: Bool = true) async throws -> String? {
        GitHubFake.reset()
        if redirected {
            GitHubFake.onRest("GET", "/actions/jobs/7/logs$") { _ in .redirect(to: "https://storage.example/logs/7?sig=secret") }
            GitHubFake.onRest("GET", #"^https://storage\.example/"#) { _ in answer }
        } else {
            GitHubFake.onRest("GET", "/actions/jobs/7/logs$") { _ in answer }
        }
        return try await GitHubClient(account: Fake.account("koen"), session: GitHubFake.session()).logTail(repository: "acme/shop", jobId: 7)
    }

    func testALogTailDropsItsCutFirstLineAndAsksStorageWithoutTheToken() async throws {
        let log = try await tail(.text("f a line cut in two\nsecond line\nthird line", status: 206))
        XCTAssertEqual(log, "second line\nthird line")
        let storage = try XCTUnwrap(GitHubFake.requests("GET", #"storage\.example"#).first)
        XCTAssertEqual(storage.headers["Range"], "bytes=-65536")
        XCTAssertNil(storage.headers["Authorization"], "the token never reaches log storage")
        XCTAssertNotNil(GitHubFake.requests("GET", "/actions/jobs/7/logs$").first?.headers["Authorization"])
    }

    func testAWholeLogIsKeptAsItIsAnEmptyOneIsEmptyAndAMissingOneIsNoLog() async throws {
        let whole = try await tail(.text("first line\nsecond line"))
        XCTAssertEqual(whole, "first line\nsecond line", "storage sent all of it: nothing was cut")
        let empty = try await tail(GitHubFake.Answer(status: 416))
        XCTAssertEqual(empty, "")
        let gone = try await tail(.status(404, message: "BlobNotFound"))
        XCTAssertNil(gone)
        let expired = try await tail(.status(410, message: "Gone"), redirected: false)
        XCTAssertNil(expired)
        do {
            _ = try await tail(.status(500, message: "Server Error"))
            XCTFail("a storage failure is an error, not an empty log")
        } catch let error as GitHubError {
            XCTAssertEqual(error, GitHubError(status: 500, message: "Reading the log failed (500)."))
        }
    }
}
