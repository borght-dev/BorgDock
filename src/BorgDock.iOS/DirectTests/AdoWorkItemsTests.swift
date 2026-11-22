import XCTest
@testable import BorgDock

/// The item page read straight from Azure DevOps: the page cases of the server's `test/item-detail.test.ts`, with ADO
/// answering over a stubbed session. What differs from the server is what the phone lacks: no signed attachment paths
/// (an attachment keeps its ADO address), no agent threads and no list of my items.
final class AdoWorkItemsTests: XCTestCase {
    private let guid = AdoFixture.guid

    private struct Page {
        let items: AdoWorkItems
        let looked: AdoRecorder<String>
        let store: AdoMemoryStore
    }

    /// GitHub has #398 open and knows #412 as merged; ADO links #412 and #380 by its own repository id.
    private func makePage(
        open: [PrSummary] = [AdoFixture.pullRequest(398, title: "Checkout totals plan", workItemIds: [61021, 61022])],
        store: AdoMemoryStore = AdoMemoryStore(),
        knowsTheRepository: Bool = true,
        lookupTime: Duration = .seconds(8),
        lookup: (@Sendable (PrKey) async throws -> PrSummary)? = nil
    ) -> Page {
        if knowsTheRepository { store.set(Data(#"{"\#(AdoFixture.shopRepositoryId)":"acme/shop"}"#.utf8), forKey: "ado.githubRepositories") }
        let looked = AdoRecorder<String>()
        let source = AdoPullRequestSource(open: { open }, lookup: { key in
            looked.add(key.key)
            if let lookup { return try await lookup(key) }
            guard key.number == 412 else { throw directError(404, "not found") }
            return AdoFixture.pullRequest(412, title: "Round totals per line AB#61021", state: .merged, checks: AdoFixture.noChecks)
        })
        let items = AdoWorkItems(connection: AdoFixture.connection, session: AdoStubURLProtocol.session(), pullRequests: source, store: store, lookupTime: lookupTime)
        return Page(items: items, looked: looked, store: store)
    }

    // MARK: The page

    func testTheItemPageMarkdownHistoryEveryPullRequestParentEffortAreaAndAttachments() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        let page = makePage()
        let detail = try await page.items.item(61021)

        XCTAssertEqual(detail.item, WorkItemSummary(
            id: 61021, type: .pbi, typeName: "Product Backlog Item", title: "Totals off by a cent", state: "Testing Failed", stateCategory: .inProgress,
            workflow: AdoFixture.workflow, sprint: "5.2.8", dueDate: nil, priority: 2, tags: ["checkout", "rounding"], assignedTo: "Koen", assignedToMe: true,
            url: "https://dev.azure.com/acme/Shop/_workitems/edit/61021"
        ))
        XCTAssertEqual(detail.description, "Totals are off by a cent.", "the plain text stays for screens without markdown")
        XCTAssertEqual(detail.qaNotes, "Invoice export still rounds per order.")
        XCTAssertEqual(detail.markdown?.description, "Totals are off by a cent.  \n![](https://dev.azure.com/acme/0f1e/_apis/wit/attachments/\(guid)?fileName=invoice.png)", "an image keeps its ADO address")
        XCTAssertEqual(detail.markdown?.acceptanceCriteria, "- Basket\n- Invoice")
        XCTAssertEqual(detail.markdown?.reproSteps, AdoFixture.reproSteps, "ADO markdown keeps its text")
        XCTAssertEqual(detail.markdown?.qaNotes, "Invoice export still rounds per order.")
        XCTAssertEqual(detail.markdown?.developerNotes, "")
        XCTAssertEqual(detail.history, [ItemHistoryEvent(at: "2026-11-01T09:00:00Z", by: "Lena", kind: .created, from: nil, to: "New")])
        XCTAssertEqual(detail.parent, ItemParent(id: 60990, title: "Checkout totals", typeName: "Epic"))
        XCTAssertEqual(detail.effort, 3)
        XCTAssertEqual(detail.areaPath, "Shop\\Checkout")
        XCTAssertEqual(detail.attachments, [
            ItemAttachment(name: "invoice-export.png", url: "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)?fileName=invoice-export.png", size: 245_760),
        ])

        XCTAssertEqual(detail.pullRequests.map(\.number), [412, 398])
        XCTAssertEqual(detail.pullRequests.map(\.state), [.merged, .open])
        XCTAssertEqual(detail.pullRequests.map(\.own), [true, false])
        XCTAssertEqual(detail.pullRequests.map(\.shared), [false, false], "the phone has no list of my items to tell a shared one by")
        XCTAssertEqual(detail.pullRequests.map(\.author), ["Priya", "Priya"])
        XCTAssertEqual(detail.pullRequests.map(\.checks), [nil, "failing"])
        XCTAssertEqual(page.looked.all.sorted(), ["acme/shop#380", "acme/shop#412"], "both of ADO's links, once the repository behind its id is known")
    }

    func testThePageAsksAdoWithTheCredentialInTheItemsOwnProject() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        _ = try await makePage().items.item(61021)
        let requests = AdoStubURLProtocol.requests
        XCTAssertEqual(Set(requests.compactMap { $0.headers["Authorization"] }), ["Basic " + Data(":\(AdoFixture.token)".utf8).base64EncodedString()])
        XCTAssertEqual(Set(requests.compactMap { $0.headers["X-TFS-FedAuthRedirect"] }), ["Suppress"], "a bad token is a plain 401, not a sign-in page")
        XCTAssertEqual(requests.first { $0.path == "/acme/_apis/wit/workitems/61021" }?.query, "$expand=Relations&api-version=7.1")
        XCTAssertEqual(requests.first { $0.path.hasSuffix("/updates") }?.query, "$top=200&api-version=7.1")
        XCTAssertEqual(requests.first { $0.path == "/acme/Shop/_apis/wit/workItems/61021/comments" }?.query, "$top=50&order=desc&api-version=7.1-preview.4")
        let batch = requests.first { $0.path.hasSuffix("/workitemsbatch") }?.json
        XCTAssertEqual(batch?["ids"] as? [Int], [60990])
        XCTAssertEqual(batch?["errorPolicy"] as? String, "Omit")
    }

    func testAPageWithoutCommentsRevisionsOrParentTitleStillOpens() async throws {
        var table = AdoFixture.itemPage
        table["GET /acme/_apis/wit/workItems/61021/updates"] = .failure(500, message: "boom")
        table["GET /acme/Shop/_apis/wit/workItems/61021/comments"] = .failure(403)
        table["POST /acme/_apis/wit/workitemsbatch"] = .failure(500)
        AdoFixture.serve(table)
        let detail = try await makePage(open: []).items.item(61021)
        XCTAssertEqual(detail.item.id, 61021)
        XCTAssertEqual(detail.comments, [])
        XCTAssertEqual(detail.history, [])
        XCTAssertEqual(detail.parent, ItemParent(id: 60990, title: "", typeName: ""), "the parent stays a link by its number")
    }

    func testAnItemAdoDoesNotHaveIsA404WithAdosOwnWords() async {
        AdoFixture.serve([:])
        await assertThrows(.server(status: 404, message: "Azure DevOps: TF401232: Work item does not exist, or you do not have permissions to read it.")) {
            _ = try await self.makePage().items.item(1)
        }
    }

    // MARK: Pull requests

    func testAnAdoRepositoryIdLearnedFromAnOpenPullRequestIsKeptForWhenItHasMerged() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        let first = makePage(open: [AdoFixture.pullRequest(412, title: "Round totals per line AB#61021")], knowsTheRepository: false)
        let whileOpen = try await first.items.item(61021)
        XCTAssertEqual(whileOpen.pullRequests.map(\.number), [412])
        XCTAssertEqual(whileOpen.pullRequests.map(\.state), [.open])
        XCTAssertEqual(first.looked.all, ["acme/shop#380"], "ADO's other link to the same repository")
        let kept = first.store.data(forKey: "ado.githubRepositories").flatMap { try? JSONDecoder().decode([String: String].self, from: $0) }
        XCTAssertEqual(kept, [AdoFixture.shopRepositoryId: "acme/shop"])

        let later = makePage(open: [], store: first.store, knowsTheRepository: false)
        let afterMerge = try await later.items.item(61021)
        XCTAssertEqual(afterMerge.pullRequests.map(\.number), [412])
        XCTAssertEqual(afterMerge.pullRequests.map(\.state), [.merged])
    }

