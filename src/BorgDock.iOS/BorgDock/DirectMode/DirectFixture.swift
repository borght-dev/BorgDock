#if DEBUG
import os
import UIKit

/// `-BorgDockFixture`: made-up GitHub and Azure DevOps answers (the `acme` shop), so screenshots and UI tests never
/// show real work and never touch the network. Writes answer "done" and change nothing. Debug builds only.
enum DirectFixture {
    static var isOn: Bool { ProcessInfo.processInfo.arguments.contains("-BorgDockFixture") }

    /// `-BorgDockFixtureMode <mode>`: the states of the overview that the full sample never shows.
    enum Mode: String {
        /// Nobody asks for your review.
        case quiet
        /// Nothing involves you; your repositories still have open pull requests.
        case clear
        /// The first read answers; after it GitHub can't be reached.
        case offline
        /// GitHub takes its time, so the first read stays on screen.
        case slow
        /// No account yet: the first run.
        case fresh
        /// The second account's token has expired: the overview says which account isn't read.
        case expired
    }

    static let mode: Mode? = {
        let arguments = ProcessInfo.processInfo.arguments
        guard let index = arguments.firstIndex(of: "-BorgDockFixtureMode"), arguments.indices.contains(index + 1) else { return nil }
        return Mode(rawValue: arguments[index + 1])
    }()

    static let credentials = DirectCredentials(
        gitHub: [.init(login: "koen", token: "fixture", name: "Koen Example", avatarUrl: nil, label: "Work", expiresAt: now.addingTimeInterval(89 * 86_400), kind: .fineGrained)],
        azureDevOps: AdoConnection(organizationURL: URL(string: "https://dev.azure.com/acme")!, project: "Shop", credential: .personalAccessToken("fixture"))
    )

    /// The personal account whose token ran out yesterday (`expired`).
    static let expiredAccount = DirectCredentials.GitHub(
        login: "koen-labs", token: "expired", name: "Koen Example", avatarUrl: nil, label: "Personal", expiresAt: now.addingTimeInterval(-86_400), kind: .fineGrained
    )

    /// The accounts the app starts with, by the fixture's mode.
    static var startCredentials: DirectCredentials {
        switch mode {
        case .fresh: return DirectCredentials()
        case .expired:
            var both = credentials
            both.gitHub.append(expiredAccount)
            return both
        default: return credentials
        }
    }

    /// A session that reads the fixture and forgets everything when the app quits.
    @MainActor
    static func session() -> DirectSession {
        // Made-up data starts clean: what an earlier run marked reviewed, unfolded or chose would change what this one shows.
        if let app = Bundle.main.bundleIdentifier { UserDefaults.standard.removePersistentDomain(forName: app) }
        UserDefaults.standard.removePersistentDomain(forName: "direct-fixture")
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DirectFixtureProtocol.self]
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("direct-fixture-\(UUID().uuidString)", isDirectory: true)
        let defaults = UserDefaults(suiteName: "direct-fixture") ?? .standard
        // Its own Keychain item: an account added while trying the first run never becomes the app's real one.
        return DirectSession(
            vault: DirectCredentialStore(service: "dev.borght.borgdock.direct.fixture"), store: FileStore(directory: scratch), defaults: defaults,
            session: URLSession(configuration: configuration), credentials: startCredentials
        )
    }

    static let now = Date()
    static func ago(hours: Double) -> String { now.addingTimeInterval(-hours * 3600).formatted(.iso8601) }
}

/// Signing in without typing, for a simulator run against the real GitHub and Azure DevOps: the environment names the
/// tokens (`SIMCTL_CHILD_BORGDOCK_GITHUB_TOKENS=a,b xcrun simctl launch …`). Debug builds only.
enum DirectDebugAccounts {
    @MainActor
    static func connect(_ session: DirectSession) async {
        let environment = ProcessInfo.processInfo.environment
        for token in (environment["BORGDOCK_GITHUB_TOKENS"] ?? "").split(separator: ",") {
            do { try await session.addGitHubAccount(token: String(token)) } catch { print("Debug GitHub account not added: \(error.localizedDescription)") }
        }
        guard let organization = environment["BORGDOCK_ADO_ORGANIZATION"].flatMap(AzureDevOpsAddress.organizationURL),
              let project = environment["BORGDOCK_ADO_PROJECT"]
        else { return }
        let credential: AdoCredential? = environment["BORGDOCK_ADO_BEARER"].map(AdoCredential.bearer) ?? environment["BORGDOCK_ADO_TOKEN"].map(AdoCredential.personalAccessToken)
        guard let credential else { return }
        do {
            try await session.connectAzureDevOps(AdoConnection(organizationURL: organization, project: project, credential: credential))
        } catch {
            print("Debug Azure DevOps not connected: \(error.localizedDescription)")
        }
    }
}

/// Answers api.github.com, dev.azure.com/acme, the fixture's own image host and its one uploaded recording.
final class DirectFixtureProtocol: URLProtocol {
    private static let imageHost = "fixture.acme.example"

