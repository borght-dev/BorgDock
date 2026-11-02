import Foundation

/// What can go wrong talking to the Dispatch server, mapped from the status codes in docs/api.md.
enum APIError: Error, Equatable, LocalizedError {
    /// 401: the session is gone (revoked or expired). Sign in again.
    case unauthorized(String)
    /// 409: the world moved on, e.g. the agent's question changed or the worktree got taken. Reload.
    case conflict(String)
    /// 502: T3 Code or Azure DevOps failed. The message says which one.
    case upstream(String)
    /// 503 on /api/overview while the first sync runs.
    case stillLoading(String)
    /// 403 from POST /api/auth/clerk: the server has no owner yet, so this sign-in must claim it with a pairing code.
    case claimRequired(String)
    /// 403 on a signed route: the device signature was missing or didn't verify.
    case signatureRequired(String)
    case server(status: Int, message: String)
    case network(String)
    case decoding(String)

    init(status: Int, body: Data) {
        let decoded = try? JSONDecoder().decode(ForbiddenBody.self, from: body)
        let message = decoded?.error ?? "The server answered with status \(status)."
        switch status {
        case 403 where decoded?.claimRequired == true: self = .claimRequired(message)
        case 403 where decoded?.signatureRequired == true: self = .signatureRequired(message)
        case 401: self = .unauthorized(message)
        case 409: self = .conflict(message)
        case 502: self = .upstream(message)
        case 503: self = .stillLoading(message)
        default: self = .server(status: status, message: message)
        }
    }

    var message: String {
        switch self {
        case .unauthorized(let message), .conflict(let message), .upstream(let message),
             .stillLoading(let message), .network(let message), .decoding(let message),
             .claimRequired(let message), .signatureRequired(let message):
            message
        case .server(_, let message):
            message
        }
    }

    var errorDescription: String? { message }

    var isUnauthorized: Bool {
        if case .unauthorized = self { return true }
        return false
    }

    var isClaimRequired: Bool {
        if case .claimRequired = self { return true }
        return false
    }

    /// 401 or a plain 403 from POST /api/auth/clerk: this Clerk account can't sign in here, so another one should get the chance.
    var rejectsAccount: Bool {
        switch self {
        case .unauthorized: true
        case .server(let status, _): status == 403
        default: false
        }
    }

    var isConflict: Bool {
        if case .conflict = self { return true }
        return false
    }

    /// 404 or 410: an unknown or expired code, a thing that's gone.
    var isGone: Bool {
        if case .server(let status, _) = self { return status == 404 || status == 410 }
        return false
    }
}

/// `{error, claimRequired?, signatureRequired?}`
private struct ForbiddenBody: Decodable {
    let error: String
    let claimRequired: Bool?
    let signatureRequired: Bool?
}

extension Result where Failure == Error {
    /// `Result { try await … }`, for running several requests in parallel with `async let`.
    init(catching body: () async throws -> Success) async {
        do { self = .success(try await body()) } catch { self = .failure(error) }
    }
}
