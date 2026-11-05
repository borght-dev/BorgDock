import Foundation
import Observation

/// The team's current sprint, for the Sprint tab and Today's sprint tile.
@MainActor
@Observable
final class SprintStore {
    weak var app: AppModel?

    private(set) var sprint: Sprint?
    private(set) var error: String?
    private(set) var isLoading = false

    @ObservationIgnored private var loadGeneration = 0

    func stats(_ scope: SprintScope, now: Date = .now) -> SprintStats? {
        sprint.map { SprintStats(sprint: $0, scope: scope, now: now) }
    }

    /// Quietly on a poll; a pull to refresh passes `reportErrors` so a failure over a shown sprint becomes a toast.
    func load(reportErrors: Bool = false) async {
        guard let api = app?.api else { return }
        loadGeneration += 1
        let generation = loadGeneration
        isLoading = true
        defer { if generation == loadGeneration { isLoading = false } }
        do {
            let fresh = try await api.sprint()
            guard generation == loadGeneration else { return }
            sprint = fresh
            error = nil
        } catch is CancellationError {
            return
        } catch {
            guard generation == loadGeneration else { return }
            if (reportErrors && sprint != nil) || (error as? APIError)?.isUnauthorized == true {
                app?.report(error)
            } else {
                self.error = (error as? APIError)?.message ?? error.localizedDescription
            }
        }
    }

    /// A sprint moves slowly: every five minutes while Today or Sprint is on screen (the server caches a minute).
    func poll() async {
        while !Task.isCancelled {
            await load()
            try? await Task.sleep(for: .seconds(sprint == nil && error != nil ? 30 : 300))
        }
    }
}
