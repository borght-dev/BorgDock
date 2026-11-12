import SwiftUI

// BorgDock's building blocks. They compile into the app and both extensions, so nothing here may touch
// UIApplication or other app-only API.

/// A rounded tag: "2 failing", "AB#61021", "Ready to merge".
struct ToneChip: View {
    let text: String
    var tone: Tone = .mute
    var systemImage: String?
    var small = false
    /// Accent (indigo) instead of a status tone, for references like AB# numbers.
    var accent = false

    var body: some View {
        HStack(spacing: 4) {
            if let systemImage {
                Image(systemName: systemImage).font(.system(size: small ? 9 : 10, weight: .bold))
            }
            Text(text).lineLimit(1)
        }
        .font(.system(size: small ? 11.5 : 12.5, weight: .semibold))
        .foregroundStyle(accent ? BD.accentText : tone.color)
        .padding(.horizontal, small ? 7 : 9)
        .frame(height: small ? 21 : 24)
        .background(accent ? BD.accentSoft : tone.soft, in: Capsule())
        .fixedSize()
    }
}

/// The desktop's check bar: one segment per check, failures red, running yellow.
struct CheckBar: View {
    let segments: [CheckState]
    var width: CGFloat = 64

    var body: some View {
        HStack(spacing: 2) {
            ForEach(Array(segments.prefix(12).enumerated()), id: \.offset) { _, state in
                RoundedRectangle(cornerRadius: 2)
                    .fill(state.color)
                    .opacity(state == .skipped || state == .neutral ? 0.5 : 1)
            }
        }
        .frame(width: width, height: 5)
        .accessibilityElement()
        .accessibilityLabel(CheckBar.summary(segments))
    }

    static func summary(_ segments: [CheckState]) -> String {
        let failed = segments.filter { $0 == .failure }.count
        let pending = segments.filter { $0 == .pending }.count
        if failed > 0 { return "\(failed) checks failing" }
        if pending > 0 { return "\(pending) checks running" }
        return segments.isEmpty ? "No checks" : "Checks pass"
    }
}

extension CheckState {
    var color: Color {
        switch self {
        case .success: BD.green
        case .failure: BD.red
        case .pending: BD.yellow
        case .neutral, .skipped: BD.text3
        }
    }
}

/// Initials on a colour picked from the login, so a person keeps their colour everywhere.
struct PersonAvatar: View {
    let name: String
    var size: CGFloat = 20

    var body: some View {
        Text(PersonAvatar.initials(name))
            .font(.system(size: size * 0.42, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: size, height: size)
            .background(Color(hue: PersonAvatar.hue(name), saturation: 0.52, brightness: 0.62), in: Circle())
            .accessibilityHidden(true)
    }

    static func initials(_ name: String) -> String {
        let words = name.split(whereSeparator: { $0 == " " || $0 == "-" || $0 == "_" || $0 == "." }).filter { !$0.isEmpty }
        if words.count >= 2 { return String(words[0].prefix(1) + words[1].prefix(1)).uppercased() }
        return String(name.prefix(2)).uppercased()
    }

    static func hue(_ name: String) -> Double {
        var hash: UInt32 = 2166136261
        for byte in name.lowercased().utf8 { hash = (hash ^ UInt32(byte)) &* 16777619 }
        return Double(hash % 360) / 360
    }
}

/// The coloured square in front of an ADO work item: red bug, blue PBI, amber task.
struct WorkItemGlyph: View {
    let typeName: String
    var size: CGFloat = 11

    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.27)
            .fill(WorkItemGlyph.color(typeName))
            .frame(width: size, height: size)
            .accessibilityHidden(true)
    }

    static func color(_ typeName: String) -> Color {
        switch typeName.lowercased() {
        case "bug": BD.bug
        case "pbi", "product backlog item", "user story", "feature": BD.pbi
        case "task": BD.task
        case "qi", "quality improvement": BD.green
        case "epic": BD.merged
        default: BD.text3
        }
    }
}

/// A GitHub label in its own colour.
struct GitHubLabel: View {
    let name: String
    let hex: String

