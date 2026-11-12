import Foundation

/// GitHub-flavoured markdown as blocks, for `GitHubMarkdown` and `ChatMarkdown` to draw. Inline text stays markdown
/// source (`MarkdownInline` styles it); HTML a GitHub body carries is folded into the same blocks.
enum MarkdownBlock: Equatable, Sendable {
    case heading(level: Int, text: String)
    case paragraph(String)
    case list(MarkdownList)
    case code(language: String?, text: String)
    case quote([MarkdownBlock])
    case table(MarkdownTable)
    case images([MarkdownImage])
    /// `<details><summary>…</summary>…</details>`: folded until tapped.
    case details(summary: String, content: [MarkdownBlock])
    case rule
}

struct MarkdownList: Equatable, Sendable {
    struct Item: Equatable, Sendable {
        /// A task list item's box: nil for an ordinary item.
        var task: Bool?
        var blocks: [MarkdownBlock]
    }

    var ordered: Bool
    var start = 1
    var items: [Item]
}

struct MarkdownTable: Equatable, Sendable {
    /// Empty for an HTML table without `<th>` cells.
    var header: [String]
    var rows: [[String]]
}

struct MarkdownImage: Hashable, Sendable {
    var url: String
    var alt: String
    var link: String?
}

enum MarkdownParser {
    struct Options: Sendable {
        /// Agents write "**What I did**" on a line of its own as a heading.
        var boldLinesAsHeadings = false
    }

    static func parse(_ markdown: String, options: Options = Options()) -> [MarkdownBlock] {
        var parser = LineParser(lines: lines(of: MarkdownCleanup.clean(markdown).text), options: options)
        return parser.blocks()
    }

    static func lines(of text: String) -> [String] {
        text.split(separator: "\n", omittingEmptySubsequences: false).map { $0.replacingOccurrences(of: "\t", with: "    ") }
    }
}

/// What a body loses before it renders: HTML comments, a bot's footer between its own markers
/// (`<!-- codesmith:footer -->` … `<!-- /codesmith:footer -->`) and badges (linked images at most 40 px high).
/// The rules are the desktop's `review-proof.ts`.
enum MarkdownCleanup {
    struct Result: Equatable {
        var text: String
        var removedFooter = false
        var removedBadges = 0
    }

    static let badgeHeight = 40

    static func clean(_ markdown: String) -> Result {
        let text = markdown.replacingOccurrences(of: "\r\n", with: "\n")
        let withoutFooters = text.replacing(footer, with: "")
        var badges = 0
        let cleaned = withoutFooters.replacing(comment, with: "").replacing(anchor) { match in
            let whole = String(match.output.0)
            let inner = String(match.output.inner)
            let kept = inner.replacing(image) { isBadge(String($0.output)) ? "" : String($0.output) }
            guard kept != inner else { return whole }
            badges += 1
            return kept.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? "" : whole.replacingOccurrences(of: inner, with: kept)
        }
        return Result(text: cleaned, removedFooter: withoutFooters != text, removedBadges: badges)
    }

    private static func isBadge(_ tag: String) -> Bool {
        guard let height = HTML.attribute("height", in: tag).flatMap({ Int($0.filter(\.isNumber)) }) else { return false }
        return height > 0 && height <= badgeHeight
    }

    private nonisolated(unsafe) static let footer = #/(?i)<!--\s*([\w.-]+):footer\s*-->[\s\S]*?<!--\s*\/\1:footer\s*-->/#
    private nonisolated(unsafe) static let comment = #/<!--[\s\S]*?-->/#
    private nonisolated(unsafe) static let anchor = #/(?i)<a\b[^>]*>(?<inner>[\s\S]*?)<\/a>/#
    private nonisolated(unsafe) static let image = #/(?i)<img\b[^>]*>/#
}

/// The few HTML helpers the parser needs: attributes and the text inside tags.
enum HTML {
    static func attribute(_ name: String, in tag: String) -> String? {
        let pattern = #"(?i)\b\#(name)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))"#
        guard let regex = try? NSRegularExpression(pattern: pattern),
              let match = regex.firstMatch(in: tag, range: NSRange(tag.startIndex..., in: tag)) else { return nil }
        for group in 1...3 {
            if let range = Range(match.range(at: group), in: tag) { return decodeEntities(String(tag[range])) }
        }
        return nil
    }

