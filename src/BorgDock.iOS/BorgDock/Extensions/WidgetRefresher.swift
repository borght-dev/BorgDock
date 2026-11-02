import BackgroundTasks
import Foundation
import WidgetKit

/// Keeps the widgets' snapshot fresh: on foreground, from the background refresh task and on a silent `refresh`
/// push. Writes `GET /api/widgets` to the App Group and reloads the timelines when it changed.
@MainActor
enum WidgetRefresher {
    static let taskIdentifier = "dev.borght.borgdock.refresh"
    private static var inFlight: Task<Bool, Never>?

    /// Returns true when the snapshot was read (changed or not).
    @discardableResult
    static func refresh(api: APIClient? = AppContext.model?.api ?? StoredCredentials.apiClient()) async -> Bool {
        if let inFlight { return await inFlight.value }
        let task = Task<Bool, Never> {
            guard let api, api.token != nil else { return false }
            do {
                let snapshot = try await api.widgets()
                if try WidgetSnapshotStore().save(snapshot) {
                    WidgetCenter.shared.reloadAllTimelines()
                }
                return true
            } catch {
                return false
            }
        }
        inFlight = task
        defer { inFlight = nil }
        return await task.value
    }

    /// Asks iOS for the next background refresh in about 20 minutes. Called whenever the app leaves the foreground.
    static func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: taskIdentifier)
        request.earliestBeginDate = .now.addingTimeInterval(20 * 60)
        try? BGTaskScheduler.shared.submit(request)
    }

    /// The `.backgroundTask(.appRefresh(…))` handler: refresh, then ask for the next one.
    static func runBackgroundRefresh() async {
        scheduleBackgroundRefresh()
        await refresh()
    }

    /// For the app delegate's remote notification handler: true when it was BorgDock's silent `refresh` push.
    static func handleSilentPush(_ userInfo: [AnyHashable: Any]) async -> Bool {
        guard let data = userInfo["dispatch"] as? [String: Any], data["kind"] as? String == "refresh" else { return false }
        await refresh()
        return true
    }
}
