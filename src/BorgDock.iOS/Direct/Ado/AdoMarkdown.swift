import Foundation

/// ADO's rich text (the HTML its editor writes) as GitHub-flavoured markdown, so descriptions, repro steps and comments
/// show with their lists, tables and screenshots. The port of the server's `ado/markdown.ts`: change both together, and
/// keep `AdoMarkdownTests` on the cases of `ado-markdown.test.ts`.
enum AdoMarkdown {
    /// Where an image goes: a URL to show, or nil to leave it out.
    typealias ImageResolver = (String) -> String?

    /// Markdown for ADO's HTML. `image` decides where each image points; without one only `https://` images stay.
    static func from(html: String?, image: @escaping ImageResolver = httpsOnly) -> String {
        guard let html, !html.isEmpty else { return "" }
        return AdoText.trim(Renderer(resolveImage: image).blocks(AdoHtml.parse(html)).joined(separator: "\n\n"))
    }

    static func httpsOnly(_ source: String) -> String? {
        source.lowercased().hasPrefix("https://") ? source : nil
    }
}

private struct Inline {
    var bold = false
    var italic = false
    var strike = false
    var link = false

    static let plain = Inline()

    func with(_ change: (inout Inline) -> Void) -> Inline {
        var style = self
        change(&style)
        return style
    }
}

/// A line break inside inline text; it becomes a hard break, a space or `<br>` depending on where the text lands.
private let lineBreak: Unicode.Scalar = "\u{0}"

private struct Renderer {
    let resolveImage: AdoMarkdown.ImageResolver

    // MARK: Inline text

    func inline(_ nodes: [AdoHtmlNode], _ style: Inline) -> String {
        nodes.map { inline($0, style) }.joined()
    }

    private func inline(_ node: AdoHtmlNode, _ style: Inline) -> String {
        switch node {
        case .text(let text):
            return Self.escape(AdoText.collapsingWhitespace(text))
        case .element(let element):
            let tag = element.tag
            if AdoHtml.dropped.contains(tag) { return "" }
            if tag == "br" { return String(Character(lineBreak)) }
            if tag == "img" { return image(of: element) }
            if ["code", "kbd", "samp", "tt"].contains(tag) { return Self.codeSpan(element.children.map(Self.text).joined()) }
            if tag == "a" { return link(of: element, style) }
            if ["b", "strong", "u", "ins"].contains(tag), !style.bold { return Self.wrap(inline(element.children, style.with { $0.bold = true }), in: "**") }
            if ["i", "em", "cite"].contains(tag), !style.italic { return Self.wrap(inline(element.children, style.with { $0.italic = true }), in: "*") }
            if ["s", "strike", "del"].contains(tag), !style.strike { return Self.wrap(inline(element.children, style.with { $0.strike = true }), in: "~~") }
            if AdoHtml.blocks.contains(tag) { return " \(inline(element.children, style)) " }
            return inline(element.children, style)
        }
    }

    private func image(of element: AdoHtmlElement) -> String {
        guard let source = resolveImage(element.attributes["src"] ?? ""), !source.isEmpty else { return "" }
        let alt = AdoText.trim(AdoText.removing(["[", "]", "\\"], from: element.attributes["alt"] ?? ""))
        return "![\(alt)](\(Self.linkTarget(source) ?? source))"
    }

    private func link(of element: AdoHtmlElement, _ style: Inline) -> String {
        let label = AdoText.trim(Self.replacingBreaks(in: inline(element.children, style.with { $0.link = true }), with: " "))
        let href = element.attributes["href"] ?? ""
        guard !style.link, let target = Self.linkTarget(href) else { return label }
        return label.isEmpty ? "<\(AdoText.trim(href))>" : "[\(label)](\(target))"
    }

    private static func replacingBreaks(in text: String, with replacement: String) -> String {
        AdoText.split(text, on: lineBreak).joined(separator: replacement)
    }

    private static func text(of node: AdoHtmlNode) -> String {
        switch node {
        case .text(let text):
            return text
        case .element(let element):
            if element.tag == "br" { return "\n" }
            if AdoHtml.dropped.contains(element.tag) { return "" }
            let inner = element.children.map(text).joined()
            return AdoHtml.blocks.contains(element.tag) && element.tag != "td" && element.tag != "th" ? inner + "\n" : inner
        }
    }

    // MARK: Escaping

