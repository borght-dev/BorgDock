import SwiftUI
import UIKit
import UserNotifications
import UserNotificationsUI

/// Shows an agent's question with its options and the agent's reasons when a BorgDock notification is expanded.
/// Tapping an option selects it; the actions under the card answer with the selected option, reply with text, or
/// open the thread. iOS forwards the action to the app, which signs and sends the answer (`QuestionActions`).
final class NotificationViewController: UIViewController, UNNotificationContentExtension {
    private var host: UIHostingController<QuestionCardView>?
    private let model = QuestionCardModel()

    override func viewDidLoad() {
        super.viewDidLoad()
        let host = UIHostingController(rootView: QuestionCardView(model: model))
        host.view.backgroundColor = .clear
        host.sizingOptions = [.preferredContentSize]
        addChild(host)
        view.addSubview(host.view)
        host.view.translatesAutoresizingMaskIntoConstraints = false
        NSLayoutConstraint.activate([
            host.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            host.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            host.view.topAnchor.constraint(equalTo: view.topAnchor),
            host.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        host.didMove(toParent: self)
        self.host = host
        model.onSelect = { [weak self] _ in self?.updateActions() }
    }

    override func preferredContentSizeDidChange(forChildContentContainer container: any UIContentContainer) {
        super.preferredContentSizeDidChange(forChildContentContainer: container)
        preferredContentSize = CGSize(width: view.bounds.width, height: container.preferredContentSize.height)
    }

    func didReceive(_ notification: UNNotification) {
        let content = notification.request.content
        model.card = NotificationQuestion(userInfo: content.userInfo)
        model.fallbackContext = content.title
        model.fallbackQuestion = content.body
        model.selection = model.card?.initialSelection ?? 0
        updateActions()
    }

    private func updateActions() {
        guard let card = model.card else { return }
        var actions: [UNNotificationAction] = []
        if card.options.indices.contains(model.selection) {
            let option = card.options[model.selection]
            actions.append(UNNotificationAction(
                identifier: QuestionActions.option(model.selection),
                title: "Answer: \(NotificationQuestion.shortLabel(option.label))",
                options: [.authenticationRequired],
                icon: UNNotificationActionIcon(systemImageName: "checkmark")
            ))
        }
        if card.allowCustomAnswer {
            actions.append(UNTextInputNotificationAction(
                identifier: QuestionActions.reply,
                title: "Reply…",
                options: [.authenticationRequired],
                icon: UNNotificationActionIcon(systemImageName: "bubble.left"),
                textInputButtonTitle: "Send",
                textInputPlaceholder: "Your answer"
            ))
        }
        actions.append(UNNotificationAction(
            identifier: QuestionActions.openThread,
            title: "Open the thread",
            options: [.foreground],
            icon: UNNotificationActionIcon(systemImageName: "arrow.up.forward.square")
        ))
        extensionContext?.notificationActions = actions
    }
}
