import SwiftUI

struct LampDot: View {
    let color: Color
    var size: CGFloat = 10

    var body: some View {
        Circle().fill(color).frame(width: size, height: size)
    }
}

/// The pulsing green dot for a running agent.
struct LiveDot: View {
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .fill(Palette.liveGreen)
            .frame(width: 7, height: 7)
            .opacity(dim ? 0.25 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.8).repeatForever(autoreverses: true)) { dim = true }
            }
            .accessibilityHidden(true)
    }
}

struct BrandMark: View {
    var body: some View {
        VStack(spacing: 3) {
            Palette.accent.frame(height: 6)
            Color(hex: 0x79A299).frame(height: 6)
            Color(hex: 0xBED4CE).frame(height: 6)
        }
        .frame(width: 24, height: 26)
        .rotationEffect(.degrees(-7))
        .accessibilityHidden(true)
    }
}

struct ItemTypeBadge: View {
    let item: WorkItemSummary

    var body: some View {
        Text(item.type == .other ? item.typeName : item.type.rawValue)
            .appFont(10, weight: .semibold, relativeTo: .caption2)
            .foregroundStyle(item.type.badgeInk)
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(item.type.paper, in: RoundedRectangle(cornerRadius: 4))
    }
}

extension ItemType {
    var badgeInk: Color {
        switch self {
        case .bug: Color(hex: 0xA34D60)
        case .pbi: Color(hex: 0x38638B)
        case .qi: Color(hex: 0x3D7350)
        case .task: Color(hex: 0x85621C)
        case .other: Palette.muted
        }
    }
}

struct TagChip: View {
    let text: String
    var tint: Color = Palette.ink.opacity(0.08)
    var foreground: Color = Palette.ink

    var body: some View {
        Text(text)
            .font(.caption)
            .foregroundStyle(foreground)
            .padding(.horizontal, 7)
            .padding(.vertical, 2)
            .background(RoundedRectangle(cornerRadius: 3).fill(tint))
    }
}

struct Pill: View {
    let text: String
    let background: Color
    var foreground: Color = .white

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .foregroundStyle(foreground)
            .padding(.horizontal, 8)
            .padding(.vertical, 2)
            .background(Capsule().fill(background))
    }
}

/// Lays out children left to right and wraps, like CSS flex-wrap.
struct FlowLayout: Layout {
    var spacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let rows = arrange(subviews, width: proposal.width ?? .infinity)
        let height = rows.last.map { $0.y + $0.height } ?? 0
        let width = rows.map(\.width).max() ?? 0
        return CGSize(width: proposal.width ?? width, height: height)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        for row in arrange(subviews, width: bounds.width) {
            var x = bounds.minX
            for index in row.indices {
                let size = subviews[index].sizeThatFits(.unspecified)
                subviews[index].place(at: CGPoint(x: x, y: bounds.minY + row.y), proposal: ProposedViewSize(size))
                x += size.width + spacing
            }
        }
    }

    private struct Row {
        var indices: [Int] = []
        var y: CGFloat = 0
        var width: CGFloat = 0
        var height: CGFloat = 0
    }

    private func arrange(_ subviews: Subviews, width: CGFloat) -> [Row] {
        var rows: [Row] = []
        var row = Row()
        for index in subviews.indices {
            let size = subviews[index].sizeThatFits(.unspecified)
            if !row.indices.isEmpty, row.width + spacing + size.width > width {
                rows.append(row)
                row = Row(y: row.y + row.height + spacing)
            }
            row.width += (row.indices.isEmpty ? 0 : spacing) + size.width
            row.height = max(row.height, size.height)
            row.indices.append(index)
        }
        if !row.indices.isEmpty { rows.append(row) }
        return rows
    }
}

/// A horizontal line, used for the dashed "suggested" segment of the state track.
struct HorizontalLine: Shape {
    func path(in rect: CGRect) -> Path {
        var path = Path()
        path.move(to: CGPoint(x: rect.minX, y: rect.midY))
        path.addLine(to: CGPoint(x: rect.maxX, y: rect.midY))
        return path
    }
}

struct ToastView: View {
    @Environment(AppModel.self) private var app

    var body: some View {
        if let toast = app.toasts.current {
            HStack(spacing: 12) {
                Text(toast.message)
                    .font(.subheadline.weight(toast.isError ? .semibold : .regular))
                    .foregroundStyle(toast.isError ? Palette.inkRed : Palette.ink)
                    .frame(maxWidth: .infinity, alignment: .leading)
                if let link = toast.link {
                    Button(link.title) { Task { await T3Link.open(link.urls) } }
                        .font(.subheadline.weight(.semibold))
                        .underline()
                        .foregroundStyle(Palette.ink)
                }
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 11)
            .background(alignment: .leading) {
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 6).fill(Color.white)
                    UnevenRoundedRectangle(topLeadingRadius: 6, bottomLeadingRadius: 6)
                        .fill(toast.isError ? Palette.Signal.waiting : Palette.Signal.working)
                        .frame(width: 4)
                }
            }
            .shadow(color: .black.opacity(0.35), radius: 15, y: 8)
            .padding(.horizontal, 12)
            .padding(.top, 4)
            .transition(.move(edge: .top).combined(with: .opacity))
            .onTapGesture { app.toasts.dismiss() }
            .id(toast.id)
            .accessibilityAddTraits(.isStaticText)
        }
    }
}

extension View {
    func paperShadow() -> some View {
        overlay(RoundedRectangle(cornerRadius: 8).strokeBorder(Palette.line))
    }
}

extension View {
    func deepStatusBar() -> some View {
        safeAreaInset(edge: .top, spacing: 0) {
            Color.clear
                .frame(height: 0)
                .background(Palette.consoleDeep.ignoresSafeArea(edges: .top))
        }
    }
}

struct CheckboxToggleStyle: ToggleStyle {
    func makeBody(configuration: Configuration) -> some View {
        Button { configuration.isOn.toggle() } label: {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Image(systemName: configuration.isOn ? "checkmark.square.fill" : "square")
                    .font(.system(size: 16))
                    .foregroundStyle(configuration.isOn ? Palette.accent : Palette.muted)
                configuration.label
                    .multilineTextAlignment(.leading)
                    .foregroundStyle(Palette.text)
                Spacer(minLength: 0)
            }
            .frame(minHeight: 28)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityValue(configuration.isOn ? "On" : "Off")
    }
}
