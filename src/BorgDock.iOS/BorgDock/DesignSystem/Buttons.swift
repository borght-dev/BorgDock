import SwiftUI

struct PaperButtonStyle: ButtonStyle {
    enum Kind { case primary, secondary }
    enum Size { case compact, large }

    var kind: Kind = .primary
    var size: Size = .compact
    var isBusy = false

    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .appFont(12, weight: .medium, relativeTo: .subheadline)
            .lineLimit(1)
            .minimumScaleFactor(0.75)
            .padding(.horizontal, size == .compact ? 11 : 14)
            .padding(.vertical, size == .compact ? 7 : 13)
            .frame(maxWidth: size == .large ? .infinity : nil)
            .foregroundStyle(kind == .primary ? Color.white : Palette.inkSoft)
            .opacity(isBusy ? 0 : 1)
            .overlay {
                if isBusy {
                    ProgressView().tint(kind == .primary ? .white : Palette.accent)
                }
            }
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(kind == .primary ? Palette.accent : Palette.paper)
            }
            .overlay {
                RoundedRectangle(cornerRadius: 6)
                    .strokeBorder(kind == .primary ? Palette.accent : Palette.line, lineWidth: 1)
            }
            .contentShape(Rectangle())
            .opacity(isEnabled ? (configuration.isPressed ? 0.75 : 1) : 0.4)
    }
}

struct ConsoleButtonStyle: ButtonStyle {
    var isBusy = false
    @Environment(\.isEnabled) private var isEnabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.body.weight(.semibold))
            .foregroundStyle(Color.white)
            .opacity(isBusy ? 0 : 1)
            .overlay { if isBusy { ProgressView().tint(.white) } }
            .padding(.vertical, 14)
            .frame(maxWidth: .infinity)
            .background(RoundedRectangle(cornerRadius: 6).fill(Palette.accent))
            .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.5)
    }
}

extension ButtonStyle where Self == PaperButtonStyle {
    static func paper(_ kind: PaperButtonStyle.Kind = .primary, size: PaperButtonStyle.Size = .compact, busy: Bool = false) -> PaperButtonStyle {
        PaperButtonStyle(kind: kind, size: size, isBusy: busy)
    }
}
