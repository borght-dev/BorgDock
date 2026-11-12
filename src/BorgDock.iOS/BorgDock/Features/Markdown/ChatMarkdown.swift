import SwiftUI

/// An agent's markdown as chat text: the same blocks as `GitHubMarkdown`, with a bold line of its own read as a heading.
struct ChatMarkdown: View {
    let text: String
    var size: CGFloat = 15.5

    var body: some View {
        MarkdownBlocksView(blocks: MarkdownParser.parse(text, options: MarkdownParser.Options(boldLinesAsHeadings: true)), size: size)
            .textSelection(.enabled)
    }

    /// One line of inline markdown as attributed text, `code` and AB# references in the accent colour.
    static func inline(_ text: String, size: CGFloat) -> AttributedString {
        MarkdownInline.pieces(text).reduce(into: AttributedString()) { result, piece in
            switch piece {
            case .text(let text):
                result += text
            case .code(let code):
                var part = AttributedString(code)
                part.font = .system(size: size - 1, design: .monospaced)
                part.foregroundColor = BD.accentText
                result += part
            case .workItem(let id):
                var part = AttributedString("AB#\(id)")
                part.foregroundColor = BD.accentText
                part.link = MarkdownLinks.url(forWorkItem: id)
                result += part
            }
        }
    }
}
