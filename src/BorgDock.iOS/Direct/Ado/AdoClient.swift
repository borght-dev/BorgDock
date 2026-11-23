import Foundation

/// Azure DevOps' REST API as the item page needs it: one item with its comments and revisions, a few items' titles or
/// summaries, and posting a comment. The port of the server's `ado/client.ts` without the sprint, the queries and the
/// state moves. An actor because each work item type's workflow and the signed-in account are read once and shared.
actor AdoClient {
    private static let api = "api-version=7.1"
    private static let commentsApi = "api-version=7.1-preview.4"
    private static let summaryFields = [
        "System.Id", "System.TeamProject", "System.WorkItemType", "System.Title", "System.State", "System.IterationPath",
        "System.Tags", "System.AssignedTo", "System.ChangedDate", "Microsoft.VSTS.Scheduling.DueDate", "Microsoft.VSTS.Common.Priority",
    ]
    /// ADO reads at most this many items in one batch.
    private static let batchSize = 200

    nonisolated let connection: AdoConnection
    private let session: URLSession
    private var workflows: [String: Task<[AdoWorkflowState], Error>] = [:]
    private var identity: Task<AdoIdentity, Error>?

    init(connection: AdoConnection, session: URLSession = .shared) {
        self.connection = connection
        self.session = session
    }

    // MARK: Reads

    /// The account the credential signs in as. Read once; a failed read is tried again next time.
    func me() async throws -> AdoIdentity {
        if let identity { return try await identity.value }
        let read = Task { () throws -> AdoIdentity in
            let data: ConnectionData = try await request("_apis/connectionData")
            return AdoIdentity(name: data.authenticatedUser?.providerDisplayName ?? "", email: data.authenticatedUser?.properties?.account?.value ?? "")
        }
        identity = read
        do {
            return try await read.value
        } catch {
            if identity == read { identity = nil }
            throw error
        }
    }

    /// The projects the credential sees, by name: the setup screen offers them, so there is nothing to mistype.
    func projects() async throws -> [String] {
        let list: ProjectList = try await request("_apis/projects?api-version=7.1&$top=300")
        return list.value.map(\.name).sorted { $0.localizedCaseInsensitiveCompare($1) == .orderedAscending }
    }

    private struct ProjectList: Decodable, Sendable {
        struct Project: Decodable, Sendable { let name: String }
        let value: [Project]
    }

    /// The item page's reads: the item first (its project names the comments' route), with its revisions alongside.
    /// Comments and revisions that can't be read leave the page without them.
    func itemRead(_ id: Int) async throws -> AdoItemRead {
        async let revisions = updates(of: id)
        let raw: RawItem = try await request("_apis/wit/workitems/\(id)?$expand=Relations&\(Self.api)")
        async let discussion = comments(of: id, project: raw.fields["System.TeamProject"]?.string ?? connection.project)
        return AdoItemRead(
            item: try await item(from: raw),
            fields: raw.fields,
            relations: raw.relations ?? [],
            formats: (raw.multilineFieldsFormat ?? [:]).compactMapValues { $0.text?.lowercased() },
            comments: await discussion,
            updates: await revisions
        )
    }

    /// Titles and types of a few items (a parent), in the order asked; ids ADO doesn't return are left out.
    func titles(_ ids: [Int]) async throws -> [ItemParent] {
        try await rawItems(ids, fields: ["System.Id", "System.Title", "System.WorkItemType"]).map { raw in
            ItemParent(id: raw.id, title: raw.fields["System.Title"]?.string ?? "", typeName: raw.fields["System.WorkItemType"]?.string ?? "")
        }
    }

    /// The summaries of several items in the order asked. An id that doesn't exist or can't be read is left out; only
    /// Azure DevOps being out of reach or refusing the credential fails the call.
    func summaries(_ ids: [Int]) async throws -> [WorkItemSummary] {
        var summaries: [WorkItemSummary] = []
        for raw in try await rawItems(ids, fields: Self.summaryFields) {
            do {
                summaries.append(try await item(from: raw).summary)
            } catch let error as APIError where !error.failsEveryItem {
                continue
            }
        }
        return summaries
    }

    /// Posts a markdown comment as the signed-in account, in the item's own project. Never changes a field.
    func addComment(_ id: Int, text: String) async throws -> AdoComment {
        let raw: RawItem = try await request("_apis/wit/workitems/\(id)?fields=System.TeamProject&\(Self.api)")
        let project = raw.fields["System.TeamProject"]?.string ?? connection.project
        return try await request(
            "\(AdoText.encodeURIComponent(project))/_apis/wit/workItems/\(id)/comments?format=markdown&\(Self.commentsApi)",
            method: "POST",
            body: try JSONEncoder().encode(["text": text])
        )
    }

    private func updates(of id: Int) async -> [AdoUpdate] {
        let list: ValueList<AdoUpdate>? = try? await request("_apis/wit/workItems/\(id)/updates?$top=200&\(Self.api)")
        return list?.value.compactMap { $0 } ?? []
    }

    private func comments(of id: Int, project: String) async -> [AdoComment] {
        let list: CommentList? = try? await request("\(AdoText.encodeURIComponent(project))/_apis/wit/workItems/\(id)/comments?$top=50&order=desc&\(Self.commentsApi)")
        return list?.comments ?? []
    }

    /// Raw items in the order of `ids`, each once. `errorPolicy: Omit` makes ADO answer `null` for an id it can't read
    /// instead of failing the batch.
    private func rawItems(_ ids: [Int], fields: [String]) async throws -> [RawItem] {
        var seen = Set<Int>()
        let wanted = ids.filter { $0 > 0 && seen.insert($0).inserted }
        var byId: [Int: RawItem] = [:]
        for start in stride(from: 0, to: wanted.count, by: Self.batchSize) {
            let batch = Batch(ids: Array(wanted[start..<min(start + Self.batchSize, wanted.count)]), fields: fields)
            let list: ValueList<RawItem> = try await request("_apis/wit/workitemsbatch?\(Self.api)", method: "POST", body: try JSONEncoder().encode(batch))
            for raw in list.value.compactMap({ $0 }) { byId[raw.id] = raw }
        }
        return wanted.compactMap { byId[$0] }
    }

    // MARK: Items

    /// The states of a work item type in process order. Read once per type; a failed read is tried again next time.
    private func workflow(project: String, type: String) async throws -> [AdoWorkflowState] {
        let key = "\(project)/\(type)"
        if let known = workflows[key] { return try await known.value }
        let read = Task { () throws -> [AdoWorkflowState] in
            let path = "\(AdoText.encodeURIComponent(project))/_apis/wit/workitemtypes/\(AdoText.encodeURIComponent(type))/states?\(Self.api)"
            let list: ValueList<AdoWorkflowState> = try await request(path)
            return AdoWorkflow.inProcessOrder(list.value.compactMap { $0 })
        }
        workflows[key] = read
        do {
            return try await read.value
        } catch {
            if workflows[key] == read { workflows[key] = nil }
            throw error
        }
    }

    private func item(from raw: RawItem) async throws -> AdoItem {
        let fields = raw.fields
        let project = fields["System.TeamProject"]?.string ?? connection.project
        let typeName = fields["System.WorkItemType"]?.string ?? ""
        async let typeStates = workflow(project: project, type: typeName)
        async let account = try? await me()
        let states = try await typeStates
        let email = await account?.email ?? ""
        let state = fields["System.State"]?.string ?? ""
        let assignedTo = fields["System.AssignedTo"]
        let tags = fields["System.Tags"]?.text.map { AdoText.split($0, on: ";").map(AdoText.trim).filter { !$0.isEmpty } } ?? []
        let summary = WorkItemSummary(
            id: raw.id,
            type: AdoItem.shortTypes[typeName] ?? .other,
            typeName: typeName,
            title: fields["System.Title"]?.string ?? "",
            state: state,
            stateCategory: states.first { $0.name == state }?.category ?? .proposed,
            workflow: states.filter { $0.category != .removed }.map(\.name),
            sprint: AdoItem.sprintLabel(iterationPath: fields["System.IterationPath"]?.string ?? "", project: project),
            dueDate: fields["Microsoft.VSTS.Scheduling.DueDate"]?.string,
            priority: fields["Microsoft.VSTS.Common.Priority"]?.number.flatMap { Int(exactly: $0) },
            tags: tags,
            assignedTo: assignedTo?["displayName"]?.string,
            assignedToMe: !email.isEmpty && (assignedTo?["uniqueName"]?.string ?? "").lowercased() == email.lowercased(),
            url: "\(connection.root)/\(AdoText.encodeURIComponent(project))/_workitems/edit/\(raw.id)"
        )
        return AdoItem(summary: summary, states: states, pullRequestLinks: AdoItem.pullRequestLinks(in: raw.relations))
    }

    // MARK: Transport

    private nonisolated func request<Response: Decodable & Sendable>(_ path: String, method: String = "GET", body: Data? = nil) async throws -> Response {
        guard let url = URL(string: "\(connection.root)/\(path)") else { throw directError(502, "Azure DevOps: \(path) is not an address.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        // Every read must show ADO as it is now; URLCache must never answer for it.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue(connection.credential.authorization, forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // Asks ADO for a plain 401 on a bad token, where it would otherwise answer with its sign-in page.
        request.setValue("Suppress", forHTTPHeaderField: "X-TFS-FedAuthRedirect")
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request, delegate: RedirectRefusal())
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.network("Could not reach Azure DevOps: \(error.localizedDescription)")
        }
        guard let http = response as? HTTPURLResponse else { throw directError(502, "Azure DevOps answered without a status.") }
        if let failure = Self.failure(of: http, body: data) { throw failure }
        do {
            return try JSONDecoder().decode(Response.self, from: data.isEmpty ? Data("{}".utf8) : data)
        } catch {
            throw APIError.decoding("Azure DevOps sent an answer this app can't read.")
        }
    }

    private static let rejectedToken = "Azure DevOps rejected the token. Check it in Settings."

    /// What went wrong, if anything. ADO answers a bad or expired token with 401, or, where it ignores
    /// `X-TFS-FedAuthRedirect`, with its sign-in page as a 203 or a redirect to that page.
    private static func failure(of response: HTTPURLResponse, body: Data) -> APIError? {
        let message = (try? JSONDecoder().decode(ErrorBody.self, from: body))?.message
        switch response.statusCode {
        case 203 where isSignInPage(response, body):
            return directError(401, rejectedToken)
        case 200..<300:
            return nil
        case 300..<400:
            let signIn = response.value(forHTTPHeaderField: "Location")?.lowercased().contains("_signin") == true
            return signIn ? directError(401, rejectedToken) : directError(502, "Azure DevOps sent the request somewhere else. Check the organization's address in Settings.")
        case 401:
            return directError(401, rejectedToken)
        case 404:
            return directError(404, message.map { "Azure DevOps: \($0)" } ?? "Azure DevOps has nothing at that address.")
        default:
            return directError(502, message.map { "Azure DevOps: \($0)" } ?? "Azure DevOps answered \(response.statusCode).")
        }
    }

    private static func isSignInPage(_ response: HTTPURLResponse, _ body: Data) -> Bool {
        if response.value(forHTTPHeaderField: "Content-Type")?.lowercased().contains("html") == true { return true }
        return body.first { !" \t\r\n".utf8.contains($0) } == UInt8(ascii: "<")
    }
}

