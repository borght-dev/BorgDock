import SwiftUI

/// An agent (a T3 thread) on a pull request or work item: a status dot, its title, one line, and a pill that opens the
/// thread in T3 Code. The row's own tap belongs to the caller (it opens the PR or the item); the pill never navigates
/// inside BorgDock. Mockup: design/ios-flow/mockups.html, Focus "Agents" and the PR page.
struct AgentRow: View {
    let thread: ThreadSummary
    /// What the agent works on, set in the line's emphasis: "#412 Round totals per line". Nil: where it runs.
    var subject: String? = nil

    var body: some View {
        HStack(spacing: 11) {
            dot.frame(width: 10).padding(.top, -16)
            VStack(alignment: .leading, spacing: 3) {
                Text(thread.title)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                line
                    .font(.system(size: 12.5))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
            }
            Spacer(minLength: 8)
            T3Pill(thread: thread)
        }
        .padding(.leading, 16)
        .padding(.trailing, 10)
        .padding(.vertical, 10)
        .frame(minHeight: 62)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    @ViewBuilder
    private var dot: some View {
        switch AgentRow.tone(thread) {
        case .run: PulseDot(color: BD.blue, size: 8)
        case .warn: Circle().fill(BD.yellow).frame(width: 8, height: 8)
        case .bad: Circle().fill(BD.red).frame(width: 8, height: 8)
        case .ok: Circle().fill(BD.green).frame(width: 8, height: 8)
        case .mute: Circle().fill(BD.text3).frame(width: 8, height: 8)
        }
    }

    private var line: some View {
        HStack(spacing: 5) {
            if let icon = AgentRow.lineIcon(thread, hasSubject: subject != nil) {
                Image(systemName: icon).font(.system(size: 11.5, weight: .semibold))
            }
            Text(AgentRow.line(thread, subject: subject))
        }
    }

    /// The dot's tone: blue while it runs, yellow while it waits on you, red when it failed, grey once settled.
    static func tone(_ thread: ThreadSummary) -> Tone {
        switch thread.status {
        case .running: .run
        case .question, .plan, .approval, .yourTurn: .warn
        case .failed: .bad
        case .settled, .unknown: .mute
        }
    }

    static func lineIcon(_ thread: ThreadSummary, hasSubject: Bool) -> String? {
        switch thread.status {
        case .question: "questionmark.circle"
        case .running where hasSubject: "arrow.triangle.pull"
        default: nil
        }
    }

    /// "#412 Round totals per line · 4 min", "Asks 1 question · #398", "Agent running 4 min · mac-mini".
    static func line(_ thread: ThreadSummary, subject: String?, now: Date = .now) -> AttributedString {
        let age = ShortTime.age(thread.lastActivityAt, now: now)
        var result = AttributedString()
        func emphasis(_ text: String) {
            var part = AttributedString(text)
            part.foregroundColor = BD.text
            part.font = .system(size: 12.5, weight: .medium)
            result += part
        }
        switch thread.status {
        case .question:
            let count = max(1, thread.questions.count)
            result += AttributedString("Asks \(count) question\(count == 1 ? "" : "s")")
            if let subject { result += AttributedString(" · "); emphasis(subject) }
        case .running:
            if let subject {
                emphasis(subject)
                result += AttributedString(" · \(age)")
            } else {
                result += AttributedString("Agent running \(age)")
                let place = thread.environmentLabel ?? thread.worktree
                if !place.isEmpty { result += AttributedString(" · \(place)") }
            }
        default:
            let state = thread.needsYouLabel ?? thread.status.sentence
            result += AttributedString("\(state) \(age)")
            if let subject { result += AttributedString(" · "); emphasis(subject) }
        }
        return result
    }
}

/// "T3" (or "Answer" while the agent asks something): opens the thread in T3 Code, else T3's web UI.
struct T3Pill: View {
    let thread: ThreadSummary

    var body: some View {
        let asks = thread.status == .question
        Button { T3Link.open(thread) } label: {
            HStack(spacing: 5) {
                Image(systemName: "arrow.up.right.square").font(.system(size: 13, weight: .semibold))
                Text(asks ? "Answer" : "T3")
            }
            .font(.system(size: 13.5, weight: .semibold))
            .foregroundStyle(asks ? BD.yellow : BD.text)
            .padding(.horizontal, 12)
            .frame(height: 34)
            .background(asks ? BD.yellowSoft : BD.fill2, in: Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(asks ? "Answer in T3 Code" : "Open in T3 Code")
    }
}
