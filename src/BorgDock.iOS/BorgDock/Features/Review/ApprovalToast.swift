import SwiftUI
import UIKit

/// "Approving #3712… Posts in 3 s · shake to undo" with the countdown bar. Shown wherever an approval is waiting:
/// Quick Review and Focus, so leaving the review doesn't hide the clock.
struct ApprovalToast: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        let hold = app.focus.hold
        if let pending = hold.current {
            TimelineView(.animation) { context in
                let remaining = pending.remaining(at: context.date)
                VStack(spacing: 0) {
                    HStack(spacing: 10) {
                        Image(systemName: "checkmark")
                            .font(.system(size: 17, weight: .bold))
                            .foregroundStyle(Color(hex: 0x5CC98F))
                        VStack(alignment: .leading, spacing: 1) {
                            Text(pending.label).font(.system(size: 15, weight: .semibold))
                            Text(verbatim: "Posts in \(Int(remaining.rounded(.up))) s · shake to undo")
                                .font(.system(size: 13))
                                .foregroundStyle(Color(hex: 0x9C9DA4))
                                .monospacedDigit()
                        }
                        Spacer(minLength: 8)
                        Button {
                            withAnimation(.snappy) { _ = hold.undo() }
                        } label: {
                            Label("Undo", systemImage: "arrow.uturn.backward")
                                .font(.system(size: 15, weight: .semibold))
                                .padding(.horizontal, 16)
                                .frame(height: 38)
                                .background(.white.opacity(0.14), in: Capsule())
                        }
                        .buttonStyle(.plain)
                    }
                    .foregroundStyle(.white)
                    .padding(.leading, 16)
                    .padding(.trailing, 10)
                    .padding(.vertical, 12)
                    GeometryReader { proxy in
                        Rectangle()
                            .fill(Color(hex: 0x7F7EFF))
                            .frame(width: proxy.size.width * (1 - remaining / pending.seconds))
                    }
                    .frame(height: 3)
                    .background(.white.opacity(0.1))
                }
                .background(Color(hex: 0x1F2024), in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: 24, style: .continuous))
                .shadow(color: .black.opacity(0.3), radius: 20, y: 14)
            }
            .padding(.horizontal, 12)
            .transition(.move(edge: .bottom).combined(with: .opacity))
            .onShake { withAnimation(.snappy) { _ = hold.undo() } }
            .accessibilityElement(children: .contain)
            .accessibilityAction(named: "Undo") { _ = hold.undo() }
        }
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
