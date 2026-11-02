import UIKit

/// Opens a T3 thread in the T3 Code app (`appLink`, t3code://…) and falls back to T3's web UI (`link`) in Safari
/// when the app isn't installed.
enum T3Link {
    /// The URLs to try, in order: the app link first, then the web link. Invalid or duplicate ones are dropped.
    static func candidates(appLink: String?, link: String) -> [URL] {
        var urls: [URL] = []
        for text in [appLink, link].compactMap({ $0?.trimmingCharacters(in: .whitespacesAndNewlines) }) where !text.isEmpty {
            if let url = URL(string: text), url.scheme != nil, !urls.contains(url) { urls.append(url) }
        }
        return urls
    }

    /// Tries each URL until one opens; returns the one that did, or nil when none would.
    @discardableResult
    static func open(_ candidates: [URL], using opener: @Sendable (URL) async -> Bool) async -> URL? {
        for url in candidates where await opener(url) {
            return url
        }
        return nil
    }

    /// `UIApplication.open` reports false when no installed app handles the scheme, so no
    /// LSApplicationQueriesSchemes entry is needed.
    @MainActor
    @discardableResult
    static func open(_ candidates: [URL]) async -> URL? {
        await open(candidates) { @MainActor url in await UIApplication.shared.open(url, options: [:]) }
    }

    @MainActor
    static func open(_ thread: ThreadSummary) {
        let urls = candidates(appLink: thread.appLink, link: thread.link)
        Task { await open(urls) }
    }
}
