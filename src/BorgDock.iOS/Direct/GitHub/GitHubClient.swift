import Foundation

/// A GitHub account this phone reads with: its login and a token that sees its pull requests.
struct GitHubAccount: Hashable, Sendable {
    let login: String
    let token: String
}

/// A GitHub failure with GitHub's own status, so callers can tell a missing commit (404) from a refused merge (405).
struct GitHubError: Error, LocalizedError, Equatable {
    let status: Int
    let message: String

    var errorDescription: String? { message }

    /// What the screens show, with the status the server would have answered: 404 stays 404, a moved head 409, a
    /// refused token 401, the rest 502.
    var shown: APIError {
        switch status {
        case 401, 404, 409: directError(status, message)
        case 422: directError(400, message)
        default: directError(502, message)
        }
    }
}

/// A value in a GraphQL request's variables.
enum GraphQLValue: Encodable, Sendable, ExpressibleByStringLiteral, ExpressibleByIntegerLiteral {
    case string(String)
    case int(Int)
    case null

    init(stringLiteral value: String) { self = .string(value) }
    init(integerLiteral value: Int) { self = .int(value) }

    /// A value that may be missing, e.g. the cursor of a first page.
    static func optional(_ value: String?) -> GraphQLValue { value.map(GraphQLValue.string) ?? .null }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .string(let value): try container.encode(value)
        case .int(let value): try container.encode(value)
        case .null: try container.encodeNil()
        }
    }
}

/// One GitHub account's reads and writes. GETs remember their ETag, so an unchanged answer costs no rate limit.
actor GitHubClient {
    nonisolated let login: String
    private let token: String
    private let session: URLSession
    private var etags = ETagCache(capacity: 300)

    private static let api = "https://api.github.com"

    init(account: GitHubAccount, session: URLSession = .shared) {
        login = account.login
        token = account.token
        self.session = session
    }

    // MARK: GraphQL

    func graphql<Answer: Decodable & Sendable>(_ query: String, _ variables: [String: GraphQLValue] = [:], as _: Answer.Type = Answer.self) async throws -> Answer {
        let body = try JSONEncoder().encode(GraphQLRequest(query: query, variables: variables))
        let (data, response) = try await send("POST", url: Self.api + "/graphql", body: body)
        guard (200..<300).contains(response.statusCode) else { throw failure(response.statusCode, data) }
        let failures = (try? JSONDecoder().decode(GraphQLFailures.self, from: data))?.errors ?? []
        if let notFound = failures.first(where: { $0.type == "NOT_FOUND" }) { throw GitHubError(status: 404, message: "GitHub: \(notFound.message)") }
        // A root field that failed answered nothing worth keeping: a search GitHub refuses (`repo:` a repository this
        // account can't see) comes back as an empty result next to the error.
        let rootFailure = failures.first { $0.pathLength == 1 }.map { GitHubError(status: $0.type == "FORBIDDEN" ? 403 : 422, message: "GitHub: \($0.message)") }
        do {
            guard let answer = try JSONDecoder().decode(GraphQLData<Answer>.self, from: data).data else {
                throw GitHubError(status: 502, message: "GitHub: \(failures.first?.message ?? "answered nothing")")
            }
            if let rootFailure { throw rootFailure }
            return answer
        } catch let error as DecodingError {
            if let rootFailure { throw rootFailure }
            if let first = failures.first { throw GitHubError(status: 502, message: "GitHub: \(first.message)") }
            throw APIError.decoding("GitHub's answer doesn't match this app version. \(error)")
        }
    }

    // MARK: REST

    func rest<Answer: Decodable & Sendable>(_ method: String, _ path: String, body: (any Encodable & Sendable)? = nil, as _: Answer.Type = Answer.self) async throws -> Answer {
        let data = try await restData(method, path, body: body)
        do {
            return try JSONDecoder().decode(Answer.self, from: data)
        } catch {
            throw APIError.decoding("GitHub's answer for \(path) doesn't match this app version. \(error)")
        }
    }

    /// A write whose answer nobody reads.
    func call(_ method: String, _ path: String, body: (any Encodable & Sendable)? = nil) async throws {
        _ = try await restData(method, path, body: body)
    }

    private func restData(_ method: String, _ path: String, body: (any Encodable & Sendable)?) async throws -> Data {
        let url = Self.api + path
        let cached = method == "GET" ? etags[url] : nil
        var headers: [String: String] = [:]
        if let cached { headers["If-None-Match"] = cached.etag }
        let (data, response) = try await send(method, url: url, body: try body.map { try JSONEncoder().encode($0) }, headers: headers)
        if response.statusCode == 304, let cached { return cached.body }
        guard (200..<300).contains(response.statusCode) else { throw failure(response.statusCode, data) }
        if method == "GET", let etag = response.value(forHTTPHeaderField: "ETag") { etags[url] = (etag, data) }
        return data
    }

    // MARK: Transport

    private func send(_ method: String, url: String, body: Data?, headers: [String: String] = [:]) async throws -> (Data, HTTPURLResponse) {
        guard let url = URL(string: url) else { throw GitHubError(status: 400, message: "GitHub: \(url) is not an address.") }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        // ETags are this client's own; URLCache must never answer for GitHub.
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("2022-11-28", forHTTPHeaderField: "X-GitHub-Api-Version")
        request.setValue("BorgDock", forHTTPHeaderField: "User-Agent")
        for (name, value) in headers { request.setValue(value, forHTTPHeaderField: name) }
        if let body {
            request.httpBody = body
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }
        do {
            let (data, response) = try await session.data(for: request)
            guard let http = response as? HTTPURLResponse else { throw GitHubError(status: 502, message: "GitHub sent something that isn't HTTP.") }
            return (data, http)
        } catch let error as URLError where error.code == .cancelled {
            throw CancellationError()
        } catch let error as URLError {
            throw GitHubError(status: 502, message: "Could not reach GitHub: \(error.localizedDescription)")
        }
    }

    private func failure(_ status: Int, _ body: Data) -> GitHubError {
        let message = (try? JSONDecoder().decode(GitHubMessage.self, from: body))?.message
        if status == 401 { return GitHubError(status: status, message: "GitHub rejected the token for \(login). Replace it in Settings.") }
        if status == 403, message?.lowercased().contains("rate limit") == true {
            return GitHubError(status: status, message: "GitHub's rate limit is used up. Try again in a few minutes.")
        }
        return GitHubError(status: status, message: "GitHub: \(message ?? "answered \(status)")")
    }
}

