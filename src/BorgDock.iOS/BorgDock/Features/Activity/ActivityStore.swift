import Foundation
import Observation
import UserNotifications

/// The Activity journal: what changed since you last looked, kept until you read it. Read state lives on the
/// server, so marking an entry read here clears it on the desktop too.
@MainActor
@Observable
final class ActivityStore {
    @ObservationIgnored weak var app: AppModel?

    /// Unread entries, for the tab badge.
    var unread = 0
    private(set) var unreadByCategory: [String: Int] = [:]
    private(set) var entries: [ActivityEntry] = []
    private(set) var away: ActivityPage.Away?
    private(set) var filter: ActivityCategory?
    private(set) var isLoading = false
    private(set) var loadError: String?
    private(set) var hasMore = false

    static let pageSize = 50

    init() {}

    func unread(_ category: ActivityCategory?) -> Int {
        guard let category else { return unread }
        return unreadByCategory[category.rawValue] ?? 0
    }

    func select(_ category: ActivityCategory?) async {
        guard category != filter else { return }
        filter = category
        entries = []
        await refresh()
    }

    func refresh() async {
        guard let app, app.isSignedIn else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            apply(try await app.api.activity(category: filter, limit: Self.pageSize), appending: false)
            loadError = nil
        } catch is CancellationError {
        } catch {
            loadError = error.localizedDescription
            if (error as? APIError)?.isUnauthorized == true { app.report(error) }
        }
    }

    func loadMore() async {
        guard let app, hasMore, !isLoading, let last = entries.last else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            apply(try await app.api.activity(category: filter, before: last.at, limit: Self.pageSize), appending: true)
        } catch {
            app.report(error)
        }
    }

    private func apply(_ page: ActivityPage, appending: Bool) {
        entries = appending ? entries + page.entries.filter { new in !entries.contains { $0.id == new.id } } : page.entries
        unread = page.unread
        unreadByCategory = page.unreadByCategory
        if !appending { away = page.away }
        hasMore = page.entries.count >= Self.pageSize
    }

    // MARK: Read state

    func markRead(_ entry: ActivityEntry) async {
        guard !entry.read else { return }
        await send(.ids([entry.id]))
    }

    func markAllRead() async {
        guard unread > 0 else { return }
        await send(.all)
    }

    private func send(_ request: MarkReadRequest) async {
        guard let app else { return }
        let before = ActivityReadState(entries: entries, unread: unread, unreadByCategory: unreadByCategory)
        apply(before.marking(request))
        do {
            unread = try await app.api.markRead(request).unread
            await Self.removeDelivered(request)
        } catch {
            apply(before)
            app.report(error)
        }
    }

    /// A `read` push: the entries were read on another device.
    func readElsewhere(_ ids: [String]) async {
        apply(ActivityReadState(entries: entries, unread: unread, unreadByCategory: unreadByCategory).marking(.ids(ids)))
        await Self.removeDelivered(.ids(ids))
    }

    private func apply(_ state: ActivityReadState) {
        entries = state.entries
        unread = state.unread
        unreadByCategory = state.unreadByCategory
    }

    /// Tapping an entry: read it, then land on its pull request, item, thread or CI group.
    func open(_ entry: ActivityEntry) {
        Task { await markRead(entry) }
        guard let route = entry.target.route else { return }
        app?.router.push(route)
    }

    /// Clears delivered notifications for entries read here or elsewhere.
    static func removeDelivered(_ request: MarkReadRequest) async {
        let center = UNUserNotificationCenter.current()
        let delivered = await center.deliveredNotifications()
        let ids: [String] = delivered.compactMap { notification in
            guard case .activity(let entryId, _, _) = BorgDockPush(userInfo: notification.request.content.userInfo) else { return nil }
            switch request {
            case .all: return notification.request.identifier
            case .ids(let read): return read.contains(entryId) ? notification.request.identifier : nil
            }
        }
        if !ids.isEmpty { center.removeDeliveredNotifications(withIdentifiers: ids) }
    }
}

/// Entries and counts after marking some read, so the list updates before the server answers. Pure for tests.
struct ActivityReadState: Equatable {
    var entries: [ActivityEntry]
    var unread: Int
    var unreadByCategory: [String: Int]

    func marking(_ request: MarkReadRequest) -> ActivityReadState {
        var next = self
        for index in next.entries.indices where !next.entries[index].read {
            let matches: Bool = switch request {
            case .all: true
            case .ids(let ids): ids.contains(next.entries[index].id)
            }
            guard matches else { continue }
            next.entries[index].read = true
            next.unread = max(0, next.unread - 1)
            let key = next.entries[index].category.rawValue
            next.unreadByCategory[key] = max(0, (next.unreadByCategory[key] ?? 0) - 1)
        }
        if case .all = request {
            next.unread = 0
            next.unreadByCategory = next.unreadByCategory.mapValues { _ in 0 }
        }
        return next
    }
}

extension ActivityTarget {
    /// Where tapping an entry or its notification lands.
    var route: Route? {
        switch self {
        case .pr(let key): PrKey(key: key).map(Route.pullRequest)
        case .item(let id): .workItem(ItemRoute(id: id))
        case .thread(let id, _): .thread(id)
        case .ci(let groupId): .ciGroup(groupId)
        case .none: nil
        }
    }
}
