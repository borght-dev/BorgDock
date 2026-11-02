import Foundation

/// Every write the app makes. Each one shows what happened, then reloads the overview.
extension AppModel {
    func isBusy(_ key: String) -> Bool { busy.contains(key) }

    @discardableResult
    func moveState(itemId: Int, to state: String) async -> Bool {
        await perform("move:\(itemId)") {
            let response = try await self.api.moveState(itemId: itemId, to: state)
            return "\(itemId) moved to \(response.state) in ADO"
        }
    }

    /// Hides the current suggestion ("Keep").
    @discardableResult
    func keepState(itemId: Int) async -> Bool {
        await perform("keep:\(itemId)") {
            _ = try await self.api.dismissSuggestion(itemId: itemId)
            return "Suggestion for \(itemId) hidden"
        }
    }

    @discardableResult
    func applyAll(_ moves: [StateMove]) async -> Bool {
        await perform("apply-all") {
            let outcome = await StateMove.apply(moves, using: self.api)
            if outcome.failures.isEmpty {
                return "\(outcome.moved.count) items moved in ADO: \(outcome.moved.map(String.init).joined(separator: ", "))"
            }
            if let unauthorized = outcome.failures.lazy.compactMap({ $0.error as? APIError }).first(where: \.isUnauthorized) {
                throw unauthorized
            }
            let failed = outcome.failures.map { "\($0.move.itemId): \($0.error.localizedDescription)" }.joined(separator: " ")
            throw APIError.server(status: 0, message: "Moved \(outcome.moved.count) of \(moves.count). \(failed)")
        }
    }

    @discardableResult
    func queue(itemId: Int) async -> Bool {
        await perform("queue:\(itemId)") {
            _ = try await self.api.queue(itemId: itemId)
            return "\(itemId) added to Up next"
        }
    }

    @discardableResult
    func unqueue(itemId: Int) async -> Bool {
        await perform("queue:\(itemId)") {
            _ = try await self.api.unqueue(itemId: itemId)
            return "\(itemId) removed from Up next"
        }
    }

    @discardableResult
    func settle(_ thread: ThreadSummary) async -> Bool {
        await perform("settle:\(thread.id)") {
            _ = try await self.api.settle(threadId: thread.id)
            return "Thread settled. \(thread.worktree) is free again."
        }
    }

    @discardableResult
    func answer(_ thread: ThreadSummary, requestId: String, answers: [String: AnswerValue]) async -> Bool {
        await perform("answer:\(thread.id)") {
            _ = try await self.api.answer(threadId: thread.id, AnswerRequest(requestId: requestId, answers: answers))
            return "Answer sent. The agent in \(thread.worktree) is working again."
        }
    }

    @discardableResult
    func link(_ thread: ThreadSummary, to itemId: Int) async -> Bool {
        await perform("link:\(thread.id)") {
            _ = try await self.api.link(threadId: thread.id, to: itemId)
            return "Thread linked to \(itemId)"
        }
    }

    /// Starts a thread. Errors go back to the sheet, which shows them in place.
    func start(_ request: StartThreadRequest) async throws -> StartThreadResponse {
        busy.insert("start")
        defer { busy.remove("start") }
        do {
            let response = try await api.startThread(request)
            let workspace = self.overview?.worktrees.first { $0.id == request.worktree || $0.name == request.worktree }
            var message = "Started in \(workspace?.name ?? request.worktree)."
            if let state = response.adoState { message += " \(request.itemId) is now \(state)." }
            let urls = T3Link.candidates(appLink: response.appLink, link: response.link)
            toasts.show(message, link: urls.isEmpty ? nil : ToastCenter.Link(title: "Open in T3", urls: urls))
            refreshAfterWrite()
            return response
        } catch let error as APIError where error.isUnauthorized {
            report(error)
            throw error
        } catch let error as APIError where error.isConflict {
            await refreshOverview()
            throw error
        }
    }

    private func perform(_ key: String, _ work: @escaping () async throws -> String) async -> Bool {
        guard !busy.contains(key) else { return false }
        busy.insert(key)
        defer { busy.remove(key) }
        do {
            toasts.show(try await work())
            refreshAfterWrite()
            return true
        } catch {
            report(error)
            if (error as? APIError)?.isConflict == true { await refreshOverview() }
            return false
        }
    }
}

/// One suggested ADO state move, as "Apply all" sends it.
struct StateMove: Hashable, Sendable {
    let itemId: Int
    let to: String

    struct Failure: @unchecked Sendable {
        let move: StateMove
        let error: Error
    }

    /// Out of sync items with a target state. "Look at this" suggestions have no target and are skipped.
    static func suggested(in overview: Overview?) -> [StateMove] {
        (overview?.items ?? []).compactMap { entry in
            guard entry.bay == .drift, let to = entry.suggestion?.to else { return nil }
            return StateMove(itemId: entry.item.id, to: to)
        }
    }

    /// Sends the moves one by one so a failure says which item it was.
    static func apply(_ moves: [StateMove], using api: APIClient) async -> (moved: [Int], failures: [Failure]) {
        var moved: [Int] = []
        var failures: [Failure] = []
        for move in moves {
            do {
                _ = try await api.moveState(itemId: move.itemId, to: move.to)
                moved.append(move.itemId)
            } catch {
                failures.append(Failure(move: move, error: error))
            }
        }
        return (moved, failures)
    }
}
