import Foundation

/// One run of a paragraph: styled text (bold, italic, strikethrough, links, @mentions in bold), inline code, or an
/// `AB#123` reference that draws as a chip.
enum InlinePiece: Equatable {
    case text(AttributedString)
    case code(String)
    case workItem(Int)
}

/// Inline markdown and the inline HTML GitHub bodies carry (`<b>`, `<code>`, `<a href>`, `<br>`, …), as pieces.
enum MarkdownInline {
    static func pieces(_ source: String) -> [InlinePiece] {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace, failurePolicy: .returnPartiallyParsedIfPossible)
        let markdown = markdownFromHTML(source)
        let parsed = (try? AttributedString(markdown: markdown, options: options)) ?? AttributedString(markdown)
        var pieces: [InlinePiece] = []
        var text = AttributedString()
        func flush() {
            if !text.characters.isEmpty { pieces.append(.text(text)) }
            text = AttributedString()
        }
        for run in parsed.runs {
            let part = AttributedString(parsed[run.range])
            if run.inlinePresentationIntent?.contains(.code) == true {
                flush()
                pieces.append(.code(String(part.characters)))
            } else if run.link != nil {
                text += part
            } else {
                for piece in references(in: part) {
                    if case .text(let plain) = piece { text += plain } else { flush(); pieces.append(piece) }
                }
            }
        }
        flush()
        return pieces
    }

    /// AB#123 out of plain text as their own pieces; @mentions bold and bare URLs linked in what is left.
    private static func references(in part: AttributedString) -> [InlinePiece] {
        let string = String(part.characters)
        var pieces: [InlinePiece] = []
        var cursor = string.startIndex
        for match in string.matches(of: workItem) {
            if match.range.lowerBound > cursor { pieces.append(.text(decorated(part, string, cursor..<match.range.lowerBound))) }
            pieces.append(.workItem(Int(match.output.1) ?? 0))
            cursor = match.range.upperBound
        }
        if cursor < string.endIndex { pieces.append(.text(decorated(part, string, cursor..<string.endIndex))) }
        return pieces
    }

    private static func decorated(_ part: AttributedString, _ string: String, _ range: Range<String.Index>) -> AttributedString {
        let lower = string.distance(from: string.startIndex, to: range.lowerBound)
        let upper = string.distance(from: string.startIndex, to: range.upperBound)
        let start = part.characters.index(part.startIndex, offsetBy: lower)
        var slice = AttributedString(part[start..<part.characters.index(part.startIndex, offsetBy: upper)])
        let text = String(slice.characters)
        func attributedRange(_ found: Range<String.Index>) -> Range<AttributedString.Index> {
            let from = slice.characters.index(slice.startIndex, offsetBy: text.distance(from: text.startIndex, to: found.lowerBound))
            return from..<slice.characters.index(from, offsetBy: text[found].count)
        }
        for match in text.matches(of: mention) where isMentionStart(text, match.range.lowerBound) {
            let range = attributedRange(match.range)
            slice[range].inlinePresentationIntent = (slice[range].inlinePresentationIntent ?? []).union(.stronglyEmphasized)
        }
        for match in text.matches(of: bareURL) {
            slice[attributedRange(match.range)].link = URL(string: String(match.output))
        }
        return slice
    }

    /// An @ that starts a word: not inside an e-mail address or a path.
    private static func isMentionStart(_ text: String, _ at: String.Index) -> Bool {
        guard at > text.startIndex else { return true }
        let before = text[text.index(before: at)]
        return !(before.isLetter || before.isNumber || "@/._-".contains(before))
    }

    /// `<b>` → `**`, `<code>` → backticks, `<a href>` → a markdown link, `<br>` → a line break, other tags → their
    /// text. Code spans are left as they are.
    static func markdownFromHTML(_ source: String) -> String {
        guard source.contains("<") else { return source }
        var result = ""
        var rest = Substring(source)
        while let open = rest.firstIndex(of: "`") {
            result += convertTags(String(rest[..<open]))
            let fence = rest[open...].prefix { $0 == "`" }
            let afterFence = rest[fence.endIndex...]
            guard let close = afterFence.range(of: String(fence)) else {
                result += String(rest[open...])
                return result
            }
            result += String(rest[open..<close.upperBound])
            rest = rest[close.upperBound...]
        }
        return result + convertTags(String(rest))
    }

    private static func convertTags(_ text: String) -> String {
        guard text.contains("<") else { return text }
        var result = text.replacing(#/(?i)<(code|kbd)\b[^>]*>([\s\S]*?)<\/\1>/#) { match -> String in
            "`\(HTML.decodeEntities(String(match.output.2)))`"
        }
        result = result.replacing(#/(?i)<a\b([^>]*)>([\s\S]*?)<\/a>/#) { match -> String in
            guard let href = HTML.attribute("href", in: String(match.output.1)) else { return String(match.output.2) }
            return "[\(match.output.2)](\(href))"
        }
        result = result.replacing(#/(?i)<img\b[^>]*>/#) { match -> String in HTML.attribute("alt", in: String(match.output)) ?? "" }
        result = result.replacing(#/(?i)<br\s*\/?>|<\/p>/#, with: "\n")
        result = result.replacing(#/(?i)<\/?(b|strong)\b[^>]*>/#, with: "**")
        result = result.replacing(#/(?i)<\/?(i|em)\b[^>]*>/#, with: "*")
        result = result.replacing(#/(?i)<\/?(s|del|strike)\b[^>]*>/#, with: "~~")
        return result.replacing(#/<\/?[A-Za-z][\w-]*\b[^>]*>/#, with: "")
    }

    private nonisolated(unsafe) static let workItem = #/(?i)\bAB#(\d+)\b/#
    private nonisolated(unsafe) static let mention = #/@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\[bot\])?/#
    private nonisolated(unsafe) static let bareURL = #/https?:\/\/[^\s<>()]+[^\s<>().,;:!?'"]/#
}
