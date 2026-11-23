import XCTest
@testable import BorgDock

/// What a pasted GitHub token is and may do, as BorgDock Review's setup shows it before the token is kept.
final class GitHubTokenTests: XCTestCase {
    override func setUp() {
        GitHubFake.reset()
    }

    private func user(scopes: String? = nil, expires: String? = nil) {
        GitHubFake.onRest("GET", "/user$") { _ in
            var answer = GitHubFake.Answer.json(["login": "koen", "name": "Koen Example", "avatar_url": NSNull()])
            if let scopes { answer.headers["X-OAuth-Scopes"] = scopes }
            if let expires { answer.headers["github-authentication-token-expiration"] = expires }
            return answer
        }
    }

    private func repositories(count: Int, singleSignOn: Bool = false) {
        GitHubFake.onRest("GET", "/user/repos") { _ in
            var answer = GitHubFake.Answer.json(count == 0 ? [] : [["full_name": "acme/shop"]])
            if count > 1 { answer.headers["Link"] = "<https://api.github.com/user/repos?per_page=1&sort=pushed&page=2>; rel=\"next\", <https://api.github.com/user/repos?per_page=1&sort=pushed&page=\(count)>; rel=\"last\"" }
            if singleSignOn { answer.headers["X-GitHub-SSO"] = "partial-results; organizations=21955855" }
            return answer
        }
    }

    func testTheKindComesFromHowATokenStarts() {
        XCTAssertEqual(GitHubTokenCheck.kind(of: "ghp_0123456789abcdef"), .classic)
        XCTAssertEqual(GitHubTokenCheck.kind(of: "github_pat_11ACME0123456789"), .fineGrained)
        XCTAssertEqual(GitHubTokenCheck.kind(of: "gho_0123456789abcdef"), .other)
    }

    func testOnlyOneLongWordIsCheckedWhileYouType() {
        XCTAssertFalse(GitHubTokenCheck.looksLikeToken("ghp_short"))
        XCTAssertFalse(GitHubTokenCheck.looksLikeToken("this is a sentence, not a token at all"))
        XCTAssertTrue(GitHubTokenCheck.looksLikeToken("  ghp_made-up-token-for-these-tests-0123\n"))
    }

    func testTheLastPageOfOneItemPagesIsTheCount() {
        XCTAssertEqual(GitHubTokenCheck.lastPage("<https://api.github.com/user/repos?per_page=1&page=2>; rel=\"next\", <https://api.github.com/user/repos?per_page=1&page=41>; rel=\"last\""), 41)
        XCTAssertNil(GitHubTokenCheck.lastPage(nil))
        XCTAssertNil(GitHubTokenCheck.lastPage("<https://api.github.com/user/repos?page=1>; rel=\"prev\""))
    }

    func testTheExpiryHeaderReadsInBothItsForms() throws {
        let utc = try XCTUnwrap(GitHubTokenCheck.expiry("2027-02-20 10:00:00 UTC"))
        XCTAssertEqual(GitHubTime.iso(utc).prefix(16), "2027-02-20T10:00")
        let offset = try XCTUnwrap(GitHubTokenCheck.expiry("2027-02-20 11:00:00 +0100"))
        XCTAssertEqual(offset, utc)
        XCTAssertNil(GitHubTokenCheck.expiry(nil))
        XCTAssertNil(GitHubTokenCheck.expiry(""))
    }

    func testAClassicTokenSaysItsScopesAndNeedsNoProbe() async throws {
        user(scopes: "read:org, repo", expires: "2027-02-20 10:00:00 UTC")
        repositories(count: 41)
        let facts = try await GitHubTokenCheck.inspect(token: "ghp_made-up-token-for-these-tests-0123", session: GitHubFake.session())
        XCTAssertEqual(facts.person.login, "koen")
        XCTAssertEqual(facts.kind, .classic)
        XCTAssertEqual(facts.scopes, ["read:org", "repo"])
        XCTAssertEqual(facts.repositories, 41)
        XCTAssertEqual(facts.reach, "Reads 41 repositories")
        XCTAssertEqual(facts.mayRerun, .yes)
        XCTAssertFalse(facts.isUseless)
        XCTAssertNotNil(facts.expiresAt)
        XCTAssertTrue(GitHubFake.requests("GET", "/pulls").isEmpty, "the scopes already say it")
        let titles = facts.rows(now: Date(timeIntervalSince1970: 1_795_000_000)).map(\.title)
        XCTAssertEqual(Array(titles.prefix(3)), ["Pull requests: read and write", "Actions: read and write", "Teams: read"])
        XCTAssertTrue(titles.last?.hasPrefix("Expires 20 February 2027") == true, titles.last ?? "")
    }