    static func decodeEntities(_ text: String) -> String {
        text.replacingOccurrences(of: "&quot;", with: "\"")
            .replacingOccurrences(of: "&#39;", with: "'")
            .replacingOccurrences(of: "&lt;", with: "<")
            .replacingOccurrences(of: "&gt;", with: ">")
            .replacingOccurrences(of: "&nbsp;", with: " ")
            .replacingOccurrences(of: "&amp;", with: "&")
    }
}

// MARK: - Lines to blocks

private struct LineParser {
    let lines: [String]
    let options: MarkdownParser.Options
    var index = 0

    init(lines: [String], options: MarkdownParser.Options) {
        self.lines = lines
        self.options = options
    }

    mutating func blocks() -> [MarkdownBlock] {
        var blocks: [MarkdownBlock] = []
        while index < lines.count {
            if lines[index].isBlank || Line.isLoneWrapperTag(lines[index]) {
                index += 1
                continue
            }
            blocks.append(contentsOf: block())
        }
        return blocks
    }

    private mutating func block() -> [MarkdownBlock] {
        let line = lines[index]
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        if let fence = Line.fence(line) { return [code(fence)] }
        if trimmed.lowercased().hasPrefix("<details") { return [details()] }
        if trimmed.lowercased().hasPrefix("<table") { return [htmlTable()] }
        if let heading = Line.heading(line) ?? Line.htmlHeading(trimmed) {
            index += 1
            return [.heading(level: heading.level, text: heading.text)]
        }
        if Line.isRule(line) || trimmed.range(of: #"^(?i)<hr\s*/?>$"#, options: .regularExpression) != nil {
            index += 1
            return [.rule]
        }
        if Line.quoteContent(line) != nil { return [quote()] }
        if let marker = Line.listMarker(line) { return [list(marker)] }
        if let table = pipeTable() { return [.table(table)] }
        return paragraph()
    }