private struct GraphQLRequest: Encodable {
    let query: String
    let variables: [String: GraphQLValue]
}

private struct GraphQLData<Answer: Decodable>: Decodable {
    let data: Answer?
}

private struct GraphQLFailures: Decodable {
    struct Failure: Decodable {
        let message: String
        let type: String?
        /// How deep in the answer it failed; 1 is a root field.
        let pathLength: Int?

        private enum CodingKeys: String, CodingKey { case message, type, path }

        init(from decoder: Decoder) throws {
            let container = try decoder.container(keyedBy: CodingKeys.self)
            message = try container.decode(String.self, forKey: .message)
            type = try container.decodeIfPresent(String.self, forKey: .type)
            pathLength = (try? container.nestedUnkeyedContainer(forKey: .path))?.count
        }
    }

    let errors: [Failure]?
}

private struct GitHubMessage: Decodable {
    let message: String
}

/// The newest answers by address, oldest dropped first.
private struct ETagCache {
    let capacity: Int
    private var entries: [String: (etag: String, body: Data)] = [:]
    private var order: [String] = []

    init(capacity: Int) { self.capacity = capacity }

    subscript(url: String) -> (etag: String, body: Data)? {
        get { entries[url] }
        set {
            order.removeAll { $0 == url }
            entries[url] = newValue
            guard newValue != nil else { return }
            order.append(url)
            if order.count > capacity { entries[order.removeFirst()] = nil }
        }
    }
}
