import AppIntents
import SwiftUI
import WidgetKit
#if canImport(ActivityKit)
import ActivityKit
#endif

// The approval countdown's views, shared by the widget extension and the app's DEBUG gallery. `pauseAt` freezes
// the clock for gallery screenshots; the activity itself always runs live.

private let approvedGreen = Color(hex: 0x5CC98F)
private let undoIndigo = Color(hex: 0x7F7EFF)

/// "0:03" until the review posts.
struct ApprovalCountdown: View {
    let state: ApprovalActivityState
    var pauseAt: Date?
    var size: CGFloat = 15

    var body: some View {
        Text(timerInterval: state.window, pauseTime: pauseAt, countsDown: true, showsHours: false)
            .font(.system(size: size, weight: .semibold))
            .monospacedDigit()
            .multilineTextAlignment(.trailing)
    }
}

/// The Undo window filling up, like the in-app toast's bar.
struct ApprovalCountdownBar: View {
    let state: ApprovalActivityState
    var pauseAt: Date?
    var track: Color = .white.opacity(0.18)

    var body: some View {
        Group {
            if let pauseAt {
                let total = state.postsAt.timeIntervalSince(state.startedAt)
                ProgressView(value: total > 0 ? min(max(pauseAt.timeIntervalSince(state.startedAt) / total, 0), 1) : 1)
            } else {
                ProgressView(timerInterval: state.window, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
            }
        }
        .progressViewStyle(.linear)
        .tint(undoIndigo)
        .background(track, in: Capsule())
        .accessibilityHidden(true)
    }
}

/// The Undo button: runs `UndoApprovalIntent` in the app's process.
struct ApprovalUndoButton: View {
    let holdId: String
    var height: CGFloat = 44
    var background: Color = .white.opacity(0.16)
    var foreground: Color = .white

    var body: some View {
        Button(intent: UndoApprovalIntent(holdId: holdId)) {
            Label("Undo", systemImage: "arrow.uturn.backward")
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(foreground)
                .padding(.horizontal, 18)
                .frame(maxWidth: .infinity)
                .frame(height: height)
                .background(background, in: Capsule())
        }
        .buttonStyle(.plain)
    }
}

#if canImport(ActivityKit)
/// Compact, leading: "✓ Approving", left of the camera.
struct ApprovalCompactLeading: View {
    let state: ApprovalActivityState

    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: "checkmark")
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(approvedGreen)
            Text(state.phase == .posted ? "Approved" : "Approving")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(.white)
                .fixedSize()
        }
    }
}

/// Compact, trailing: "#3712 Undo", right of the camera. Tapping the compact island opens the app with the undo link.
struct ApprovalCompactTrailing: View {
    let attributes: ApprovalActivityAttributes
    let state: ApprovalActivityState

    var body: some View {
        HStack(spacing: 8) {
            Text(verbatim: "#\(attributes.number)").foregroundStyle(.white)
            if state.phase == .holding {
                Text("Undo").foregroundStyle(undoIndigo)
            } else {
                Image(systemName: "checkmark.circle.fill").foregroundStyle(approvedGreen)
            }
        }
        .font(.system(size: 14, weight: .semibold))
        .lineLimit(1)
        .padding(.trailing, 4)
    }
}

/// Minimal: the countdown as a ring around the check.
struct ApprovalMinimal: View {
    let state: ApprovalActivityState
    var pauseAt: Date?

    var body: some View {
        ZStack {
            if let pauseAt, state.phase == .holding {
                // Outside a widget a circular ProgressView spins, so the frozen ring is drawn.
                let total = state.postsAt.timeIntervalSince(state.startedAt)
                let fraction = total > 0 ? min(max(pauseAt.timeIntervalSince(state.startedAt) / total, 0), 1) : 1
                Circle().stroke(.white.opacity(0.18), lineWidth: 2.5)
                Circle().trim(from: 0, to: fraction)
                    .stroke(approvedGreen, style: StrokeStyle(lineWidth: 2.5, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            } else if state.phase == .holding {
                ProgressView(timerInterval: state.window, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                    .progressViewStyle(.circular)
                    .tint(approvedGreen)
            }
            Image(systemName: "checkmark").font(.system(size: 9, weight: .heavy)).foregroundStyle(approvedGreen)
        }
    }
}

/// Expanded, centre: "Approving #3712" over the pull request's title.
struct ApprovalIslandTitle: View {
    let attributes: ApprovalActivityAttributes
    let state: ApprovalActivityState

    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text(state.phase == .posted ? "Approved #\(attributes.number)" : attributes.label)
                .font(.system(size: 17, weight: .bold))
                .foregroundStyle(.white)
            Text(attributes.title ?? (state.phase == .posted ? "GitHub has the review" : "Undo takes it back"))
                .font(.system(size: 14))
                .foregroundStyle(.white.opacity(0.6))
        }
        .lineLimit(1)
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.top, 2)
    }
}

/// Expanded, bottom: the bar and Undo (the countdown is on the trailing side).
struct ApprovalIslandBottom: View {
    let attributes: ApprovalActivityAttributes
    let state: ApprovalActivityState
    var pauseAt: Date?

    var body: some View {
        VStack(spacing: 8) {
            if state.phase == .holding {
                ApprovalCountdownBar(state: state, pauseAt: pauseAt)
                ApprovalUndoButton(holdId: attributes.holdId, height: 38)
            } else {
                Text("GitHub has the review.")
                    .font(.system(size: 15))
                    .foregroundStyle(.white.opacity(0.75))
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 4)
        .padding(.top, 2)
    }
}

/// The lock screen: the in-app toast's layout on the activity background.
struct ApprovalLockScreenView: View {
    let attributes: ApprovalActivityAttributes
    let state: ApprovalActivityState
    var pauseAt: Date?

    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 12) {
                Image(systemName: "checkmark")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(approvedGreen)
                VStack(alignment: .leading, spacing: 2) {
                    Text(state.phase == .posted ? "Approved #\(attributes.number)" : "\(attributes.label)…")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundStyle(BD.text)
                    if state.phase == .holding {
                        HStack(spacing: 4) {
                            Text("Posts in")
                            ApprovalCountdown(state: state, pauseAt: pauseAt, size: 14)
                        }
                        .font(.system(size: 14))
                        .foregroundStyle(BD.text2)
                    } else if let title = attributes.title {
                        Text(title).font(.system(size: 14)).foregroundStyle(BD.text2).lineLimit(1)
                    }
                }
                Spacer(minLength: 8)
                if state.phase == .holding {
                    ApprovalUndoButton(holdId: attributes.holdId, height: 38, background: BD.fill2, foreground: BD.text)
                        .fixedSize()
                }
            }
            if state.phase == .holding {
                ApprovalCountdownBar(state: state, pauseAt: pauseAt, track: BD.fill2)
            }
        }
    }
}
#endif
