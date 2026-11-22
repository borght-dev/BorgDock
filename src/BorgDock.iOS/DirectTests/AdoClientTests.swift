import XCTest
@testable import BorgDock

/// Azure DevOps' REST API from the phone: how it signs in, what each failure reads as, and what is read only once.
final class AdoClientTests: XCTestCase {
    private func makeClient(_ credential: AdoCredential = .personalAccessToken(AdoFixture.token)) -> AdoClient {
        let connection = AdoConnection(organizationURL: AdoFixture.connection.organizationURL, project: "Shop", credential: credential)
        return AdoClient(connection: connection, session: AdoStubURLProtocol.session())
    }

    // MARK: Signing in

    func testATokenSignsInAsBasicWithAnEmptyUserAndAnAccessTokenAsBearer() async throws {
        AdoFixture.serve(AdoFixture.itemPage)
        _ = try await makeClient().me()
        XCTAssertEqual(AdoStubURLProtocol.requests.last?.headers["Authorization"], "Basic " + Data(":pat-for-tests".utf8).base64EncodedString())
        _ = try await makeClient(.bearer("entra-token")).me()
        XCTAssertEqual(AdoStubURLProtocol.requests.last?.headers["Authorization"], "Bearer entra-token")
    }

    func testTheAccountIsReadOnceAndAFailedReadIsTriedAgain() async throws {
        let client = makeClient()
        AdoStubURLProtocol.respond { _ in .failure(500) }
        do {
            _ = try await client.me()
            XCTFail("Expected the read to fail")
        } catch {}
        AdoFixture.serve(AdoFixture.itemPage)
        let first = try await client.me()
        let second = try await client.me()
        XCTAssertEqual(first, AdoIdentity(name: "Koen", email: "Koen@Example.com"))
        XCTAssertEqual(second, first)
        XCTAssertEqual(AdoStubURLProtocol.requests.count, 1, "the second answer is the first one's")
    }

    func testACredentialNeverShowsWhenPrinted() throws {
        let secret = "s3cr3t-token-value"
        for credential in [AdoCredential.personalAccessToken(secret), .bearer(secret)] {
            let connection = AdoConnection(organizationURL: AdoFixture.connection.organizationURL, project: "Shop", credential: credential)
            var dumped = ""
            dump(connection, to: &dumped)
            for text in ["\(credential)", "\(connection)", String(reflecting: credential), String(reflecting: connection), dumped] {
                XCTAssertFalse(text.contains(secret), text)
                XCTAssertFalse(text.contains(Data(":\(secret)".utf8).base64EncodedString()), text)
            }
            let stored = try JSONEncoder().encode(connection)
            XCTAssertEqual(try JSONDecoder().decode(AdoConnection.self, from: stored), connection, "what the Keychain holds reads back")
        }
    }

    // MARK: Failures

    private func failure(_ answer: AdoStubURLProtocol.Answer) async -> APIError? {
        AdoStubURLProtocol.respond { _ in answer }
        do {
            _ = try await makeClient().titles([61021])
            return nil
        } catch {
            return error as? APIError
        }
    }

    func testEachFailureReadsAsWhatWentWrong() async {
        let rejected = APIError.unauthorized("Azure DevOps rejected the token. Check it in Settings.")
        var signInPage = AdoStubURLProtocol.Answer(status: 203, body: "<html><body>Sign in to your account</body></html>")
        signInPage.headers = ["Content-Type": "text/html; charset=utf-8"]
        let signInPageWithoutAType = AdoStubURLProtocol.Answer(status: 203, headers: [:], body: "\r\n<!DOCTYPE html><html></html>")

        let rejectedToken = await failure(.failure(401))
        XCTAssertEqual(rejectedToken, rejected)
        let page = await failure(signInPage)
        XCTAssertEqual(page, rejected, "ADO answers an expired token with its sign-in page")
        let untypedPage = await failure(signInPageWithoutAType)
        XCTAssertEqual(untypedPage, rejected)
        let missing = await failure(.failure(404, message: "TF401232: Work item 61021 does not exist."))
        XCTAssertEqual(missing, .server(status: 404, message: "Azure DevOps: TF401232: Work item 61021 does not exist."))
        let missingWithoutWords = await failure(.failure(404))
        XCTAssertEqual(missingWithoutWords, .server(status: 404, message: "Azure DevOps has nothing at that address."))
        let refused = await failure(.failure(400, message: "VS403474: The batch is too large."))
        XCTAssertEqual(refused, .upstream("Azure DevOps: VS403474: The batch is too large."))
        let broken = await failure(.failure(500))
        XCTAssertEqual(broken, .upstream("Azure DevOps answered 500."))
        let unreadable = await failure(AdoStubURLProtocol.Answer(body: "not json"))
        XCTAssertEqual(unreadable, .decoding("Azure DevOps sent an answer this app can't read."))
    }

    func testANetworkFailureSaysAzureDevOpsIsOutOfReach() async {
        let offline = await failure(AdoStubURLProtocol.Answer(failure: .notConnectedToInternet))
        guard case .network(let message) = offline else { return XCTFail("Expected a network failure, got \(String(describing: offline))") }
        XCTAssertTrue(message.hasPrefix("Could not reach Azure DevOps: "), message)
    }