    func testWithoutAKnownRepositoryAdosLinksAloneShowNothing() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        let page = makePage(open: [AdoFixture.pullRequest(412, title: "Same number, names nothing")], knowsTheRepository: false)
        let detail = try await page.items.item(61021)
        XCTAssertEqual(detail.pullRequests, [], "numbers collide across repositories")
        XCTAssertEqual(page.looked.all, [])
    }

    func testAGitHubThatNeverAnswersLeavesThePullRequestsItKnows() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        let page = makePage(lookupTime: .milliseconds(50)) { _ in
            // Never answers and ignores being cancelled, as a hung connection would.
            await withUnsafeContinuation { (_: UnsafeContinuation<Void, Never>) in }
            throw directError(502, "unreachable")
        }
        let started = ContinuousClock.now
        let detail = try await page.items.item(61021)
        XCTAssertLessThan(ContinuousClock.now - started, .seconds(2), "answered within the lookup budget")
        XCTAssertEqual(detail.pullRequests.map(\.number), [398])
        XCTAssertEqual(detail.pullRequests.map(\.state), [.open])
    }

    func testAtMostSixPullRequestsAreLookedUpPerPage() async throws {
        var item = AdoFixture.item
        item["relations"] = (300..<310).map { ["rel": "ArtifactLink", "url": "vstfs:///GitHub/PullRequest/\(AdoFixture.shopRepositoryId)%2f\($0)"] }
        var table = AdoFixture.itemPage
        table["GET /acme/_apis/wit/workitems/61021"] = .json(item)
        AdoFixture.serve(table)
        let page = makePage(open: [])
        _ = try await page.items.item(61021)
        XCTAssertEqual(page.looked.all.sorted(), (300..<306).map { "acme/shop#\($0)" })
    }

    // MARK: Comments

    func testCommentsIdAndMarkdownASignedOneIsItsSignersPostingSendsMarkdownAndAnswersTheComment() async throws {
        let table = AdoFixture.itemPage
        AdoStubURLProtocol.respond { request in
            guard request.method == "POST", request.path == "/acme/Shop/_apis/wit/workItems/61021/comments" else {
                return table["\(request.method) \(request.path)"] ?? .notFound
            }
            let posted: [String: Any] = ["id": 9, "text": request.json?["text"] ?? "", "format": "markdown", "createdDate": "2026-11-12T10:00:00Z", "createdBy": ["displayName": "Koen"]]
            return .json(posted)
        }
        let items = makePage().items
        let detail = try await items.item(61021)
        XCTAssertEqual(detail.comments, [
            ItemComment(id: 3, by: "Vera · test-report", at: "2026-11-11T09:00:00Z", text: "14 checks passed, 1 failed.", markdown: "14 checks passed, **1 failed**."),
            ItemComment(id: 2, by: "Koen", at: "2026-11-08T11:00:00Z", text: "Fix is in **#412**.", markdown: "Fix is in **#412**."),
        ])

        let comment = try await items.postItemComment(itemId: 61021, text: "Looks right on the **invoice** now.")
        let posted = AdoStubURLProtocol.requests.filter { $0.method == "POST" && $0.path.hasSuffix("/comments") }
        XCTAssertEqual(posted.map(\.query), ["format=markdown&api-version=7.1-preview.4"])
        XCTAssertEqual(posted.first?.json?["text"] as? String, "Looks right on the **invoice** now.")
        XCTAssertEqual(comment, ItemComment(id: 9, by: "Koen", at: "2026-11-12T10:00:00Z", text: "Looks right on the **invoice** now.", markdown: "Looks right on the **invoice** now."))
    }

    func testAnEmptyOrOverlongCommentIsRefusedBeforeAnythingIsSent() async {
        AdoFixture.serve(AdoFixture.itemPage)
        let items = makePage().items
        await assertThrows(.server(status: 400, message: "The comment is empty.")) { _ = try await items.postItemComment(itemId: 61021, text: "  \n") }
        await assertThrows(.server(status: 400, message: "The comment is longer than 30,000 characters.")) {
            _ = try await items.postItemComment(itemId: 61021, text: String(repeating: "a", count: 30_001))
        }
        XCTAssertEqual(AdoStubURLProtocol.requests.count, 0)
    }

    func testACommentSignedByAnAgentIsTheAgents() {
        XCTAssertEqual(AdoSignature(of: "Vera · plan — Here is the plan").map { [$0.author, $0.prefix] }, ["Vera · plan", "Vera · plan — "])
        XCTAssertEqual(AdoSignature(of: "Vera · test-report - all green")?.author, "Vera · test-report")
        XCTAssertNil(AdoSignature(of: "Here is the plan — Vera · plan"))
        let comment = AdoItemPage.comment(AdoComment(text: "<p>Vera · plan — Here is the plan</p>", createdDate: "2026-10-20T08:00:00Z", createdBy: .init(displayName: "Koen")))
        XCTAssertEqual(comment, ItemComment(id: nil, by: "Vera · plan", at: "2026-10-20T08:00:00Z", text: "Here is the plan", markdown: "Here is the plan"))
        XCTAssertEqual(AdoItemPage.comment(AdoComment(text: "<p>Plain</p>", createdDate: "")).by, "Unknown")
    }

    // MARK: Summaries

    func testSummariesComeInTheOrderAskedAndAnIdAdoCannotReadIsLeftOut() async throws {
        var table = AdoFixture.itemPage
        table["POST /acme/_apis/wit/workitemsbatch"] = AdoFixture.batch([
            AdoFixture.raw(61030, AdoFixture.fields(id: 61030, type: "Bug", state: "New")),
            NSNull(),
            AdoFixture.raw(61021, AdoFixture.fields(id: 61021)),
            AdoFixture.raw(61040, AdoFixture.fields(id: 61040, type: "Epic", state: "New")),
        ])
        table["GET /acme/Shop/_apis/wit/workitemtypes/Bug/states"] = .json(["value": [["name": "Done", "category": "Completed"], ["name": "New", "category": "Proposed"]]])
        AdoFixture.serve(table)
        let summaries = try await makePage().items.summaries([61021, 999_999, 61030, 61021, 61040, 0])
        XCTAssertEqual(summaries.map(\.id), [61021, 61030], "999999 doesn't exist, and an Epic's workflow can't be read here")
        XCTAssertEqual(summaries.map(\.type), [.pbi, .bug])
        XCTAssertEqual(summaries.last?.workflow, ["New", "Done"])
        XCTAssertEqual(summaries.last?.stateCategory, .proposed)

        let batch = AdoStubURLProtocol.requests.first { $0.path.hasSuffix("/workitemsbatch") }?.json
        XCTAssertEqual(batch?["ids"] as? [Int], [61021, 999_999, 61030, 61040], "each id once, and none that can't be an id")
        XCTAssertEqual(batch?["errorPolicy"] as? String, "Omit")
        XCTAssertEqual((batch?["fields"] as? [String])?.contains("System.TeamProject"), true)
    }

    func testSummariesOfNothingAskNothing() async throws {
        AdoFixture.serve([:])
        let summaries = try await makePage().items.summaries([])
        XCTAssertEqual(summaries, [])
        XCTAssertEqual(AdoStubURLProtocol.requests.count, 0)
    }

    func testARefusedTokenFailsSummariesInsteadOfHidingEveryItem() async {
        AdoStubURLProtocol.respond { _ in .failure(401) }
        await assertThrows(.unauthorized("Azure DevOps rejected the token. Check it in Settings.")) { _ = try await self.makePage().items.summaries([61021]) }
    }

    // MARK: Without a connection

    func testWithoutAConnectionEveryCallSaysToConnect() async {
        AdoFixture.serve(AdoFixture.itemPage)
        let items = AdoWorkItems(connection: nil, session: AdoStubURLProtocol.session(), store: AdoMemoryStore())
        let connect = APIError.stillLoading("Connect Azure DevOps in Settings to open work items.")
        await assertThrows(connect) { _ = try await items.item(61021) }
        await assertThrows(connect) { _ = try await items.postItemComment(itemId: 61021, text: "Hello") }
        await assertThrows(connect) { _ = try await items.summaries([61021]) }
        XCTAssertNil(items.authorization(for: URL(string: "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)")!))
        XCTAssertEqual(AdoStubURLProtocol.requests.count, 0)
    }

    // MARK: Attachments

    func testTheCredentialGoesToAnAttachmentOfThisOrganizationOnly() {
        let items = makePage().items
        let header = "Basic " + Data(":\(AdoFixture.token)".utf8).base64EncodedString()
        let attachments = "https://dev.azure.com/acme/_apis/wit/attachments"
        for url in [
            "\(attachments)/\(guid)?fileName=invoice.png",
            "\(attachments)/\(guid.uppercased())",
            "https://dev.azure.com/acme/0f1e/_apis/wit/attachments/\(guid)?fileName=invoice.png",
            "https://DEV.azure.com/Acme/Shop/_apis/wit/attachments/\(guid)?fileName=a%20b.png&download=false",
            "https://dev.azure.com:443/acme/_apis/wit/attachments/\(guid)",
        ] {
            XCTAssertEqual(items.authorization(for: URL(string: url)!), header, url)
        }
        for url in [
            "https://example.com/acme/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com.example.com/acme/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com@example.com/acme/_apis/wit/attachments/\(guid)",
            "https://user:secret@dev.azure.com/acme/_apis/wit/attachments/\(guid)",
            "http://dev.azure.com/acme/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com:8443/acme/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/globex/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme/../globex/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme/%2e%2e/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme/a%2Fb/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme/Shop/Team/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme//_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme/_apis/wit/attachments/not-a-guid",
            "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)/extra",
            "https://dev.azure.com/acme/_apis/wit/workitems/61021",
            "https://dev.azure.com/acme/_apis/git/repositories?next=/_apis/wit/attachments/\(guid)",
            "https://dev.azure.com/acme",
            "file:///acme/_apis/wit/attachments/\(guid)",
        ] {
            XCTAssertNil(items.authorization(for: URL(string: url)!), url)
        }
    }

    func testABearerTokenAndAnOrganizationOnItsOwnHostWorkTheSame() {
        let connection = AdoConnection(organizationURL: URL(string: "https://ado.example.com/tfs/Acme/")!, project: "Shop", credential: .bearer("entra-token"))
        let items = AdoWorkItems(connection: connection, session: AdoStubURLProtocol.session(), store: AdoMemoryStore())
        XCTAssertEqual(items.authorization(for: URL(string: "https://ado.example.com/tfs/Acme/Shop/_apis/wit/attachments/\(guid)")!), "Bearer entra-token")
        XCTAssertNil(items.authorization(for: URL(string: "https://ado.example.com/tfs/Other/_apis/wit/attachments/\(guid)")!))
        XCTAssertNil(items.authorization(for: URL(string: "https://ado.example.com/_apis/wit/attachments/\(guid)")!))
    }

    func testAnAbsoluteAddressResolvesToItselfAndNothingElseResolves() {
        let items = makePage().items
        XCTAssertEqual(items.resolve("https://dev.azure.com/acme/_apis/wit/attachments/\(guid)?fileName=invoice.png")?.absoluteString, "https://dev.azure.com/acme/_apis/wit/attachments/\(guid)?fileName=invoice.png")
        XCTAssertEqual(items.resolve("http://example.com/a.png")?.host(), "example.com")
        XCTAssertNil(items.resolve("/api/items/61021/attachments/\(guid)?name=a.png"), "there is no server to resolve a path against")
        XCTAssertNil(items.resolve("file:///etc/hosts"))
        XCTAssertNil(items.resolve(""))
    }

    // MARK: Helpers

    private func assertThrows(_ expected: APIError, file: StaticString = #filePath, line: UInt = #line, _ work: () async throws -> Void) async {
        do {
            try await work()
            XCTFail("Expected \(expected)", file: file, line: line)
        } catch {
            XCTAssertEqual(error as? APIError, expected, file: file, line: line)
        }
    }
}
