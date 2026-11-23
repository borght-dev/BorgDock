import Foundation
import Synchronization
@testable import BorgDock

/// Azure DevOps for the tests: answers every request from a table of canned responses and records what was sent.
/// No network, and never the real Azure DevOps.
final class AdoStubURLProtocol: URLProtocol {
    struct Recorded: Sendable {
        let method: String
        /// Decoded: `/acme/Shop/_apis/wit/workitemtypes/Product Backlog Item/states`.
        let path: String
        let query: String
        let headers: [String: String]
        let body: Data?

        var json: [String: Any]? { body.flatMap { try? JSONSerialization.jsonObject(with: $0) } as? [String: Any] }
    }

    struct Answer: Sendable {
        var status = 200
        var headers = ["Content-Type": "application/json"]
        var body = "{}"
        /// A redirect the session is asked to follow, instead of a response.
        var redirect: URL? = nil
        /// The connection fails with this, instead of a response.
        var failure: URLError.Code? = nil

        static func json(_ object: Any, status: Int = 200) -> Answer {
            let data = (try? JSONSerialization.data(withJSONObject: object)) ?? Data("{}".utf8)
            return Answer(status: status, body: String(decoding: data, as: UTF8.self))
        }

        static func failure(_ status: Int, message: String? = nil) -> Answer {
            Answer(status: status, body: message.map { #"{"message":"\#($0)"}"# } ?? "")
        }

        static let notFound = failure(404, message: "TF401232: Work item does not exist, or you do not have permissions to read it.")
    }

    typealias Responder = @Sendable (Recorded) -> Answer

    private struct State {
        var responder: Responder = { _ in .notFound }
        var recorded: [Recorded] = []
    }

    private static let state = Mutex(State())

    /// Answers from now on with `responder`, and forgets what was recorded.
    static func respond(_ responder: @escaping Responder) {
        state.withLock { $0 = State(responder: responder) }
    }

    /// Requests that reached Azure DevOps.
    static var requests: [Recorded] { state.withLock { $0.recorded } }

    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [AdoStubURLProtocol.self]
        return URLSession(configuration: configuration)
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        guard let url = request.url else { return }
        let record = Recorded(
            method: request.httpMethod ?? "GET",
            path: url.path(percentEncoded: false),
            query: url.query(percentEncoded: false) ?? "",
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody ?? request.httpBodyStream.map(Self.read)
        )
        let responder = Self.state.withLock { state in
            state.recorded.append(record)
            return state.responder
        }
        let answer = responder(record)
        if let failure = answer.failure {
            client?.urlProtocol(self, didFailWithError: URLError(failure))
            return
        }
        if let redirect = answer.redirect {
            let response = HTTPURLResponse(url: url, statusCode: 302, httpVersion: "HTTP/1.1", headerFields: ["Location": redirect.absoluteString])!
            client?.urlProtocol(self, wasRedirectedTo: URLRequest(url: redirect), redirectResponse: response)
            // A session that refuses the redirect takes the redirect itself as the answer; one that follows it has
            // already started the next load and ignores this.
            client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
            client?.urlProtocolDidFinishLoading(self)
            return
        }
        let response = HTTPURLResponse(url: url, statusCode: answer.status, httpVersion: "HTTP/1.1", headerFields: answer.headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: .notAllowed)
        client?.urlProtocol(self, didLoad: Data(answer.body.utf8))
        client?.urlProtocolDidFinishLoading(self)
    }

    override func stopLoading() {}

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
