import Foundation

// The platform slice's endpoints (shared/src/borgdock.ts): account, machines, sources, threads, launching,
// activity and preferences. Routes the contract lists as signed pass `signed: true`.
extension APIClient {
    // MARK: Server and account

    func serverInfo() async throws -> ServerInfo { try await get("/api/server") }

    func exchangeClerkToken(_ request: ClerkExchangeRequest) async throws -> ClerkExchangeResponse {
        try await post("/api/auth/clerk", body: request)
    }

    func account() async throws -> Account { try await get("/api/account") }

    func sources() async throws -> Sources { try await get("/api/sources") }

    func pairMachine(_ request: PairMachineRequest) async throws -> Machine {
        try await post("/api/machines/pair", body: request, signed: true)
    }

    /// Links the desktop showing `code` to this account. Signed: approving hands that desktop a session.
    func approveDesktopLink(code: String) async throws -> DesktopLinkApproval {
        try await post("/api/desktop/links/approve", body: ApproveDesktopRequest(code: code), signed: true)
    }

    func preferences() async throws -> BorgDockPreferences { try await get("/api/preferences") }

    func setPreferences(_ preferences: BorgDockPreferences) async throws -> BorgDockPreferences {
        try await put("/api/preferences", body: preferences)
    }

    // MARK: Threads

    func thread(_ id: String) async throws -> ThreadDetail { try await get("/api/threads/\(Self.pathComponent(id))") }

    func sendMessage(threadId: String, text: String) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/messages", body: SendMessageRequest(text: text), signed: true)
    }

    func approvePlan(threadId: String) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/approve-plan", signed: true)
    }

    // MARK: Launching

    func launchTargets() async throws -> LaunchTargets { try await get("/api/agents/targets") }

    func branches(machineId: String, projectId: String) async throws -> Branches {
        try await get("/api/agents/branches", query: [URLQueryItem(name: "machine", value: machineId), URLQueryItem(name: "project", value: projectId)])
    }

    func launch(_ request: LaunchRequest) async throws -> StartThreadResponse {
        try await post("/api/agents/launch", body: request, signed: true)
    }

    // MARK: Activity

    func activity(category: ActivityCategory? = nil, before: String? = nil, limit: Int = 50) async throws -> ActivityPage {
        var query = [URLQueryItem(name: "limit", value: String(limit))]
        if let category { query.append(URLQueryItem(name: "category", value: category.rawValue)) }
        if let before { query.append(URLQueryItem(name: "before", value: before)) }
        return try await get("/api/activity", query: query)
    }

    func markRead(_ request: MarkReadRequest) async throws -> UnreadResponse {
        try await post("/api/activity/read", body: request)
    }
}
