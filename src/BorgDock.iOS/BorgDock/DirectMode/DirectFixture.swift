#if DEBUG
import UIKit

/// `-BorgDockFixture`: made-up GitHub and Azure DevOps answers (the `acme` shop), so screenshots and UI tests never
/// show real work and never touch the network. Writes answer "done" and change nothing. Debug builds only.
enum DirectFixture {
    static var isOn: Bool { ProcessInfo.processInfo.arguments.contains("-BorgDockFixture") }

    static let credentials = DirectCredentials(
        gitHub: [.init(login: "koen", token: "fixture", name: "Koen Example", avatarUrl: nil)],
        azureDevOps: AdoConnection(organizationURL: URL(string: "https://dev.azure.com/acme")!, project: "Shop", credential: .personalAccessToken("fixture"))
    )

    /// A session that reads the fixture and forgets everything when the app quits.
    @MainActor
    static func session() -> DirectSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [DirectFixtureProtocol.self]
        let scratch = FileManager.default.temporaryDirectory.appendingPathComponent("direct-fixture-\(UUID().uuidString)", isDirectory: true)
        let defaults = UserDefaults(suiteName: "direct-fixture") ?? .standard
        return DirectSession(store: FileStore(directory: scratch), defaults: defaults, session: URLSession(configuration: configuration), credentials: credentials)
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

/// Answers api.github.com, dev.azure.com/acme and the fixture's own image host.
final class DirectFixtureProtocol: URLProtocol {
    private static let imageHost = "fixture.acme.example"

    override class func canInit(with request: URLRequest) -> Bool {
        guard let host = request.url?.host() else { return false }
        return host == "api.github.com" || host == "dev.azure.com" || host == imageHost
    }

    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }
    override func stopLoading() {}

