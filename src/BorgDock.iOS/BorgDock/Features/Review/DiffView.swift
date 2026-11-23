import SwiftUI

/// One diff line: number, marker and highlighted code, on the mockups' 34 + 16 pt grid. Long lines wrap with a
/// hanging indent at the code's own indentation, so wrapped parts stay readable on a phone.
struct DiffLineRow: View {
    let line: DiffLine
    let language: SyntaxHighlighter.Language
    var fontSize: CGFloat = 13
    /// The line is part of the comment being written: tinted in the accent.
    var selected = false
    /// A draft comment covers the line: an accent bar on its edge.
    var covered = false
    var onTapNumber: (() -> Void)?

    private var charWidth: CGFloat { fontSize * 0.6 }

    var body: some View {
        switch line.kind {
        case .hunk:
            Text(line.text)
                .font(.system(size: fontSize, design: .monospaced))
                .foregroundStyle(BD.text3)
                .lineLimit(1)
                .truncationMode(.tail)
                .padding(.horizontal, 12)
                .padding(.vertical, 3)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BD.fill)
        case .note:
            Text(line.text)
                .font(.system(size: fontSize - 1).italic())
                .foregroundStyle(BD.text3)
                .padding(.horizontal, 16)
                .padding(.vertical, 3)
                .frame(maxWidth: .infinity, alignment: .leading)
        default:
            code
        }
    }

    private var code: some View {
        let (columns, rest) = UnifiedDiff.indent(line.text)
        return HStack(alignment: .firstTextBaseline, spacing: 0) {
            HStack(spacing: 0) {
                Text(line.number.map(String.init) ?? "")
                    .frame(width: 28, alignment: .trailing)
                    .padding(.trailing, 6)
                Text(line.marker).frame(width: 16, alignment: .leading)
            }
            .foregroundStyle(numberColor)
            .tappable(onTapNumber, label: line.number.map { "Comment on line \($0)" } ?? "")
            Text(SyntaxHighlighter.attributed(String(rest), language: language))
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, CGFloat(columns) * charWidth)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.system(size: fontSize, design: .monospaced))
        .lineSpacing(3)
        .padding(.trailing, 12)
        .padding(.vertical, 2.5)
        .background(background)
        .overlay { if selected { BD.accent.opacity(0.16).allowsHitTesting(false) } }
        .overlay(alignment: .leading) { if selected || covered { BD.accent.frame(width: 3).allowsHitTesting(false) } }
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private var numberColor: Color {
        switch line.kind {
        case .added: BD.green
        case .removed: BD.red
        default: BD.text3
        }
    }

    private var background: Color {
        switch line.kind {
        case .added: BD.greenSoft
        case .removed: BD.redSoft
        default: .clear
        }
    }
}

/// A bubble under a diff line: your draft comment, tappable to edit.
struct DraftBubble: View {
    let line: Int
    /// The first line of a draft on several lines.
    var startLine: Int?
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: startLine.map { "Draft · lines \($0) to \(line)" } ?? "Draft · line \(line)")
                .font(.system(size: 11.5, weight: .semibold))
                .foregroundStyle(BD.accentText)
            Text(DraftBubble.inline(text)).font(.system(size: 14.5)).foregroundStyle(BD.text).lineSpacing(1.5)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BD.accentSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        // Dashed until the review posts: a draft is only on this phone.
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.accent.opacity(0.55), style: StrokeStyle(lineWidth: 1, dash: [4, 3])))
        .padding(.leading, 50)
        .padding(.trailing, 12)
        .padding(.vertical, 6)
    }

    /// The draft's inline markdown (`code`, **bold**) as GitHub will show it.
    static func inline(_ text: String) -> AttributedString {
        (try? AttributedString(markdown: text, options: .init(interpretedSyntax: .inlineOnlyPreservingWhitespace))) ?? AttributedString(text)
    }
}

extension View {
    /// A tap that a sideways swipe cancels, unlike a Button, which fires when a swipe ends inside it: the walk pages
    /// by swiping across the diff.
    @ViewBuilder
    func tappable(_ action: (() -> Void)?, label: String) -> some View {
        if let action {
            contentShape(Rectangle())
                .onTapGesture(perform: action)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(label)
                .accessibilityAddTraits(.isButton)
                .accessibilityAction { action() }
        } else {
            self
        }
    }
}
