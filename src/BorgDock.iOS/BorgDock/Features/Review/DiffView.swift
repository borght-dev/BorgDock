import SwiftUI

/// One diff line: number, marker and highlighted code. Long lines wrap with a hanging indent at the code's own
/// indentation, so wrapped parts stay readable on a phone.
struct DiffLineRow: View {
    let line: DiffLine
    let language: SyntaxHighlighter.Language
    var fontSize: CGFloat = 13
    var onTapNumber: (() -> Void)?

    private var charWidth: CGFloat { fontSize * 0.6 }

    var body: some View {
        switch line.kind {
        case .hunk:
            Text(line.text)
                .font(.system(size: fontSize - 0.5, design: .monospaced))
                .foregroundStyle(BD.text3)
                .lineLimit(1)
                .truncationMode(.tail)
                .padding(.horizontal, 16)
                .padding(.vertical, 6)
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
            Button { onTapNumber?() } label: {
                HStack(spacing: 0) {
                    Text(line.number.map(String.init) ?? "")
                        .frame(width: 34, alignment: .leading)
                    Text(line.marker).frame(width: 18, alignment: .leading)
                }
                .foregroundStyle(numberColor)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .disabled(onTapNumber == nil)
            .accessibilityLabel(line.number.map { "Comment on line \($0)" } ?? "")
            Text(SyntaxHighlighter.attributed(String(rest), language: language))
                .foregroundStyle(BD.text)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, CGFloat(columns) * charWidth)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .font(.system(size: fontSize, design: .monospaced))
        .lineSpacing(3)
        .padding(.leading, 16)
        .padding(.trailing, 12)
        .padding(.vertical, 3.5)
        .background(background)
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
    let text: String

    var body: some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(verbatim: "Draft · line \(line)").font(.system(size: 11.5, weight: .semibold)).foregroundStyle(BD.accentText)
            Text(text).font(.system(size: 14.5)).foregroundStyle(BD.text).lineSpacing(1.5)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(BD.accentSoft, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(BD.accent.opacity(0.35), lineWidth: 0.5))
        .padding(.leading, 52)
        .padding(.trailing, 12)
        .padding(.vertical, 6)
    }
}
