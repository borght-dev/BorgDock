import AppIntents
import Foundation

// App Intents shared by the app and the widget extension (not the notification extension): the Action button and
// the Control Center control open the quick note, the agent Live Activity's Stop button settles the thread, and the
// approval Live Activity's Undo takes back a held approval.

/// Opens the quick note sheet: the desktop's Ctrl+F8. Offered to the Action button through `BorgDockShortcuts`.
struct QuickNoteIntent: AppIntent {
    static let title: LocalizedStringResource = "Quick note"
    static let description = IntentDescription("Write a note into today's daily note, linked to what you last opened.")

    init() {}

    func perform() async throws -> some IntentResult & OpensIntent {
        .result(opensIntent: OpenURLIntent(BorgDockLink.capture))
    }
}

/// The Stop button on an agent's Live Activity. iOS runs a `LiveActivityIntent` in the app's process, where
/// `AgentStopper.handler` sends the signed settle.
struct StopAgentIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Stop the agent"
    static let isDiscoverable = false

    @Parameter(title: "Thread")
    var threadId: String

    init() {}

    init(threadId: String) {
        self.threadId = threadId
    }

    func perform() async throws -> some IntentResult {
        try await AgentStopper.stop(threadId)
        return .result()
    }
}

/// Set by the app at launch; nil in the widget extension, which never performs `StopAgentIntent` itself.
@MainActor
enum AgentStopper {
    static var handler: (@MainActor (String) async throws -> Void)?

    static func stop(_ threadId: String) async throws {
        guard let handler else { throw StopError.unavailable }
        try await handler(threadId)
    }

    enum StopError: LocalizedError {
        case unavailable
        var errorDescription: String? { "Open BorgDock to stop the agent." }
    }
}

/// Undo on the approval Live Activity. The app is alive during the five-second window, so iOS runs the intent in
/// its process, where `ApprovalUndoer.handler` takes the approval back before it posts.
struct UndoApprovalIntent: LiveActivityIntent {
    static let title: LocalizedStringResource = "Undo the approval"
    static let isDiscoverable = false

    @Parameter(title: "Approval")
    var holdId: String

    init() {}

    init(holdId: String) {
        self.holdId = holdId
    }

    func perform() async throws -> some IntentResult {
        try await ApprovalUndoer.undo(holdId)
        return .result()
    }
}

/// Set by the app at launch; nil in the widget extension, which never performs `UndoApprovalIntent` itself.
@MainActor
enum ApprovalUndoer {
    /// False when the approval already posted (or was undone in the app).
    static var handler: (@MainActor (String) -> Bool)?

    static func undo(_ holdId: String) async throws {
        guard let handler else { throw UndoError.unavailable }
        guard handler(holdId) else { throw UndoError.alreadyPosted }
    }

    enum UndoError: LocalizedError {
        case unavailable, alreadyPosted
        var errorDescription: String? {
            switch self {
            case .unavailable: "Open BorgDock to undo the approval."
            case .alreadyPosted: "The approval already posted."
            }
        }
    }
}
