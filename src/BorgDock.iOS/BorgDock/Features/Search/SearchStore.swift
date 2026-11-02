import Foundation
import Observation

/// The Search tab: the server's search over pull requests, items and threads, plus full text over the notes on
/// this phone (the vault never goes to the server). A number or AB# jumps straight to it.
@MainActor
@Observable
final class SearchStore {
    @ObservationIgnored weak var app: AppModel?

    enum Scope: Hashable, CaseIterable {
        case all, pullRequests, items, notes, threads

        var title: String {
            switch self {
            case .all: "All"
            case .pullRequests: "PRs"
            case .items: "Items"
            case .notes: "Notes"
            case .threads: "Threads"
            }
        }
    }

    var query = ""
    var scope: Scope = .all
    private(set) var results: SearchResults?
    private(set) var noteHits: [NotesStore.NoteHit] = []
    private(set) var isSearching = false
    private(set) var error: String?

    init() {}

    func count(_ scope: Scope) -> Int? {
        switch scope {
        case .all: nil
        case .pullRequests: results?.pullRequests.count
        case .items: results?.items.count
        case .notes: noteHits.count
        case .threads: results?.threads.count
        }
    }

    /// Searches after a short pause in typing; the view cancels it when the query changes again.
    func run() async {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else {
            results = nil
            noteHits = []
            error = nil
            return
        }
        try? await Task.sleep(for: .milliseconds(250))
        guard !Task.isCancelled, let app else { return }
        noteHits = app.notes.search(text)
        guard app.isSignedIn else { return }
        isSearching = true
        defer { isSearching = false }
        do {
            let found = try await app.api.search(text)
            guard !Task.isCancelled else { return }
            results = found
            error = nil
        } catch is CancellationError {
            return
        } catch {
            self.error = error.localizedDescription
        }
    }

    /// Return in the field: the item or pull request the query names, else the first result.
    func submit() async {
        guard let app else { return }
        if results?.query != query.trimmingCharacters(in: .whitespacesAndNewlines) {
            await run()
        }
        if let route = SearchJump.route(for: query, results: results) ?? firstResult {
            app.router.push(route)
        }
    }

    private var firstResult: Route? {
        if let pr = results?.pullRequests.first { return .pullRequest(pr.prKey) }
        if let item = results?.items.first { return .workItem(ItemRoute(id: item.id, prefill: item)) }
        if let note = noteHits.first { return .note(note.file.path) }
        return nil
    }
}

/// "3712", "#3712", "AB#61021": where a query that names a number goes.
enum SearchJump {
    enum Target: Equatable {
        case item(Int)
        case pullRequest(number: Int)
        case number(Int)
    }

    static func target(_ query: String) -> Target? {
        let text = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if let match = text.wholeMatch(of: /(?i)ab#?\s*(\d{1,9})/), let id = Int(match.output.1) { return .item(id) }
        if let match = text.wholeMatch(of: /#(\d{1,7})/), let number = Int(match.output.1) { return .pullRequest(number: number) }
        if let match = text.wholeMatch(of: /(\d{1,9})/), let number = Int(match.output.1) { return .number(number) }
        return nil
    }

    /// AB# always means a work item. `#12` means a pull request in the results. A bare number is the pull
    /// request with that number when the results have one, else the work item with that id.
    static func route(for query: String, results: SearchResults?) -> Route? {
        switch target(query) {
        case .item(let id)?:
            return .workItem(ItemRoute(id: id, prefill: results?.items.first { $0.id == id }))
        case .pullRequest(let number)?:
            return results?.pullRequests.first { $0.number == number }.map { .pullRequest($0.prKey) }
        case .number(let number)?:
            if let pr = results?.pullRequests.first(where: { $0.number == number }) { return .pullRequest(pr.prKey) }
            if let item = results?.items.first(where: { $0.id == number }) { return .workItem(ItemRoute(id: item.id, prefill: item)) }
            // ADO ids are five digits and more; shorter numbers are pull requests we haven't found.
            return number >= 10_000 ? .workItem(ItemRoute(id: number)) : nil
        case nil:
            return nil
        }
    }
}