    private static let markdownCharacter = AdoPattern(#"[\\`*\[\]<]"#)
    /// An underscore that could open or close emphasis: one not between two letters or digits.
    private static let looseUnderscore = AdoPattern(#"(^|[^\p{L}\p{N}])_|_(?=\z|[^\p{L}\p{N}])"#)

    private static func escape(_ text: String) -> String {
        var escaped = markdownCharacter.replacing(in: text) { "\\" + $0.text }
        escaped = looseUnderscore.replacing(in: escaped) { match in
            match.text.replacingOccurrences(of: "_", with: "\\_", options: .literal, range: match.text.range(of: "_", options: .literal))
        }
        return escaped.replacingOccurrences(of: "~~", with: "\\~\\~", options: .literal)
    }

    private static let blockStart = AdoPattern(#"^(#{1,6}(\s|\z)|>|[\-+](\s|\z)|[=\-]{3,}\s*\z)"#)
    private static let numberedStart = AdoPattern(#"^([0-9]+)([.)])(\s|\z)"#)

    /// A line that would read as a heading, quote, rule or list item stays text.
    private static func escapeLineStart(_ line: String) -> String {
        if blockStart.isFound(in: line) { return "\\" + line }
        return numberedStart.replacing(in: line) { match in
            (match[1] ?? "") + "\\" + (match[2] ?? "") + (match[3] ?? "")
        }
    }

    /// `**text**` with the spaces around it kept outside, so `a<b> b </b>c` stays `a **b** c`.
    private static func wrap(_ inner: String, in marker: String) -> String {
        let core = AdoText.trim(inner)
        guard !core.isEmpty else { return inner }
        let scalars = inner.unicodeScalars
        let leading = String(Substring(scalars.prefix(while: AdoText.isWhitespace)))
        let trailing = String(String.UnicodeScalarView(scalars.reversed().prefix(while: AdoText.isWhitespace).reversed()))
        return leading + marker + core + marker + trailing
    }

    private static func codeSpan(_ text: String) -> String {
        let content = AdoText.collapsingWhitespace(text)
        if AdoText.trim(content).isEmpty { return "" }
        return content.contains("`") ? "`` \(content) ``" : "`\(content)`"
    }

    private static let safeScheme = AdoPattern(#"^(https?:|mailto:)"#, caseInsensitive: true)

    /// A link's target as markdown takes it, or nil for anything but http, https and mailto.
    private static func linkTarget(_ href: String) -> String? {
        let url = AdoText.trim(href)
        guard safeScheme.isFound(in: url) else { return nil }
        let needsBrackets = url.unicodeScalars.contains { AdoText.isWhitespace($0) || "()<>".unicodeScalars.contains($0) }
        guard needsBrackets else { return url }
        return "<" + url.replacingOccurrences(of: "<", with: "%3C", options: .literal).replacingOccurrences(of: ">", with: "%3E", options: .literal) + ">"
    }

    // MARK: Blocks

    /// Markdown blocks, each a string without surrounding blank lines.
    func blocks(_ nodes: [AdoHtmlNode]) -> [String] {
        var out: [String] = []
        var run: [AdoHtmlNode] = []
        func flush() {
            let text = paragraph(run)
            if !text.isEmpty { out.append(text) }
            run = []
        }
        for node in nodes {
            if case .element(let element) = node, AdoHtml.blocks.contains(element.tag) {
                flush()
                out += block(element)
            } else if case .element(let element) = node, Self.holdsBlocks(element) {
                // `<span><div>a</div><div>b</div></span>`: the blocks keep their lines; the span's styling goes.
                flush()
                out += blocks(element.children)
            } else {
                run.append(node)
            }
        }
        flush()
        return out
    }

    private static func holdsBlocks(_ element: AdoHtmlElement) -> Bool {
        element.tag != "a" && element.children.contains { child in
            guard case .element(let inner) = child else { return false }
            return AdoHtml.blocks.contains(inner.tag) || holdsBlocks(inner)
        }
    }

    private func paragraph(_ nodes: [AdoHtmlNode]) -> String {
        var lines = AdoText.split(inline(nodes, .plain), on: lineBreak).map(AdoText.trim)
        while lines.first?.isEmpty == true { lines.removeFirst() }
        while lines.last?.isEmpty == true { lines.removeLast() }
        return lines.map(Self.escapeLineStart).joined(separator: "  \n")
    }

    private func block(_ element: AdoHtmlElement) -> [String] {
        switch element.tag {
        case "h1", "h2", "h3", "h4", "h5", "h6":
            let text = AdoText.trim(AdoText.collapsingWhitespace(Self.replacingBreaks(in: inline(element.children, .plain), with: " ")))
            let level = element.tag.last?.wholeNumberValue ?? 1
            return text.isEmpty ? [] : [String(repeating: "#", count: level) + " " + text]
        case "ul", "ol":
            let markdown = list(element)
            return markdown.isEmpty ? [] : [markdown]
        case "table":
            let markdown = table(element)
            return markdown.isEmpty ? [] : [markdown]
        case "blockquote":
            let inner = blocks(element.children).joined(separator: "\n\n")
            return inner.isEmpty ? [] : [AdoText.split(inner, on: "\n").map { $0.isEmpty ? ">" : "> " + $0 }.joined(separator: "\n")]
        case "pre":
            return Self.codeBlock(element.children.map(Self.text).joined())
        case "hr":
            return ["---"]
        default:
            return blocks(element.children)
        }
    }

    private static func codeBlock(_ text: String) -> [String] {
        let withoutLeadingLine = text.unicodeScalars.first == "\n" ? String(Substring(text.unicodeScalars.dropFirst())) : text
        let code = AdoText.trimEnd(withoutLeadingLine)
        if code.isEmpty { return [] }
        let fence = code.contains("```") ? "~~~" : "```"
        return ["\(fence)\n\(code)\n\(fence)"]
    }

    private func list(_ element: AdoHtmlElement) -> String {
        let ordered = element.tag == "ol"
        var number = max(1, AdoText.leadingInteger(element.attributes["start"] ?? "1") ?? 1)
        var items: [String] = []
        for child in element.children {
            if case .text(let text) = child, AdoText.trim(text).isEmpty { continue }
            // A list nested straight inside a list (ADO's editor writes them) belongs to the item before it.
            if case .element(let nestedList) = child, nestedList.tag == "ul" || nestedList.tag == "ol" {
                let nested = list(nestedList)
                if nested.isEmpty { continue }
                let indent = String(repeating: " ", count: items.last.map(Self.markerWidth) ?? 0)
                let lines = AdoText.split(nested, on: "\n").map { $0.isEmpty ? $0 : indent + $0 }.joined(separator: "\n")
                if items.isEmpty { items.append(lines) } else { items[items.count - 1] += "\n" + lines }
                continue
            }
            let content: [String]
            if case .element(let item) = child, item.tag == "li" { content = blocks(item.children) } else { content = blocks([child]) }
            let marker = ordered ? "\(number). " : "- "
            if ordered { number += 1 }
            let pad = String(repeating: " ", count: marker.count)
            let body = AdoText.split(content.joined(separator: "\n"), on: "\n").enumerated()
                .map { $0.offset == 0 || $0.element.isEmpty ? $0.element : pad + $0.element }
                .joined(separator: "\n")
            items.append(AdoText.trimEnd(marker + body))
        }
        return items.joined(separator: "\n")
    }

    /// How far a nested list is indented under an item: the width of the item's `1. ` or `- `.
    private static func markerWidth(_ item: String) -> Int {
        if item.hasPrefix("- ") { return 2 }
        let digits = item.unicodeScalars.prefix { ("0"..."9").contains($0) }.count
        let afterDigits = String(Substring(item.unicodeScalars.dropFirst(digits)))
        return digits > 0 && afterDigits.hasPrefix(". ") ? digits + 2 : 2
    }

    private func table(_ element: AdoHtmlElement) -> String {
        let rows = Self.rows(of: element).map(cells).filter { !$0.isEmpty }
        guard let header = rows.first else { return "" }
        let width = rows.map(\.count).max() ?? 0
        func line(_ row: [String]) -> String {
            "| " + (0..<width).map { $0 < row.count ? row[$0] : "" }.joined(separator: " | ") + " |"
        }
        let rule = "| " + Array(repeating: "---", count: width).joined(separator: " | ") + " |"
        return ([line(header), rule] + rows.dropFirst().map(line)).joined(separator: "\n")
    }

    /// The table's own rows, through `thead`, `tbody` and `tfoot`; a table inside a cell keeps its rows.
    private static func rows(of parent: AdoHtmlElement) -> [AdoHtmlElement] {
        parent.children.flatMap { child -> [AdoHtmlElement] in
            guard case .element(let element) = child, element.tag != "table" else { return [] }
            if element.tag == "tr" { return [element] }
            return ["thead", "tbody", "tfoot"].contains(element.tag) ? rows(of: element) : []
        }
    }

    private func cells(of row: AdoHtmlElement) -> [String] {
        row.children.compactMap { child in
            guard case .element(let cell) = child, cell.tag == "td" || cell.tag == "th" else { return nil }
            return self.cell(cell)
        }
    }

    /// A cell is one line: its blocks and line breaks become `<br>`, and a pipe is escaped.
    private func cell(_ cell: AdoHtmlElement) -> String {
        AdoText.split(blocks(cell.children).joined(separator: "\n")) { $0 == "\n" || $0 == lineBreak }
            .map(AdoText.trim)
            .filter { !$0.isEmpty }
            .joined(separator: "<br>")
            .replacingOccurrences(of: "|", with: "\\|", options: .literal)
    }
}
