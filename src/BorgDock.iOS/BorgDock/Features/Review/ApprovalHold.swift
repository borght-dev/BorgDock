import Foundation
import Observation

/// Holds an approval for a few seconds before it is sent, because GitHub can't take a review back
/// (the desktop's `quick-review-approval.ts`). The deck moves on at once; Undo brings the PR back.
@MainActor
@Observable
final class ApprovalHold {
    struct Pending: Identifiable, Equatable {
        let id = UUID()
        let key: PrKey
        let label: String
        /// The pull request's title, for the Live Activity.
        var title: String? = nil
        let startedAt: Date
        let duration: Duration

        var seconds: Double { Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18 }
        var postsAt: Date { startedAt.addingTimeInterval(seconds) }

        func remaining(at now: Date) -> Double { max(0, seconds - now.timeIntervalSince(startedAt)) }
    }

    /// How a hold ended, for its presenter.
    enum Outcome: Equatable {
        case posted, undone, replaced, failed
    }

    nonisolated static let undoWindow: Duration = .seconds(5)

    /// Every approval still waiting, oldest first. The toast shows the newest.
    private(set) var pending: [Pending] = []
    @ObservationIgnored private var tasks: [UUID: Task<Void, Never>] = [:]
    @ObservationIgnored private var undoActions: [UUID: () -> Void] = [:]
    @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
    /// Shows each hold outside the app (the Live Activity); nil in tests that don't look.
    @ObservationIgnored private let presenter: ApprovalHoldPresenter?

    init(presenter: ApprovalHoldPresenter? = nil, sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        self.presenter = presenter
        self.sleep = sleep
    }

    var current: Pending? { pending.last }

    /// Approving the same PR again replaces its earlier hold, so one review is sent.
    func hold(
        _ key: PrKey,
        label: String,
        title: String? = nil,
        duration: Duration = ApprovalHold.undoWindow,
        send: @escaping @MainActor () async throws -> Void,
        onUndo: @escaping @MainActor () -> Void,
        onSent: @escaping @MainActor () -> Void = {},
        onFailure: @escaping @MainActor (Error) -> Void
    ) {
        if let earlier = pending.first(where: { $0.key == key }) { drop(earlier.id, outcome: .replaced) }
        let entry = Pending(key: key, label: label, title: title, startedAt: .now, duration: duration)
        pending.append(entry)
        undoActions[entry.id] = onUndo
        presenter?.held(entry)
        let sleep = self.sleep
        tasks[entry.id] = Task { [weak self] in
            do {
                try await sleep(duration)
            } catch {
                return
            }
            guard let self, !Task.isCancelled, self.pending.contains(where: { $0.id == entry.id }) else { return }
            // The hold is over: forget it without cancelling this task, which is about to send.
            self.release(entry.id)
            do {
                try await send()
                self.presenter?.ended(entry.id, outcome: .posted)
                onSent()
            } catch {
                self.presenter?.ended(entry.id, outcome: .failed)
                onFailure(error)
            }
        }
    }

    /// Takes back the newest approval. False when none is waiting.
    @discardableResult
    func undo() -> Bool {
        guard let entry = pending.last else { return false }
        return undo(id: entry.id)
    }

    /// Takes back one approval, e.g. from its Live Activity. False when it already posted or was undone.
    @discardableResult
    func undo(id: UUID) -> Bool {
        guard pending.contains(where: { $0.id == id }) else { return false }
        let action = undoActions[id]
        drop(id, outcome: .undone)
        action?()
        return true
    }

    /// `holdId` as the Live Activity carries it (the id's uuidString).
    @discardableResult
    func undo(holdId: String) -> Bool {
        guard let id = UUID(uuidString: holdId) else { return false }
        return undo(id: id)
    }

    func isHeld(_ key: PrKey) -> Bool { pending.contains { $0.key == key } }

    /// Takes an approval back before it is sent.
    private func drop(_ id: UUID, outcome: Outcome) {
        tasks[id]?.cancel()
        release(id)
        presenter?.ended(id, outcome: outcome)
    }

    private func release(_ id: UUID) {
        tasks.removeValue(forKey: id)
        undoActions.removeValue(forKey: id)
        pending.removeAll { $0.id == id }
    }
}

/// Shows a held approval outside the app: the Live Activity in the Dynamic Island, with its own Undo.
@MainActor
protocol ApprovalHoldPresenter: AnyObject {
    func held(_ pending: ApprovalHold.Pending)
    func ended(_ id: UUID, outcome: ApprovalHold.Outcome)
}