    func testARedirectIsNeverFollowedSoTheCredentialStaysWithTheOrganization() async {
        let signIn = await failure(AdoStubURLProtocol.Answer(redirect: URL(string: "https://login.example.com/_signin?realm=dev.azure.com")!))
        XCTAssertEqual(signIn, .unauthorized("Azure DevOps rejected the token. Check it in Settings."))
        XCTAssertEqual(AdoStubURLProtocol.requests.map(\.path), ["/acme/_apis/wit/workitemsbatch"], "nothing went to the other host")

        let elsewhere = await failure(AdoStubURLProtocol.Answer(redirect: URL(string: "https://elsewhere.example.com/acme/_apis/wit/workitemsbatch")!))
        XCTAssertEqual(elsewhere, .upstream("Azure DevOps sent the request somewhere else. Check the organization's address in Settings."))
        XCTAssertEqual(AdoStubURLProtocol.requests.count, 1)
    }

    // MARK: Items

    func testAWorkflowFollowsTheProcessNotAdosOrderAndIsReadOncePerType() async throws {
        var table = AdoFixture.itemPage
        table["POST /acme/_apis/wit/workitemsbatch"] = AdoFixture.batch([
            AdoFixture.raw(61021, AdoFixture.fields(id: 61021)),
            AdoFixture.raw(61022, AdoFixture.fields(id: 61022, state: "Removed")),
            AdoFixture.raw(61023, AdoFixture.fields(id: 61023, state: "Somewhere Else")),
        ])
        AdoFixture.serve(table)
        let summaries = try await makeClient().summaries([61021, 61022, 61023])
        XCTAssertEqual(summaries.map(\.workflow), Array(repeating: AdoFixture.workflow, count: 3), "Testing before Testing Failed as ADO lists them; Removed is no step")
        XCTAssertEqual(summaries.map(\.stateCategory), [.inProgress, .removed, .proposed], "a state the type doesn't have counts as proposed")
        XCTAssertEqual(AdoStubURLProtocol.requests.filter { $0.path.hasSuffix("/states") }.count, 1)
        XCTAssertEqual(AdoStubURLProtocol.requests.filter { $0.path.hasSuffix("/connectionData") }.count, 1)
    }

    func testAnItemIsMineByTheAccountNotTheNameAndReadsWithoutAnAccountToo() async throws {
        var table = AdoFixture.itemPage
        var someoneElses = AdoFixture.fields(id: 61022)
        someoneElses["System.AssignedTo"] = ["displayName": "Koen", "uniqueName": "priya@example.com"]
        var unassigned = AdoFixture.fields(id: 61023)
        unassigned["System.AssignedTo"] = nil
        unassigned["System.Tags"] = nil
        unassigned["System.IterationPath"] = "Shop"
        unassigned["Microsoft.VSTS.Scheduling.DueDate"] = "2026-12-01T00:00:00Z"
        table["POST /acme/_apis/wit/workitemsbatch"] = AdoFixture.batch([
            AdoFixture.raw(61021, AdoFixture.fields(id: 61021)), AdoFixture.raw(61022, someoneElses), AdoFixture.raw(61023, unassigned),
        ])
        AdoFixture.serve(table)
        let summaries = try await makeClient().summaries([61021, 61022, 61023])
        XCTAssertEqual(summaries.map(\.assignedToMe), [true, false, false])
        XCTAssertEqual(summaries.map(\.assignedTo), ["Koen", "Koen", nil])
        XCTAssertEqual(summaries.last?.tags, [])
        XCTAssertEqual(summaries.last?.sprint, "Backlog")
        XCTAssertEqual(summaries.last?.dueDate, "2026-12-01T00:00:00Z")

        table["GET /acme/_apis/connectionData"] = .failure(500)
        AdoFixture.serve(table)
        let withoutAnAccount = try await makeClient().summaries([61021])
        XCTAssertEqual(withoutAnAccount.map(\.assignedToMe), [false], "nobody's item is mine while the account can't be read")
    }

    func testASprintIsTheLastPartOfItsIterationPath() {
        XCTAssertEqual(AdoItem.sprintLabel(iterationPath: "Shop\\2026\\Sprint 23", project: "Shop"), "Sprint 23")
        XCTAssertEqual(AdoItem.sprintLabel(iterationPath: "Shop\\Service Pack 5.2.8", project: "Shop"), "5.2.8")
        XCTAssertEqual(AdoItem.sprintLabel(iterationPath: "Shop", project: "Shop"), "Backlog")
        XCTAssertEqual(AdoItem.sprintLabel(iterationPath: "", project: "Shop"), "Backlog")
    }

    func testAProjectNameWithSpacesIsEncodedInEveryPath() async throws {
        var fields = AdoFixture.fields(id: 61050)
        fields["System.TeamProject"] = "Shop & Co"
        AdoFixture.serve([
            "POST /acme/_apis/wit/workitemsbatch": AdoFixture.batch([AdoFixture.raw(61050, fields)]),
            "GET /acme/Shop & Co/_apis/wit/workitemtypes/Product Backlog Item/states": .json(["value": AdoFixture.states]),
        ])
        let summaries = try await makeClient().summaries([61050])
        XCTAssertEqual(summaries.map(\.url), ["https://dev.azure.com/acme/Shop%20%26%20Co/_workitems/edit/61050"])
    }
}
