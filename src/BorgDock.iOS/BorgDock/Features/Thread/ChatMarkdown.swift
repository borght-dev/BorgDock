import SwiftUI

/// An agent's markdown as chat text: paragraphs, headings and bold-only lines as titles, numbered and bulleted
/// lists with hanging indents, tables, quotes, rules, code blocks in mono, inline `code` in the accent colour.
struct ChatMarkdown: View {
    let text: String
    var size: CGFloat = 15.5

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(ChatBlock.parse(text).enumerated()), id: \.offset) { _, block in
                view(for: block)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .textSelection(.enabled)
    }

    @ViewBuilder
    private func view(for block: ChatBlock) -> some View {
        switch block {
        case .title(let line):
            Text(Self.inline(line, size: size + 1.5)).font(.system(size: size + 1.5, weight: .bold))
        case .paragraph(let line):
            Text(Self.inline(line, size: size)).font(.system(size: size)).lineSpacing(3)
        case .list(let items, let numbered):
            VStack(alignment: .leading, spacing: 5) {
                ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                    HStack(alignment: .firstTextBaseline, spacing: 6) {
                        Text(numbered ? "\(index + 1)." : "•")
                            .font(.system(size: size).monospacedDigit())
                            .frame(minWidth: 18, alignment: .trailing)
                        Text(Self.inline(item, size: size)).font(.system(size: size)).lineSpacing(3)
                    }
                }
            }
        case .code(let code):
            Text(code)
                .font(.system(size: size - 2.5, design: .monospaced))
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(BD.fill, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
        case .table(let header, let rows):
            ChatTable(header: header, rows: rows, size: size - 2)
        case .quote(let line):
            Text(Self.inline(line, size: size)).font(.system(size: size)).lineSpacing(3)
                .foregroundStyle(BD.text2)
                .padding(.leading, 12)
                .overlay(alignment: .leading) { Capsule().fill(BD.separator).frame(width: 3) }
        case .rule:
            Divider().overlay(BD.separator).padding(.vertical, 4)
        }
    }

    static func inline(_ text: String, size: CGFloat) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        var result = (try? AttributedString(markdown: text, options: options)) ?? AttributedString(text)
        for run in result.runs where run.inlinePresentationIntent?.contains(.code) == true {
            result[run.range].font = .system(size: size - 1, design: .monospaced)
            result[run.range].foregroundColor = BD.accentText
        }
        return result
    }
}

enum ChatBlock: Equatable {
    case title(String)
    case paragraph(String)
    case list([String], numbered: Bool)
    case code(String)
    case table(header: [String], rows: [[String]])
    case quote(String)
    case rule

    static func parse(_ markdown: String) -> [ChatBlock] {
        var blocks: [ChatBlock] = []
        var paragraph: [String] = []
        var list: [String] = []
        var numbered = false
        var code: [String]?
        var table: [String] = []
        var quote: [String] = []

        func flush() {
            if !paragraph.isEmpty { blocks.append(.paragraph(paragraph.joined(separator: " "))); paragraph = [] }
            if !list.isEmpty { blocks.append(.list(list, numbered: numbered)); list = [] }
            if !quote.isEmpty { blocks.append(.quote(quote.joined(separator: " "))); quote = [] }
            if !table.isEmpty { blocks.append(contentsOf: tableBlocks(table)); table = [] }
        }

        for raw in markdown.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n") {
            let line = raw.trimmingCharacters(in: .whitespaces)
            if line.hasPrefix("```") {
                if let open = code {
                    blocks.append(.code(open.joined(separator: "\n")))
                    code = nil
                } else {
                    flush()
                    code = []
                }
                continue
            }
            if code != nil { code?.append(raw); continue }
            if line.isEmpty { flush(); continue }
            if line.hasPrefix("|") {
                if table.isEmpty { flush() }
                table.append(line)
                continue
            }
            if !table.isEmpty { flush() }
            if line.hasPrefix(">") {
                if quote.isEmpty { flush() }
                quote.append(line.dropFirst().trimmingCharacters(in: .whitespaces))
                continue
            }
            if !quote.isEmpty { flush() }
            if isRule(line) {
                flush()
                blocks.append(.rule)
            } else if line.hasPrefix("#") {
                flush()
                blocks.append(.title(line.drop { $0 == "#" }.trimmingCharacters(in: .whitespaces)))
            } else if line.hasPrefix("**"), line.hasSuffix("**"), line.count > 4, !line.dropFirst(2).dropLast(2).contains("**") {
                flush()
                blocks.append(.title(String(line.dropFirst(2).dropLast(2))))
            } else if let item = numberedItem(line) {
                if !paragraph.isEmpty || (!list.isEmpty && !numbered) { flush() }
                numbered = true
                list.append(item)
            } else if line.hasPrefix("- ") || line.hasPrefix("* ") {
                if !paragraph.isEmpty || (!list.isEmpty && numbered) { flush() }
                numbered = false
                list.append(String(line.dropFirst(2)))
            } else if !list.isEmpty && raw.hasPrefix("  ") {
                list[list.count - 1] += " " + line
            } else {
                if !list.isEmpty { flush() }
                paragraph.append(line)
            }
        }
        if let open = code { blocks.append(.code(open.joined(separator: "\n"))) }
        flush()
        return blocks
    }

    /// A header row, a `|---|:--:|` delimiter row, then body rows. Without the delimiter the lines stay text.
    private static func tableBlocks(_ lines: [String]) -> [ChatBlock] {
        guard lines.count >= 2, isDelimiterRow(lines[1]) else { return [.paragraph(lines.joined(separator: " "))] }
        let header = cells(lines[0])
        let rows = lines.dropFirst(2).map { row in
            let cells = cells(row)
            return Array((cells + Array(repeating: "", count: max(0, header.count - cells.count))).prefix(header.count))
        }
        return [.table(header: header, rows: rows)]
    }

    private static func cells(_ row: String) -> [String] {
        var inner = Substring(row)
        if inner.hasPrefix("|") { inner = inner.dropFirst() }
        if inner.hasSuffix("|"), !inner.hasSuffix("\\|") { inner = inner.dropLast() }
        return inner.replacingOccurrences(of: "\\|", with: "\u{1}")
            .components(separatedBy: "|")
            .map { $0.replacingOccurrences(of: "\u{1}", with: "|").trimmingCharacters(in: .whitespaces) }
    }

    private static func isDelimiterRow(_ row: String) -> Bool {
        let cells = cells(row)
        return !cells.isEmpty && cells.allSatisfy { cell in
            cell.contains("-") && cell.allSatisfy { $0 == "-" || $0 == ":" }
        }
    }

    private static func isRule(_ line: String) -> Bool {
        let marks = line.filter { $0 != " " }
        guard marks.count >= 3, let mark = marks.first, "-*_".contains(mark) else { return false }
        return marks.allSatisfy { $0 == mark }
    }

    private static func numberedItem(_ line: String) -> String? {
        guard let dot = line.firstIndex(where: { $0 == "." || $0 == ")" }), line[..<dot].allSatisfy(\.isNumber), !line[..<dot].isEmpty else { return nil }
        let rest = line[line.index(after: dot)...]
        guard rest.first == " " else { return nil }
        return rest.trimmingCharacters(in: .whitespaces)
    }
}

