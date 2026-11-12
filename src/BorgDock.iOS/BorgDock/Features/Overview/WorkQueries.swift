import Foundation
import Observation

/// The Work tab's saved ADO queries: the list, each query's items once read, and their counts for the Show sheet.
@MainActor
@Observable
final class WorkQueries {
    private(set) var saved: [BrowseQuery] = []
    private(set) var items: [String: [WorkItemSummary]] = [:]
    private(set) var error: String?

    /// Counts are one ADO query each, so only the first few queries get one, once per launch.
    static let countedQueries = 8

    func count(_ id: String) -> Int? { items[id]?.count }

    func loadSaved(_ app: AppModel) async {
        do {
            saved = try await app.api.browseQueries()
        } catch {
            if (error as? APIError)?.isUnauthorized == true { app.report(error) }
        }
    }

    /// Reads one query; `reportErrors` turns a failure into a toast instead of the tab's error line.
    func load(_ id: String, app: AppModel, reportErrors: Bool = false) async {
        do {
            items[id] = try await app.api.browse(query: id, search: nil).items
            error = nil
        } catch is CancellationError {
        } catch {
            if reportErrors || (error as? APIError)?.isUnauthorized == true { app.report(error) } else { self.error = error.localizedDescription }
        }
    }

    /// Reads the queries that have no count yet, a few at a time.
    func loadCounts(_ app: AppModel) async {
        let missing = saved.prefix(Self.countedQueries).map(\.id).filter { items[$0] == nil }
        await withTaskGroup(of: (String, [WorkItemSummary]?).self) { group in
            for id in missing {
                group.addTask { [api = app.api] in (id, try? await api.browse(query: id, search: nil).items) }
            }
            for await (id, result) in group {
                if let result { items[id] = result }
            }
        }
    }
}