    func testAClassicTokenWithoutRepoIsRefusedBeforeItIsKept() async throws {
        user(scopes: "read:user")
        repositories(count: 0)
        let facts = try await GitHubTokenCheck.inspect(token: "ghp_made-up-token-for-these-tests-0123", session: GitHubFake.session())
        XCTAssertTrue(facts.isUseless)
        XCTAssertEqual(facts.mayRerun, .no)
        XCTAssertEqual(facts.rows().first?.mark, .missing)
        XCTAssertEqual(facts.rows().last?.title, "Doesn't expire")
        XCTAssertEqual(facts.reach, "Reads no repository")
    }

    func testAFineGrainedTokenIsTriedOnWhatItReads() async throws {
        user()
        repositories(count: 3, singleSignOn: true)
        GitHubFake.onRest("GET", "/repos/acme/shop/pulls", json: [])
        GitHubFake.onRest("GET", "/repos/acme/shop/actions/runs") { _ in .status(403, message: "Resource not accessible by personal access token") }
        let facts = try await GitHubTokenCheck.inspect(token: "github_pat_11ACME0123456789abcdef0123456789", session: GitHubFake.session())
        XCTAssertEqual(facts.kind, .fineGrained)
        XCTAssertNil(facts.scopes)
        XCTAssertEqual(facts.readsPullRequests, .yes)
        XCTAssertEqual(facts.readsActions, .no)
        XCTAssertEqual(facts.mayRerun, .no, "a token that can't read Actions can't rerun either")
        XCTAssertTrue(facts.singleSignOnMissing)
        XCTAssertFalse(facts.isUseless)
        let rows = facts.rows()
        XCTAssertEqual(rows.map(\.mark), [.ok, .optional, .optional, .expiry])
        XCTAssertEqual(rows[1].title, "Actions: not readable")
        XCTAssertEqual(rows[2].title, "Single sign-on not authorized")
    }

    func testAFineGrainedTokenThatReadsActionsLeavesRerunToTheFirstTry() async throws {
        user()
        repositories(count: 1)
        GitHubFake.onRest("GET", "/repos/acme/shop/pulls", json: [])
        GitHubFake.onRest("GET", "/repos/acme/shop/actions/runs", json: ["workflow_runs": []])
        let facts = try await GitHubTokenCheck.inspect(token: "github_pat_11ACME0123456789abcdef0123456789", session: GitHubFake.session())
        XCTAssertEqual(facts.readsActions, .yes)
        XCTAssertEqual(facts.mayRerun, .unknown)
        XCTAssertEqual(facts.reach, "Reads 1 repository")
    }

    func testATokenGitHubDoesNotKnowSaysSo() async {
        GitHubFake.onRest("GET", "/user$") { _ in .status(401, message: "Bad credentials") }
        do {
            _ = try await GitHubTokenCheck.inspect(token: "ghp_made-up-token-for-these-tests-0123", session: GitHubFake.session())
            XCTFail("a refused token is no account")
        } catch {
            XCTAssertTrue((error as? APIError)?.isUnauthorized == true, "\(error)")
            XCTAssertTrue(error.localizedDescription.contains("doesn't know this token"), error.localizedDescription)
        }
    }

    func testAnAccountTheLastReadGotNothingFromIsNamed() async throws {
        let world = GitHubWorld()
        world.install()
        GitHubFake.onGraphql("FocusSearch") { seen in
            seen.reader == "labs" ? .status(401, message: "Bad credentials") : .data(Fake.searchAnswer([]))
        }
        let service = world.service(accounts: ["koen", "labs"])
        _ = try await service.focus(fresh: true)
        let troubles = await service.accountTroubles()
        XCTAssertEqual(troubles.map { $0.login }, ["labs"])
        XCTAssertEqual(troubles.first?.tokenRefused, true)
        await world.settle()
    }

    func testTheRefreshSettingDecidesHowOldTheListMayGet() async throws {
        let world = GitHubWorld()
        world.install()
        let service = world.service()
        var every = await service.refreshEvery
        XCTAssertEqual(every, GitHubDirect.pollEvery)
        await service.setRefresh(seconds: 300)
        every = await service.refreshEvery
        XCTAssertEqual(every, 300)
        await service.setRefresh(seconds: 60)
        let stored = await service.settings.refreshSeconds
        XCTAssertNil(stored, "a minute is the default, so nothing is stored")
    }
}
