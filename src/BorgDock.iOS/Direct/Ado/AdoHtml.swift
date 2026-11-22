import Foundation

// The HTML ADO's editor writes, read two ways: as a tree for `AdoMarkdown` (the server's `ado/markdown.ts`), and as
// plain text (`htmlToText` in `ado/client.ts`). Change a rule here and on the server together.

struct AdoHtmlElement: Sendable, Equatable {
    let tag: String
    let attributes: [String: String]
    var children: [AdoHtmlNode] = []
}

enum AdoHtmlNode: Sendable, Equatable {
    case text(String)
    case element(AdoHtmlElement)
}

enum AdoHtml {
    static let void: Set<String> = ["br", "img", "hr", "input", "meta", "link", "col", "wbr", "area", "source"]
    static let dropped: Set<String> = ["script", "style", "head", "title", "noscript", "template"]
    static let blocks: Set<String> = [
        "p", "div", "section", "article", "header", "footer", "main", "aside", "nav", "figure", "figcaption", "details", "summary", "center", "form", "fieldset",
        "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table", "thead", "tbody", "tfoot", "tr", "td", "th", "blockquote", "pre", "hr", "dl", "dt", "dd",
    ]
    /// An opening tag that closes an open one of these first (`<li>a<li>b`).
    private static let closedBySibling: [String: Set<String>] = [
        "li": ["li"], "tr": ["tr", "td", "th"], "td": ["td", "th"], "th": ["td", "th"], "p": ["p"], "dt": ["dt", "dd"], "dd": ["dt", "dd"],
    ]
    /// A sibling closes nothing outside the list or table it sits in.
    private static let siblingBoundaries: Set<String> = ["ul", "ol", "table", "dl"]

    private static let entities: [String: String] = [
        "nbsp": " ", "amp": "&", "lt": "<", "gt": ">", "quot": "\"", "apos": "'", "lsquo": "‘", "rsquo": "’", "ldquo": "“", "rdquo": "”", "ndash": "–",
        "mdash": "—", "hellip": "…", "euro": "€", "pound": "£", "copy": "©", "reg": "®", "trade": "™", "bull": "•", "middot": "·", "laquo": "«",
        "raquo": "»", "times": "×", "deg": "°", "shy": "",
    ]
    private static let entity = AdoPattern(#"&(#x[0-9a-f]+|#[0-9]+|[a-z]+);"#, caseInsensitive: true)

    /// Named and numbered entities as their characters; one it doesn't know stays as written. A no-break space becomes a
    /// plain one.
    static func decodeEntities(_ text: String) -> String {
        entity.replacing(in: text) { match in
            let name = match[1] ?? ""
            guard name.hasPrefix("#") else { return entities[name.lowercased()] ?? match.text }
            let digits = name.dropFirst()
            let code = digits.hasPrefix("x") || digits.hasPrefix("X") ? UInt32(digits.dropFirst(), radix: 16) : UInt32(digits)
            guard let code, code > 0, let scalar = Unicode.Scalar(code == 0xA0 ? 0x20 : code) else { return match.text }
            return String(Character(scalar))
        }
    }

    private static let attribute = AdoPattern(#"([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?"#)

    private static func attributes(of source: String) -> [String: String] {
        var attributes: [String: String] = [:]
        for match in attribute.matches(in: source) {
            attributes[(match[1] ?? "").lowercased()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "")
        }
        return attributes
    }

    /// A comment, a declaration, a closing tag (group 1), an opening tag with its attributes (groups 2 and 3), or text
    /// (group 4). A `<` that opens none of these is text.
    private static let token = AdoPattern(
        #"<!--[\s\S]*?(?:-->|\z)|<![A-Za-z0-9_][^>]*>|</\s*([a-z][A-Za-z0-9_:\-]*)\s*>|<([a-z][A-Za-z0-9_:\-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>|([^<]+|<)"#,
        caseInsensitive: true
    )

    /// A small tolerant parser: ADO's HTML is generated, and anything this doesn't know becomes its text.
    static func parse(_ html: String) -> [AdoHtmlNode] {
        var open = [AdoHtmlElement(tag: "#root", attributes: [:])]
        /// Closes every element from `index` up; each becomes the last child of the one below it.
        func close(from index: Int) {
            while open.count > index {
                let element = open.removeLast()
                open[open.count - 1].children.append(.element(element))
            }
        }
        for match in token.matches(in: html) {
            if let text = match[4] {
                open[open.count - 1].children.append(.text(decodeEntities(text)))
            } else if let opening = match[2] {
                let tag = opening.lowercased()
                let rawAttributes = match[3] ?? ""
                if let closes = closedBySibling[tag] {
                    let sibling = open.lastIndex { closes.contains($0.tag) } ?? -1
                    let boundary = open.lastIndex { siblingBoundaries.contains($0.tag) } ?? -1
                    if sibling > 0, sibling > boundary { close(from: sibling) }
                }
                let element = AdoHtmlElement(tag: tag, attributes: attributes(of: rawAttributes))
                if void.contains(tag) || AdoText.trimEnd(rawAttributes).hasSuffix("/") {
                    open[open.count - 1].children.append(.element(element))
                } else {
                    open.append(element)
                }
            } else if let closing = match[1] {
                let tag = closing.lowercased()
                if let index = open.lastIndex(where: { $0.tag == tag }), index > 0 { close(from: index) }
            }
        }
        close(from: 1)
        return open[0].children
    }

    // MARK: Plain text

    private static let lineEnd = AdoPattern(#"<(br|/p|/div|/li|/h[0-9]|/tr)\s*/?>"#, caseInsensitive: true)
    private static let listItem = AdoPattern(#"<li[^>]*>"#, caseInsensitive: true)
    private static let anyTag = AdoPattern(#"<[^>]+>"#)
    private static let plainEntity = AdoPattern(#"&(nbsp|amp|lt|gt|quot|#39);"#)
    private static let plainEntities = ["&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'"]
    private static let numberedEntity = AdoPattern(#"&#([0-9]+);"#)
    private static let spacesBeforeLineEnd = AdoPattern(#"[ \t]+\n"#)
    private static let blankLines = AdoPattern(#"\n{3,}"#)

    /// Rich text as plain text, one line per block and a bullet per list item (the server's `htmlToText`). The screens
    /// that can't draw markdown show this.
    static func text(_ html: String?) -> String {
        guard let html, !html.isEmpty else { return "" }
        var text = lineEnd.replacing(in: html, with: "\n")
        text = listItem.replacing(in: text, with: "• ")
        text = anyTag.replacing(in: text, with: "")
        text = plainEntity.replacing(in: text) { plainEntities[$0.text] ?? $0.text }
        text = numberedEntity.replacing(in: text) { match in
            guard let code = UInt32(match[1] ?? ""), let scalar = Unicode.Scalar(code) else { return match.text }
            return String(Character(scalar))
        }
        text = spacesBeforeLineEnd.replacing(in: text, with: "\n")
        text = blankLines.replacing(in: text, with: "\n\n")
        return AdoText.trim(text)
    }
}
