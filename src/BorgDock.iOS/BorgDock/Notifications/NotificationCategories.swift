import UserNotifications

// Notification categories and the action identifiers the app handles (shared/src/borgdock.ts, "Push").
// The notification content extension must use these exact identifiers:
//
//   Category                        Actions (identifier → what the app does)
//   BORGDOCK_QUESTION               answer.recommended → signed answer with the recommended option
//                                   answer.text        → signed answer with the typed text (UNTextInputNotificationResponse)
//                                   answer.option.<n>  → signed answer with option n (0-based, `QuestionPush.options`);
//                                                        the content extension adds one per option at runtime
//   BORGDOCK_QUESTION_RECOMMENDED   answer.recommended, answer.option.<n>
//   BORGDOCK_QUESTION_TEXT          answer.text, answer.option.<n>
//   BORGDOCK_SUGGESTION             move        → opens the app on the run sheet for that move (BorgDock never moves
//                                                 an ADO state from a button; an agent does it with the repo's skills)
//   BORGDOCK_PR                     pr.review   → opens Quick Review of the pull request
//                                   pr.open     → opens the pull request
//   BORGDOCK_CI                     ci.checks   → opens the pull request's checks
//                                   ci.claude   → opens Start an agent on the failure
//   BORGDOCK_DEFAULT                (none; tapping opens the target)
//
// Every action that writes requires an unlocked phone: answering a full-access agent from the lock screen isn't allowed.
enum NotificationCategories {
    static let question = "BORGDOCK_QUESTION"
    static let questionRecommended = "BORGDOCK_QUESTION_RECOMMENDED"
    static let questionText = "BORGDOCK_QUESTION_TEXT"
    static let suggestion = "BORGDOCK_SUGGESTION"
    static let pullRequest = "BORGDOCK_PR"
    static let ci = "BORGDOCK_CI"
    static let standard = "BORGDOCK_DEFAULT"

    enum Action {
        static let answerRecommended = "answer.recommended"
        static let answerText = "answer.text"
        /// `answer.option.<index>`, added per option by the content extension.
        static let answerOptionPrefix = "answer.option."
        static let move = "move"
        static let review = "pr.review"
        static let openPullRequest = "pr.open"
        static let openChecks = "ci.checks"
        static let handToClaude = "ci.claude"

        static func answerOption(_ index: Int) -> String { answerOptionPrefix + String(index) }

        /// The option index of an `answer.option.<n>` identifier.
        static func optionIndex(_ identifier: String) -> Int? {
            guard identifier.hasPrefix(answerOptionPrefix) else { return nil }
            return Int(identifier.dropFirst(answerOptionPrefix.count))
        }
    }

    static var all: Set<UNNotificationCategory> {
        let recommended = UNNotificationAction(identifier: Action.answerRecommended, title: "Use recommended answer", options: [.authenticationRequired])
        let text = UNTextInputNotificationAction(
            identifier: Action.answerText,
            title: "Answer…",
            options: [.authenticationRequired],
            textInputButtonTitle: "Send",
            textInputPlaceholder: "Your answer"
        )
        let move = UNNotificationAction(identifier: Action.move, title: "Move in ADO", options: [.authenticationRequired, .foreground])
        let review = UNNotificationAction(identifier: Action.review, title: "Review", options: [.foreground])
        let open = UNNotificationAction(identifier: Action.openPullRequest, title: "Open", options: [.foreground])
        let checks = UNNotificationAction(identifier: Action.openChecks, title: "Open checks", options: [.foreground])
        let claude = UNNotificationAction(identifier: Action.handToClaude, title: "Hand to Claude", options: [.authenticationRequired, .foreground])
        return [
            UNNotificationCategory(identifier: question, actions: [recommended, text], intentIdentifiers: []),
            UNNotificationCategory(identifier: questionRecommended, actions: [recommended], intentIdentifiers: []),
            UNNotificationCategory(identifier: questionText, actions: [text], intentIdentifiers: []),
            UNNotificationCategory(identifier: suggestion, actions: [move], intentIdentifiers: []),
            UNNotificationCategory(identifier: pullRequest, actions: [review, open], intentIdentifiers: []),
            UNNotificationCategory(identifier: ci, actions: [checks, claude], intentIdentifiers: []),
            UNNotificationCategory(identifier: standard, actions: [], intentIdentifiers: []),
        ]
    }
}