    private func startsBlock(_ line: String) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces).lowercased()
        return Line.fence(line) != nil || Line.heading(line) != nil || Line.isRule(line) || Line.quoteContent(line) != nil
            || Line.listMarker(line) != nil || trimmed.hasPrefix("<details") || trimmed.hasPrefix("<table")
    }

    // MARK: Paragraphs and images

    private mutating func paragraph() -> [MarkdownBlock] {
        var text: [String] = []
        while index < lines.count {
            let line = lines[index]
            if !text.isEmpty, let level = Line.setextLevel(line) {
                index += 1
                return [.heading(level: level, text: text.joined(separator: " "))]
            }
            if line.isBlank || (!text.isEmpty && (startsBlock(line) || isPipeTableStart(at: index))) { break }
            text.append(line.trimmingCharacters(in: .whitespaces))
            index += 1
        }
        let joined = text.joined(separator: "\n")
        if options.boldLinesAsHeadings, text.count == 1, let title = Line.boldOnly(joined) {
            return [.heading(level: 4, text: title)]
        }
        let (rest, images) = MarkdownImages.extract(joined)
        var blocks: [MarkdownBlock] = []
        let visible = rest.replacingOccurrences(of: #"<[^>]+>"#, with: "", options: .regularExpression)
        if !visible.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            blocks.append(.paragraph(rest.trimmingCharacters(in: .whitespacesAndNewlines)))
        }
        if !images.isEmpty { blocks.append(.images(images)) }
        return blocks
    }

    // MARK: Code

    private mutating func code(_ fence: Line.Fence) -> MarkdownBlock {
        index += 1
        var body: [String] = []
        while index < lines.count {
            let line = lines[index]
            index += 1
            if Line.closesFence(line, fence) { break }
            body.append(String(line.dropFirst(min(fence.indent, line.leadingSpaces))))
        }
        return .code(language: fence.info.isEmpty ? nil : fence.info, text: body.joined(separator: "\n"))
    }

    // MARK: Quotes

    private mutating func quote() -> MarkdownBlock {
        var inner: [String] = []
        while index < lines.count, let content = Line.quoteContent(lines[index]) ?? lazyContinuation(after: inner) {
            inner.append(content)
            index += 1
        }
        var parser = LineParser(lines: inner, options: options)
        return .quote(parser.blocks())
    }

    /// A paragraph line that continues the quote or list item above it without repeating its marker.
    private func lazyContinuation(after previous: [String]) -> String? {
        let line = lines[index]
        guard let last = previous.last, !last.isBlank, !line.isBlank, !startsBlock(line) else { return nil }
        return line.trimmingCharacters(in: .whitespaces)
    }

    // MARK: Lists

    private mutating func list(_ first: Line.ListMarker) -> MarkdownBlock {
        var items: [MarkdownList.Item] = []
        var current: [String] = [first.content]
        var contentIndent = first.contentIndent
        index += 1

        func finish() {
            while current.last?.isBlank == true { current.removeLast() }
            var task: Bool?
            if let head = current.first, let box = Line.taskBox(head) {
                task = box.checked
                current[0] = box.rest
            }
            var parser = LineParser(lines: current, options: options)
            items.append(MarkdownList.Item(task: task, blocks: parser.blocks()))
        }

        while index < lines.count {
            let line = lines[index]
            if line.isBlank {
                current.append("")
                index += 1
                continue
            }
            if line.leadingSpaces < contentIndent, let marker = Line.listMarker(line), marker.ordered == first.ordered {
                finish()
                current = [marker.content]
                contentIndent = marker.contentIndent
                index += 1
                continue
            }
            if line.leadingSpaces >= contentIndent {
                current.append(String(line.dropFirst(contentIndent)))
                index += 1
                continue
            }
            if let continuation = lazyContinuation(after: current) {
                current.append(continuation)
                index += 1
                continue
            }
            break
        }
        finish()
        return .list(MarkdownList(ordered: first.ordered, start: first.number, items: items))
    }

    // MARK: Tables

    private func isPipeTableStart(at row: Int) -> Bool {
        guard row + 1 < lines.count, lines[row].contains("|") else { return false }
        let header = Line.cells(lines[row])
        let delimiter = lines[row + 1]
        return Line.isDelimiterRow(delimiter) && Line.cells(delimiter).count == header.count
    }

    private mutating func pipeTable() -> MarkdownTable? {
        guard isPipeTableStart(at: index) else { return nil }
        let header = Line.cells(lines[index])
        index += 2
        var rows: [[String]] = []
        while index < lines.count, !lines[index].isBlank, lines[index].contains("|"), !startsBlock(lines[index]) {
            let cells = Line.cells(lines[index])
            rows.append(Array((cells + Array(repeating: "", count: max(0, header.count - cells.count))).prefix(header.count)))
            index += 1
        }
        return MarkdownTable(header: header, rows: rows)
    }

    private mutating func htmlTable() -> MarkdownBlock {
        let html = collect(open: "<table", close: "</table>")
        var header: [String] = []
        var rows: [[String]] = []
        for row in html.matches(of: #/(?i)<tr\b[^>]*>([\s\S]*?)<\/tr>/#) {
            let cells = String(row.output.1).matches(of: #/(?i)<t([hd])\b[^>]*>([\s\S]*?)<\/t[hd]>/#)
            let texts = cells.map { Line.collapsingWhitespace(String($0.output.2)) }
            if rows.isEmpty, header.isEmpty, cells.contains(where: { $0.output.1.lowercased() == "h" }) {
                header = texts
            } else {
                rows.append(texts)
            }
        }
        let columns = max(header.count, rows.map(\.count).max() ?? 0)
        let pad = { (cells: [String]) in cells + Array(repeating: "", count: columns - cells.count) }
        return .table(MarkdownTable(header: header.isEmpty ? [] : pad(header), rows: rows.map(pad)))
    }

    // MARK: Details

    private mutating func details() -> MarkdownBlock {
        let html = collect(open: "<details", close: "</details>")
        var body = html.replacing(#/(?i)^\s*<details\b[^>]*>/#, with: "")
        if let end = body.range(of: "</details>", options: [.caseInsensitive, .backwards]) { body = String(body[..<end.lowerBound]) }
        var summary = "Details"
        if let match = body.firstMatch(of: #/(?i)<summary\b[^>]*>([\s\S]*?)<\/summary>/#) {
            summary = Line.collapsingWhitespace(String(match.output.1))
            body.removeSubrange(match.range)
        }
        var parser = LineParser(lines: MarkdownParser.lines(of: body), options: options)
        return .details(summary: summary, content: parser.blocks())
    }

    /// The lines from an HTML block's opening tag to its matching close, nested blocks of the same tag included.
    private mutating func collect(open: String, close: String) -> String {
        var collected: [String] = []
        var depth = 0
        while index < lines.count {
            let line = lines[index]
            let lower = line.lowercased()
            depth += lower.components(separatedBy: open).count - 1
            depth -= lower.components(separatedBy: close).count - 1
            collected.append(line)
            index += 1
            if depth <= 0 { break }
        }
        return collected.joined(separator: "\n")
    }
}

// MARK: - One line

private enum Line {
    struct Fence {
        let indent: Int
        let marker: Character
        let count: Int
        let info: String
    }

    struct ListMarker {
        let ordered: Bool
        let number: Int
        let contentIndent: Int
        let content: String
    }

    static func fence(_ line: String) -> Fence? {
        let indent = line.leadingSpaces
        guard indent <= 3 else { return nil }
        let rest = line.dropFirst(indent)
        guard let marker = rest.first, marker == "`" || marker == "~" else { return nil }
        let count = rest.prefix { $0 == marker }.count
        guard count >= 3 else { return nil }
        let info = rest.dropFirst(count).trimmingCharacters(in: .whitespaces)
        if marker == "`", info.contains("`") { return nil }
        return Fence(indent: indent, marker: marker, count: count, info: info.split(separator: " ").first.map(String.init) ?? "")
    }

    static func closesFence(_ line: String, _ fence: Fence) -> Bool {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        return line.leadingSpaces <= 3 && trimmed.count >= fence.count && trimmed.allSatisfy { $0 == fence.marker }
    }

    static func heading(_ line: String) -> (level: Int, text: String)? {
        guard line.leadingSpaces <= 3 else { return nil }
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        let level = trimmed.prefix { $0 == "#" }.count
        guard (1...6).contains(level) else { return nil }
        let rest = trimmed.dropFirst(level)
        guard rest.isEmpty || rest.first == " " else { return nil }
        var text = rest.trimmingCharacters(in: .whitespaces)
        if let closing = text.range(of: #"\s+#+$"#, options: .regularExpression) { text.removeSubrange(closing) }
        if text.allSatisfy({ $0 == "#" }) { text = "" }
        return (level, text)
    }

    static func htmlHeading(_ trimmed: String) -> (level: Int, text: String)? {
        guard let match = trimmed.wholeMatch(of: #/(?i)<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/#), let level = Int(match.output.1) else { return nil }
        return (level, collapsingWhitespace(String(match.output.2)))
    }

    static func setextLevel(_ line: String) -> Int? {
        let trimmed = line.trimmingCharacters(in: .whitespaces)
        guard line.leadingSpaces <= 3, !trimmed.isEmpty else { return nil }
        if trimmed.allSatisfy({ $0 == "=" }) { return 1 }
        if trimmed.allSatisfy({ $0 == "-" }) { return 2 }
        return nil
    }

    static func isRule(_ line: String) -> Bool {
        guard line.leadingSpaces <= 3 else { return false }
        let marks = line.filter { $0 != " " }
        guard marks.count >= 3, let mark = marks.first, "-*_".contains(mark) else { return false }
        return marks.allSatisfy { $0 == mark }
    }

    static func quoteContent(_ line: String) -> String? {
        guard line.leadingSpaces <= 3 else { return nil }
        let trimmed = line.drop { $0 == " " }
        guard trimmed.first == ">" else { return nil }
        let rest = trimmed.dropFirst()
        return String(rest.first == " " ? rest.dropFirst() : rest)
    }

    static func listMarker(_ line: String) -> ListMarker? {
        let indent = line.leadingSpaces
        guard indent <= 3, !isRule(line) else { return nil }
        let rest = line.dropFirst(indent)
        let marker: Substring
        var ordered = false
        var number = 1
        if let first = rest.first, "-*+".contains(first) {
            marker = rest.prefix(1)
        } else {
            let digits = rest.prefix { $0.isASCII && $0.isNumber }
            guard (1...9).contains(digits.count), let delimiter = rest.dropFirst(digits.count).first, delimiter == "." || delimiter == ")" else { return nil }
            marker = rest.prefix(digits.count + 1)
            ordered = true
            number = Int(digits) ?? 1
        }
        let afterMarker = rest.dropFirst(marker.count)
        guard afterMarker.isEmpty || afterMarker.first == " " else { return nil }
        let spaces = afterMarker.prefix { $0 == " " }.count
        let padding = afterMarker.allSatisfy({ $0 == " " }) || spaces > 4 ? 1 : spaces
        return ListMarker(ordered: ordered, number: number, contentIndent: indent + marker.count + padding,
                          content: afterMarker.trimmingCharacters(in: .whitespaces))
    }

    static func taskBox(_ text: String) -> (checked: Bool, rest: String)? {
        guard let match = text.prefixMatch(of: #/\[([ xX])\](?:\s+|$)/#) else { return nil }
        return (match.output.1 != " ", String(text[match.range.upperBound...]))
    }

    static func boldOnly(_ line: String) -> String? {
        guard line.hasPrefix("**"), line.hasSuffix("**"), line.count > 4 else { return nil }
        let inner = line.dropFirst(2).dropLast(2)
        return inner.contains("**") ? nil : String(inner)
    }

    static func cells(_ row: String) -> [String] {
        var inner = Substring(row.trimmingCharacters(in: .whitespaces))
        if inner.hasPrefix("|") { inner = inner.dropFirst() }
        if inner.hasSuffix("|"), !inner.hasSuffix("\\|") { inner = inner.dropLast() }
        return inner.replacingOccurrences(of: "\\|", with: "\u{1}")
            .components(separatedBy: "|")
            .map { $0.replacingOccurrences(of: "\u{1}", with: "\\|").trimmingCharacters(in: .whitespaces) }
    }

    static func isDelimiterRow(_ row: String) -> Bool {
        let cells = cells(row)
        return !cells.isEmpty && cells.allSatisfy { cell in
            cell.contains("-") && cell.allSatisfy { $0 == "-" || $0 == ":" }
        }
    }

    /// `<p>`, `</div>`, `<ul>`: a line that only opens or closes a wrapper holds nothing to show.
    static func isLoneWrapperTag(_ line: String) -> Bool {
        line.trimmingCharacters(in: .whitespaces).wholeMatch(of: #/(?i)<\/?(p|div|span|center|ul|ol|li|section)\b[^>]*>/#) != nil
    }

    static func collapsingWhitespace(_ html: String) -> String {
        html.replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression).trimmingCharacters(in: .whitespaces)
    }
}

/// Images out of a paragraph's source, in the order they appear: markdown (`![alt](src)`, linked or not) and `<img>`.
enum MarkdownImages {
    static func extract(_ text: String) -> (text: String, images: [MarkdownImage]) {
        var found: [(position: Int, image: MarkdownImage)] = []
        var rest = text
        /// Each match becomes filler of its own length, so positions stay comparable across the patterns.
        func take<Output>(_ regex: Regex<Output>, _ make: (Regex<Output>.Match) -> MarkdownImage?) {
            while let match = rest.firstMatch(of: regex) {
                let position = rest.distance(from: rest.startIndex, to: match.range.lowerBound)
                if let image = make(match) { found.append((position, image)) }
                rest.replaceSubrange(match.range, with: String(repeating: "\u{FFFC}", count: rest[match.range].count))
            }
        }
        take(#/\[!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^)]*)?\s*\)\]\(\s*<?([^\s)>]+)>?[^)]*\)/#) {
            MarkdownImage(url: String($0.output.2), alt: String($0.output.1), link: String($0.output.3))
        }
        take(#/!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+["'][^)]*)?\s*\)/#) {
            MarkdownImage(url: String($0.output.2), alt: String($0.output.1))
        }
        take(#/(?i)<a\b([^>]*)>\s*(<img\b[^>]*>)\s*<\/a>/#) { match in
            let tag = String(match.output.2)
            return HTML.attribute("src", in: tag).map { MarkdownImage(url: $0, alt: HTML.attribute("alt", in: tag) ?? "", link: HTML.attribute("href", in: String(match.output.1))) }
        }
        take(#/(?i)<img\b[^>]*>/#) { match in
            let tag = String(match.output)
            return HTML.attribute("src", in: tag).map { MarkdownImage(url: $0, alt: HTML.attribute("alt", in: tag) ?? "") }
        }
        let images = found.sorted { $0.position < $1.position }.map(\.image)
        return (rest.replacingOccurrences(of: "\u{FFFC}", with: ""), images)
    }
}

private extension StringProtocol {
    var isBlank: Bool { allSatisfy { $0 == " " } }
    var leadingSpaces: Int { prefix { $0 == " " }.count }
}
