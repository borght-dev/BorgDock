import ActivityKit
import UIKit

/// The approval countdown outside the app: a local Live Activity per held approval ("✓ Approving #3712 … Undo"),
/// ended when the review posts or is undone. It also asks iOS for background time, so an approval made just
/// before leaving the app still posts on time instead of when the app comes back.
@MainActor
final class ApprovalLiveActivity: ApprovalHoldPresenter {
    /// Activity ids by hold.
    private var activities: [UUID: String] = [:]
    private var backgroundTasks: [UUID: UIBackgroundTaskIdentifier] = [:]

    /// Made once, at launch: approvals held when the app last quit never posted, so their activities go.
    init() {
        let leftovers = Set(Activity<ApprovalActivityAttributes>.activities.map(\.id))
        guard !leftovers.isEmpty else { return }
        Task {
            for activity in Activity<ApprovalActivityAttributes>.activities where leftovers.contains(activity.id) {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    func held(_ pending: ApprovalHold.Pending) {
        keepRunning(pending.id)
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
        let attributes = ApprovalActivityAttributes(holdId: pending.id.uuidString, prKey: pending.key.key, number: pending.key.number, title: pending.title)
        let state = ApprovalActivityState(phase: .holding, startedAt: pending.startedAt, postsAt: pending.postsAt)
        let content = ActivityContent(state: state, staleDate: pending.postsAt.addingTimeInterval(30))
        activities[pending.id] = (try? Activity.request(attributes: attributes, content: content, pushType: nil))?.id
    }

    func ended(_ id: UUID, outcome: ApprovalHold.Outcome) {
        defer { stopRunning(id) }
        guard let activityId = activities.removeValue(forKey: id) else { return }
        let posted = outcome == .posted
        Task {
            for activity in Activity<ApprovalActivityAttributes>.activities where activity.id == activityId {
                var state = activity.content.state
                if posted { state.phase = .posted }
                await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: posted ? .after(.now.addingTimeInterval(3)) : .immediate)
            }
        }
    }

    private func keepRunning(_ id: UUID) {
        backgroundTasks[id] = UIApplication.shared.beginBackgroundTask(withName: "Approval \(id.uuidString)") { [weak self] in
            Task { @MainActor in self?.stopRunning(id) }
        }
    }

    private func stopRunning(_ id: UUID) {
        guard let task = backgroundTasks.removeValue(forKey: id), task != .invalid else { return }
        UIApplication.shared.endBackgroundTask(task)
    }
}