    override class func canInit(with request: URLRequest) -> Bool {
        guard let url = request.url, let host = url.host() else { return false }
        return host == "api.github.com" || host == "dev.azure.com" || host == imageHost || FixtureRecording.isRecording(url)
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    /// How many list searches were answered: one read of the list is three.
    private static let listSearches = OSAllocatedUnfairLock(initialState: 0)

    override func startLoading() {
        guard let url = request.url else { return }
        if DirectFixture.mode == .slow { Thread.sleep(forTimeInterval: 25) }
        if DirectFixture.mode == .offline, url.host() == "api.github.com", Self.listSearches.withLock({ $0 }) >= 3 {
            client?.urlProtocol(self, didFailWithError: URLError(.notConnectedToInternet))
            return
        }
        if url.host() == "api.github.com", request.value(forHTTPHeaderField: "Authorization") == "Bearer expired" {
            return answer(401, Data(#"{"message":"Bad credentials"}"#.utf8), type: "application/json")
        }
        if url.host() == "api.github.com", url.path().hasSuffix("/logs") {
            return answer(200, Data(GitHubFixture.failedJobLog.utf8), type: "text/plain")
        }
        if FixtureRecording.isRecording(url) {
            return answer(200, FixtureRecording.webm, type: "video/webm")
        }
        if url.host() == Self.imageHost || AdoFixture.isAttachment(url) {
            return answer(200, FixtureImage.png(named: url.query() ?? url.lastPathComponent), type: "image/png")
        }
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        let reply: Any? = url.host() == "dev.azure.com"
            ? AdoFixture.answer(method: request.httpMethod ?? "GET", url: url, body: json)
            : url.path() == "/graphql"
                ? Self.graphql(json)
                : GitHubFixture.rest(method: request.httpMethod ?? "GET", path: url.path(), query: url.query() ?? "")
        guard let reply, let data = try? JSONSerialization.data(withJSONObject: reply) else {
            return answer(404, Data(#"{"message":"Not in the fixture"}"#.utf8), type: "application/json")
        }
        answer(200, data, type: "application/json", headers: GitHubFixture.headers(path: url.path(), query: url.query() ?? ""))
    }

    private static func graphql(_ json: [String: Any]) -> Any? {
        let query = json["query"] as? String ?? ""
        if query.contains("FocusSearch") { listSearches.withLock { $0 += 1 } }
        return GitHubFixture.graphql(query: query, variables: json["variables"] as? [String: Any] ?? [:])
    }

    private func answer(_ status: Int, _ data: Data, type: String, headers: [String: String] = [:]) {
        let fields = headers.merging(["Content-Type": type]) { _, type in type }
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: fields)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: data)
        client?.urlProtocolDidFinishLoading(self)
    }

    private static func read(_ stream: InputStream) -> Data {
        stream.open()
        defer { stream.close() }
        var data = Data()
        var buffer = [UInt8](repeating: 0, count: 4096)
        while stream.hasBytesAvailable {
            let count = stream.read(&buffer, maxLength: buffer.count)
            if count <= 0 { break }
            data.append(buffer, count: count)
        }
        return data
    }
}

// MARK: - GitHub

private enum GitHubFixture {
    struct Check {
        var name: String
        var conclusion: String? = "SUCCESS"
        var workflow = "CI"
    }

    struct PullRequest {
        var number: Int
        var owner = "acme"
        var repo = "shop"
        var title: String
        var author: (login: String, name: String?)
        var body = ""
        var draft = false
        var updatedHoursAgo: Double = 2
        var createdHoursAgo: Double = 30
        var additions = 24
        var deletions = 6
        var files = 3
        var labels: [(String, String)] = []
        var requested: [String] = []
        var teams: [String] = []
        var reviews: [(login: String, state: String, sha: String?)] = []
        var checks: [Check] = [Check(name: "build"), Check(name: "unit"), Check(name: "lint")]
        var commits: [String]?
        var mergeable = "MERGEABLE"
        /// When each requested reviewer was asked, as GitHub's timeline has it.
        var requestedHoursAgo: Double = 6
        /// When the reviews were submitted; three hours before the last update when unset.
        var reviewedHoursAgo: Double?
        var mergedHoursAgo: Double?

        var headSha: String { "head\(number)" }
        var branch: String { "feat/" + title.lowercased().split(separator: " ").prefix(3).joined(separator: "-").filter { $0.isLetter || $0 == "-" } }
    }

    static let basketBody = """
    ## What
    A checkout that timed out emptied the basket. It now keeps the basket and offers to try again.

    ## Why
    AB#60379: customers lost a full basket when the payment page was slow.

    ## How it was tested
    - Unit tests for the timeout and the retry
    - By hand on the test shop, with the payment provider throttled

    | Before | After |
    |---|---|
    | ![The basket is empty after a timeout](https://fixture.acme.example/basket-before.png) | ![The basket is kept, with Try again](https://fixture.acme.example/basket-after.png) |

    \(FixtureRecording.address)
    """

    static let pullRequests: [PullRequest] = [
        PullRequest(
            number: 412, title: "Keep the basket on timeout AB#60379", author: ("sanne", "Sanne de Vries"), body: basketBody, updatedHoursAgo: 2,
            additions: 148, deletions: 37, files: 5, labels: [("frontend", "1d76db"), ("checkout", "5319e7")], requested: ["koen"], teams: ["checkout"],
            reviews: [("tom", "APPROVED", "c410")],
            checks: [Check(name: "build"), Check(name: "unit"), Check(name: "lint"), Check(name: "e2e / checkout", conclusion: "FAILURE"), Check(name: "types")],
            commits: ["c409", "c410", "c411", "head412"], requestedHoursAgo: 4 * 24, reviewedHoursAgo: 2 * 24
        ),
        PullRequest(
            number: 409, title: "Round totals per line, not per order AB#60402", author: ("mira", "Mira Jansen"), updatedHoursAgo: 5, additions: 62, deletions: 18, files: 4,
            labels: [("pricing", "0e8a16")], requested: ["koen"], reviews: [("koen", "COMMENTED", "c1")], commits: ["c1", "c2", "head409"],
            requestedHoursAgo: 26, reviewedHoursAgo: 26
        ),
        PullRequest(
            number: 415, title: "Cache the price list for a minute", author: ("tom", "Tom Bakker"), updatedHoursAgo: 1, additions: 31, deletions: 4, files: 2,
            teams: ["platform"], requestedHoursAgo: 2
        ),
        PullRequest(
            number: 398, title: "Checkout: show the delivery window", author: ("koen", "Koen Example"), updatedHoursAgo: 20, additions: 96, deletions: 12, files: 6,
            reviews: [("mira", "APPROVED", nil)], reviewedHoursAgo: 21
        ),
        PullRequest(
            number: 401, title: "Search suggestions for product names AB#60388", author: ("koen", "Koen Example"), updatedHoursAgo: 7, additions: 210, deletions: 44, files: 9,
            reviews: [("sanne", "CHANGES_REQUESTED", nil)], reviewedHoursAgo: 26
        ),
        PullRequest(
            number: 404, title: "Move the cart store to signals", author: ("koen", "Koen Example"), updatedHoursAgo: 0.4, additions: 340, deletions: 301, files: 14,
            checks: [Check(name: "build"), Check(name: "unit", conclusion: nil), Check(name: "e2e / checkout", conclusion: nil)]
        ),
        PullRequest(number: 88, repo: "api", title: "Rate limit the price endpoint", author: ("lena", "Lena Visser"), draft: true, updatedHoursAgo: 26, additions: 54, deletions: 3, files: 3),
        PullRequest(
            number: 377, title: "Upgrade the payment SDK to 9", author: ("tom", "Tom Bakker"), updatedHoursAgo: 12 * 24, createdHoursAgo: 20 * 24, additions: 12, deletions: 12, files: 2,
            checks: [Check(name: "build", conclusion: "FAILURE"), Check(name: "unit")]
        ),
    ] + ledgerRows

    /// The rest of the acme shop, so the overview shows every section and every reason a row can give.
    private static let ledgerRows: [PullRequest] = [
        // To review
        PullRequest(
            number: 88, repo: "payments", title: "Refunds for split payments AB#60871", author: ("ines", "Ines Duarte"), updatedHoursAgo: 20, additions: 640, deletions: 212, files: 18,
            requested: ["koen"], requestedHoursAgo: 2 * 24
        ),
        PullRequest(
            number: 382, repo: "storefront", title: "Product page: skeleton while stock loads AB#61040", author: ("tom", "Tom Bakker"), updatedHoursAgo: 9, additions: 71, deletions: 9,
            requested: ["koen"], requestedHoursAgo: 25
        ),
        PullRequest(
            number: 31, owner: "kv-labs", repo: "printfarm", title: "Pause the queue when a spool runs out", author: ("mateo", "Mateo Ruiz"), updatedHoursAgo: 5, additions: 52, deletions: 9,
            requested: ["koen"], checks: [Check(name: "build"), Check(name: "test")], requestedHoursAgo: 5
        ),
        // Yours, needs you
        PullRequest(
            number: 419, title: "Cache price lists per customer group AB#61055", author: ("koen", "Koen Example"), updatedHoursAgo: 2, additions: 310, deletions: 40, files: 11,
            requested: ["sanne"], checks: [Check(name: "build"), Check(name: "unit"), Check(name: "types"), Check(name: "e2e · chromium 2/4", conclusion: "FAILURE"), Check(name: "lint", conclusion: "FAILURE")]
        ),
        PullRequest(
            number: 90, repo: "payments", title: "Retry declined cards once", author: ("koen", "Koen Example"), updatedHoursAgo: 4, additions: 58, deletions: 7,
            reviews: [("ines", "COMMENTED", nil)], reviewedHoursAgo: 4
        ),
        // Ready to merge
        PullRequest(
            number: 91, repo: "payments", title: "Bump the payment SDK to 7.2", author: ("koen", "Koen Example"), updatedHoursAgo: 3, additions: 12, deletions: 12, files: 2,
            reviews: [("ines", "APPROVED", nil)], reviewedHoursAgo: 3
        ),
        // Waiting on others
        PullRequest(
            number: 407, title: "Order export: add the VAT number AB#61031", author: ("koen", "Koen Example"), updatedHoursAgo: 30, additions: 140, deletions: 22, files: 7,
            requested: ["sam"], requestedHoursAgo: 2 * 24
        ),
        PullRequest(
            number: 380, repo: "storefront", title: "Search: remember the last filter", author: ("koen", "Koen Example"), updatedHoursAgo: 22, additions: 75, deletions: 18,
            requested: ["tom", "ines"], requestedHoursAgo: 26
        ),
        PullRequest(number: 411, title: "Coupons: one per order AB#61060", author: ("koen", "Koen Example"), draft: true, updatedHoursAgo: 3, createdHoursAgo: 3, additions: 220, deletions: 35, files: 8),
        PullRequest(
            number: 12, owner: "kv-labs", repo: "dotfiles", title: "zsh: a faster prompt", author: ("koen", "Koen Example"), updatedHoursAgo: 6 * 24, createdHoursAgo: 7 * 24, additions: 30, deletions: 11, files: 1,
            requested: ["mateo"], checks: [], requestedHoursAgo: 6 * 24
        ),
        // Also open in your repositories
        PullRequest(number: 89, repo: "payments", title: "Payouts: daily instead of weekly", author: ("sam", "Sam Okafor"), updatedHoursAgo: 40, additions: 210, deletions: 60, files: 9, requested: ["ines"], requestedHoursAgo: 2 * 24),
        PullRequest(
            number: 87, repo: "payments", title: "3-D Secure: handle the frictionless flow", author: ("ines", "Ines Duarte"), updatedHoursAgo: 60, additions: 330, deletions: 48, files: 12,
            reviews: [("sam", "APPROVED", nil)], reviewedHoursAgo: 3 * 24
        ),
        PullRequest(number: 85, repo: "payments", title: "Refund emails: use the order's language", author: ("sam", "Sam Okafor"), updatedHoursAgo: 100, createdHoursAgo: 5 * 24, additions: 44, deletions: 9),
        PullRequest(number: 84, repo: "payments", title: "Bump eslint from 9.14.0 to 9.15.0", author: ("dependabot", nil), updatedHoursAgo: 6 * 24, createdHoursAgo: 6 * 24, additions: 6, deletions: 6, files: 2),
        PullRequest(
            number: 79, repo: "payments", title: "Ledger export: one file per month AB#60711", author: ("ines", "Ines Duarte"), draft: true, updatedHoursAgo: 4 * 24, createdHoursAgo: 23 * 24,
            additions: 1900, deletions: 120, files: 31
        ),
        PullRequest(
            number: 51, repo: "infra", title: "CI: cache the Playwright browsers", author: ("lena", "Lena Visser"), updatedHoursAgo: 3, additions: 28, deletions: 6, files: 2,
            requested: ["sam"], checks: [Check(name: "build"), Check(name: "plan"), Check(name: "apply", conclusion: nil)], requestedHoursAgo: 3
        ),
        PullRequest(
            number: 50, repo: "infra", title: "Staging: rotate the database password", author: ("sam", "Sam Okafor"), updatedHoursAgo: 26, additions: 9, deletions: 9, files: 2,
            reviews: [("tom", "APPROVED", nil)], reviewedHoursAgo: 24
        ),
        PullRequest(
            number: 30, owner: "kv-labs", repo: "printfarm", title: "Slicer profiles for the 0.2 mm nozzle", author: ("mateo", "Mateo Ruiz"), updatedHoursAgo: 50, createdHoursAgo: 2 * 24,
            additions: 460, deletions: 0, files: 6, checks: [Check(name: "build"), Check(name: "test")]
        ),
        PullRequest(
            number: 29, owner: "kv-labs", repo: "printfarm", title: "Camera: a time-lapse per print", author: ("mateo", "Mateo Ruiz"), draft: true, updatedHoursAgo: 8 * 24, createdHoursAgo: 9 * 24,
            additions: 730, deletions: 15, files: 9, checks: [Check(name: "build"), Check(name: "test")]
        ),
    ]

    /// The open pull requests the list reads, by the fixture's mode.
    private static var shown: [PullRequest] {
        func asksKoen(_ pr: PullRequest) -> Bool { pr.requested.contains("koen") || pr.teams.contains("platform") }
        switch DirectFixture.mode {
        case .quiet: return pullRequests.filter { !asksKoen($0) }
        case .clear: return pullRequests.filter { !asksKoen($0) && $0.author.login != "koen" && !$0.reviews.contains { $0.login == "koen" } }
        case .offline, .slow, .fresh, .expired, nil: return pullRequests
        }
    }

    /// What merged this week: search shows these in a section of their own.
    private static let merged: [PullRequest] = [
        PullRequest(
            number: 390, title: "Refund rounding follows the invoice AB#60931", author: ("tom", "Tom Bakker"), updatedHoursAgo: 3 * 24, createdHoursAgo: 6 * 24, additions: 58, deletions: 22,
            reviews: [("koen", "APPROVED", nil)], mergedHoursAgo: 3 * 24
        ),
        PullRequest(
            number: 86, repo: "payments", title: "Refunds: show the reason on the receipt", author: ("ines", "Ines Duarte"), updatedHoursAgo: 5 * 24, createdHoursAgo: 8 * 24, additions: 92, deletions: 14,
            reviews: [("sam", "APPROVED", nil)], mergedHoursAgo: 5 * 24
        ),
    ]

    static func node(_ pr: PullRequest) -> [String: Any] {
        [
            "id": "PR_\(pr.repo)_\(pr.number)", "number": pr.number, "title": pr.title, "body": pr.body,
            "url": "https://github.com/\(pr.owner)/\(pr.repo)/pull/\(pr.number)", "isDraft": pr.draft, "state": pr.mergedHoursAgo == nil ? "OPEN" : "MERGED",
            "createdAt": DirectFixture.ago(hours: pr.createdHoursAgo), "updatedAt": DirectFixture.ago(hours: pr.updatedHoursAgo),
            "mergedAt": pr.mergedHoursAgo.map { DirectFixture.ago(hours: $0) as Any } ?? NSNull(),
            "additions": pr.additions, "deletions": pr.deletions, "changedFiles": pr.files, "headRefName": pr.branch, "baseRefName": "main", "headRefOid": pr.headSha,
            "isCrossRepository": false, "mergeable": pr.mergeable, "reviewDecision": NSNull(), "autoMergeRequest": NSNull(),
            "author": actor(pr.author.login, pr.author.name),
            "repository": ["name": pr.repo, "owner": ["login": pr.owner], "defaultBranchRef": ["name": "main"]],
            "labels": ["nodes": pr.labels.map { ["name": $0.0, "color": $0.1] }],
            "reviewRequests": ["nodes": pr.requested.map { ["requestedReviewer": ["__typename": "User", "login": $0]] }
                + pr.teams.map { ["requestedReviewer": ["__typename": "Team", "slug": $0]] }],
            "requested": ["nodes": pr.requested.map { ["createdAt": DirectFixture.ago(hours: pr.requestedHoursAgo), "requestedReviewer": ["__typename": "User", "login": $0]] as [String: Any] }
                + pr.teams.map { ["createdAt": DirectFixture.ago(hours: pr.requestedHoursAgo), "requestedReviewer": ["__typename": "Team", "slug": $0]] as [String: Any] }],
            "latestReviews": ["nodes": pr.reviews.map {
                ["state": $0.state, "submittedAt": DirectFixture.ago(hours: pr.reviewedHoursAgo ?? pr.updatedHoursAgo + 3), "author": ["login": $0.login], "commit": ["oid": $0.sha ?? pr.headSha]] as [String: Any]
            }],
            "head": ["nodes": [["commit": ["statusCheckRollup": ["contexts": ["nodes": pr.checks.enumerated().map { check($1, id: pr.number * 100 + $0, pr: pr) }]]]]]],
            "recent": ["nodes": (pr.commits ?? [pr.headSha]).map { ["commit": ["oid": $0]] }],
        ]
    }

    private static func actor(_ login: String, _ name: String?) -> [String: Any] {
        ["login": login, "avatarUrl": NSNull(), "name": name ?? NSNull()]
    }

    private static func check(_ check: Check, id: Int, pr: PullRequest) -> [String: Any] {
        let running = check.conclusion == nil
        return [
            "__typename": "CheckRun", "databaseId": id, "name": check.name, "status": running ? "IN_PROGRESS" : "COMPLETED", "conclusion": check.conclusion ?? NSNull(),
            "startedAt": DirectFixture.ago(hours: pr.updatedHoursAgo), "completedAt": running ? NSNull() : DirectFixture.ago(hours: max(0, pr.updatedHoursAgo - 0.1)) as Any,
            "detailsUrl": "https://github.com/\(pr.owner)/\(pr.repo)/actions/runs/\(pr.number)/job/\(id)",
            "checkSuite": ["workflowRun": ["databaseId": pr.number * 10, "runNumber": pr.number * 3, "workflow": ["name": check.workflow]]],
        ]
    }

    static func graphql(query: String, variables: [String: Any]) -> Any? {
        let operation = query.firstMatch(of: #/(?:query|mutation)\s+(\w+)/#).map { String($0.1) } ?? ""
        let pr = (pullRequests + merged).first { $0.number == variables["number"] as? Int && $0.repo == variables["repo"] as? String }
        switch operation {
        case "Viewer":
            return data(["viewer": actor("koen", "Koen Example")])
        case "ViewerTeams":
            return data(["viewer": ["organizations": ["nodes": [["teams": ["nodes": [["slug": "platform"]]]]]]]])
        case "FocusSearch":
            // Everything involves koen here; the other searches add nothing new.
            let search = variables["query"] as? String ?? ""
            let found = !search.contains("involves:@me") ? [] : search.contains("is:merged") ? merged.map(node) : shown.map(node)
            return data(["viewer": ["login": "koen"], "found": ["pageInfo": ["hasNextPage": false, "endCursor": NSNull()], "nodes": found]])
        case "PrDetail":
            guard let pr else { return data(["repository": ["pullRequest": NSNull()]]) }
            var detail = node(pr)
            detail["commits"] = ["totalCount": pr.commits?.count ?? 3]
            detail["reviews"] = ["nodes": pr.reviews.map {
                ["state": $0.state, "submittedAt": DirectFixture.ago(hours: pr.reviewedHoursAgo ?? pr.updatedHoursAgo + 3), "body": $0.state == "APPROVED" ? "" : "Close. See the notes on the retry.",
                 "author": actor($0.login, names[$0.login] ?? $0.login.capitalized)] as [String: Any]
            }]
            detail["reviewRequestsFull"] = ["nodes": pr.requested.map { ["requestedReviewer": ["__typename": "User", "login": $0, "name": names[$0] ?? $0.capitalized, "avatarUrl": NSNull()]] }
                + pr.teams.map { ["requestedReviewer": ["__typename": "Team", "slug": $0, "name": $0.capitalized, "avatarUrl": NSNull()]] }]
            return data(["repository": [
                "squashMergeAllowed": true, "mergeCommitAllowed": false, "rebaseMergeAllowed": true, "deleteBranchOnMerge": true,
                "viewerPermission": "WRITE", "viewerDefaultMergeMethod": "SQUASH", "pullRequest": detail,
            ]])
        case "PrHead":
            guard let pr else { return data(["repository": ["pullRequest": NSNull()]]) }
            return data(["repository": ["pullRequest": [
                "id": "PR_\(pr.repo)_\(pr.number)", "headRefOid": pr.headSha, "state": "OPEN", "headRefName": pr.branch, "isCrossRepository": false, "head": node(pr)["head"]!,
            ]]])
        case "PrConversation":
            let none: [String: Any] = ["reviewThreads": ["nodes": [Any]()], "comments": ["nodes": [Any]()]]
            return data(["repository": ["pullRequest": pr?.number == 412 ? conversation : pr?.number == 409 ? reReviewConversation : none]])
        case "Reply", "Resolve", "AutoMerge":
            return data(["ok": true])
        default:
            return nil
        }
    }

    private static func data(_ value: Any) -> [String: Any] { ["data": value] }

    /// The people of the acme shop by login.
    private static let names = [
        "koen": "Koen Example", "sanne": "Sanne de Vries", "mira": "Mira Jansen", "tom": "Tom Bakker", "lena": "Lena Visser",
        "ines": "Ines Duarte", "sam": "Sam Okafor", "mateo": "Mateo Ruiz",
    ]

    /// #409, the re-review: Koen's question on the rounding, and Mira's answer after she changed the line.
    private static var reReviewConversation: [String: Any] {
        [
        "reviewThreads": ["nodes": [
            [
                "id": "RT_409", "path": "src/pricing/round.ts", "line": 7, "originalLine": 7, "startLine": NSNull(), "diffSide": "RIGHT", "isOutdated": false, "isResolved": false,
                "comments": ["nodes": [
                    comment("C_409a", "koen", "Koen Example", "Half up, or half even? The invoice rounds half even.", hours: 26, hunk: roundSincePatch),
                    comment("C_409b", "mira", "Mira Jansen", "Half even now, same as the invoice.", hours: 5),
                ]],
            ],
        ]],
        "comments": ["nodes": [Any]()],
        ]
    }

    /// `src/pricing/round.ts` over the whole of #409.
    private static let roundPatch = """
    @@ -4,10 +4,14 @@ import { Money } from '../money';
     
     export function roundLine(line: Line): Money {
    -  return Money.round(line.qty * line.price);
    +  const raw = line.qty * line.price;
    +  return Money.round(raw, 'half-even');
     }
     
     export function roundOrder(lines: Line[]): Money {
    -  return Money.round(lines.reduce((sum, l) => sum + l.qty * l.price, 0));
    +  // Each line rounds on its own, like the invoice.
    +  return lines.map(roundLine).reduce((sum, line) => sum.add(line), Money.zero);
     }
    """

    /// The same file between the commit Koen reviewed and the head: one line changed in answer to his comment.
    private static let roundSincePatch = """
    @@ -5,5 +5,5 @@ import { Money } from '../money';
     export function roundLine(line: Line): Money {
       const raw = line.qty * line.price;
    -  return Money.round(raw, 'half-up');
    +  return Money.round(raw, 'half-even');
     }
    """

    private static var reReviewFiles: [[String: Any]] {
        [
        ["filename": "src/pricing/round.ts", "status": "modified", "additions": 4, "deletions": 2, "patch": roundPatch],
        [
            "filename": "src/cart/total.ts", "status": "modified", "additions": 3, "deletions": 4,
            "patch": """
            @@ -10,8 +10,7 @@ import { roundOrder } from '../pricing/round';
             export function orderTotal(lines: Line[]): Money {
            -  const raw = lines.reduce((sum, l) => sum + l.qty * l.price, 0);
            -  return Money.round(raw);
            +  return roundOrder(lines);
             }
            """,
        ],
        [
            "filename": "src/invoice/Invoice.tsx", "status": "modified", "additions": 5, "deletions": 3,
            "patch": """
            @@ -31,7 +31,9 @@ export function Invoice({ order }: Props) {
               return (
                 <Table rows={order.lines}>
            -      <Column field="total" value={(line) => line.qty * line.price} />
            +      <Column field="total" value={(line) => roundLine(line)} />
                 </Table>
               );
            """,
        ],
        [
            "filename": "src/pricing/round.test.ts", "status": "modified", "additions": 50, "deletions": 9,
            "patch": "@@ -1,6 +1,12 @@\n import { roundLine, roundOrder } from './round';\n+\n+test('three lines of 4.133 come to 12.40', () => {\n+  expect(roundOrder(threeLines).toString()).toBe('12.40');\n+});",
        ],
        ]
    }

    private static var conversation: [String: Any] {
        [
        "reviewThreads": ["nodes": [
            [
                "id": "RT_1", "path": "src/cart/timeout.ts", "line": 21, "originalLine": 21, "isResolved": false,
                "comments": ["nodes": [
                    comment("C_1", "mira", "Mira Jansen", "Should the retry keep the same payment intent, or ask for a new one?", hours: 4, hunk: timeoutPatch),
                    comment("C_2", "sanne", "Sanne de Vries", "The same one: the provider says an intent stays valid for 15 minutes.", hours: 3),
                ]],
            ],
            [
                "id": "RT_2", "path": "docs/cart.md", "line": 12, "originalLine": 12, "isResolved": true,
                "comments": ["nodes": [comment("C_3", "tom", "Tom Bakker", "Typo: \"recieve\".", hours: 6, hunk: "@@ -10,3 +10,5 @@\n ## Timeouts\n+A basket is kept when the payment page times out.")]],
            ],
        ]],
        "comments": ["nodes": [
            comment("IC_1", "tom", "Tom Bakker", "Tried it on the test shop with a throttled connection. The basket stays, nice.", hours: 5),
        ]],
        ]
    }

    private static func comment(_ id: String, _ login: String, _ name: String, _ body: String, hours: Double, hunk: String? = nil) -> [String: Any] {
        [
            "id": id, "body": body, "createdAt": DirectFixture.ago(hours: hours), "diffHunk": hunk ?? NSNull(), "author": actor(login, name),
            "reactionGroups": id == "IC_1" ? [["content": "THUMBS_UP", "reactors": ["totalCount": 2]]] : [],
        ]
    }

    /// The end of the failed e2e job's log, as Vitest prints a failure.
    static let failedJobLog = """
    2026-10-20T09:14:01.8760000Z  FAIL  e2e/checkout.spec.ts > checkout > keeps the basket when the payment times out
    2026-10-20T09:14:01.8833000Z AssertionError: expected 0 to be 3 // Object.is equality
    2026-10-20T09:14:01.9417000Z  ❯ e2e/checkout.spec.ts:42:27
    2026-10-20T09:14:02.1169000Z  Test Files  1 failed | 6 passed (7)
    2026-10-20T09:14:02.1242000Z       Tests  1 failed | 31 passed (32)
    2026-10-20T09:14:02.1534000Z error: script "test:e2e" exited with code 1
    2026-10-20T09:14:02.1607000Z ##[error]Process completed with exit code 1.
    """

    /// The repositories the account reads, newest push first: the acme shop's and the personal ones.
    private static let repositories: [(name: String, pushedHoursAgo: Double)] = [
        ("acme/shop", 1), ("acme/payments", 3), ("acme/infra", 3), ("acme/storefront", 9), ("kv-labs/printfarm", 5), ("acme/api", 26),
        ("acme/design-tokens", 2 * 24), ("acme/checkout-sdk", 3 * 24), ("acme/warehouse", 4 * 24), ("acme/mobile", 6 * 24), ("kv-labs/dotfiles", 6 * 24),
        ("acme/docs", 9 * 24), ("acme/emails", 12 * 24), ("acme/search", 15 * 24), ("acme/billing-export", 21 * 24), ("acme/legacy-admin", 60 * 24),
    ]

    /// What GitHub says in an answer's headers: when the token expires, and how many repositories there are.
    static func headers(path: String, query: String) -> [String: String] {
        if path == "/user" { return ["github-authentication-token-expiration": "2027-02-20 10:00:00 UTC"] }
        if path == "/user/repos", query.contains("per_page=1&") || query.hasSuffix("per_page=1") {
            return ["Link": "<https://api.github.com/user/repos?per_page=1&page=\(repositories.count)>; rel=\"last\""]
        }
        return [:]
    }

    static func rest(method: String, path: String, query: String) -> Any? {
        if method == "GET", path == "/user" { return ["login": "koen", "name": "Koen Example", "avatar_url": NSNull()] as [String: Any] }
        if method == "GET", path == "/user/repos" {
            if query.contains("page=2") || query.contains("page=3") { return [Any]() }
            let all: [[String: Any]] = repositories.map { ["full_name": $0.name, "pushed_at": DirectFixture.ago(hours: $0.pushedHoursAgo), "private": true, "archived": false] }
            return query.contains("per_page=1&") ? Array(all.prefix(1)) : all
        }
        if method == "GET", path.hasSuffix("/pulls") { return [Any]() }
        if method == "GET", path.contains("/actions/jobs/") {
            return ["steps": [["name": "Set up job", "conclusion": "success"], ["name": "Run bun run test:e2e", "conclusion": "failure"]]]
        }
        // The default branches are green: no failure here is shared with main.
        if method == "GET", path.hasSuffix("/actions/runs") { return ["workflow_runs": [Any]()] }
        if method == "GET", path.hasSuffix("/files") {
            if query.contains("page=2") { return [Any]() }
            return path.contains("/pulls/412/") ? files : path.contains("/pulls/409/") ? reReviewFiles : [Any]()
        }
        if method == "GET", path.contains("/compare/") {
            return ["files": [["filename": "src/pricing/round.ts", "status": "modified", "additions": 1, "deletions": 1, "patch": roundSincePatch]]]
        }
        if method == "POST", path.hasSuffix("/reviews") { return ["id": 9001] }
        if method == "PUT", path.hasSuffix("/merge") { return ["merged": true, "message": "Pull Request successfully merged"] }
        if method == "POST" || method == "DELETE" { return ["ok": true] }
        return nil
    }

    private static let timeoutPatch = """
    @@ -12,14 +12,24 @@ export async function pay(basket: Basket, intent: PaymentIntent) {
       const controller = new AbortController();
       const timer = setTimeout(() => controller.abort(), PAYMENT_TIMEOUT_MS);
       try {
    -    const receipt = await provider.confirm(intent, { signal: controller.signal });
    -    basket.clear();
    -    return receipt;
    +    const receipt = await provider.confirm(intent, { signal: controller.signal });
    +    basket.clear();
    +    return { status: 'paid', receipt } as const;
    +  } catch (error) {
    +    if (isAbort(error)) {
    +      // The basket stays: the customer can try again with the same intent.
    +      return { status: 'timed-out', retry: () => pay(basket, intent) } as const;
    +    }
    +    throw error;
       } finally {
         clearTimeout(timer);
       }
     }
    +
    +function isAbort(error: unknown): boolean {
    +  return error instanceof DOMException && error.name === 'AbortError';
    +}
    """

    private static var files: [[String: Any]] {
        [
        ["filename": "src/cart/timeout.ts", "status": "modified", "additions": 14, "deletions": 3, "patch": timeoutPatch],
        [
            "filename": "src/cart/CheckoutButton.tsx", "status": "modified", "additions": 22, "deletions": 9,
            "patch": """
            @@ -18,9 +18,22 @@ export function CheckoutButton({ basket }: Props) {
               const [state, setState] = useState<'idle' | 'paying' | 'timed-out'>('idle');
            -  const onPay = async () => {
            -    setState('paying');
            -    await pay(basket, intent);
            -  };
            +  const [retry, setRetry] = useState<(() => Promise<PayResult>) | null>(null);
            +
            +  const settle = (result: PayResult) => {
            +    if (result.status === 'timed-out') {
            +      setRetry(() => result.retry);
            +      setState('timed-out');
            +      return;
            +    }
            +    setState('idle');
            +  };
            +
            +  const onPay = async () => {
            +    setState('paying');
            +    settle(await pay(basket, intent));
            +  };
               return <Button onClick={onPay} busy={state === 'paying'}>Pay</Button>;
             }
            """,
        ],
        [
            "filename": "src/cart/__tests__/timeout.test.ts", "status": "added", "additions": 58, "deletions": 0,
            "patch": """
            @@ -0,0 +1,12 @@
            +import { expect, test, vi } from 'vitest';
            +import { pay } from '../timeout';
            +
            +test('a timeout keeps the basket and offers a retry', async () => {
            +  vi.useFakeTimers();
            +  const basket = basketWith('socks', 'mug');
            +  const result = pay(basket, slowIntent());
            +  await vi.advanceTimersByTimeAsync(PAYMENT_TIMEOUT_MS);
            +  expect((await result).status).toBe('timed-out');
            +  expect(basket.items).toHaveLength(2);
            +});
            """,
        ],
        [
            "filename": "docs/cart.md", "status": "modified", "additions": 4, "deletions": 0,
            "patch": "@@ -10,3 +10,7 @@\n ## Timeouts\n+\n+A basket is kept when the payment page times out. The customer sees **Try again**,\n+which confirms the same payment intent.\n+",
        ],
        ["filename": "bun.lock", "status": "modified", "additions": 50, "deletions": 25, "patch": "@@ -1,3 +1,3 @@\n-\"vitest\": \"3.1.0\"\n+\"vitest\": \"3.2.0\""],
        ]
    }
}

// MARK: - Azure DevOps

/// The work items the fixture's pull requests name, in the JSON Azure DevOps sends.
private enum AdoFixture {
    struct Item {
        var id: Int
        var type = "Product Backlog Item"
        var title: String
        var state: String
        var assignedTo = "Sanne de Vries"
        var tags = "checkout; payments"
        var description = ""
        var acceptance = ""
        var repro = ""
    }

    static let attachment = "1b4e28ba-2fa1-11d2-883f-0016d3cca427"
    static let shopRepository = "a1b2c3d4-0000-4000-8000-000000000001"

    static let items: [Item] = [
        Item(
            id: 60379, title: "Keep the basket when the payment page times out", state: "Code Review",
            description: """
            <div>When the payment provider is slow, checkout gives up after 20 seconds and <b>empties the basket</b>. Customers have to start over.</div>
            <div><br></div><div>Keep the basket and offer to try again with the same payment.</div>
            <div><img src="https://dev.azure.com/acme/_apis/wit/attachments/\(attachment)?fileName=basket-before.png"></div>
            """,
            acceptance: "<ul><li>A timeout keeps every item in the basket</li><li>The customer sees <b>Try again</b></li><li>Trying again never charges twice</li></ul>"
        ),
        Item(
            id: 60402, type: "Bug", title: "Totals are off by a cent on orders with a discount", state: "Code Review", assignedTo: "Mira Jansen",
            tags: "checkout; pricing; rounding; invoice-export; reported-by-support; regression",
            description: longNotes,
            repro: """
            <ol><li>Add three items of € 3,33 to the basket</li><li>Apply the 10% code
            <ol><li><img src="https://dev.azure.com/acme/_apis/wit/attachments/\(attachment)?fileName=invoice-wide.png"></li></ol></li>
            <li>Compare the basket total with the invoice</li></ol>
            """
        ),
        Item(id: 60388, title: "Suggest product names while searching", state: "Development In Progress", assignedTo: "Koen Example"),
        Item(id: 60300, type: "Epic", title: "Checkout that never loses an order", state: "In Progress", assignedTo: "Lena Visser"),
        Item(id: 60871, title: "Refund an order that was paid in parts", state: "Code Review", assignedTo: "Ines Duarte"),
        Item(id: 61040, title: "Stock per warehouse on the product page", state: "Code Review", assignedTo: "Tom Bakker"),
        Item(id: 61055, type: "Task", title: "Price lists per customer group", state: "Development In Progress", assignedTo: "Koen Example"),
        Item(id: 61031, title: "VAT number on the order export", state: "Code Review", assignedTo: "Koen Example"),
        Item(id: 61060, title: "One coupon per order", state: "Development In Progress", assignedTo: "Koen Example"),
        Item(id: 60711, title: "Monthly ledger export for bookkeeping", state: "Development In Progress", assignedTo: "Ines Duarte"),
        Item(id: 60931, type: "Bug", title: "Refunds round differently than the invoice", state: "Done", assignedTo: "Tom Bakker"),
    ]

    /// Notes as an agent writes them: lists with quoted source lines, the shape that once pushed the page off screen.
    private static let longNotes = """
    <div><b>Risk: Medium</b> — The totals pipeline is shared by the basket, the invoice, the export and the dashboard tiles, so a fix touches many callers; it does not change stored orders.</div>
    <ul><li>The code to change has many callers</li></ul>
    <div>Intended behaviour, quoted from the source:</div>
    <ul>
    <li>doc <code>docs/pricing/rounding.md:300</code><blockquote>| `line.total` / `order.total` | `Totals.Line` (not `basket.sum` / `invoice.sum`) | rounded per line, then summed over every line of the order, never per order |<br><br>Each of them is rounded at its own place in the order, so it honours the discount of every<br>other line.</blockquote></li>
    <li>test <code>shop/Shop.Core.Api.Tests/Features/Checkout/Pricing/Totals/RoundingPerLineWithDiscountTests.cs:1815</code><blockquote>[Fact]<br>public void Totals_RoundPerLine_AppliesToOrdersWithADiscount_AndKeepsTheInvoiceEqualToTheBasket()<br>{<br>// one discounted line + one normal line</blockquote></li>
    </ul>
    """

    /// A process with many states, as teams that plan and verify with agents have.
    private static let longWorkflow: [[String: String]] = [
        ["name": "New", "category": "Proposed"], ["name": "Pick up by Agent", "category": "Proposed"], ["name": "Planning", "category": "InProgress"],
        ["name": "Awaiting Answers", "category": "InProgress"], ["name": "Answers Ready", "category": "InProgress"], ["name": "Finalizing", "category": "InProgress"],
        ["name": "Plan Review", "category": "InProgress"], ["name": "Plan Verification", "category": "InProgress"], ["name": "Ready For Development", "category": "InProgress"],
        ["name": "Development In Progress", "category": "InProgress"], ["name": "On Hold", "category": "InProgress"], ["name": "Testing Failed", "category": "InProgress"],
        ["name": "Fix Verification", "category": "InProgress"], ["name": "Needs Human", "category": "InProgress"], ["name": "Code Review", "category": "Resolved"],
        ["name": "Ready For QA", "category": "Resolved"], ["name": "Post-Merge Smoke", "category": "Resolved"], ["name": "Test In Progress", "category": "Resolved"],
        ["name": "Done", "category": "Completed"],
    ]

    private static let states: [[String: String]] = [
        ["name": "New", "category": "Proposed"], ["name": "Development In Progress", "category": "InProgress"], ["name": "Code Review", "category": "Resolved"],
        ["name": "Testing", "category": "InProgress"], ["name": "Ready For QA", "category": "Resolved"], ["name": "Done", "category": "Completed"],
    ]

    static func isAttachment(_ url: URL) -> Bool { url.path().lowercased().contains("/_apis/wit/attachments/") }

    static func answer(method: String, url: URL, body: [String: Any]) -> Any? {
        let path = url.path().lowercased()
        let id = path.firstMatch(of: #/workitems/(\d+)/#).flatMap { Int($0.1) }
        let item = items.first { $0.id == id }
        if path.hasSuffix("/_apis/connectiondata") {
            return ["authenticatedUser": ["providerDisplayName": "Koen Example", "properties": ["Account": ["$type": "System.String", "$value": "koen@example.com"]]]]
        }
        if path.hasSuffix("/_apis/projects") { return ["value": [["name": "Shop"], ["name": "Warehouse"], ["name": "Platform"]]] }
        if path.hasSuffix("/states") { return ["value": path.contains("/bug/") ? longWorkflow : states] }
        if path.hasSuffix("/_apis/wit/workitemsbatch") {
            let wanted = body["ids"] as? [Int] ?? []
            return ["value": wanted.map { id in items.first { $0.id == id }.map(raw) ?? NSNull() as Any }]
        }
        guard let item else { return nil }
        if path.hasSuffix("/updates") { return ["value": updates(item)] }
        if path.hasSuffix("/comments") {
            if method == "POST" { return comment(99, "Koen Example", body["text"] as? String ?? "", hoursAgo: 0, markdown: true) }
            return ["comments": item.id == 60379 ? comments : []]
        }
        var answer = raw(item)
        answer["relations"] = item.id == 60379 ? relations : []
        return answer
    }

    private static func raw(_ item: Item) -> [String: Any] {
        ["id": item.id, "fields": [
            "System.Id": item.id, "System.TeamProject": "Shop", "System.WorkItemType": item.type, "System.Title": item.title, "System.State": item.state,
            "System.IterationPath": "Shop\\Sprint 42", "System.AreaPath": "Shop\\Checkout", "System.Tags": item.tags,
            "System.AssignedTo": ["displayName": item.assignedTo, "uniqueName": "\(item.assignedTo.split(separator: " ")[0].lowercased())@example.com"],
            "System.ChangedDate": DirectFixture.ago(hours: 3), "Microsoft.VSTS.Common.Priority": 2, "Microsoft.VSTS.Scheduling.Effort": 5,
            "System.Description": item.description, "Microsoft.VSTS.Common.AcceptanceCriteria": item.acceptance, "Microsoft.VSTS.TCM.ReproSteps": item.repro,
        ] as [String: Any]]
    }

    private static var relations: [[String: Any]] {
        [
            ["rel": "System.LinkTypes.Hierarchy-Reverse", "url": "https://dev.azure.com/acme/_apis/wit/workItems/60300"],
            ["rel": "AttachedFile", "url": "https://dev.azure.com/acme/_apis/wit/attachments/\(attachment)", "attributes": ["name": "basket-before.png", "resourceSize": 184_320] as [String: Any]],
            ["rel": "ArtifactLink", "url": "vstfs:///GitHub/PullRequest/\(shopRepository)%2f412", "attributes": ["name": "GitHub Pull Request"]],
        ]
    }

    private static var comments: [[String: Any]] {
        [
            comment(3, "Sanne de Vries", "Pull request **#412** is up. The retry confirms the same payment intent, so nobody is charged twice.", hoursAgo: 3, markdown: true),
            comment(2, "Lena Visser", "<div>Support had four of these last week. Please keep the basket for at least the session.</div>", hoursAgo: 50, markdown: false),
        ]
    }

    private static func comment(_ id: Int, _ by: String, _ text: String, hoursAgo: Double, markdown: Bool) -> [String: Any] {
        var comment: [String: Any] = ["id": id, "text": text, "createdDate": DirectFixture.ago(hours: hoursAgo), "createdBy": ["displayName": by]]
        if markdown { comment["format"] = "markdown" }
        return comment
    }

    private static func updates(_ item: Item) -> [[String: Any]] {
        func change(_ rev: Int, by: String, hoursAgo: Double, _ fields: [String: Any]) -> [String: Any] {
            var fields = fields
            fields["System.ChangedDate"] = ["newValue": DirectFixture.ago(hours: hoursAgo)]
            return ["rev": rev, "revisedBy": ["displayName": by], "fields": fields]
        }
        return [
            change(1, by: "Lena Visser", hoursAgo: 96, ["System.State": ["newValue": "New"]]),
            change(2, by: "Lena Visser", hoursAgo: 72, ["System.AssignedTo": ["newValue": ["displayName": item.assignedTo]]]),
            change(3, by: item.assignedTo, hoursAgo: 48, ["System.State": ["oldValue": "New", "newValue": "Development In Progress"]]),
            change(4, by: item.assignedTo, hoursAgo: 3, ["System.State": ["oldValue": "Development In Progress", "newValue": item.state]]),
        ]
    }
}

// MARK: - Images

/// A drawn stand-in for a screenshot, so proof images load without a network.
private enum FixtureImage {
    static func png(named name: String) -> Data {
        if name.contains("wide") { return desktopScreenshot() }
        let after = name.contains("after")
        let size = CGSize(width: 390, height: 700)
        return UIGraphicsImageRenderer(size: size).pngData { context in
            UIColor(white: 0.97, alpha: 1).setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(white: 1, alpha: 1).setFill()
            for row in 0..<(after ? 3 : 0) {
                UIBezierPath(roundedRect: CGRect(x: 20, y: 120 + CGFloat(row) * 96, width: 350, height: 80), cornerRadius: 16).fill()
            }
            let title = after ? "Basket · 3 items" : "Your basket is empty"
            (title as NSString).draw(at: CGPoint(x: 20, y: 60), withAttributes: [.font: UIFont.systemFont(ofSize: 26, weight: .bold), .foregroundColor: UIColor.black])
            (after ? UIColor.systemIndigo : UIColor.systemGray3).setFill()
            UIBezierPath(roundedRect: CGRect(x: 20, y: 600, width: 350, height: 54), cornerRadius: 27).fill()
            ((after ? "Try again" : "Back to the shop") as NSString).draw(
                at: CGPoint(x: 140, y: 615), withAttributes: [.font: UIFont.systemFont(ofSize: 18, weight: .semibold), .foregroundColor: UIColor.white]
            )
        }
    }

    /// A wide one, as a screenshot of a desktop page is.
    private static func desktopScreenshot() -> Data {
        let size = CGSize(width: 1600, height: 820)
        return UIGraphicsImageRenderer(size: size).pngData { context in
            UIColor.white.setFill()
            context.fill(CGRect(origin: .zero, size: size))
            UIColor(red: 0.10, green: 0.13, blue: 0.27, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 96, height: size.height))
            UIColor(white: 0.93, alpha: 1).setFill()
            for row in 0..<9 { context.fill(CGRect(x: 130, y: 150 + CGFloat(row) * 66, width: 1430, height: 2)) }
            ("Invoices" as NSString).draw(at: CGPoint(x: 130, y: 44), withAttributes: [.font: UIFont.systemFont(ofSize: 44, weight: .bold), .foregroundColor: UIColor.black])
            ("Total  € 9,00   ·   Basket  € 8,99" as NSString).draw(
                at: CGPoint(x: 130, y: 172), withAttributes: [.font: UIFont.systemFont(ofSize: 30, weight: .medium), .foregroundColor: UIColor.systemRed]
            )
        }
    }
}
#endif
