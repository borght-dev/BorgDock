import Foundation

/// Signs agent, merge and approve commands with the device key (shared/src/borgdock.ts, "Signed commands").
/// Returns the X-BorgDock-* headers for one request. `path` is the API path without query, e.g. "/api/threads".
protocol RequestSigner: Sendable {
    func headers(method: String, path: String, body: Data) async throws -> [String: String]
}

/// A bearer-token client for the BorgDock HTTP API. Value type: build a new one when the server or token changes.
struct APIClient: Sendable {
    let baseURL: URL
    let token: String?
    let session: URLSession
    /// Set once the device has a key; requests made with `signed: true` fail without one.
    let signer: RequestSigner?

    init(baseURL: URL, token: String?, session: URLSession = .shared, signer: RequestSigner? = nil) {
        self.baseURL = baseURL
        self.token = token
        self.session = session
        self.signer = signer
    }

    func get<Response: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> Response {
        try await send("GET", path, query: query, body: nil)
    }

    /// `signed`: the route needs a device signature (agents, merges, approvals).
    func post<Response: Decodable>(_ path: String, body: some Encodable = EmptyBody(), signed: Bool = false) async throws -> Response {
        try await send("POST", path, body: try JSONEncoder().encode(body), signed: signed)
    }

    func put<Response: Decodable>(_ path: String, body: some Encodable) async throws -> Response {
        try await send("PUT", path, body: try JSONEncoder().encode(body))
    }

    func delete<Response: Decodable>(_ path: String, signed: Bool = false) async throws -> Response {
        try await send("DELETE", path, body: nil, signed: signed)
    }

    func url(_ path: String, query: [URLQueryItem] = []) -> URL {
        let base = baseURL.absoluteString.hasSuffix("/") ? String(baseURL.absoluteString.dropLast()) : baseURL.absoluteString
        var components = URLComponents(string: base + path)!
        if !query.isEmpty { components.queryItems = query }
        return components.url!
    }

    private func send<Response: Decodable>(_ method: String, _ path: String, query: [URLQueryItem] = [], body: Data?, signed: Bool = false) async throws -> Response {
        var request = URLRequest(url: url(path, query: query))
        request.httpMethod = method
        request.timeoutInterval = 30
        // Every read must reflect the server now; URLCache must never answer for it.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        // The server rejects unauthenticated writes without it (e.g. the PKCE token exchange); send it always.
        request.setValue("1", forHTTPHeaderField: "X-Dispatch-Intent")
        if let token {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        if signed {
            guard let signer else { throw APIError.network("This device has no key to sign with yet. Sign in again.") }
            for (name, value) in try await signer.headers(method: method, path: path, body: body ?? Data()) {
                request.setValue(value, forHTTPHeaderField: name)
            }
        }

        let data: Data
        let response: URLResponse
        do {
            (data, response) = try await session.data(for: request)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            throw APIError.network("Can't reach BorgDock at \(baseURL.host() ?? baseURL.absoluteString). \(error.localizedDescription)")
        }

        guard let http = response as? HTTPURLResponse else {
            throw APIError.network("The server sent something that isn't HTTP.")
        }
        guard (200..<300).contains(http.statusCode) else {
            throw APIError(status: http.statusCode, body: data)
        }
        do {
            return try JSONDecoder().decode(Response.self, from: data)
        } catch {
            throw APIError.decoding("The server's answer for \(path) doesn't match this app version. \(error)")
        }
    }

    static func pathComponent(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? value
    }
}

// MARK: - Endpoints (docs/api.md)

extension APIClient {
    func config() async throws -> AppConfig { try await get("/api/config") }

    /// The cheap cached read the 30 s poll uses.
    func overview() async throws -> Overview { try await get("/api/overview") }

    /// Pull to refresh: the server reads ADO and T3 right now and returns the result.
    func refresh() async throws -> Overview { try await post("/api/refresh") }

    func item(_ id: Int) async throws -> ItemDetail { try await get("/api/items/\(id)") }

    /// Posts a comment on the item as you. Markdown; it never changes a state.
    func postItemComment(itemId: Int, text: String) async throws -> ItemComment {
        let response: PostItemCommentResponse = try await post("/api/items/\(itemId)/comments", body: PostItemCommentRequest(text: text))
        return response.comment
    }

    /// A server path such as a signed attachment ("/api/items/1/attachments/…?sig=…") as a full URL under the server's
    /// own path prefix (https://host/borgdock + /api/… → https://host/borgdock/api/…); absolute URLs pass through.
    func resolve(_ pathOrURL: String) -> URL? {
        if let url = URL(string: pathOrURL), url.scheme != nil { return url }
        let base = baseURL.absoluteString.hasSuffix("/") ? String(baseURL.absoluteString.dropLast()) : baseURL.absoluteString
        return URL(string: base + (pathOrURL.hasPrefix("/") ? pathOrURL : "/" + pathOrURL))
    }

    func startOptions(itemId: Int) async throws -> StartOptions { try await get("/api/items/\(itemId)/start") }

    func browseQueries() async throws -> [BrowseQuery] { try await get("/api/browse/queries") }

    /// The team's current sprint, finished items included.
    func sprint() async throws -> Sprint { try await get("/api/sprint") }

    func browse(query: String?, search: String?) async throws -> BrowseResult {
        if let search, !search.trimmingCharacters(in: .whitespaces).isEmpty {
            return try await get("/api/browse", query: [URLQueryItem(name: "search", value: search)])
        }
        return try await get("/api/browse", query: [URLQueryItem(name: "query", value: query ?? "sprint")])
    }

    func startThread(_ request: StartThreadRequest) async throws -> StartThreadResponse {
        try await post("/api/threads", body: request, signed: true)
    }

    func answer(threadId: String, _ request: AnswerRequest) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/answers", body: request, signed: true)
    }

    func settle(threadId: String) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/settle", signed: true)
    }

    func link(threadId: String, to itemId: Int?) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/link", body: LinkThreadRequest(itemId: itemId))
    }

    func moveState(itemId: Int, to state: String) async throws -> MoveStateResponse {
        try await post("/api/items/\(itemId)/state", body: MoveStateRequest(to: state))
    }

    func dismissSuggestion(itemId: Int) async throws -> OKResponse {
        try await post("/api/items/\(itemId)/dismiss")
    }

    func queue(itemId: Int) async throws -> OKResponse {
        try await post("/api/queue/\(itemId)")
    }

    func unqueue(itemId: Int) async throws -> OKResponse {
        try await delete("/api/queue/\(itemId)")
    }

    func registerAPNs(_ registration: ApnsRegistration) async throws -> ApnsRegistrationResponse {
        try await post("/api/push/apns", body: registration)
    }

    func sendTestPush() async throws -> OKResponse {
        try await post("/api/push/test")
    }

    func notificationPreferences() async throws -> NotificationPreferences {
        try await get("/api/preferences/notifications")
    }

    func setNotificationPreferences(_ preferences: NotificationPreferences) async throws -> NotificationPreferences {
        try await put("/api/preferences/notifications", body: preferences)
    }

    func authStatus() async throws -> AuthStatus { try await get("/api/auth/status") }

    func sessions() async throws -> [SessionInfo] { try await get("/api/auth/sessions") }

    func revokeSession(id: String) async throws -> OKResponse {
        try await delete("/api/auth/sessions/\(Self.pathComponent(id))")
    }

    func logout() async throws -> OKResponse { try await post("/api/auth/logout") }

    func exchangeAppToken(_ request: AppTokenRequest) async throws -> AppTokenResponse {
        try await post("/api/auth/app/token", body: request)
    }
}