    override func startLoading() {
        guard let url = request.url else { return }
        if url.host() == "api.github.com", url.path().hasSuffix("/logs") {
            return answer(200, Data(GitHubFixture.failedJobLog.utf8), type: "text/plain")
        }
        if url.host() == Self.imageHost || AdoFixture.isAttachment(url) {
            return answer(200, FixtureImage.png(named: url.query() ?? url.lastPathComponent), type: "image/png")
        }
        let body = request.httpBody ?? request.httpBodyStream.map(Self.read) ?? Data()
        let json = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
        let reply: Any? = url.host() == "dev.azure.com"
            ? AdoFixture.answer(method: request.httpMethod ?? "GET", url: url, body: json)
            : url.path() == "/graphql"
                ? GitHubFixture.graphql(query: json["query"] as? String ?? "", variables: json["variables"] as? [String: Any] ?? [:])
                : GitHubFixture.rest(method: request.httpMethod ?? "GET", path: url.path(), query: url.query() ?? "")
        guard let reply, let data = try? JSONSerialization.data(withJSONObject: reply) else {
            return answer(404, Data(#"{"message":"Not in the fixture"}"#.utf8), type: "application/json")
        }
        answer(200, data, type: "application/json")
    }

    private func answer(_ status: Int, _ data: Data, type: String) {
        let response = HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": type])!
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
    """

    static let pullRequests: [PullRequest] = [
        PullRequest(
            number: 412, title: "Keep the basket on timeout AB#60379", author: ("sanne", "Sanne de Vries"), body: basketBody, updatedHoursAgo: 2,
            additions: 148, deletions: 37, files: 5, labels: [("frontend", "1d76db"), ("checkout", "5319e7")], requested: ["koen"],
            checks: [Check(name: "build"), Check(name: "unit"), Check(name: "lint"), Check(name: "e2e / checkout", conclusion: "FAILURE"), Check(name: "types")]
        ),
        PullRequest(
            number: 409, title: "Round totals per line, not per order AB#60402", author: ("mira", "Mira Jansen"), updatedHoursAgo: 5, additions: 62, deletions: 18, files: 4,
            labels: [("pricing", "0e8a16")], requested: ["koen"], reviews: [("koen", "COMMENTED", "c1")], commits: ["c1", "c2", "head409"]
        ),
        PullRequest(number: 415, title: "Cache the price list for a minute", author: ("tom", "Tom Bakker"), updatedHoursAgo: 1, additions: 31, deletions: 4, files: 2, teams: ["platform"]),
        PullRequest(
            number: 398, title: "Checkout: show the delivery window", author: ("koen", "Koen Example"), updatedHoursAgo: 20, additions: 96, deletions: 12, files: 6,
            reviews: [("mira", "APPROVED", nil)]
        ),
        PullRequest(
            number: 401, title: "Search suggestions for product names AB#60388", author: ("koen", "Koen Example"), updatedHoursAgo: 7, additions: 210, deletions: 44, files: 9,
            reviews: [("sanne", "CHANGES_REQUESTED", nil)]
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
    ]

    static func node(_ pr: PullRequest) -> [String: Any] {
        [
            "id": "PR_\(pr.repo)_\(pr.number)", "number": pr.number, "title": pr.title, "body": pr.body,
            "url": "https://github.com/acme/\(pr.repo)/pull/\(pr.number)", "isDraft": pr.draft, "state": "OPEN",
            "createdAt": DirectFixture.ago(hours: pr.createdHoursAgo), "updatedAt": DirectFixture.ago(hours: pr.updatedHoursAgo), "mergedAt": NSNull(),
            "additions": pr.additions, "deletions": pr.deletions, "changedFiles": pr.files, "headRefName": pr.branch, "baseRefName": "main", "headRefOid": pr.headSha,
            "isCrossRepository": false, "mergeable": pr.mergeable, "reviewDecision": NSNull(), "autoMergeRequest": NSNull(),
            "author": actor(pr.author.login, pr.author.name),
            "repository": ["name": pr.repo, "owner": ["login": "acme"], "defaultBranchRef": ["name": "main"]],
            "labels": ["nodes": pr.labels.map { ["name": $0.0, "color": $0.1] }],
            "reviewRequests": ["nodes": pr.requested.map { ["requestedReviewer": ["__typename": "User", "login": $0]] }
                + pr.teams.map { ["requestedReviewer": ["__typename": "Team", "slug": $0]] }],
            "latestReviews": ["nodes": pr.reviews.map {
                ["state": $0.state, "submittedAt": DirectFixture.ago(hours: pr.updatedHoursAgo + 3), "author": ["login": $0.login], "commit": ["oid": $0.sha ?? pr.headSha]] as [String: Any]
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
            "detailsUrl": "https://github.com/acme/\(pr.repo)/actions/runs/\(pr.number)/job/\(id)",
            "checkSuite": ["workflowRun": ["databaseId": pr.number * 10, "runNumber": pr.number * 3, "workflow": ["name": check.workflow]]],
        ]
    }

    static func graphql(query: String, variables: [String: Any]) -> Any? {
        let operation = query.firstMatch(of: #/(?:query|mutation)\s+(\w+)/#).map { String($0.1) } ?? ""
        let pr = pullRequests.first { $0.number == variables["number"] as? Int && $0.repo == variables["repo"] as? String }
        switch operation {
        case "Viewer":
            return data(["viewer": actor("koen", "Koen Example")])
        case "ViewerTeams":
            return data(["viewer": ["organizations": ["nodes": [["teams": ["nodes": [["slug": "platform"]]]]]]]])
        case "FocusSearch":
            // Everything involves koen here; the other searches add nothing new.
            let found = (variables["query"] as? String ?? "").contains("involves:@me") ? pullRequests.map(node) : []
            return data(["viewer": ["login": "koen"], "found": ["pageInfo": ["hasNextPage": false, "endCursor": NSNull()], "nodes": found]])
        case "PrDetail":
            guard let pr else { return data(["repository": ["pullRequest": NSNull()]]) }
            var detail = node(pr)
            detail["commits"] = ["totalCount": pr.commits?.count ?? 3]
            detail["reviews"] = ["nodes": pr.reviews.map {
                ["state": $0.state, "submittedAt": DirectFixture.ago(hours: pr.updatedHoursAgo + 3), "body": $0.state == "APPROVED" ? "" : "Close. See the notes on the retry.",
                 "author": actor($0.login, $0.login.capitalized)] as [String: Any]
            }]
            detail["reviewRequestsFull"] = ["nodes": pr.requested.map { ["requestedReviewer": ["__typename": "User", "login": $0, "name": "Koen Example", "avatarUrl": NSNull()]] }]
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
            return data(["repository": ["pullRequest": pr?.number == 412 ? conversation : ["reviewThreads": ["nodes": [Any]()], "comments": ["nodes": [Any]()]]]])
        case "Reply", "Resolve", "AutoMerge":
            return data(["ok": true])
        default:
            return nil
        }
    }

    private static func data(_ value: Any) -> [String: Any] { ["data": value] }

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

    static func rest(method: String, path: String, query: String) -> Any? {
        if method == "GET", path.contains("/actions/jobs/") {
            return ["steps": [["name": "Set up job", "conclusion": "success"], ["name": "Run bun run test:e2e", "conclusion": "failure"]]]
        }
        // The default branches are green: no failure here is shared with main.
        if method == "GET", path.hasSuffix("/actions/runs") { return ["workflow_runs": [Any]()] }
        if method == "GET", path.hasSuffix("/files") { return path.contains("/pulls/412/") && !query.contains("page=2") ? files : [Any]() }
        if method == "GET", path.contains("/compare/") { return ["files": [["filename": "src/pricing/round.ts", "status": "modified", "additions": 4, "deletions": 1]]] }
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
