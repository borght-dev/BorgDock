import Foundation

// Swift mirrors of shared/src/borgdock.ts for widgets and Live Activities. `WidgetSnapshot` and the activity
// states live in ios/Shared because the widget extension decodes them too.

/// POST /api/live-activities: lets the server update one activity.
struct LiveActivityRegistration: Encodable, Hashable, Sendable {
    enum Kind: String, Encodable, Sendable { case agent, checks }

    let kind: Kind
    let threadId: String?
    let prKey: String?
    let pushToken: String

    static func agent(threadId: String, pushToken: String) -> Self {
        Self(kind: .agent, threadId: threadId, prKey: nil, pushToken: pushToken)
    }

    static func checks(prKey: String, pushToken: String) -> Self {
        Self(kind: .checks, threadId: nil, prKey: prKey, pushToken: pushToken)
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(kind, forKey: .kind)
        try container.encodeIfPresent(threadId, forKey: .threadId)
        try container.encodeIfPresent(prKey, forKey: .prKey)
        try container.encode(pushToken, forKey: .pushToken)
    }

    private enum CodingKeys: String, CodingKey { case kind, threadId, prKey, pushToken }
}

/// POST /api/live-activities/start-token: lets the server start an agent activity when a thread starts running.
struct PushToStartRegistration: Codable, Hashable, Sendable {
    let token: String
}

extension APIClient {
    func widgets() async throws -> WidgetSnapshot { try await get("/api/widgets") }

    func registerLiveActivity(_ registration: LiveActivityRegistration) async throws -> OKResponse {
        try await post("/api/live-activities", body: registration)
    }

    func endLiveActivity(pushToken: String) async throws -> OKResponse {
        try await delete("/api/live-activities/\(Self.pathComponent(pushToken))")
    }

    func registerPushToStart(_ registration: PushToStartRegistration) async throws -> OKResponse {
        try await post("/api/live-activities/start-token", body: registration)
    }

    /// The signed settle the Live Activity's Stop button sends.
    func stopAgent(threadId: String) async throws -> OKResponse {
        try await post("/api/threads/\(Self.pathComponent(threadId))/settle", signed: true)
    }
}

extension Data {
    /// APNs and ActivityKit tokens as the server expects them: lower-case hex.
    var tokenHex: String { map { String(format: "%02x", $0) }.joined() }
}