/// Never follows a redirect: the credential goes to the organization's own address and nowhere else.
private final class RedirectRefusal: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        nil
    }
}

private extension APIError {
    /// Azure DevOps is out of reach or refuses the credential: no item can be read, so leaving one out would hide it.
    var failsEveryItem: Bool {
        switch self {
        case .network, .unauthorized: true
        default: false
        }
    }
}

// MARK: - ADO's JSON

private struct RawItem: Decodable, Sendable {
    let id: Int
    let fields: [String: AdoValue]
    let relations: [AdoRelation]?
    let multilineFieldsFormat: [String: AdoValue]?

    private enum CodingKeys: String, CodingKey { case id, fields, relations, multilineFieldsFormat }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(Int.self, forKey: .id)
        fields = try container.decodeIfPresent([String: AdoValue].self, forKey: .fields) ?? [:]
        relations = try? container.decodeIfPresent([AdoRelation].self, forKey: .relations)
        multilineFieldsFormat = try? container.decodeIfPresent([String: AdoValue].self, forKey: .multilineFieldsFormat)
    }
}

/// `{ value: [...] }`. An entry that is `null` (an item a batch couldn't read) or has another shape decodes as nil, so
/// one odd entry never costs the rest.
private struct ValueList<Element: Decodable & Sendable>: Decodable, Sendable {
    let value: [Element?]

    private enum CodingKeys: String, CodingKey { case value }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        value = (try container.decodeIfPresent([Lenient].self, forKey: .value) ?? []).map(\.element)
    }

    private struct Lenient: Decodable {
        let element: Element?

        init(from decoder: Decoder) throws {
            element = try? decoder.singleValueContainer().decode(Element.self)
        }
    }
}

private struct CommentList: Decodable, Sendable {
    let comments: [AdoComment]?
}

private struct Batch: Encodable {
    let ids: [Int]
    let fields: [String]
    let errorPolicy = "Omit"
}

private struct ErrorBody: Decodable {
    let message: String?
}

/// `/_apis/connectionData`: the account's display name and, as the `Account` property, its email address.
private struct ConnectionData: Decodable, Sendable {
    struct User: Decodable, Sendable {
        let providerDisplayName: String?
        let properties: Properties?
    }

    struct Properties: Decodable, Sendable {
        let account: Property?

        private enum CodingKeys: String, CodingKey { case account = "Account" }
    }

    struct Property: Decodable, Sendable {
        let value: String?

        private enum CodingKeys: String, CodingKey { case value = "$value" }
    }

    let authenticatedUser: User?
}
