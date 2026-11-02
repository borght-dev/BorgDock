import UserNotifications

/// Shows notifications while the app is open, routes taps to their target, and runs the quick actions
/// (identifiers in NotificationCategories.swift). iOS waits for the async delegate method to return before it ends
/// the action's background time, so a signed answer finishes before the completion fires.
final class NotificationController: NSObject, UNUserNotificationCenterDelegate, Sendable {
    static let shared = NotificationController()

    /// Posted for a silent `refresh` push, so widgets can reload their snapshot.
    static let refreshPush = Notification.Name("BorgDockRefreshPush")

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        let userInfo = notification.request.content.userInfo
        if let push = BorgDockPush(userInfo: userInfo) {
            await handleSilent(push)
            if case .activity = push { return [.banner, .list, .sound] }
            return []
        }
        if userInfo["dispatch"] != nil {
            await MainActor.run { AppContext.model?.refreshAfterWrite() }
        }
        return [.banner, .list, .sound]
    }

    /// Also called by the app delegate for silent pushes (`content-available`).
    func handleSilent(_ push: BorgDockPush) async {
        switch push {
        case .read(let ids):
            let model = await AppContext.model
            await model?.activity.readElsewhere(ids)
            await ActivityStore.removeDelivered(.ids(ids))
        case .refresh:
            await MainActor.run { NotificationCenter.default.post(name: Self.refreshPush, object: nil) }
        case .activity:
            let model = await AppContext.model
            await model?.activity.refresh()
        }
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        let content = response.notification.request.content
        let action = response.actionIdentifier
        guard action != UNNotificationDismissActionIdentifier else { return }

        if case .activity(let entryId, _, let target) = BorgDockPush(userInfo: content.userInfo) {
            await open(target, action: action, entryId: entryId)
            return
        }
        guard let data = PushData(userInfo: content.userInfo) else { return }

        switch (action, data) {
        case (UNNotificationDefaultActionIdentifier, .question(let push)), (QuestionActions.openThread, .question(let push)):
            await MainActor.run { AppContext.model?.router.openThread(push.threadId) }
        case (UNNotificationDefaultActionIdentifier, .finished(_, let threadId)):
            await MainActor.run { AppContext.model?.router.openThread(threadId) }
        case (UNNotificationDefaultActionIdentifier, _):
            let itemId = data.itemId
            guard itemId > 0 else { return }
            await MainActor.run { AppContext.model?.router.openItem(itemId) }
        case (NotificationCategories.Action.move, .suggestion(let itemId, let to)):
            await MainActor.run {
                AppContext.model?.router.present(.launch(LaunchContext.move(itemId: itemId, to: to, title: nil)))
            }
        default:
            let userText = (response as? UNTextInputNotificationResponse)?.userText
            guard let api = StoredCredentials.apiClient() else {
                await notify("Sign in to BorgDock first.", itemId: data.itemId)
                return
            }
            let outcome = await NotificationActionHandler(api: api).handle(action: action, userText: userText, data: data)
            switch outcome {
            case .done:
                break
            case .skipped(let message), .failed(let message):
                await notify(message, itemId: data.itemId)
            }
            await MainActor.run { AppContext.model?.refreshAfterWrite() }
        }
    }

    /// An activity entry: the action's screen, else the entry's target. Opening it marks it read.
    @MainActor
    private func open(_ target: ActivityTarget, action: String, entryId: String) async {
        guard let app = AppContext.model else { return }
        Task { await app.activity.readElsewhere([entryId]); _ = try? await app.api.markRead(.ids([entryId])) }
        switch (action, target) {
        case (NotificationCategories.Action.review, .pr(let key)):
            if let key = PrKey(key: key) { app.router.review([key]) }
        case (NotificationCategories.Action.openChecks, .pr(let key)):
            if let key = PrKey(key: key) {
                app.router.openPullRequest(key)
                app.router.present(.checks(key))
            }
        case (NotificationCategories.Action.handToClaude, .pr(let key)):
            app.router.present(.launch(LaunchContext(prKey: key, message: "Fix the failing checks on \(key).", title: "Fix checks on \(key)")))
        case (NotificationCategories.Action.handToClaude, .ci(let groupId)):
            app.router.present(.launch(LaunchContext(ciGroupId: groupId, message: "Investigate this CI failure and fix it.", title: "Investigate CI failure")))
        default:
            guard let route = target.route else { return }
            let tab: Router.Tab = switch target {
            case .pr, .ci, .none: .focus
            case .item, .thread: .dispatch
            }
            app.router.open(route, in: tab)
        }
    }

    /// Says when a quick action didn't do what was asked; tapping it opens the item.
    private func notify(_ message: String, itemId: Int) async {
        let content = UNMutableNotificationContent()
        content.title = "BorgDock"
        content.body = message
        content.categoryIdentifier = NotificationCategories.standard
        content.threadIdentifier = "item-\(itemId)"
        content.userInfo = ["dispatch": ["kind": "waiting", "itemId": itemId]]
        let request = UNNotificationRequest(identifier: "action-result-\(UUID().uuidString)", content: content, trigger: nil)
        try? await UNUserNotificationCenter.current().add(request)
    }
}
