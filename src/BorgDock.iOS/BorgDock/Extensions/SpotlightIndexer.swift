import CoreSpotlight
import Foundation
import UniformTypeIdentifiers

/// Puts open pull requests and your work items in Spotlight, so the system search finds them. Each item's
/// identifier is its `borgdock://` link; tapping a result continues `CSSearchableItemActionType` with it.
@MainActor
enum SpotlightIndexer {
    static let domain = "dev.borght.borgdock"
    private static var lastIndexed: Set<String> = []

    struct Entry: Hashable, Sendable {
        let link: URL
        let title: String
        let detail: String
        let keywords: [String]
    }

    /// Pull requests from GET /api/focus (only the fields Spotlight needs) and the overview's items.
    static func refresh(app: AppModel) async {
        var entries: [Entry] = []
        if let focus: SpotlightFocus = try? await app.api.get("/api/focus") {
            entries += focus.pullRequests.compactMap { entry($0) }
        }
        entries += (app.overview?.items ?? []).map { entry($0.item) }
        await index(entries)
    }

    static func entry(_ pr: SpotlightFocus.PullRequest) -> Entry? {
        guard let link = BorgDockLink.pullRequest(key: pr.key) else { return nil }
        let repo = pr.key.split(separator: "#").first.map { String($0.split(separator: "/").last ?? $0) } ?? ""
        return Entry(link: link, title: pr.title, detail: "\(repo) #\(pr.number)", keywords: ["\(pr.number)", "#\(pr.number)", repo, "pull request"])
    }

    static func entry(_ item: WorkItemSummary) -> Entry {
        Entry(link: BorgDockLink.item(item.id), title: item.title, detail: "AB#\(item.id) · \(item.state)", keywords: ["\(item.id)", "AB#\(item.id)", item.typeName])
    }

    /// Replaces the index only when the set changed, and drops what left it.
    static func index(_ entries: [Entry]) async {
        let identifiers = Set(entries.map(\.link.absoluteString))
        guard identifiers != lastIndexed else { return }
        let index = CSSearchableIndex.default()
        let gone = Array(lastIndexed.subtracting(identifiers))
        if !gone.isEmpty { try? await index.deleteSearchableItems(withIdentifiers: gone) }
        let items = entries.map { entry in
            let attributes = CSSearchableItemAttributeSet(contentType: .text)
            attributes.title = entry.title
            attributes.contentDescription = entry.detail
            attributes.keywords = entry.keywords
            return CSSearchableItem(uniqueIdentifier: entry.link.absoluteString, domainIdentifier: domain, attributeSet: attributes)
        }
        try? await index.indexSearchableItems(items)
        lastIndexed = identifiers
    }

    /// The link a Spotlight result continues with.
    static func link(from activity: NSUserActivity) -> URL? {
        guard activity.activityType == CSSearchableItemActionType,
              let identifier = activity.userInfo?[CSSearchableItemActivityIdentifier] as? String
        else { return nil }
        return URL(string: identifier)
    }
}

/// The part of GET /api/focus Spotlight reads; the Focus slice decodes the whole thing.
struct SpotlightFocus: Decodable, Sendable {
    struct PullRequest: Decodable, Sendable {
        let key: String
        let number: Int
        let title: String
    }

    let pullRequests: [PullRequest]
}
