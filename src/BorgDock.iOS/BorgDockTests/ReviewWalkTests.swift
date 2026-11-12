import XCTest
@testable import BorgDock

/// Quick Review's walk: the order (source by folder, docs, then tests and generated files as one step each), moving
/// by path, Mark reviewed, the words around it, decisions and a load that fails twice.
@MainActor
final class ReviewWalkTests: XCTestCase {
    private func file(_ path: String, _ category: PrFileCategory? = nil, additions: Int = 1, deletions: Int = 0) -> PrFile {
        PrFile(path: path, previousPath: nil, status: .modified, additions: additions, deletions: deletions,
               patch: "@@ -1 +1 @@\n-a\n+b", changedSinceReview: false, category: category)
    }

    /// The mockup's mix in miniature: three source folders, a doc, tests and generated files, in GitHub's order.
    private var files: [PrFile] {
        [
            file("src/receipt/render.ts"),
            file("README.md", .docs),
            file("src/cart/line.ts"),
            file("src/cart/__tests__/total.test.ts", .tests, additions: 64, deletions: 12),
            file("bun.lock", .generated),
            file("src/cart/total.ts"),
            file("e2e/checkout.spec.ts", .tests, additions: 112, deletions: 30),
            file("src/invoice/export.ts", nil),
            file("src/generated/api.ts", .generated),
        ]
    }

    private func defaults() -> UserDefaults {
        let name = "ReviewWalkTests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: name)!
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    private func session(_ files: [PrFile]? = nil, reviewed: Set<String> = [], start: ReviewWalk.Position? = nil) throws -> ReviewSession {
        let storage = ReviewedFiles(defaults: defaults())
        let prFiles = PrFiles(headSha: "head", reviewedHeadSha: nil, files: files ?? self.files)
        storage.save(reviewed, prKey: "acme/shop#412", headSha: "head")
        let session = ReviewSession(key: PrKey(owner: "acme", repo: "shop", number: 412), storage: storage)
        session.show(detail: try sampleDetail(), files: prFiles, start: start)
        return session
    }

    private func sampleDetail() throws -> PrDetail {
        let summary = try samplePR(412, bucket: "you")
        var json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(summary)) as! [String: Any]
        json.merge([
            "body": "", "commits": 6, "reviews": [], "requestedReviewers": [], "requestedFromYou": true,
            "checkRuns": [
                ["id": 1, "name": "e2e / checkout", "workflow": "e2e", "state": "failure", "url": "https://example.com", "startedAt": NSNull(), "completedAt": NSNull(), "durationSeconds": NSNull(), "runId": NSNull(), "jobId": NSNull(), "failure": NSNull()],
                ["id": 2, "name": "lint", "workflow": "lint", "state": "success", "url": "https://example.com", "startedAt": NSNull(), "completedAt": NSNull(), "durationSeconds": NSNull(), "runId": NSNull(), "jobId": NSNull(), "failure": NSNull()],
            ],
            "proofImages": [], "allowedMergeMethods": ["squash"], "defaultMergeMethod": "squash", "deleteBranchOnMerge": true,
            "viewerCanMerge": true, "workItems": [], "threads": [],
        ]) { $1 }
        return try JSONDecoder().decode(PrDetail.self, from: JSONSerialization.data(withJSONObject: json))
    }

    // MARK: - Order

    func testSourceByFolderThenDocsThenOneStepPerGroup() {
        let walk = ReviewWalk(files)
        XCTAssertEqual(walk.files.map(\.path), ["src/cart/line.ts", "src/cart/total.ts", "src/invoice/export.ts", "src/receipt/render.ts", "README.md"],
                       "folders in order, GitHub's order within a folder, docs after the source; no category reads as source")
        XCTAssertEqual(walk.tests.map(\.path), ["src/cart/__tests__/total.test.ts", "e2e/checkout.spec.ts"], "a step keeps GitHub's order")
        XCTAssertEqual(walk.generated.map(\.path), ["bun.lock", "src/generated/api.ts"])
        XCTAssertEqual(walk.steps.suffix(2), [.step(.tests), .step(.generated)])
        XCTAssertEqual(walk.steps.count, 7)
        XCTAssertEqual(walk.total, 9)
    }

    func testAStepIsLeftOutWhenNothingIsInIt() {
        let walk = ReviewWalk([file("a.ts"), file("b.test.ts", .tests)])
        XCTAssertEqual(walk.steps, [.file("a.ts"), .step(.tests)])
        XCTAssertEqual(walk.caption(at: .file("a.ts"), reviewed: []).rest, "· then tests, one step")
        XCTAssertEqual(ReviewWalk([file("a.ts")]).caption(at: .file("a.ts"), reviewed: []).rest, "")
    }

