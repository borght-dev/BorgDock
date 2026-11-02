import Foundation

/// One line of a unified diff, numbered the way GitHub shows it.
struct DiffLine: Hashable, Identifiable, Sendable {
    enum Kind: Hashable, Sendable { case hunk, context, added, removed, note }

    let id: Int
    let kind: Kind
    /// Line in the old file (context and removed lines).
    let oldLine: Int?
    /// Line in the new file (context and added lines).
    let newLine: Int?
    /// The code without its +/-/space marker; the whole header for hunks.
    let text: String

    /// Where a review comment on this line goes: new-file lines on the right, removed lines on the left.
    var anchor: DiffAnchor? {
        switch kind {
        case .added, .context: newLine.map { DiffAnchor(line: $0, side: .right) }
        case .removed: oldLine.map { DiffAnchor(line: $0, side: .left) }
        case .hunk, .note: nil
        }
    }

    /// The number in the gutter.
    var number: Int? { kind == .removed ? oldLine : newLine }

    var marker: String {
        switch kind {
        case .added: "+"
        case .removed: "−"
        default: ""
        }
    }
}

struct DiffAnchor: Hashable, Codable, Sendable {
    let line: Int
    let side: DiffSide
}

/// Parses GitHub's per-file `patch` (hunks only, no `diff --git` header).
enum UnifiedDiff {
    static func parse(_ patch: String) -> [DiffLine] {
        var lines: [DiffLine] = []
        var old = 0
        var new = 0
        var raw = patch.components(separatedBy: "\n")
        if raw.last == "" { raw.removeLast() }
        for text in raw {
            let id = lines.count
            if text.hasPrefix("@@") {
                if let (oldStart, newStart) = hunkStarts(text) {
                    old = oldStart
                    new = newStart
                }
                lines.append(DiffLine(id: id, kind: .hunk, oldLine: nil, newLine: nil, text: text))
            } else if text.hasPrefix("\\") {
                lines.append(DiffLine(id: id, kind: .note, oldLine: nil, newLine: nil, text: String(text.dropFirst()).trimmingCharacters(in: .whitespaces)))
            } else if text.hasPrefix("+") {
                lines.append(DiffLine(id: id, kind: .added, oldLine: nil, newLine: new, text: String(text.dropFirst())))
                new += 1
            } else if text.hasPrefix("-") {
                lines.append(DiffLine(id: id, kind: .removed, oldLine: old, newLine: nil, text: String(text.dropFirst())))
                old += 1
            } else {
                lines.append(DiffLine(id: id, kind: .context, oldLine: old, newLine: new, text: text.isEmpty ? "" : String(text.dropFirst())))
                old += 1
                new += 1
            }
        }
        return lines
    }

    /// "@@ -32,9 +32,18 @@ export function …" → (32, 32).
    static func hunkStarts(_ header: String) -> (Int, Int)? {
        let parts = header.split(separator: " ")
        guard parts.count >= 3, parts[1].hasPrefix("-"), parts[2].hasPrefix("+") else { return nil }
        func start(_ part: Substring) -> Int? { Int(part.dropFirst().split(separator: ",").first ?? "") }
        guard let old = start(parts[1]), let new = start(parts[2]) else { return nil }
        return (old, new)
    }

    /// Leading spaces and tabs (a tab counts as two), for the hanging indent of wrapped lines.
    static func indent(_ text: String) -> (columns: Int, rest: Substring) {
        var columns = 0
        var index = text.startIndex
        while index < text.endIndex {
            switch text[index] {
            case " ": columns += 1
            case "\t": columns += 2
            default: return (columns, text[index...])
            }
            index = text.index(after: index)
        }
        return (columns, text[index...])
    }
}
