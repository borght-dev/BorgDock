import SwiftUI
import UIKit

/// Loads the images the screens show. `AsyncImage` can't send a token, so Azure DevOps attachments and files uploaded
/// to private GitHub repositories would never appear; this loader adds one where a rule names it for that exact
/// address, and for no other.
struct ImageLoader: Sendable {
    /// The Authorization values worth trying for an address, in order; empty when the address isn't this rule's.
    struct Rule: Sendable {
        let authorizations: @Sendable (URL) -> [String]
    }

    var session: URLSession = .shared
    var rules: [Rule] = []

    enum Failure: Error { case notAnImage }

    func image(from url: URL) async throws -> UIImage {
        if let cached = ImageCache.shared[url] { return cached }
        guard let image = await UIImage(data: try await data(from: url))?.byPreparingForDisplay() else { throw Failure.notAnImage }
        ImageCache.shared[url] = image
        return image
    }

    /// The bytes at an address, asked with each token its rules name until one is let in.
    func data(from url: URL) async throws -> Data {
        let candidates = rules.flatMap { $0.authorizations(url) }
        guard !candidates.isEmpty else { return try await answered(URLRequest(url: url)) }
        var failure: Error = URLError(.userAuthenticationRequired)
        for authorization in candidates {
            var request = URLRequest(url: url)
            request.setValue(authorization, forHTTPHeaderField: "Authorization")
            do {
                return try await answered(request)
            } catch {
                // Another account's token may be the one that sees this repository.
                failure = error
            }
        }
        throw failure
    }

    /// A recording whose address a rule names (an upload to a private repository): the player's web view can't ask
    /// for it, so it is fetched here into `folder`. Nil when no rule names the address: the player streams it itself.
    func recording(from url: URL, into folder: URL) async throws -> URL? {
        let candidates = rules.flatMap { $0.authorizations(url) }
        guard !candidates.isEmpty else { return nil }
        var failure: Error = URLError(.userAuthenticationRequired)
        for authorization in candidates {
            var request = URLRequest(url: url)
            request.setValue(authorization, forHTTPHeaderField: "Authorization")
            do {
                let (file, response) = try await session.download(for: request, delegate: SameHostAuthorization.shared)
                // A sign-in page instead of the file is no recording.
                guard let answer = response as? HTTPURLResponse, (200..<300).contains(answer.statusCode),
                      let kind = Self.videoExtension(type: answer.mimeType, address: url) else {
                    try? FileManager.default.removeItem(at: file)
                    throw URLError(.cannotDecodeContentData)
                }
                let kept = folder.appending(path: "recording.\(kind)")
                try? FileManager.default.removeItem(at: kept)
                try FileManager.default.moveItem(at: file, to: kept)
                return kept
            } catch is CancellationError {
                throw CancellationError()
            } catch {
                failure = error
            }
        }
        throw failure
    }

    /// The file extension WebKit knows a video by, from what the server calls it, else from its address.
    static func videoExtension(type: String?, address: URL) -> String? {
        switch type?.lowercased() {
        case "video/webm": return "webm"
        case "video/mp4": return "mp4"
        case "video/quicktime": return "mov"
        case "video/x-m4v": return "m4v"
        case nil, "application/octet-stream", "binary/octet-stream":
            let named = address.pathExtension.lowercased()
            return ["webm", "mp4", "mov", "m4v"].contains(named) ? named : nil
        default: return nil
        }
    }

    private func answered(_ request: URLRequest) async throws -> Data {
        let (data, response) = try await session.data(for: request, delegate: SameHostAuthorization.shared)
        guard let status = (response as? HTTPURLResponse)?.statusCode, (200..<300).contains(status) else { throw URLError(.badServerResponse) }
        return data
    }
}

extension EnvironmentValues {
    /// How this app loads images; BorgDock Review's adds its accounts' tokens.
    @Entry var imageLoader = ImageLoader()
}

/// A redirect to another host (GitHub hands an upload over to its storage with a signed address) goes without the
/// token: it was meant for the host that was asked.
private final class SameHostAuthorization: NSObject, URLSessionTaskDelegate {
    static let shared = SameHostAuthorization()

    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest) async -> URLRequest? {
        guard request.url?.host() != task.originalRequest?.url?.host() else { return request }
        var bare = request
        bare.setValue(nil, forHTTPHeaderField: "Authorization")
        return bare
    }
}

/// Decoded images by address, so scrolling back to one doesn't load it again. `NSCache` is safe from any thread.
private final class ImageCache: @unchecked Sendable {
    static let shared = ImageCache()
    private let cache = NSCache<NSURL, UIImage>()

    subscript(url: URL) -> UIImage? {
        get { cache.object(forKey: url as NSURL) }
        set {
            if let newValue { cache.setObject(newValue, forKey: url as NSURL) } else { cache.removeObject(forKey: url as NSURL) }
        }
    }
}

/// What `AsyncImage` gives a view: nothing yet, the image, or a failure.
enum LoadedImagePhase {
    case empty
    case success(Image)
    case failure
}

/// `AsyncImage` through the app's `ImageLoader`.
struct LoadedImage<Content: View>: View {
    @Environment(\.imageLoader) private var loader
    let url: URL?
    @ViewBuilder let content: (LoadedImagePhase) -> Content
    @State private var phase = LoadedImagePhase.empty

    var body: some View {
        content(phase)
            .task(id: url) {
                guard let url else {
                    phase = .failure
                    return
                }
                do {
                    phase = .success(Image(uiImage: try await loader.image(from: url)))
                } catch is CancellationError {
                } catch {
                    phase = .failure
                }
            }
    }
}