    var body: some View {
        let color = Color(hexString: hex) ?? BD.text3
        Text(name)
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)
            .padding(.horizontal, 9)
            .frame(height: 22)
            .foregroundStyle(BD.text)
            .background(color.opacity(0.22), in: Capsule())
            .overlay(Capsule().strokeBorder(color.opacity(0.5), lineWidth: 0.5))
            .fixedSize()
    }
}

/// A bucket or filter in a horizontal strip: "Needs you 3".
struct BucketPill: View {
    let title: String
    var count: Int?
    var selected = false

    var body: some View {
        HStack(spacing: 6) {
            Text(title)
            if let count {
                Text("\(count)").monospacedDigit().foregroundStyle(selected ? BD.bg.opacity(0.65) : BD.text2)
            }
        }
        .font(.system(size: 14, weight: .semibold))
        .foregroundStyle(selected ? BD.bg : BD.text)
        .padding(.horizontal, 13)
        .frame(height: 34)
        .background(selected ? BD.text : BD.fill, in: Capsule())
    }
}

/// "Code Review   2", the small header above a grouped list.
struct GroupHeader: View {
    let title: String
    var trailing: String?

    var body: some View {
        HStack {
            Text(title)
            Spacer()
            if let trailing { Text(trailing) }
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundStyle(BD.text2)
        .padding(.horizontal, 16)
        .padding(.top, 18)
        .padding(.bottom, 7)
    }
}

/// A card on the grouped background.
struct CardBackground: ViewModifier {
    @Environment(\.colorScheme) private var scheme
    var radius: CGFloat = 22
    var fill: Color = BD.card

    func body(content: Content) -> some View {
        content
            .background(fill, in: RoundedRectangle(cornerRadius: radius, style: .continuous))
            .overlay {
                if scheme == .dark {
                    RoundedRectangle(cornerRadius: radius, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5)
                }
            }
            .shadow(color: .black.opacity(scheme == .dark ? 0 : 0.04), radius: 1, y: 1)
    }
}

extension View {
    func bdCard(radius: CGFloat = 22, fill: Color = BD.card) -> some View {
        modifier(CardBackground(radius: radius, fill: fill))
    }
}

/// The BorgDock mark: a rail and two docked panels forming a B (`design/brand/workbench`).
struct BDMark: Shape {
    func path(in rect: CGRect) -> Path {
        let s = min(rect.width, rect.height) / 32
        let ox = rect.minX + (rect.width - 32 * s) / 2
        let oy = rect.minY + (rect.height - 32 * s) / 2
        func p(_ x: CGFloat, _ y: CGFloat) -> CGPoint { CGPoint(x: ox + x * s, y: oy + y * s) }
        var path = Path()
        path.addRoundedRect(in: CGRect(origin: p(4, 4), size: CGSize(width: 6 * s, height: 24 * s)), cornerSize: CGSize(width: 1.5 * s, height: 1.5 * s))
        // Upper panel: 13..28 wide, 4..15 high, rounded right side.
        path.addPath(BDMark.panel(x: 13, y: 4, w: 15, h: 11, topRight: 6, bottomRight: 4, p: p, s: s))
        // Lower panel: 13..28 wide, 17..28 high.
        path.addPath(BDMark.panel(x: 13, y: 17, w: 15, h: 11, topRight: 4, bottomRight: 6, p: p, s: s))
        return path
    }

    private static func panel(x: CGFloat, y: CGFloat, w: CGFloat, h: CGFloat, topRight: CGFloat, bottomRight: CGFloat,
                              p: (CGFloat, CGFloat) -> CGPoint, s: CGFloat) -> Path {
        let shape = UnevenRoundedRectangle(
            topLeadingRadius: 1.5 * s, bottomLeadingRadius: 1.5 * s,
            bottomTrailingRadius: bottomRight * s, topTrailingRadius: topRight * s, style: .continuous
        )
        let origin = p(x, y)
        return shape.path(in: CGRect(x: origin.x, y: origin.y, width: w * s, height: h * s))
    }
}

/// The app icon's tile: the indigo mark on graphite.
struct BDAppTile: View {
    var size: CGFloat = 38

