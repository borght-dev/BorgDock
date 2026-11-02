import CryptoKit
import Foundation
@testable import BorgDock

/// Answers every request with a canned response and records what the app sent. No network, no real T3 or ADO.
final class StubURLProtocol: URLProtocol {
    struct Recorded: Sendable {
        let method: String
        let path: String
        let query: String?
        let headers: [String: String]
        let body: Data?
        let cachePolicy: URLRequest.CachePolicy

        var json: Any? { body.flatMap { try? JSONSerialization.jsonObject(with: $0) } }
    }

    typealias Responder = @Sendable (Recorded) -> (status: Int, body: String)

    private static let lock = NSLock()
    nonisolated(unsafe) private static var responder: Responder = { _ in (200, #"{"ok":true}"#) }
    nonisolated(unsafe) private static var recorded: [Recorded] = []
    nonisolated(unsafe) private static var cacheable = false

    /// `cacheable` makes every response say `Cache-Control: max-age=3600`, like a server that forgot `no-store`.
    static func respond(cacheable: Bool = false, _ responder: @escaping Responder) {
        lock.withLock {
            self.responder = responder
            self.cacheable = cacheable
            recorded = []
        }
    }

    /// Requests that reached the server.
    static var requests: [Recorded] { lock.withLock { recorded } }

    static let baseURL = URL(string: "https://dispatch.test:10000")!

    /// A session that routes everything to the stub, with its own in-memory URLCache.
    static func session() -> URLSession {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.protocolClasses = [StubURLProtocol.self]
        configuration.urlCache = URLCache(memoryCapacity: 8 * 1024 * 1024, diskCapacity: 0)
        configuration.requestCachePolicy = .useProtocolCachePolicy
        return URLSession(configuration: configuration)
    }

    /// Signs with a throwaway software key, so signed routes (answers, starts, settles) reach the stub.
    static func client(token: String? = "test-token", session: URLSession = session()) -> APIClient {
        APIClient(baseURL: baseURL, token: token, session: session, signer: DeviceRequestSigner(key: .software(P256.Signing.PrivateKey())))
    }

    override class func canInit(with request: URLRequest) -> Bool { true }
    override class func canonicalRequest(for request: URLRequest) -> URLRequest { request }

    override func startLoading() {
        let url = request.url!
        let record = Recorded(
            method: request.httpMethod ?? "GET",
            path: url.path(),
            query: url.query(),
            headers: request.allHTTPHeaderFields ?? [:],
            body: request.httpBody ?? request.httpBodyStream.map(Self.read),
            cachePolicy: request.cachePolicy
        )
        let responder = Self.lock.withLock {
            Self.recorded.append(record)
            return Self.responder
        }
        let (status, body) = responder(record)
        let cacheable = Self.lock.withLock { Self.cacheable }
        var headers = ["Content-Type": "application/json"]
        if cacheable { headers["Cache-Control"] = "public, max-age=3600" }
        let response = HTTPURLResponse(url: url, statusCode: status, httpVersion: "HTTP/1.1", headerFields: headers)!
        client?.urlProtocol(self, didReceive: response, cacheStoragePolicy: cacheable ? .allowedInMemoryOnly : .notAllowed)
        client?.urlProtocol(self, didLoad: Data(body.utf8))
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
