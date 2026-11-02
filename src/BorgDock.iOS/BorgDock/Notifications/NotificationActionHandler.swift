import Foundation

/// Turns an answer action on an agent's question into the signed API call. No UI, so it runs from the lock screen
/// (after unlocking) and in unit tests. Actions that open the app are routed by NotificationController.
struct NotificationActionHandler: Sendable {
    let api: APIClient

    enum Outcome: Equatable, Sendable {
        case done(String)
        /// Nothing was sent; the message says what to do instead.
        case skipped(String)
        case failed(String)
    }

    func handle(action: String, userText: String?, data: PushData) async -> Outcome {
        guard case .question(let push) = data else {
            return .skipped("Open BorgDock to act on \(data.itemId).")
        }
        switch action {
        case NotificationCategories.Action.answerRecommended:
            guard let index = push.recommended, push.options.indices.contains(index) else {
                return .skipped("\(push.itemId) has no recommended answer. Open BorgDock to answer.")
            }
            return await answer(push, with: push.options[index].value)

        case NotificationCategories.Action.answerText:
            guard push.allowCustomAnswer else {
                return .skipped("\(push.itemId) needs one of the agent's options. Open BorgDock to answer.")
            }
            let text = userText?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            guard !text.isEmpty else { return .skipped("The answer was empty, so nothing was sent.") }
            return await answer(push, with: text)

        default:
            guard let index = NotificationCategories.Action.optionIndex(action), push.options.indices.contains(index) else {
                return .skipped("Open BorgDock to act on \(push.itemId).")
            }
            return await answer(push, with: push.options[index].value)
        }
    }

    private func answer(_ push: QuestionPush, with value: String) async -> Outcome {
        do {
            _ = try await api.answer(threadId: push.threadId, AnswerRequest(requestId: push.requestId, answers: [push.questionId: .single(value)]))
            return .done("Answer sent to \(push.itemId)")
        } catch {
            return .failed("Couldn't answer \(push.itemId): \(error.localizedDescription)")
        }
    }
}

/// The stored server, token and device key, readable outside the main actor for notification actions.
enum StoredCredentials {
    static func apiClient() -> APIClient? {
        let server = ServerSettings.current()
        guard let token = LaunchOverrides.token ?? KeychainTokenStore().token(for: server) else { return nil }
        let signer = (try? DeviceKey.loadOrCreate()).map { DeviceRequestSigner(key: $0) }
        return APIClient(baseURL: server, token: token, signer: signer)
    }
}