/// A markdown table in a rounded frame: a tinted header row, hairlines between rows, cells wrapping inside the
/// widths `TableLayout` gives them.
struct ChatTable: View {
    let header: [String]
    let rows: [[String]]
    var size: CGFloat = 13.5

    var body: some View {
        TableLayout(columns: header.count) {
            ForEach(Array(header.enumerated()), id: \.offset) { _, text in
                cell(text, weight: .semibold).background(BD.fill)
            }
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                ForEach(Array(row.enumerated()), id: \.offset) { _, text in
                    cell(text, weight: .regular)
                        .overlay(alignment: .top) { Rectangle().fill(BD.separator).frame(height: 0.5) }
                }
            }
        }
        .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
        .overlay { RoundedRectangle(cornerRadius: 10, style: .continuous).strokeBorder(BD.separator, lineWidth: 0.5) }
    }

    private func cell(_ text: String, weight: Font.Weight) -> some View {
        Text(ChatMarkdown.inline(text, size: size))
            .font(.system(size: size, weight: weight))
            .padding(.horizontal, 9)
            .padding(.vertical, 7)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// Cells row by row. Columns are as wide as their content when the table fits; otherwise the narrow columns keep
/// their width and the wide ones share what is left equally, so a table reads on a phone without scrolling sideways.
struct TableLayout: Layout {
    let columns: Int
    var minimumColumn: CGFloat = 64

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let widths = columnWidths(available: proposal.width, subviews: subviews)
        return CGSize(width: widths.reduce(0, +), height: rowHeights(widths, subviews: subviews).reduce(0, +))
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let widths = columnWidths(available: bounds.width, subviews: subviews)
        var y = bounds.minY
        for (row, height) in rowHeights(widths, subviews: subviews).enumerated() {
            var x = bounds.minX
            for column in 0..<columns {
                let index = row * columns + column
                guard index < subviews.count else { break }
                subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(width: widths[column], height: height))
                x += widths[column]
            }
            y += height
        }
    }

    private func columnWidths(available: CGFloat?, subviews: Subviews) -> [CGFloat] {
        guard columns > 0 else { return [] }
        var ideal = Array(repeating: CGFloat(0), count: columns)
        for (index, cell) in subviews.enumerated() {
            ideal[index % columns] = max(ideal[index % columns], cell.sizeThatFits(.unspecified).width)
        }
        guard let available, available.isFinite, ideal.reduce(0, +) > available else { return ideal }
        return Self.share(available, ideal: ideal, minimum: min(minimumColumn, available / CGFloat(columns)))
    }

    private func rowHeights(_ widths: [CGFloat], subviews: Subviews) -> [CGFloat] {
        guard columns > 0 else { return [] }
        return stride(from: 0, to: subviews.count, by: columns).map { start in
            (start..<min(start + columns, subviews.count)).map { index in
                subviews[index].sizeThatFits(ProposedViewSize(width: widths[index - start], height: nil)).height
            }.max() ?? 0
        }
    }

    /// Columns narrower than an equal share keep their ideal width; the rest split what remains equally.
    static func share(_ available: CGFloat, ideal: [CGFloat], minimum: CGFloat) -> [CGFloat] {
        var widths = ideal
        var open = Array(ideal.indices)
        var left = available
        while !open.isEmpty {
            let equal = max(minimum, left / CGFloat(open.count))
            let fitting = open.filter { ideal[$0] <= equal }
            guard !fitting.isEmpty else {
                for index in open { widths[index] = equal }
                break
            }
            for index in fitting { left -= ideal[index] }
            open.removeAll { fitting.contains($0) }
        }
        return widths
    }
}
