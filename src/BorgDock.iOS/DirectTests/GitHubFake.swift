import Foundation
@testable import BorgDock

/// A stand-in for api.github.com: answers recorded-shape responses and records every request. Tests never reach
/// the real GitHub. The Swift twin of the server's `test/github-fixtures/fake.ts`.
final class GitHubFake: URLProtocol {
    struct Seen: Sendable {
        let method: String
        let url: String
        let headers: [String: String]
        let body: Data?
        /// `query FocusSearch` → "FocusSearch"; nil for REST.
        let operation: String?

        var json: [String: Any] { body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] ?? [:] }
        var variables: [String: Any] { json["variables"] as? [String: Any] ?? [:] }
        var query: String { variables["query"] as? String ?? "" }
        /// "token-of-koen-0123456789" → "koen"
        var reader: String { headers["Authorization"]?.firstMatch(of: #/token-of-(\w+)-/#).map { String($0.1) } ?? "" }
    }

    struct Answer: Sendable {
        var status = 200
        var body = Data()
        var headers: [String: String] = [:]
        /// Set by `held(by:)`.
        var gate: Gate?

        static func json(_ object: Any, status: Int = 200) -> Answer {
            Answer(status: status, body: (try? JSONSerialization.data(withJSONObject: object)) ?? Data())
        }

        /// A GraphQL answer: `{ "data": … }`.
        static func data(_ object: Any) -> Answer { json(["data": object]) }
        static func status(_ status: Int, message: String = "") -> Answer { json(["message": message], status: status) }
        static func text(_ text: String, status: Int = 200, headers: [String: String] = [:]) -> Answer {
            Answer(status: status, body: Data(text.utf8), headers: headers)
        }

        /// GitHub's answer for a job's log: the log is at `location`.
        static func redirect(to location: String) -> Answer { Answer(status: 302, headers: ["Location": location]) }

        /// The same answer, sent only once `gate` opens: one that is still on its way.
        func held(by gate: Gate) -> Answer {
            var held = self
            held.gate = gate
            return held
        }
    }

    /// Holds answers back until a test opens it.
    final class Gate: @unchecked Sendable {
        private let lock = NSLock()
        // Guarded by `lock`.
        private var isOpen = false
        private var waiting: [() -> Void] = []

        func open() {
            let released = lock.withLock {
                isOpen = true
                defer { waiting = [] }
                return waiting
            }
            released.forEach { $0() }
        }

        fileprivate func whenOpen(_ work: @escaping () -> Void) {
            let alreadyOpen = lock.withLock {
                if !isOpen { waiting.append(work) }
                return isOpen
            }
            if alreadyOpen { work() }
        }
    }

    /// Handlers run on the loader's thread while the test awaits the request; they only read what they captured.
    typealias Handler = (Seen) -> Answer?

    private static let lock = NSLock()
    nonisolated(unsafe) private static var graphql: [String: Handler] = [:]
    nonisolated(unsafe) private static var rest: [(method: String, pattern: String, handler: Handler)] = []
    nonisolated(unsafe) private static var recorded: [Seen] = []

    static func reset() {
        lock.withLock {
            graphql = [:]
            rest = []
            recorded = []
        }
    }

    /// Answers a GraphQL operation by its name (`query FocusSearch`).
    static func onGraphql(_ operation: String, _ handler: @escaping Handler) {
        lock.withLock { graphql[operation] = handler }
    }

    static func onGraphql(_ operation: String, data: Any) {
        let answer = Answer.data(data)
        onGraphql(operation) { _ in answer }
    }

    /// The newest handler whose pattern matches the address wins.
    static func onRest(_ method: String, _ pattern: String, _ handler: @escaping Handler) {
        lock.withLock { rest.insert((method, pattern, handler), at: 0) }
    }

    static func onRest(_ method: String, _ pattern: String, json: Any, status: Int = 200) {
        let answer = Answer.json(json, status: status)
        onRest(method, pattern) { _ in answer }
    }

    static var seen: [Seen] { lock.withLock { recorded } }
    static func operations(_ name: String) -> [Seen] { seen.filter { $0.operation == name } }
    static func requests(_ method: String, _ pattern: String) -> [Seen] {
        seen.filter { $0.method == method && $0.url.range(of: pattern, options: .regularExpression) != nil }
    }

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [GitHubFake.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!.absoluteString
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read)
        let operation = url.hasSuffix("/graphql")
            ? body.flatMap { String(data: $0, encoding: .utf8) }?.firstMatch(of: #/(?:query|mutation)\s+(\w+)/#).map { String($0.1) }
            : nil
        let seen = Seen(method: request.httpMethod ?? "GET", url: url, headers: request.allHTTPHeaderFields ?? [:], body: body, operation: operation)
        let handler: Handler? = Self.lock.withLock {
            Self.recorded.append(seen)
            if let operation { return Self.graphql[operation] }
            return Self.rest.first { $0.method == seen.method && url.range(of: $0.pattern, options: .regularExpression) != nil }?.handler
        }
        let answer = handler?(seen) ?? .status(404, message: "Not Found (\(seen.method) \(url))")
        guard let gate = answer.gate else { return send(answer) }
        // URLProtocol wants its client told on the thread that started the load.
        held = answer
        let loader = Thread.current
        let modes = [(RunLoop.current.currentMode ?? .default).rawValue]
        gate.whenOpen { self.perform(#selector(self.sendHeld), on: loader, with: nil, waitUntilDone: false, modes: modes) }
    }

    override func stopLoading() {}

    /// The answer a gate holds back.
    private var held: Answer?

    @objc private func sendHeld() {
        if let held { send(held) }
    }

    private func send(_ answer: Answer) {
        let response = HTTPURLResponse(url: request.url!, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: answer.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: answer.body)
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

// MARK: - Recorded shapes

enum Fake {
    /// JSON's null for a missing value.
    static func orNull(_ value: Any?) -> Any { value ?? NSNull() }

    static let now = try! Date("2026-10-31T12:00:00Z", strategy: .iso8601)
    static func hours(_ count: Double) -> TimeInterval { count * 3600 }
    static func days(_ count: Double) -> TimeInterval { count * 86_400 }
    /// The ISO time `seconds` before `now`, as GitHub writes it.
    static func ago(_ seconds: TimeInterval) -> String { now.addingTimeInterval(-seconds).formatted(.iso8601) }

    static func account(_ login: String) -> GitHubAccount { GitHubAccount(login: login, token: "token-of-\(login)-0123456789") }

    struct Check {
        var name: String
        /// `nil` for a check that still runs.
        var conclusion: String? = "SUCCESS"
        var status = "COMPLETED"
        var id = 1
        var runId = 1
        var runNumber = 1
        var workflow = "CI"
        var completedAt: String?
    }

    static func checkRun(_ check: Check) -> [String: Any] {
        [
            "__typename": "CheckRun", "databaseId": check.id, "name": check.name, "status": check.status, "conclusion": orNull(check.conclusion),
            "startedAt": ago(hours(2)), "completedAt": check.completedAt ?? ago(hours(1)),
            "detailsUrl": "https://github.com/acme/shop/actions/runs/\(check.runId)/job/\(check.id)",
            "checkSuite": ["workflowRun": ["databaseId": check.runId, "runNumber": check.runNumber, "workflow": ["name": check.workflow]]],
        ]
    }

    struct Review {
        var login: String
        var state: String
        var at: String?
        var sha: String?
    }

    /// A pull request node in the shape GitHub's GraphQL search returns it (recorded from a real answer, then anonymised).
    static func pullRequest(
        number: Int = 1, title: String? = nil, body: String = "", author: String = "sanne", authorName: String? = "Sanne de Vries", draft: Bool = false,
        updatedAgo: TimeInterval = 3600, createdAgo: TimeInterval = 2 * 86_400, head: String? = nil, headSha: String? = nil, mergeable: String = "MERGEABLE",
        requested: [String] = [], teams: [String] = [], autoMerge: Bool = false, reviews: [Review] = [], checks: [Any]? = nil, commits: [String]? = nil,
        owner: String = "acme", repo: String = "shop"
    ) -> [String: Any] {
        let sha = headSha ?? "sha\(number)"
        return [
            "id": "PR_\(owner)_\(repo)_\(number)", "number": number, "title": title ?? "Pull request \(number)", "body": body,
            "url": "https://github.com/\(owner)/\(repo)/pull/\(number)", "isDraft": draft, "state": "OPEN",
            "createdAt": ago(createdAgo), "updatedAt": ago(updatedAgo), "mergedAt": NSNull(),
            "additions": 10, "deletions": 2, "changedFiles": 1, "headRefName": head ?? "feat/\(number)-thing", "baseRefName": "main", "headRefOid": sha,
            "isCrossRepository": false, "mergeable": mergeable, "reviewDecision": NSNull(),
            "autoMergeRequest": autoMerge ? ["enabledAt": ago(hours(1))] : NSNull(),
            "author": ["login": author, "avatarUrl": "https://avatars.example/\(author)", "name": orNull(authorName)],
            "repository": ["name": repo, "owner": ["login": owner], "defaultBranchRef": ["name": "main"]],
            "labels": ["nodes": [["name": "frontend", "color": "1d76db"]]],
            "reviewRequests": ["nodes": requested.map { ["requestedReviewer": ["__typename": "User", "login": $0]] }
                + teams.map { ["requestedReviewer": ["__typename": "Team", "slug": $0]] }],
            "latestReviews": ["nodes": reviews.map {
                ["state": $0.state, "submittedAt": $0.at ?? ago(hours(3)), "author": ["login": $0.login], "commit": ["oid": $0.sha ?? sha]] as [String: Any]
            }],
            "head": ["nodes": [["commit": ["statusCheckRollup": ["contexts": ["nodes": checks ?? [checkRun(Check(name: "build"))]]]]]]],
            "recent": ["nodes": (commits ?? [sha]).map { ["commit": ["oid": $0]] }],
        ]
    }

    static func record(_ node: [String: Any], account: String = "koen") -> PrRecord {
        let raw = try! JSONDecoder().decode(RawPullRequest.self, from: JSONSerialization.data(withJSONObject: node))
        return GitHubMapping.record(raw, account: account)
    }

    /// One page of a FocusSearch answer; `next` is the cursor of the page after it.
    static func searchAnswer(_ nodes: [[String: Any]], login: String = "koen", next: String? = nil) -> [String: Any] {
        ["viewer": ["login": login], "found": ["pageInfo": ["hasNextPage": next != nil, "endCursor": orNull(next)], "nodes": nodes]]
    }

    /// The repository a search reads, lower-cased: GitHub ignores case.
    static func repositoryOf(_ seen: GitHubFake.Seen) -> String? {
        seen.query.firstMatch(of: #/repo:(\S+)/#).map { $0.1.lowercased() }
    }
}

/// A GitHub with one repository, two open pull requests and a red main branch. #1: a review Sanne asked from koen,
/// its e2e job red. #2: koen's own, approved and green. main: red since m1.
struct GitHubWorld {
    let store = MemoryStore()
    private let made = Services()
    var review = Fake.pullRequest(
        number: 1, title: "Keep the basket on timeout AB#60379",
        body: "Before/after:\n![basket kept](https://github.com/user-attachments/assets/basket.png)\n<img src=\"https://github.com/user-attachments/assets/after.png\" alt=\"after\">",
        head: "feat/1-basket", headSha: "h1", requested: ["koen"],
        checks: [Fake.checkRun(.init(name: "e2e", conclusion: "FAILURE", id: 501, runId: 50)), Fake.checkRun(.init(name: "lint", id: 502, runId: 50))]
    )
    var mine = Fake.pullRequest(
        number: 2, title: "Round totals", author: "koen", authorName: "Koen", headSha: "h2",
        reviews: [.init(login: "mira", state: "APPROVED", sha: "h2")], checks: [Fake.checkRun(.init(name: "build", id: 601, runId: 60))]
    )

    static let one = PrKey(owner: "acme", repo: "shop", number: 1)
    static let two = PrKey(owner: "acme", repo: "shop", number: 2)

    /// Registers the answers; call again after changing `review` or `mine`.
    func install() {
        let byNumber = [1: review, 2: mine]
        let (review, mine) = (review, mine)
        GitHubFake.onGraphql("FocusSearch") { seen in
            if seen.reader == "broken" { return .status(502, message: "Server Error") }
            return .data(Fake.searchAnswer(seen.query.contains("involves:@me") ? [review, mine] : []))
        }
        GitHubFake.onGraphql("ViewerTeams", data: ["viewer": ["organizations": ["nodes": [["teams": ["nodes": [["slug": "platform"]]]]]]]])
        GitHubFake.onGraphql("PrDetail") { seen in
            guard let pr = byNumber[seen.variables["number"] as? Int ?? 0] else { return .data(["repository": ["pullRequest": NSNull()]]) }
            var detail = pr
            detail["commits"] = ["totalCount": 3]
            detail["reviews"] = ["nodes": [["state": "COMMENTED", "submittedAt": Fake.ago(Fake.hours(3)), "body": "Looks close",
                                           "author": ["login": "mira", "avatarUrl": NSNull(), "name": "Mira"]]]]
            detail["reviewRequestsFull"] = ["nodes": [["requestedReviewer": ["__typename": "User", "login": "koen", "name": "Koen", "avatarUrl": NSNull()]]]]
            return .data(["repository": [
                "squashMergeAllowed": true, "mergeCommitAllowed": false, "rebaseMergeAllowed": true, "deleteBranchOnMerge": true,
                "viewerPermission": "WRITE", "viewerDefaultMergeMethod": "SQUASH", "pullRequest": detail,
            ]])
        }
        GitHubFake.onGraphql("PrHead") { seen in
            guard let pr = byNumber[seen.variables["number"] as? Int ?? 0] else { return .data(["repository": ["pullRequest": NSNull()]]) }
            return .data(["repository": ["pullRequest": [
                "id": pr["id"]!, "headRefOid": pr["headRefOid"]!, "state": "OPEN", "headRefName": pr["headRefName"]!, "isCrossRepository": false, "head": pr["head"]!,
            ]]])
        }
        installFailedJobs()
    }

    /// #1's failed job and main's red runs, with the log of each failed job behind GitHub's redirect to storage.
    private func installFailedJobs() {
        let testFailed: [String: Any] = ["name": "Run bun run test", "conclusion": "failure"]
        GitHubFake.onRest("GET", #"/repos/acme/shop/actions/jobs/501$"#, json: ["id": 501, "steps": [["name": "Set up job", "conclusion": "success"], testFailed]])
        GitHubFake.onRest("GET", #"/actions/jobs/\d+/logs$"#) { seen in
            let job = seen.url.firstMatch(of: #/jobs/(\d+)/#).map { String($0.1) } ?? ""
            return .redirect(to: "https://storage.example/logs/\(job)?sig=secret")
        }
        GitHubFake.onRest("GET", #"^https://storage\.example/logs/"#) { _ in Self.storedLog }

        // main: runs 900 and 899 red (899 the first), 898 green.
        func run(_ id: Int, _ conclusion: String, sha: String, ago: TimeInterval, message: String) -> [String: Any] {
            ["id": id, "workflow_id": 7, "name": "CI", "status": "completed", "conclusion": conclusion, "head_sha": sha, "created_at": Fake.ago(ago),
             "head_commit": ["message": message]]
        }
        GitHubFake.onRest("GET", #"/repos/acme/shop/actions/runs\?branch=main"#, json: ["workflow_runs": [
            run(900, "failure", sha: "m2", ago: Fake.hours(4), message: "Tidy the cart"),
            run(899, "failure", sha: "m1", ago: Fake.days(1), message: "Round totals\n\nlong body"),
            run(898, "success", sha: "m0", ago: Fake.days(2), message: "Green"),
        ]])
        GitHubFake.onRest("GET", "/actions/runs/900/jobs", json: ["jobs": [
            ["id": 901, "run_id": 900, "name": "test", "conclusion": "failure", "completed_at": Fake.ago(Fake.hours(3)), "head_sha": "m2", "steps": [testFailed]],
            ["id": 902, "run_id": 900, "name": "lint", "conclusion": "success", "completed_at": Fake.ago(Fake.hours(3)), "head_sha": "m2"],
        ]])
    }

    /// What log storage answers for the tail of a failed job's log.
    static let storedLog = GitHubFake.Answer.text(CiLogs.vitestFailure, status: 206, headers: ["Content-Range": "bytes 0-1/2"])

    func service(accounts: [String] = ["koen"], workItems: @escaping WorkItemLookup = { _ in [] }) -> GitHubDirect {
        let service = GitHubDirect(accounts: accounts.map(Fake.account), store: store, session: GitHubFake.session(), workItems: workItems, now: { Fake.now })
        made.add(service)
        return service
    }

    /// Waits until the services this world made have read the job logs they started on, so none of them is still
    /// asking GitHub when the next test begins.
    func settle() async {
        for service in made.all { await service.ciSettled() }
    }
}

/// The services a world made.
private final class Services: @unchecked Sendable {
    private let lock = NSLock()
    // Guarded by `lock`.
    private var services: [GitHubDirect] = []

    var all: [GitHubDirect] { lock.withLock { services } }
    func add(_ service: GitHubDirect) { lock.withLock { services.append(service) } }
}
