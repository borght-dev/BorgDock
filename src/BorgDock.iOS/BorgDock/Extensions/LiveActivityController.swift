import ActivityKit
import Foundation

/// Starts BorgDock's Live Activities and hands their push tokens to the server, which updates and ends them.
/// The push-to-start token lets the server start an agent activity on its own when a thread you launched runs.
@MainActor
enum LiveActivityController {
    private static var observing = false
    /// Activities whose token updates are already observed, by activity id.
    private static var watched: Set<String> = []

    /// Once per launch: the push-to-start token, and every agent or checks activity, including ones the server
    /// started by push while the app wasn't running.
    static func observe() {
        guard !observing else { return }
        observing = true
        Task {
            for await token in Activity<AgentActivityAttributes>.pushToStartTokenUpdates {
                _ = try? await api()?.registerPushToStart(PushToStartRegistration(token: token.tokenHex))
            }
        }
        Task {
            for await activity in Activity<AgentActivityAttributes>.activityUpdates { watch(activity) }
        }
        Task {
            for await activity in Activity<ChecksActivityAttributes>.activityUpdates { watch(activity) }
        }
        Activity<AgentActivityAttributes>.activities.forEach(watch)
        Activity<ChecksActivityAttributes>.activities.forEach(watch)
    }

    /// An agent's activity, e.g. right after the launch sheet started its thread. One per thread.
    @discardableResult
    static func startAgent(threadId: String, itemId: Int?, title: String, machine: String, state: AgentActivityState? = nil) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        if Activity<AgentActivityAttributes>.activities.contains(where: { $0.attributes.threadId == threadId }) { return true }
        let attributes = AgentActivityAttributes(threadId: threadId, itemId: itemId, title: title, machine: machine)
        let initial = state ?? AgentActivityState(step: "Starting", stepIndex: 1, stepCount: 0, status: .running, startedAt: ISODates.format(.now))
        do {
            let activity = try Activity.request(attributes: attributes, content: ActivityContent(state: initial, staleDate: nil), pushType: .token)
            watch(activity)
            return true
        } catch {
            return false
        }
    }

    /// A pull request's checks while they run. One per pull request.
    @discardableResult
    static func startChecks(prKey: String, number: Int, title: String, state: ChecksActivityState) -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        if Activity<ChecksActivityAttributes>.activities.contains(where: { $0.attributes.prKey == prKey }) { return true }
        let attributes = ChecksActivityAttributes(prKey: prKey, number: number, title: title)
        do {
            let activity = try Activity.request(attributes: attributes, content: ActivityContent(state: state, staleDate: nil), pushType: .token)
            watch(activity)
            return true
        } catch {
            return false
        }
    }

    /// The Stop button: settle the thread (signed), then end its activity.
    static func stopAgent(threadId: String) async throws {
        guard let api = api() else { throw AgentStopper.StopError.unavailable }
        _ = try await api.stopAgent(threadId: threadId)
        for activity in Activity<AgentActivityAttributes>.activities where activity.attributes.threadId == threadId {
            var state = activity.content.state
            state.status = .failed
            state.step = "Stopped"
            await activity.end(ActivityContent(state: state, staleDate: nil), dismissalPolicy: .after(.now.addingTimeInterval(60)))
        }
    }

    private static func watch(_ activity: Activity<AgentActivityAttributes>) {
        guard watched.insert(activity.id).inserted else { return }
        let threadId = activity.attributes.threadId
        Task {
            for await token in activity.pushTokenUpdates {
                _ = try? await api()?.registerLiveActivity(.agent(threadId: threadId, pushToken: token.tokenHex))
            }
        }
    }

    private static func watch(_ activity: Activity<ChecksActivityAttributes>) {
        guard watched.insert(activity.id).inserted else { return }
        let prKey = activity.attributes.prKey
        Task {
            for await token in activity.pushTokenUpdates {
                _ = try? await api()?.registerLiveActivity(.checks(prKey: prKey, pushToken: token.tokenHex))
            }
        }
    }

    private static func api() -> APIClient? {
        let api = AppContext.model?.api ?? StoredCredentials.apiClient()
        return api?.token == nil ? nil : api
    }
}
