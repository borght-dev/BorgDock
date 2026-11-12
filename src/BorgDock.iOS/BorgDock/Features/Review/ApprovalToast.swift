import SwiftUI
import UIKit

/// "Approving #412 · Posts in 4 s" with a ring counting down and Undo. Shown wherever an approval is waiting:
/// Quick Review (just above its bottom bar), Focus and the pull request list, so leaving the review doesn't hide the
/// clock. Shake to undo works too.
struct ApprovalToast: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let hold = app.focus.hold
        if let pending = hold.current {
            TimelineView(.animation) { context in
                let remaining = pending.remaining(at: context.date)
                let seconds = Int(remaining.rounded(.up))
                HStack(spacing: 11) {
                    CountdownRing(fraction: pending.seconds > 0 ? remaining / pending.seconds : 0, seconds: seconds)
                    VStack(alignment: .leading, spacing: 1) {
                        Text(pending.label).font(.system(size: 14.5, weight: .semibold)).foregroundStyle(BD.text).lineLimit(1)
                        Text(verbatim: "Posts in \(seconds) s")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundStyle(BD.text2)
                            .monospacedDigit()
                    }
                    Spacer(minLength: 8)
                    Button {
                        withAnimation(.snappy) { _ = hold.undo() }
                    } label: {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundStyle(BD.text)
                            .padding(.horizontal, 15)
                            .frame(height: 40)
                            .background(BD.fill2, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
                .padding(.leading, 14)
                .padding(.trailing, 7)
                .frame(height: 54)
                .glassEffect(.regular, in: Capsule())
            }
            .padding(.horizontal, 14)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .onShake { withAnimation(.snappy) { _ = hold.undo() } }
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Undo") { _ = hold.undo() }
        }
    }
}

/// The seconds left inside a ring that empties as they run out.
struct CountdownRing: View {
    let fraction: Double
    let seconds: Int

    var body: some View {
        ZStack {
            Circle().stroke(BD.fill2, lineWidth: 3)
            Circle().trim(from: 0, to: min(1, max(0, fraction))).stroke(BD.green, style: StrokeStyle(lineWidth: 3)).rotationEffect(.degrees(-90))
            Text(verbatim: "\(seconds)").font(.system(size: 11, weight: .semibold)).foregroundStyle(BD.text).monospacedDigit()
        }
        .frame(width: 26, height: 26)
        .accessibilityHidden(true)
    }
}

// MARK: - Shake

extension Notification.Name {
    static let deviceDidShake = Notification.Name("BorgDockDeviceDidShake")
}

extension UIWindow {
    open override func motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        if motion == .motionShake { NotificationCenter.default.post(name: .deviceDidShake, object: nil) }
        super.motionEnded(motion, with: event)
    }
}

extension View {
    func onShake(perform action: @escaping () -> Void) -> some View {
        onReceive(NotificationCenter.default.publisher(for: .deviceDidShake)) { _ in action() }
    }
}