    var body: some View {
        BDMark()
            .fill(BD.brandIndigo)
            .frame(width: size * 0.66, height: size * 0.66)
            .frame(width: size, height: size)
            .background(BD.graphite, in: RoundedRectangle(cornerRadius: size * 0.24, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: size * 0.24, style: .continuous).strokeBorder(.white.opacity(0.14), lineWidth: 0.5))
            .accessibilityHidden(true)
    }
}

/// Capsule buttons: primary (indigo), go (green), danger (soft red) and plain (fill).
struct BDButtonStyle: ButtonStyle {
    enum Kind { case primary, go, danger, plain }
    var kind: Kind = .primary
    var height: CGFloat = 52

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.system(size: height >= 50 ? 17 : 15.5, weight: .semibold))
            .lineLimit(1)
            .foregroundStyle(foreground)
            .frame(maxWidth: .infinity)
            .frame(height: height)
            .background(background, in: Capsule())
            .opacity(configuration.isPressed ? 0.75 : 1)
            .contentShape(Capsule())
    }

    private var foreground: Color {
        switch kind {
        case .primary: BD.onAccent
        case .go: BD.onGreen
        case .danger: BD.red
        case .plain: BD.text
        }
    }

    private var background: Color {
        switch kind {
        case .primary: BD.accent
        case .go: BD.green
        case .danger: BD.redSoft
        case .plain: BD.fill2
        }
    }
}

extension ButtonStyle where Self == BDButtonStyle {
    static var bdPrimary: BDButtonStyle { BDButtonStyle(kind: .primary) }
    static var bdGo: BDButtonStyle { BDButtonStyle(kind: .go) }
    static var bdDanger: BDButtonStyle { BDButtonStyle(kind: .danger) }
    static var bdPlain: BDButtonStyle { BDButtonStyle(kind: .plain) }
    static func bd(_ kind: BDButtonStyle.Kind, height: CGFloat = 52) -> BDButtonStyle { BDButtonStyle(kind: kind, height: height) }
}

/// A round Liquid Glass button for navigation bars and floating bars.
struct GlassIconButton: View {
    let systemImage: String
    var label: String
    var size: CGFloat = 44
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: size * 0.4, weight: .semibold))
                .frame(width: size, height: size)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .accessibilityLabel(label)
    }
}

/// "+412 −88" in the mono face.
struct DiffStat: View {
    let additions: Int
    let deletions: Int

    var body: some View {
        HStack(spacing: 4) {
            Text("+" + DiffStat.compact(additions)).foregroundStyle(BD.green)
            Text("−" + DiffStat.compact(deletions)).foregroundStyle(BD.red)
        }
        .font(.system(size: 12, weight: .medium, design: .monospaced))
        .lineLimit(1)
        .fixedSize()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(additions) lines added, \(deletions) removed")
    }

    /// 842, 4.2k, 198k, 1.3M: one short line however big the change, with no locale's grouping separator.
    nonisolated static func compact(_ count: Int) -> String {
        switch count {
        case ..<1000: "\(count)"
        case ..<10_000: tenths(count, unit: 1000, suffix: "k")
        case ..<1_000_000: "\(count / 1000)k"
        default: tenths(count, unit: 1_000_000, suffix: "M")
        }
    }

    private nonisolated static func tenths(_ count: Int, unit: Int, suffix: String) -> String {
        let tenths = count / (unit / 10)
        return tenths % 10 == 0 ? "\(tenths / 10)\(suffix)" : "\(tenths / 10).\(tenths % 10)\(suffix)"
    }
}

/// A small pulsing dot for something running now.
struct PulseDot: View {
    var color: Color = BD.blue
    var size: CGFloat = 7
    @State private var dim = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
            .overlay(Circle().stroke(color.opacity(0.25), lineWidth: 3))
            .opacity(dim ? 0.35 : 1)
            .onAppear {
                guard !reduceMotion else { return }
                withAnimation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true)) { dim = true }
            }
            .accessibilityHidden(true)
    }
}