    func testAStepsFilesAreReadFromTheStepAndLeadOnToTheNextStep() {
        let walk = ReviewWalk(files)
        XCTAssertEqual(walk.next(after: .file("README.md")), .step(.tests))
        XCTAssertEqual(walk.next(after: .step(.tests)), .step(.generated), "a step is one page, not one per test")
        XCTAssertEqual(walk.next(after: .file("src/cart/__tests__/total.test.ts")), .file("e2e/checkout.spec.ts"))
        XCTAssertEqual(walk.next(after: .file("e2e/checkout.spec.ts")), .step(.generated))
        XCTAssertEqual(walk.previous(before: .file("src/cart/__tests__/total.test.ts")), .step(.tests))
        XCTAssertEqual(walk.previous(before: .file("e2e/checkout.spec.ts")), .file("src/cart/__tests__/total.test.ts"))
        XCTAssertEqual(walk.previous(before: .file("src/cart/line.ts")), nil)
        XCTAssertNil(walk.next(after: .step(.generated)))
        XCTAssertTrue(walk.isForward(from: .step(.tests), to: .file("e2e/checkout.spec.ts")))
        XCTAssertFalse(walk.isForward(from: .step(.generated), to: .file("src/cart/total.ts")))
    }

    // MARK: - Marking, keyed by path

    func testMarkReviewedOpensTheNextUnreviewedFileEveryTime() throws {
        let session = try session(reviewed: ["src/cart/total.ts"])
        XCTAssertEqual(session.position, .file("src/cart/line.ts"), "starts on the first file you haven't reviewed")
        var seen: [ReviewWalk.Position?] = []
        for _ in 0..<4 {
            session.markCurrentReviewed()
            seen.append(session.position)
            XCTAssertEqual(session.currentFile?.path, session.position?.path, "the page and the title name the same file")
        }
        XCTAssertEqual(seen, [.file("src/invoice/export.ts"), .file("src/receipt/render.ts"), .file("README.md"), .step(.tests)],
                       "skips the file reviewed earlier, then the step after the files")
        XCTAssertEqual(session.left, 2)
        XCTAssertEqual(session.walk.caption(at: .step(.tests), reviewed: session.reviewed), .init(lead: "Step 6 of 7", rest: "· all 5 source files reviewed"))
    }

    func testMarkingAStepCoversEveryFileInItAndTheLastOneOpensTheDecision() throws {
        let walkFiles = ReviewWalk(files).files.map(\.path)
        let session = try session(reviewed: Set(walkFiles), start: .file("e2e/checkout.spec.ts"))
        XCTAssertEqual(session.position, .file("e2e/checkout.spec.ts"))
        XCTAssertFalse(session.markCurrentReviewed(), "the generated step is still open")
        XCTAssertTrue(session.reviewed.isSuperset(of: ["e2e/checkout.spec.ts", "src/cart/__tests__/total.test.ts"]))
        XCTAssertEqual(session.position, .step(.generated))
        XCTAssertTrue(session.markCurrentReviewed(), "nothing left")
        XCTAssertTrue(session.isDone)
    }

    func testAResumedWalkStartsOnTheFirstUnreviewedFileAndAMissingStartIsIgnored() throws {
        let session = try session(reviewed: ["src/cart/line.ts", "src/cart/total.ts"], start: .file("gone.ts"))
        XCTAssertEqual(session.position, .file("src/invoice/export.ts"))
        XCTAssertTrue(session.opened.contains("src/invoice/export.ts"))
        session.unmarkCurrent()
        session.goBack()
        XCTAssertEqual(session.position, .file("src/cart/total.ts"))
        XCTAssertFalse(session.movedForward)
        session.goToNextUnreviewed()
        XCTAssertEqual(session.position, .file("src/invoice/export.ts"))
    }

    func testReviewedFilesAreSavedForTheHead() throws {
        let storage = ReviewedFiles(defaults: defaults())
        let session = ReviewSession(key: PrKey(owner: "acme", repo: "shop", number: 1), storage: storage)
        session.show(detail: try sampleDetail(), files: PrFiles(headSha: "h1", reviewedHeadSha: nil, files: files))
        session.markCurrentReviewed()
        XCTAssertEqual(storage.saved(prKey: "acme/shop#1", headSha: "h1"), ["src/cart/line.ts"])
    }

    // MARK: - The words around it

    func testCaptionsCountFilesAmongThemselvesAndNameTheStepsAhead() {
        let walk = ReviewWalk(files)
        XCTAssertEqual(walk.caption(at: .file("src/invoice/export.ts"), reviewed: []), .init(lead: "File 3 of 5", rest: "· then tests and generated, one step each"))
        XCTAssertEqual(walk.caption(at: .step(.generated), reviewed: ["src/cart/line.ts"]), .init(lead: "Step 7 of 7", rest: "· 1 of 5 source files reviewed"))
        XCTAssertEqual(walk.caption(at: .file("e2e/checkout.spec.ts"), reviewed: []), .init(lead: "Test 2 of 2", rest: "· part of the tests step"))
    }

