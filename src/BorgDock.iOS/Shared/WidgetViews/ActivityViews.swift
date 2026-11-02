import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

// Views shared by the widget extension and the app (the app renders them in its DEBUG gallery for screenshots).

/// How long the agent has run, counting up; the outcome once it settles.
struct AgentTimer: View {
    let state: AgentActivityState
    var size: CGFloat = 17

    var body: some View {
        Group {
            switch state.status {
            case .done:
                Image(systemName: "checkmark.circle.fill").foregroundStyle(Color(hex: 0x5CC98F))
            case .failed:
                Image(systemName: "xmark.circle.fill").foregroundStyle(Color(hex: 0xF0616D))
            case .waiting:
                Image(systemName: "hand.raised.fill").foregroundStyle(Color(hex: 0xE5B454))
            case .running:
                Text(timerInterval: state.startDate...Date.distantFuture, countsDown: false)
                    .monospacedDigit()
                    .multilineTextAlignment(.trailing)
                    .foregroundStyle(BD.brandIndigo)
                    .frame(maxWidth: size * 3.6, alignment: .trailing)
            }
        }
        .font(.system(size: size, weight: .semibold))
    }
}

/// One segment per step: done steps full, the current one half full.
struct StepBar: View {
    let state: AgentActivityState
    var track: Color = BD.fill2

    var body: some View {
        let count = max(state.stepCount, 1)
        let current = min(max(state.stepIndex, 1), count)
        HStack(spacing: 6) {
            ForEach(1...count, id: \.self) { index in
                GeometryReader { proxy in
                    ZStack(alignment: .leading) {
                        Capsule().fill(track)
                        Capsule().fill(BD.brandIndigo)
                            .frame(width: proxy.size.width * fill(index: index, current: current))
                    }
                }
                .frame(height: 6)
            }
        }
        .accessibilityElement()
        .accessibilityLabel(state.stepLabel)
    }

    private func fill(index: Int, current: Int) -> CGFloat {
        if state.isSettled || index < current { return 1 }
        return index == current ? 0.5 : 0
    }
}

/// The lock screen card: what the agent does now, the timer and the steps.
struct AgentLockScreenView: View {
    let attributes: AgentActivityAttributes
    let state: AgentActivityState

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                BDMark().fill(BD.brandIndigo).frame(width: 16, height: 16)
                Text(header)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                Spacer(minLength: 6)
                Text(attributes.machine)
                    .font(.system(size: 14))
                    .foregroundStyle(BD.text2)
                    .lineLimit(1)
            }
            HStack {
                Text(stepText)
                    .font(.system(size: 19, weight: .semibold))
                    .foregroundStyle(BD.text)
                    .lineLimit(1)
                Spacer(minLength: 6)
                AgentTimer(state: state, size: 19)
            }
            StepBar(state: state)
        }
    }

    /// "AB#60988 · Refund email sent twice"
    private var header: String {
        [attributes.itemId.map { "AB#\($0)" }, attributes.title].compactMap { $0 }.joined(separator: " · ")
    }

    private var stepText: String {
        switch state.status {
        case .done: "Done"
        case .failed: "Stopped: \(state.step)"
        case .waiting: "Waiting on you"
        case .running: state.step
        }
    }
}

/// Finished checks as a ring: green for passed, red for failed, the rest still running.
struct ChecksRing: View {
    let state: ChecksActivityState
    var size: CGFloat = 20
    var lineWidth: CGFloat = 3

    var body: some View {
        let total = Double(max(state.total, 1))
        let failed = Double(state.failed) / total
        let passed = Double(state.finished - state.failed) / total
        ZStack {
            Circle().stroke(.white.opacity(0.18), lineWidth: lineWidth)
            Circle().trim(from: 0, to: failed)
                .stroke(Color(hex: 0xF0616D), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
            Circle().trim(from: failed, to: failed + passed)
                .stroke(Color(hex: 0x5CC98F), style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
        }
        .rotationEffect(.degrees(-90))
        .frame(width: size, height: size)
        .accessibilityLabel(ChecksLockScreenView.summary(state))
    }
}

struct ChecksLockScreenView: View {
    let attributes: ChecksActivityAttributes
    let state: ChecksActivityState

    var body: some View {
        HStack(spacing: 14) {
            ChecksRing(state: state, size: 38, lineWidth: 5)
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 6) {
                    BDMark().fill(BD.brandIndigo).frame(width: 14, height: 14)
                    Text(verbatim: "#\(attributes.number) · \(attributes.title)")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(BD.text)
                        .lineLimit(1)
                }
                Text(Self.summary(state))
                    .font(.system(size: 15))
                    .foregroundStyle(state.failed > 0 ? BD.red : BD.text2)
            }
            Spacer(minLength: 4)
            Text("\(state.finished)/\(state.total)")
                .font(.system(size: 19, weight: .semibold))
                .monospacedDigit()
                .foregroundStyle(BD.text)
        }
    }

    /// "16 of 18 done · 1 failing"
    static func summary(_ state: ChecksActivityState) -> String {
        var text = state.pending > 0 ? "\(state.finished) of \(state.total) done" : "All \(state.total) done"
        if state.failed > 0 { text += " · \(state.failed) failing" }
        return text
    }
}

// MARK: - Dynamic Island regions

/// Expanded, centre: "AB#60988 · mac-mini" over the title.
struct IslandTitle: View {
    let context: String
    let title: String

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(context).font(.system(size: 14)).foregroundStyle(.white.opacity(0.6))
            Text(title).font(.system(size: 17, weight: .bold)).foregroundStyle(.white)
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 6)
    }
}

/// Expanded, bottom: the step, the steps bar, Open thread and Stop.
struct AgentIslandBottom: View {
    let threadId: String
    let state: AgentActivityState

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(state.step).foregroundStyle(.white)
                Spacer()
                Text(state.stepLabel).foregroundStyle(.white.opacity(0.55))
            }
            .font(.system(size: 15))
            .lineLimit(1)
            StepBar(state: state, track: .white.opacity(0.18))
            HStack(spacing: 12) {
                Link(destination: BorgDockLink.thread(threadId)) {
                    Text("Open thread")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 44)
                        .background(.white.opacity(0.16), in: Capsule())
                }
                if !state.isSettled {
                    Button(intent: StopAgentIntent(threadId: threadId)) {
                        Text("Stop")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundStyle(Color(hex: 0xF0616D))
                            .frame(maxWidth: .infinity)
                            .frame(height: 44)
                            .background(Color(hex: 0xF0616D).opacity(0.18), in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.top, 4)
        }
        .padding(.horizontal, 4)
        .padding(.top, 6)
    }
}

/// "16/18": checks finished of all.
struct ChecksCount: View {
    let state: ChecksActivityState
    var size: CGFloat = 15

    var body: some View {
        Text("\(state.finished)/\(state.total)")
            .font(.system(size: size, weight: .semibold))
            .monospacedDigit()
            .foregroundStyle(.white)
    }
}
