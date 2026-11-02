import Foundation

// MARK: - GitHub and CI endpoints (shared/src/borgdock.ts)

extension APIClient {
    func focus() async throws -> Focus { try await get("/api/focus") }

    func pullRequest(_ key: PrKey) async throws -> PrDetail { try await get(key.apiPath) }

    func pullRequestFiles(_ key: PrKey) async throws -> PrFiles { try await get(key.apiPath + "/files") }

    func conversation(_ key: PrKey) async throws -> PrConversation { try await get(key.apiPath + "/comments") }

    func postComment(_ key: PrKey, _ request: PostCommentRequest) async throws -> OKResponse {
        try await post(key.apiPath + "/comments", body: request)
    }

    func resolveThread(_ key: PrKey, threadId: String) async throws -> OKResponse {
        try await post(key.apiPath + "/threads/\(Self.pathComponent(threadId))/resolve")
    }

    func submitReview(_ key: PrKey, _ request: SubmitReviewRequest) async throws -> SubmitReviewResponse {
        try await post(key.apiPath + "/reviews", body: request, signed: true)
    }

    func merge(_ key: PrKey, _ request: MergeRequest) async throws -> MergeResponse {
        try await post(key.apiPath + "/merge", body: request, signed: true)
    }

    func rerunFailed(_ key: PrKey) async throws -> RerunResponse { try await post(key.apiPath + "/rerun-failed") }

    func snooze(_ key: PrKey, until: Date?) async throws -> OKResponse {
        try await post(key.apiPath + "/snooze", body: SnoozeRequest(until: until.map { $0.formatted(.iso8601) }))
    }

    func ciGroup(_ id: String) async throws -> CiFailureGroup { try await get("/api/ci/groups/\(Self.pathComponent(id))") }

    func claimCiGroup(_ id: String, note: String?) async throws -> CiFailureGroup {
        try await post("/api/ci/groups/\(Self.pathComponent(id))/claim", body: ClaimRequest(note: note))
    }

    func releaseCiGroup(_ id: String) async throws -> CiFailureGroup {
        try await delete("/api/ci/groups/\(Self.pathComponent(id))/claim")
    }

    /// Only `faceIdForActions` matters here; the platform models own the full `BorgDockPreferences`.
    func faceIdForActions() async throws -> Bool {
        let preferences: FaceIdPreference = try await get("/api/preferences")
        return preferences.faceIdForActions
    }
}

private struct FaceIdPreference: Decodable {
    let faceIdForActions: Bool
}