    func testLeftCountsFilesAndOneForEachStep() {
        let walk = ReviewWalk(files)
        XCTAssertEqual(walk.left([]), 7)
        XCTAssertEqual(walk.left(["src/cart/line.ts", "e2e/checkout.spec.ts"]), 6, "half a step isn't a step")
        XCTAssertEqual(walk.reviewedSummary(Set(walk.files.map(\.path) + walk.tests.map(\.path) + walk.generated.map(\.path))), "5 of 5 files and both steps")
        XCTAssertEqual(walk.reviewedSummary(Set(walk.tests.map(\.path))), "0 of 5 files and the tests step")
    }

    func testTheProgressBarHasAStretchPerStep() {
        let walk = ReviewWalk(files)
        XCTAssertEqual(walk.progress(at: .file("src/cart/total.ts"), reviewed: ["src/cart/line.ts"]), [
            .init(weight: 1, fill: .reviewed), .init(weight: 4, fill: .open), .init(weight: 1, fill: .step), .init(weight: 1, fill: .step),
        ])
        XCTAssertEqual(walk.progress(at: .file("e2e/checkout.spec.ts"), reviewed: Set(walk.files.map(\.path))).suffix(2), [
            .init(weight: 1, fill: .current), .init(weight: 1, fill: .step),
        ], "a test opened from its step lights the step")
    }

    func testGeneratedStepsAreDescribedLockfilesFirst() {
        XCTAssertEqual(ReviewWalk.describeGenerated(["src/generated/api.ts", "src/cart/__snapshots__/total.test.ts.snap", "bun.lock", "src/generated/schema.ts"]),
                       "bun.lock, snapshots, src/generated")
        XCTAssertEqual(ReviewWalk.describeGenerated(["dist/app.min.js", "Package.resolved"]), "Package.resolved, dist")
    }

    func testTheBriefsBarCountsFilesByKind() {
        let mix = ChangeMix(files: files)
        XCTAssertEqual(mix.parts.map(\.kind), [.source, .docs, .tests, .generated])
        XCTAssertEqual(mix.parts.map(\.count), [4, 1, 2, 2])
        XCTAssertEqual(ChangeMix(files: [file("a.ts")]).parts.map(\.kind), [.source], "no empty kinds")
    }

    // MARK: - Decisions

    func testTheDecisionBannerSaysWhatYouDidAtWhichCommit() throws {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        var record = ReviewDecisionRecord(event: .approve, body: "Nice", lineComments: [ReviewLineComment(path: "src/cart/total.ts", line: 14, side: .right, body: "nit")],
                                          headSha: "4f2c1a9b7e3d", at: now.addingTimeInterval(-65), autoMerge: true, status: .posted)
        let banner = record.banner(detail: try sampleDetail(), now: now)
        XCTAssertEqual(banner.title, "You approved this")
        XCTAssertEqual(banner.text, "at 4f2c1a9, 1 minute ago. Auto-merge is on: GitHub merges when e2e passes.")
        XCTAssertEqual(record.lineCommentSummary, "1 line comment · total.ts:14")

        record.status = .failed("Head moved on.")
        XCTAssertEqual(record.banner(detail: nil, now: now).title, "Not submitted.")
        let comment = ReviewDecisionRecord(event: .comment, body: "", lineComments: [], headSha: "abcdef1234", at: now, autoMerge: false, status: .posted)
        XCTAssertEqual(comment.banner(detail: nil, now: now).text, "at abcdef1, just now.", "no merge sentence for a comment")
    }

    // MARK: - Loading

    func testAFailedLoadSaysWhyAndThatTheApprovalIsSafe() {
        XCTAssertEqual(ReviewLoadFailure.message(APIError.upstream("GitHub took longer than 30 seconds."), attempts: 2, approvalElsewhere: 405),
                       "GitHub took longer than 30 seconds, twice. Your approval of #405 isn't affected.")
        XCTAssertEqual(ReviewLoadFailure.message(APIError.network("Can't reach BorgDock at x. The request timed out."), attempts: 2, approvalElsewhere: nil),
                       "BorgDock took longer than 30 seconds to answer, twice.")
    }

    func testAReadIsRetriedOnceThenFails() async throws {
        var attempts = 0
        let value = try await RetryOnce.run(sleep: { _ in }) {
            attempts += 1
            if attempts == 1 { throw APIError.upstream("slow") }
            return "detail"
        }
        XCTAssertEqual(value, "detail")
        XCTAssertEqual(attempts, 2)

        attempts = 0
        do {
            _ = try await RetryOnce.run(sleep: { _ in }) { () async throws -> String in
                attempts += 1
                throw APIError.upstream("slow")
            }
            XCTFail("a second failure is reported")
        } catch {
            XCTAssertEqual(attempts, 2)
        }
    }
}
