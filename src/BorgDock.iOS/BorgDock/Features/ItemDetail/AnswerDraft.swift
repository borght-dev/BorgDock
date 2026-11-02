import Foundation

/// Koen's picks for one round of agent questions. Recommended options start selected.
struct AnswerDraft: Equatable {
    struct Choice: Equatable {
        var picked: Set<Int> = []
        var custom = false
        var customText = ""
    }

    let requestId: String
    private(set) var choices: [String: Choice]

    init(requestId: String, questions: [AgentQuestion]) {
        self.requestId = requestId
        var choices: [String: Choice] = [:]
        for question in questions {
            var choice = Choice()
            if let recommended = question.recommended, question.options.indices.contains(recommended) {
                choice.picked = [recommended]
            }
            choices[question.id] = choice
        }
        self.choices = choices
    }

    func choice(for question: AgentQuestion) -> Choice {
        choices[question.id] ?? Choice()
    }

    mutating func pick(_ index: Int, in question: AgentQuestion) {
        var choice = choice(for: question)
        if question.multiSelect {
            if choice.picked.contains(index) { choice.picked.remove(index) } else { choice.picked.insert(index) }
        } else {
            choice.picked = [index]
            choice.custom = false
        }
        choices[question.id] = choice
    }

    mutating func pickCustom(in question: AgentQuestion) {
        var choice = choice(for: question)
        if question.multiSelect {
            choice.custom.toggle()
        } else {
            choice.custom = true
            choice.picked = []
        }
        choices[question.id] = choice
    }

    mutating func setCustomText(_ text: String, for question: AgentQuestion) {
        var choice = choice(for: question)
        choice.customText = text
        choices[question.id] = choice
    }

    /// Each question's `options[i].value` (never the label) or free text, keyed by question id.
    /// Nil until every question has an answer.
    func answers(for questions: [AgentQuestion]) -> [String: AnswerValue]? {
        var answers: [String: AnswerValue] = [:]
        for question in questions {
            let choice = choice(for: question)
            let custom = choice.customText.trimmingCharacters(in: .whitespacesAndNewlines)
            let values = choice.picked.sorted().compactMap { question.options.indices.contains($0) ? question.options[$0].value : nil }
            if question.multiSelect {
                let all = values + (choice.custom && !custom.isEmpty ? [custom] : [])
                guard !all.isEmpty else { return nil }
                answers[question.id] = .multiple(all)
            } else if choice.custom {
                guard !custom.isEmpty else { return nil }
                answers[question.id] = .single(custom)
            } else {
                guard let value = values.first else { return nil }
                answers[question.id] = .single(value)
            }
        }
        return answers
    }
}
