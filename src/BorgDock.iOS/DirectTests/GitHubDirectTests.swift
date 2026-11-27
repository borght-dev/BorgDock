import XCTest
@testable import BorgDock

/// The server's `test/github-service.test.ts` and `github-repositories.test.ts` against the phone's own reader, plus
/// what only the phone does: answer from the last read, read again after a write, keep the list and what job logs
/// said for the next launch.
final class GitHubDirectTests: XCTestCase {
    private var world = GitHubWorld()

    override func setUp() {
        GitHubFake.reset()
        world = GitHubWorld()
        world.install()
    }

    /// A read of the list starts reading job logs behind it; they finish before the next test begins.
    override func tearDown() async throws {
        await world.settle()
    }

    private func status(_ error: Error) -> Int? {
        switch error as? APIError {
        case .unauthorized: 401
        case .conflict: 409
        case .upstream: 502
        case .stillLoading: 503
        case .server(let status, _): status
        default: nil
        }
    }

    private func assertFails(_ expected: Int, _ work: () async throws -> some Sendable, file: StaticString = #filePath, line: UInt = #line) async {
        do {
            _ = try await work()
            XCTFail("Expected a failure with status \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(status(error), expected, "\(error)", file: file, line: line)
        }
    }

    // MARK: The list

    func testAPollBucketsThePullRequestsThatInvolveYouWithReasons() async throws {
        let focus = try await world.service().focus(fresh: false)
        XCTAssertEqual(focus.counts, ["you": 1, "wait": 0, "ready": 1, "stale": 0])
        let (first, second) = (focus.pullRequests[0], focus.pullRequests[1])
        XCTAssertEqual(first.key, "acme/shop#1")
        XCTAssertEqual(first.bucket, .you)
        XCTAssertTrue(first.reason.text.hasPrefix("Sanne asked for your review"))
        XCTAssertEqual(first.workItemIds, [60379])
        XCTAssertEqual(first.checks.failed, 1)
        XCTAssertFalse(first.isMine)
        XCTAssertEqual(second.bucket, .ready)
        XCTAssertTrue(second.isMine)
        XCTAssertEqual(second.approvedBy, ["mira"])
        XCTAssertEqual(focus.teams, ["koen": ["platform"]])
        let searched = Set(GitHubFake.operations("FocusSearch").compactMap { $0.query.firstMatch(of: #/\S+:@me/#).map { String($0.0) } })
        XCTAssertEqual(searched, ["involves:@me", "review-requested:@me", "reviewed-by:@me"])
    }

    func testReviewRequestsAndYourReviewsComeFromTheirOwnSearchesPagedToTheEnd() async throws {
        let teamAsks = (0..<25).map { Fake.pullRequest(number: 100 + $0, title: "Team change \($0)", author: "tom", teams: ["platform"]) }
        let reviewed = Fake.pullRequest(number: 4, title: "Split the checkout", author: "mira", headSha: "new", reviews: [.init(login: "koen", state: "APPROVED", sha: "old")], commits: ["old", "new"])
        let (review, mine) = (world.review, world.mine)
        GitHubFake.onGraphql("FocusSearch") { seen in
            if seen.query.contains("involves:@me") { return .data(Fake.searchAnswer([review, mine])) }
            if seen.query.contains("reviewed-by:@me") { return .data(Fake.searchAnswer([reviewed])) }
            return seen.variables["after"] as? String == "page-2"
                ? .data(Fake.searchAnswer(Array(teamAsks[20...]) + [review]))
                : .data(Fake.searchAnswer(Array(teamAsks[..<20]), next: "page-2"))
        }
        let focus = try await world.service().focus(fresh: false)
        XCTAssertEqual(focus.pullRequests.count, 28, "#1, #2, #4 and 25 team requests, each once")
        XCTAssertEqual(focus.pullRequests.first { $0.key == "acme/shop#124" }?.bucket, .you, "a request to your team needs you")
        XCTAssertEqual(GitHubFake.operations("FocusSearch").filter { $0.query.contains("review-requested:@me") }.count, 2, "two pages")
    }

    func testASearchThatFailsKeepsItsLastAnswerTheOthersRefresh() async throws {
        let teamAsk = Fake.pullRequest(number: 3, title: "Cache the price list", author: "tom", teams: ["platform"])
        let (review, mine) = (world.review, world.mine)
        let down = Flag()
        GitHubFake.onGraphql("FocusSearch") { seen in
            if seen.query.contains("review-requested:@me") { return down.isSet ? GitHubFake.Answer(status: 504, body: Data("<!DOCTYPE html>".utf8)) : .data(Fake.searchAnswer([teamAsk])) }
            return .data(Fake.searchAnswer(seen.query.contains("involves:@me") ? [review, mine] : []))
        }
        let service = world.service()
        _ = try await service.refresh()
        down.set()
        let focus = try await service.refresh()
        XCTAssertEqual(focus.pullRequests.map(\.key).sorted(), ["acme/shop#1", "acme/shop#2", "acme/shop#3"])
    }

    func testAnAccountThatFailsKeepsTheOthersCountingNoAccountAnsweringIsAnError() async throws {
        let focus = try await world.service(accounts: ["koen", "broken"]).focus(fresh: false)
        XCTAssertEqual(focus.pullRequests.count, 2)
        await assertFails(502) { try await self.world.service(accounts: ["broken"]).focus(fresh: false) }
        GitHubFake.onGraphql("FocusSearch") { _ in .status(401, message: "Bad credentials") }
        await assertFails(401) { try await self.world.service().focus(fresh: false) }
    }

    func testTheListAnswersFromTheLastReadForAMinuteAndReadsAgainWhenAskedFresh() async throws {
        let service = world.service()
        _ = try await service.focus(fresh: false)
        let searches = GitHubFake.operations("FocusSearch").count
        _ = try await service.focus(fresh: false)
        XCTAssertEqual(GitHubFake.operations("FocusSearch").count, searches, "read a moment ago: no new search")
        _ = try await service.focus(fresh: true)
        XCTAssertEqual(GitHubFake.operations("FocusSearch").count, searches * 2)
    }

    func testTheListIsKeptForTheNextLaunch() async throws {
        XCTAssertNil(world.service().lastFocus())
        _ = try await world.service().focus(fresh: false)
        XCTAssertEqual(world.service().lastFocus()?.pullRequests.map(\.key), ["acme/shop#1", "acme/shop#2"])
    }

    // MARK: Watched repositories

    func testEachWatchedRepositoryIsSearchedOnItsOwnPagedByTheAccountThatCanReadIt() async throws {
        let teammate = (0..<120).map { Fake.pullRequest(number: 200 + $0, title: "Teammate change \($0)", author: "tom") }
        let portal = Fake.pullRequest(number: 7, title: "Partner portal sign-in", author: "tom", owner: "globex", repo: "portal")
        GitHubFake.onGraphql("FocusSearch") { seen in
            switch Fake.repositoryOf(seen) {
            case "globex/portal":
                if seen.reader == "work" { return .data(Fake.searchAnswer([portal])) }
                return .json(["data": Fake.searchAnswer([]), "errors": [["type": "INVALID", "path": ["found"], "message": "The listed users and repositories cannot be searched."]]])
            case "acme/shop":
                let page = Int(seen.variables["after"] as? String ?? "0") ?? 0
                return .data(Fake.searchAnswer(Array(teammate[(page * 20)..<(page * 20 + 20)]), next: page < 5 ? String(page + 1) : nil))
            default:
                return .data(Fake.searchAnswer([]))
            }
        }
        let service = world.service(accounts: ["koen", "work"])
        await service.watch(["globex/portal", "ACME/shop", "acme/shop", "not a repo"])
        let focus = try await service.focus(fresh: false)
        XCTAssertEqual(focus.pullRequests.filter { $0.title.hasPrefix("Teammate change") }.count, 120, "six pages of twenty")
        XCTAssertEqual(focus.pullRequests.first { $0.key == "globex/portal#7" }?.account, "work")
        let repositories = await service.repositories()
        XCTAssertEqual(repositories.source, .config)
        XCTAssertEqual(repositories.repositories.map(\.name), ["globex/portal", "ACME/shop"])
        XCTAssertEqual(repositories.repositories.map(\.open), [1, 120])
        XCTAssertFalse(repositories.cutOff)
        XCTAssertNotNil(repositories.polledAt)

        let before = GitHubFake.operations("FocusSearch").filter { Fake.repositoryOf($0) == "globex/portal" }.count
        _ = try await service.refresh()
        XCTAssertEqual(GitHubFake.operations("FocusSearch").filter { Fake.repositoryOf($0) == "globex/portal" }.count, before, "read a moment ago: it waits")
        _ = try await service.refresh(repositories: true)
        let later = GitHubFake.operations("FocusSearch").filter { Fake.repositoryOf($0) == "globex/portal" }.dropFirst(before)
        XCTAssertEqual(later.map(\.reader), ["work"], "the account that read it last reads it first")
        XCTAssertEqual(world.service().lastFocus()?.pullRequests.count, focus.pullRequests.count)
        let restarted = await world.service().repositories()
        XCTAssertEqual(restarted.repositories.map(\.name), ["globex/portal", "ACME/shop"], "the watch list survives a launch")
    }

    func testWithoutInvolvingSearchesOnlyTheWatchedRepositoriesAreReadWithoutTeamRequestsYourTeamsNeverCount() async throws {
        let teamAsk = Fake.pullRequest(number: 3, title: "Cache the price list", author: "tom", teams: ["platform"])
        GitHubFake.onGraphql("FocusSearch") { seen in .data(Fake.searchAnswer(Fake.repositoryOf(seen) == nil ? [] : [teamAsk])) }
        let service = world.service()
        await service.watch(["acme/shop"])
        var focus = try await service.focus(fresh: false)
        XCTAssertEqual(focus.pullRequests.first { $0.number == 3 }?.bucket, .you, "a request to your team needs you")
        let updated = await service.setRepositoryPreferences(PrRepositoryPreferences(includeInvolving: false, includeTeamRequests: false))
        XCTAssertEqual([updated.includeInvolving, updated.includeTeamRequests], [false, false])
        let seen = GitHubFake.operations("FocusSearch").count
        focus = try await service.focus(fresh: false)
        XCTAssertEqual(GitHubFake.operations("FocusSearch").dropFirst(seen).map(Fake.repositoryOf), ["acme/shop"])
        XCTAssertNotEqual(focus.pullRequests.first { $0.number == 3 }?.bucket, .you)
    }

    // MARK: One pull request

    func testDetailMergeOptionsProofImagesReviewsAndTheWorkItemsItNames() async throws {
        let item = WorkItemSummary(
            id: 60379, type: .pbi, typeName: "Product Backlog Item", title: "Keep the basket on timeout", state: "Code Review", stateCategory: .inProgress,
            workflow: ["New", "Code Review", "Done"], sprint: "Sprint 12", dueDate: nil, priority: 2, tags: [], assignedTo: "Sanne", assignedToMe: false,
            url: "https://dev.azure.com/acme/Shop/_workitems/edit/60379"
        )
        let service = world.service { ids in ids == [60379] ? [item] : [] }
        _ = try await service.focus(fresh: false)
        let detail = try await service.pullRequest(GitHubWorld.one)
        XCTAssertEqual(detail.allowedMergeMethods, [.squash, .rebase])
        XCTAssertEqual(detail.defaultMergeMethod, .squash)
        XCTAssertTrue(detail.viewerCanMerge)
        XCTAssertTrue(detail.requestedFromYou)
        XCTAssertEqual(detail.proofImages.map(\.alt), ["basket kept", "after"])
        XCTAssertEqual(detail.reviews.map { "\($0.author.login) \($0.state.rawValue)" }, ["mira commented"])
        XCTAssertEqual(detail.workItems.map(\.id), [60379])
        XCTAssertEqual(detail.commits, 3)
        XCTAssertEqual(detail.checkRuns.map(\.name), ["e2e", "lint"], "failures first")
        XCTAssertEqual(detail.checkRuns.first?.jobId, 501)
        XCTAssertEqual(detail.summary.failedChecks?.map(\.name), ["e2e"])
    }

    func testADetailAndItsFilesReadAtOnceAskGitHubForThePullRequestOnce() async throws {
        GitHubFake.onRest("GET", #"/pulls/1/files\?"#, json: [["filename": "src/cart.ts", "status": "modified", "additions": 1, "deletions": 0, "patch": "@@ -1 +1 @@\n+a"]])
        let service = world.service()
        _ = try await service.focus(fresh: false)
        async let detail = service.pullRequest(GitHubWorld.one)
        async let files = service.pullRequestFiles(GitHubWorld.one)
        async let again = service.pullRequest(GitHubWorld.one)
        _ = try await (detail, files, again)
        XCTAssertEqual(GitHubFake.operations("PrDetail").count, 1)
    }

    func testFilesChangedSinceYourReviewComeFromComparingYourReviewsCommitWithTheHead() async throws {
        world.review["latestReviews"] = ["nodes": [["state": "COMMENTED", "submittedAt": "2026-10-30T10:00:00Z", "author": ["login": "koen"], "commit": ["oid": "r1"]]]]
        world.install()
        GitHubFake.onRest("GET", #"/pulls/1/files\?"#, json: [
            ["filename": "src/cart.ts", "status": "modified", "additions": 3, "deletions": 1, "patch": "@@ -1 +1 @@\n-a\n+b"],
            ["filename": "src/new.ts", "previous_filename": "src/old.ts", "status": "renamed", "additions": 0, "deletions": 0],
            ["filename": "e2e/cart.spec.ts", "status": "added", "additions": 9, "deletions": 0, "patch": "@@ -0,0 +1 @@\n+test"],
            ["filename": "public/logo.png", "status": "added", "additions": 0, "deletions": 0],
        ])
        GitHubFake.onRest("GET", #"/compare/r1\.\.\.h1$"#, json: ["files": [["filename": "src/cart.ts", "status": "modified", "additions": 1, "deletions": 0]]])
        let files = try await world.service().pullRequestFiles(GitHubWorld.one)
        XCTAssertEqual(files.reviewedHeadSha, "r1")
        XCTAssertEqual(files.files.map { "\($0.path) \($0.status.rawValue) \($0.changedSinceReview) \($0.kind.rawValue)" }, [
            "src/cart.ts modified true source", "src/new.ts renamed false source", "e2e/cart.spec.ts added false tests", "public/logo.png added false generated",
        ])
        XCTAssertNil(files.files[1].patch)
        XCTAssertEqual(files.files[1].previousPath, "src/old.ts")
        // A force-push dropped the reviewed commit: everything counts as changed.
        GitHubFake.onRest("GET", "/compare/") { _ in .status(404, message: "Not Found") }
        let afterForcePush = try await world.service().pullRequestFiles(GitHubWorld.one)
        XCTAssertTrue(afterForcePush.files.allSatisfy(\.changedSinceReview))
    }

    func testConversationThreadsWithTheirDiffLinesRepliesThroughGraphQLTopLevelThroughREST() async throws {
        let actor: [String: Any] = ["login": "mira", "avatarUrl": NSNull(), "name": "Mira"]
        GitHubFake.onGraphql("PrConversation", data: ["repository": ["pullRequest": [
            "reviewThreads": ["nodes": [[
                "id": "RT_1", "path": "src/cart.ts", "line": NSNull(), "originalLine": 12, "isResolved": false,
                "comments": ["nodes": [[
                    "id": "C_1", "body": "Round here?", "createdAt": "2026-10-31T09:00:00Z", "diffHunk": "@@ -1,9 +1,9 @@\n a\n b\n c\n d\n e\n f\n g\n+h", "author": actor,
                    "reactionGroups": [["content": "THUMBS_UP", "reactors": ["totalCount": 2]], ["content": "EYES", "reactors": ["totalCount": 0]]],
                ]]],
            ]]],
            "comments": ["nodes": [["id": "IC_1", "body": "Ship it", "createdAt": "2026-10-31T10:00:00Z", "author": actor, "reactionGroups": []]]],
        ]]])
        GitHubFake.onGraphql("Reply", data: ["addPullRequestReviewThreadReply": ["comment": ["id": "C_2"]]])
        GitHubFake.onRest("POST", "/issues/1/comments$", json: ["id": 5])
        let service = world.service()
        let conversation = try await service.conversation(GitHubWorld.one)
        let thread = try XCTUnwrap(conversation.threads.first)
        XCTAssertEqual(thread.line, 12)
        XCTAssertEqual(thread.diffHunk?.components(separatedBy: "\n").count, 7)
        XCTAssertEqual(thread.comments.first?.reactions, [Reaction(content: "thumbs_up", count: 2)])
        XCTAssertEqual(conversation.comments.first?.body, "Ship it")
        _ = try await service.postComment(GitHubWorld.one, PostCommentRequest(body: "Done", threadId: "RT_1"))
        XCTAssertEqual(GitHubFake.operations("Reply").first?.variables["threadId"] as? String, "RT_1")
        _ = try await service.postComment(GitHubWorld.one, PostCommentRequest(body: "Thanks"))
        XCTAssertEqual(GitHubFake.requests("POST", "issues/1/comments$").first?.json["body"] as? String, "Thanks")
        await assertFails(400) { try await service.postComment(GitHubWorld.one, PostCommentRequest(body: "  ")) }
    }

    func testAPullRequestNoPollHasShownIsReadByTheAccountThatCanSeeItAndLaterReadsKeepThatAccount() async throws {
        let portal = Fake.pullRequest(number: 7, title: "Partner portal sign-in", headSha: "g7", owner: "globex", repo: "portal")
        let key = PrKey(owner: "globex", repo: "portal", number: 7)
        let notFound = GitHubFake.Answer.json(["data": ["repository": NSNull()], "errors": [["type": "NOT_FOUND", "message": "Could not resolve to a Repository with the name 'globex/portal'."]]])
        GitHubFake.onGraphql("PrDetail") { seen in
            guard seen.reader == "work", seen.variables["number"] as? Int == 7 else { return notFound }
            var detail = portal
            detail["commits"] = ["totalCount": 1]
            detail["reviews"] = ["nodes": [Any]()]
            detail["reviewRequestsFull"] = ["nodes": [Any]()]
            return .data(["repository": [
                "squashMergeAllowed": true, "mergeCommitAllowed": false, "rebaseMergeAllowed": false, "deleteBranchOnMerge": false,
                "viewerPermission": "READ", "viewerDefaultMergeMethod": "SQUASH", "pullRequest": detail,
            ]])
        }
        GitHubFake.onGraphql("PrConversation") { seen in
            seen.reader == "work" ? .data(["repository": ["pullRequest": ["reviewThreads": ["nodes": [Any]()], "comments": ["nodes": [Any]()]]]]) : notFound
        }
        let service = world.service(accounts: ["koen", "work"])
        _ = try await service.focus(fresh: false)
        let detail = try await service.pullRequest(key)
        XCTAssertEqual(detail.title, "Partner portal sign-in")
        XCTAssertFalse(detail.viewerCanMerge)
        XCTAssertEqual(GitHubFake.operations("PrDetail").map(\.reader), ["koen", "work"], "the first account cannot see it, the second can")
        _ = try await service.conversation(key)
        XCTAssertEqual(GitHubFake.operations("PrConversation").map(\.reader), ["work"])
        await assertFails(404) { try await service.pullRequest(PrKey(owner: "globex", repo: "portal", number: 99)) }
    }

    // MARK: Writes

    func testMergeAMovedHeadIsAConflictAndNothingMerges() async throws {
        let service = world.service()
        let request = MergeRequest(method: .squash, commitTitle: "Round totals", commitMessage: "", deleteBranch: true, headSha: "old")
        await assertFails(409) {
            try await service.merge(GitHubWorld.two, request)
        }
        await assertFails(409) {
            try await service.merge(GitHubWorld.two, request, bypass: true)
        }
        XCTAssertTrue(GitHubFake.requests("PUT", "merge").isEmpty)
        XCTAssertTrue(GitHubFake.operations("BypassMerge").isEmpty)
    }

    func testMergeGreenChecksMergeAtTheHeadAndDeleteTheBranch() async throws {
        GitHubFake.onRest("PUT", "/pulls/2/merge$", json: ["merged": true, "message": "Pull Request successfully merged"])
        GitHubFake.onRest("DELETE", "/git/refs/heads/feat/2-thing$") { _ in GitHubFake.Answer(status: 204) }
        let result = try await world.service().merge(GitHubWorld.two, MergeRequest(method: .squash, commitTitle: "Round totals (#2)", commitMessage: "Body", deleteBranch: true, headSha: "h2"))
        XCTAssertEqual(result, MergeResponse(merged: true, autoMerge: false, message: "Pull Request successfully merged"))
        let sent = try XCTUnwrap(GitHubFake.requests("PUT", "merge$").first?.json)
        XCTAssertEqual(sent as NSDictionary, ["sha": "h2", "merge_method": "squash", "commit_title": "Round totals (#2)", "commit_message": "Body"] as NSDictionary)
        XCTAssertEqual(GitHubFake.requests("DELETE", "refs/heads/feat/2-thing$").count, 1)
    }

    func testMergeRunningChecksTurnOnAutoMergeInstead() async throws {
        world.mine["head"] = ["nodes": [["commit": ["statusCheckRollup": ["contexts": ["nodes": [Fake.checkRun(.init(name: "build", conclusion: nil, status: "IN_PROGRESS"))]]]]]]]
        world.install()
        GitHubFake.onGraphql("AutoMerge", data: ["enablePullRequestAutoMerge": ["clientMutationId": NSNull()]])
        let result = try await world.service().merge(GitHubWorld.two, MergeRequest(method: .squash, commitTitle: "", commitMessage: "", deleteBranch: false, headSha: "h2"))
        XCTAssertTrue(result.autoMerge)
        XCTAssertFalse(result.merged)
        let mutation = try XCTUnwrap(GitHubFake.operations("AutoMerge").first)
        XCTAssertEqual(mutation.variables["method"] as? String, "SQUASH")
        XCTAssertEqual(mutation.variables["head"] as? String, "h2")
        XCTAssertTrue(GitHubFake.requests("PUT", "merge").isEmpty)
    }

    func testBypassMergeTargetsTheReviewedHeadWithoutWaitingForChecks() async throws {
        world.mine["head"] = ["nodes": [["commit": ["statusCheckRollup": ["contexts": ["nodes": [
            Fake.checkRun(.init(name: "build", conclusion: nil, status: "IN_PROGRESS")),
            Fake.checkRun(.init(name: "unit", conclusion: "FAILURE")),
        ]]]]]]]
        world.install()
        GitHubFake.onGraphql("BypassMerge", data: ["mergePullRequest": ["pullRequest": ["merged": true]]])
        GitHubFake.onRest("DELETE", "/git/refs/heads/feat/2-thing$") { _ in GitHubFake.Answer(status: 204) }

        let request = MergeRequest(method: .squash, commitTitle: "Round totals", commitMessage: "Body", deleteBranch: true, headSha: "h2")
        let result = try await world.service().merge(GitHubWorld.two, request, bypass: true)
        XCTAssertEqual(result, MergeResponse(merged: true, autoMerge: false, message: "Merged #2"))
        let mutation = try XCTUnwrap(GitHubFake.operations("BypassMerge").first)
        XCTAssertTrue((mutation.json["query"] as? String)?.contains("expectedHeadOid: $head") == true)
        XCTAssertEqual(mutation.variables as NSDictionary, [
            "id": "PR_acme_shop_2", "method": "SQUASH", "headline": "Round totals", "body": "Body", "head": "h2",
        ] as NSDictionary)
        XCTAssertTrue(GitHubFake.operations("AutoMerge").isEmpty)
        XCTAssertTrue(GitHubFake.requests("PUT", "merge$").isEmpty)
        XCTAssertEqual(GitHubFake.requests("DELETE", "refs/heads/feat/2-thing$").count, 1)
    }

    func testUnconfirmedBypassDoesNotDeleteTheBranch() async throws {
        GitHubFake.onGraphql("BypassMerge", data: ["mergePullRequest": ["pullRequest": ["merged": false]]])
        let request = MergeRequest(method: .squash, commitTitle: "", commitMessage: "", deleteBranch: true, headSha: "h2")
        await assertFails(409) { try await world.service().merge(GitHubWorld.two, request, bypass: true) }
        XCTAssertTrue(GitHubFake.requests("DELETE", "refs/heads/").isEmpty)
    }

    func testReviewPostedAtTheHeadTheReviewerSawAMovedHeadIsAConflict() async throws {
        GitHubFake.onRest("POST", "/pulls/1/reviews$", json: ["id": 77])
        let service = world.service()
        await assertFails(409) { try await service.submitReview(GitHubWorld.one, SubmitReviewRequest(event: .approve, body: "", headSha: "stale", comments: [])) }
        await assertFails(400) { try await service.submitReview(GitHubWorld.one, SubmitReviewRequest(event: .requestChanges, body: " ", headSha: "h1", comments: [])) }
        let comment = ReviewLineComment(path: "src/cart.ts", line: 12, side: .right, body: "Round here?")
        let answer = try await service.submitReview(GitHubWorld.one, SubmitReviewRequest(event: .comment, body: "Two notes", headSha: "h1", comments: [comment]))
        XCTAssertEqual(answer.reviewId, "77")
        let posted = try XCTUnwrap(GitHubFake.requests("POST", "reviews$").first?.json)
        XCTAssertEqual(posted["commit_id"] as? String, "h1")
        XCTAssertEqual(posted["event"] as? String, "COMMENT")
        XCTAssertEqual(posted["comments"] as? NSArray, [["path": "src/cart.ts", "line": 12, "side": "RIGHT", "body": "Round here?"]] as NSArray)
    }

    func testRerunFailedRestartsEachRedWorkflowRunOnce() async throws {
        world.review["head"] = ["nodes": [["commit": ["statusCheckRollup": ["contexts": ["nodes": [
            Fake.checkRun(.init(name: "e2e", conclusion: "FAILURE", id: 501, runId: 50)), Fake.checkRun(.init(name: "unit", conclusion: "FAILURE", id: 503, runId: 50)),
            Fake.checkRun(.init(name: "deploy", conclusion: "FAILURE", id: 504, runId: 51, workflow: "Deploy")), Fake.checkRun(.init(name: "lint", id: 502, runId: 52)),
        ]]]]]]]
        world.install()
        GitHubFake.onRest("POST", "rerun-failed-jobs$") { _ in GitHubFake.Answer(status: 201) }
        let answer = try await world.service().rerunFailed(GitHubWorld.one)
        XCTAssertEqual(answer.reruns, 2)
        XCTAssertEqual(GitHubFake.requests("POST", "rerun-failed-jobs$").compactMap { $0.url.firstMatch(of: #/runs/(\d+)/#).map { String($0.1) } }, ["50", "51"])
    }

    func testASnoozeMovesAReviewOutOfNeedsYouUntilItRunsOutAndSurvivesALaunch() async throws {
        let service = world.service()
        _ = try await service.focus(fresh: false)
        let until = try Date("2026-11-01T00:00:00Z", strategy: .iso8601)
        _ = await service.snooze(GitHubWorld.one, until: until)
        var review = try await service.focus(fresh: false).pullRequests.first { $0.key == "acme/shop#1" }
        XCTAssertEqual(review?.bucket, .wait)
        XCTAssertEqual(review?.snoozedUntil, "2026-11-01T00:00:00.000Z")
        let relaunched = try await world.service().focus(fresh: false).pullRequests.first { $0.key == "acme/shop#1" }
        XCTAssertEqual(relaunched?.bucket, .wait)
        _ = await service.snooze(GitHubWorld.one, until: nil)
        review = try await service.focus(fresh: false).pullRequests.first { $0.key == "acme/shop#1" }
        XCTAssertEqual(review?.bucket, .you)
    }

    func testAfterAWriteTheListIsReadAgain() async throws {
        GitHubFake.onRest("POST", "/issues/1/comments$", json: ["id": 5])
        let service = world.service()
        _ = try await service.focus(fresh: false)
        let searches = GitHubFake.operations("FocusSearch").count
        _ = try await service.postComment(GitHubWorld.one, PostCommentRequest(body: "Thanks"))
        _ = try await service.focus(fresh: false)
        XCTAssertGreaterThan(GitHubFake.operations("FocusSearch").count, searches)
    }

    // MARK: Failed jobs

    func testFailedJobsTheLogTailThroughTheRedirectAndAGroupWithTheBaseBranch() async throws {
        let service = world.service()
        _ = try await service.refresh()
        await service.ciSettled()

        let storage = GitHubFake.requests("GET", #"storage\.example"#)
        XCTAssertEqual(storage.count, 2, "one tail for the PR job, one for main")
        for request in storage {
            XCTAssertEqual(request.headers["Range"], "bytes=-65536")
            XCTAssertNil(request.headers["Authorization"], "the token never reaches log storage")
        }

        let groups = await service.ciGroups()
        XCTAssertEqual(groups.count, 1)
        let group = try XCTUnwrap(groups.first)
        XCTAssertEqual(group.branches.map { $0.prKey ?? $0.branch }, ["main", "acme/shop#1"])
        XCTAssertEqual(group.branches.first?.suspect, CiSuspect(sha: "m1", message: "Round totals"))

        let detail = try await service.pullRequest(GitHubWorld.one)
        let failed = try XCTUnwrap(detail.checkRuns.first)
        XCTAssertEqual(failed.name, "e2e")
        XCTAssertEqual(failed.jobId, 501)
        XCTAssertEqual(failed.failure?.step, "Run bun run test")
        XCTAssertEqual(failed.failure?.summary, "AssertionError: expected 100 to be 90 // Object.is equality")
        XCTAssertEqual(failed.failure?.groupId, group.id)
        XCTAssertEqual(failed.failure?.newInThisPr, false)
        XCTAssertEqual(failed.failure?.alsoOnBase?.since, Fake.ago(Fake.days(1)), "main is red since its run on m1")

        // Read once: the next poll leaves the logs alone.
        _ = try await service.refresh()
        await service.ciSettled()
        XCTAssertEqual(GitHubFake.requests("GET", #"storage\.example"#).count, 2)

        let claimed = try await service.claimCiGroup(group.id, note: " on it ")
        XCTAssertEqual(claimed.claim?.note, "on it")
        XCTAssertEqual(claimed.claim?.by.login, "koen")
        let released = try await service.releaseCiGroup(group.id)
        XCTAssertNil(released.claim)
        await assertFails(404) { try await service.ciGroup("nope") }
    }

    func testDetailAnswersBeforeTheFailedJobsLogIsReadTheNextReadCarriesTheReason() async throws {
        let storage = GitHubFake.Gate()
        GitHubFake.onRest("GET", #"^https://storage\.example/logs/"#) { _ in GitHubWorld.storedLog.held(by: storage) }
        let service = world.service()
        let first = try await service.pullRequest(GitHubWorld.one)
        XCTAssertEqual(first.checkRuns.first?.name, "e2e")
        XCTAssertNil(first.checkRuns.first?.failure, "answered while the log is still on its way")
        _ = try await service.pullRequest(GitHubWorld.one)

        storage.open()
        await service.ciSettled()
        XCTAssertEqual(GitHubFake.requests("GET", "actions/jobs/501$").count, 1, "the second read joined the one in flight")
        let read = try await service.pullRequest(GitHubWorld.one)
        XCTAssertEqual(read.checkRuns.first?.failure?.step, "Run bun run test")
    }

    func testAJobThatCantBeReadSaysWhyAndIsTriedAgainOnlyLater() async throws {
        GitHubFake.onRest("GET", #"^https://storage\.example/logs/"#) { _ in .status(500, message: "Server Error") }
        let service = world.service()
        _ = try await service.refresh()
        await service.ciSettled()
        let detail = try await service.pullRequest(GitHubWorld.one)
        XCTAssertEqual(detail.checkRuns.first?.failure?.summary, "Reading the log failed (500).")
        XCTAssertEqual(detail.checkRuns.first?.failure?.step, "Run bun run test")
        let groups = await service.ciGroups()
        XCTAssertTrue(groups.isEmpty, "nothing was read, so nothing groups")

        let asked = GitHubFake.requests("GET", "actions/jobs/501/logs$").count
        _ = try await service.refresh()
        await service.ciSettled()
        XCTAssertEqual(GitHubFake.requests("GET", "actions/jobs/501/logs$").count, asked, "tried a moment ago: it waits ten minutes")
    }

    func testWhatTheLogsSaidIsKeptForTheNextLaunch() async throws {
        let service = world.service()
        _ = try await service.refresh()
        await service.ciSettled()
        let read = await service.ciGroups()
        let group = try XCTUnwrap(read.first)
        _ = try await service.claimCiGroup(group.id, note: "on it")
        let logs = GitHubFake.requests("GET", #"storage\.example"#).count

        let relaunched = world.service()
        let kept = await relaunched.ciGroups()
        XCTAssertEqual(kept.map(\.id), [group.id], "the groups show while the first read runs")
        XCTAssertEqual(kept.first?.claim?.note, "on it")
        let detail = try await relaunched.pullRequest(GitHubWorld.one)
        XCTAssertEqual(detail.checkRuns.first?.failure?.groupId, group.id)
        XCTAssertEqual(detail.checkRuns.first?.failure?.newInThisPr, false)
        _ = try await relaunched.refresh()
        await relaunched.ciSettled()
        XCTAssertEqual(GitHubFake.requests("GET", #"storage\.example"#).count, logs, "no log is read twice")
        let afterPoll = await relaunched.ciGroups()
        XCTAssertEqual(afterPoll.first?.claim?.note, "on it")
    }

    func testATokenSaysWhoItBelongsTo() async throws {
        GitHubFake.onGraphql("Viewer") { seen in
            seen.headers["Authorization"] == "Bearer good" ? .data(["viewer": ["login": "koen", "name": "Koen", "avatarUrl": NSNull()]]) : .status(401, message: "Bad credentials")
        }
        let me = try await GitHubDirect.whoIs(token: "good", session: GitHubFake.session())
        XCTAssertEqual(me.login, "koen")
        await assertFails(401) { try await GitHubDirect.whoIs(token: "bad", session: GitHubFake.session()) }
    }
}

/// A switch a test flips from outside a `@Sendable` handler.
private final class Flag: @unchecked Sendable {
    private let lock = NSLock()
    private var value = false

    var isSet: Bool { lock.withLock { value } }
    func set() { lock.withLock { value = true } }
}
