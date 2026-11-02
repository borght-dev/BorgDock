import Foundation

/// How the notification content extension answers an agent's question. The extension shows the options and sets
/// `extensionContext.notificationActions`; iOS forwards the chosen action to the app, which signs and sends the
/// answer (`POST /api/threads/:id/answers`).
///
/// Identifiers:
///   `answer.option.<index>`  the option at `index` of the push's `options` (one per option)
///   `answer.text`            free text from a text-input action (the same id as `answer.text` in the app)
///   `open.thread`            opens the thread in the app (foreground)
enum QuestionActions {
    static let optionPrefix = "answer.option."
    static let reply = "answer.text"
    static let openThread = "open.thread"

    static func option(_ index: Int) -> String { optionPrefix + String(index) }

    /// The option index of an `answer.option.<index>` identifier, else nil.
    static func optionIndex(_ identifier: String) -> Int? {
        guard identifier.hasPrefix(optionPrefix) else { return nil }
        return Int(identifier.dropFirst(optionPrefix.count))
    }
}

/// The question as the content extension reads it from `userInfo["dispatch"]` (api.ts `PushData` kind
/// `question`), plus the optional fields BorgDock adds: each option's `description` (the agent's reason), the
/// question text and a context line. Without them the extension falls back to the alert's title and body.
struct NotificationQuestion: Decodable, Hashable, Sendable {
    struct Option: Decodable, Hashable, Sendable {
        let label: String
        let value: String
        let description: String?
    }

    let itemId: Int?
    let threadId: String
    let options: [Option]
    let recommended: Int?
    let allowCustomAnswer: Bool
    let question: String?
    /// "AB#61044 · Offline basket · mac-mini"
    let context: String?

    init?(userInfo: [AnyHashable: Any]) {
        guard let raw = userInfo["dispatch"],
              JSONSerialization.isValidJSONObject(raw),
              let data = try? JSONSerialization.data(withJSONObject: raw),
              let decoded = try? JSONDecoder().decode(NotificationQuestion.self, from: data),
              !decoded.options.isEmpty
        else { return nil }
        self = decoded
    }

    private enum CodingKeys: String, CodingKey {
        case kind, itemId, threadId, options, recommended, allowCustomAnswer, question, context
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        guard try container.decode(String.self, forKey: .kind) == "question" else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: container, debugDescription: "Not a question")
        }
        itemId = try container.decodeIfPresent(Int.self, forKey: .itemId)
        threadId = try container.decode(String.self, forKey: .threadId)
        options = try container.decode([Option].self, forKey: .options)
        recommended = try container.decodeIfPresent(Int.self, forKey: .recommended)
        allowCustomAnswer = try container.decodeIfPresent(Bool.self, forKey: .allowCustomAnswer) ?? false
        question = try container.decodeIfPresent(String.self, forKey: .question)
        context = try container.decodeIfPresent(String.self, forKey: .context)
    }

    /// The option to preselect: the recommended one, else the first.
    var initialSelection: Int {
        if let recommended, options.indices.contains(recommended) { return recommended }
        return 0
    }

    /// "Answer: IndexedDB": the option's label up to " via " or the first parenthesis, so the button stays short.
    static func shortLabel(_ label: String) -> String {
        var short = label
        for separator in [" via ", " (", " — ", ": "] {
            if let range = short.range(of: separator) { short = String(short[..<range.lowerBound]) }
        }
        return short.trimmingCharacters(in: .whitespaces)
    }
}
