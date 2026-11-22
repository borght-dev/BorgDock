import Foundation

// The server's ADO code is TypeScript, and its rules lean on JavaScript's strings and regular expressions. These two
// helpers keep the Swift ports cutting, splitting and matching exactly as the server does, so one input gives one
// answer on both sides.

/// A regular expression with the few operations the ports need. The patterns are the server's own in ICU's spelling:
/// `\z` where JavaScript's `$` means the very end, and ASCII classes written out where its `\w` and `\d` are ASCII only.
struct AdoPattern: Sendable {
    struct Match {
        let range: NSRange
        /// The whole match first, then each group; nil for a group that took no part.
        let groups: [String?]

        var text: String { groups[0] ?? "" }

        subscript(group: Int) -> String? { groups[group] }
    }

    private let expression: NSRegularExpression

    init(_ pattern: String, caseInsensitive: Bool = false) {
        // Every pattern is a literal in this folder: one that doesn't compile is a typo, never something an input causes.
        expression = try! NSRegularExpression(pattern: pattern, options: caseInsensitive ? [.caseInsensitive] : [])
    }

    func matches(in text: String) -> [Match] {
        let source = text as NSString
        return expression.matches(in: text, range: NSRange(location: 0, length: source.length)).map { result in
            Match(range: result.range, groups: (0..<result.numberOfRanges).map { group in
                let range = result.range(at: group)
                return range.location == NSNotFound ? nil : source.substring(with: range)
            })
        }
    }

    func firstMatch(in text: String) -> Match? {
        let source = text as NSString
        guard let result = expression.firstMatch(in: text, range: NSRange(location: 0, length: source.length)) else { return nil }
        return Match(range: result.range, groups: (0..<result.numberOfRanges).map { group in
            let range = result.range(at: group)
            return range.location == NSNotFound ? nil : source.substring(with: range)
        })
    }

    func isFound(in text: String) -> Bool {
        expression.firstMatch(in: text, range: NSRange(location: 0, length: (text as NSString).length)) != nil
    }

    /// JavaScript's `replace` with a function, over every match.
    func replacing(in text: String, with replacement: (Match) -> String) -> String {
        let found = matches(in: text)
        guard !found.isEmpty else { return text }
        let source = text as NSString
        var result = ""
        var end = 0
        for match in found {
            result += source.substring(with: NSRange(location: end, length: match.range.location - end))
            result += replacement(match)
            end = match.range.location + match.range.length
        }
        return result + source.substring(from: end)
    }

    func replacing(in text: String, with replacement: String) -> String {
        replacing(in: text) { _ in replacement }
    }
}

/// JavaScript's string rules where Swift's differ: what counts as white space, and pieces counted in Unicode scalars or
/// UTF-16 units instead of characters (Swift reads "\r\n" as one character, so a split on "\n" would miss it).
enum AdoText {
    /// What JavaScript's `trim()` and `\s` take: its white space and its line ends.
    static func isWhitespace(_ scalar: Unicode.Scalar) -> Bool {
        switch scalar.value {
        case 0x09...0x0D, 0x20, 0xA0, 0x1680, 0x2000...0x200A, 0x2028, 0x2029, 0x202F, 0x205F, 0x3000, 0xFEFF: true
        default: false
        }
    }

    static func trim(_ text: String) -> String {
        let scalars = text.unicodeScalars
        guard let first = scalars.firstIndex(where: { !isWhitespace($0) }),
              let last = scalars.lastIndex(where: { !isWhitespace($0) })
        else { return "" }
        return String(Substring(scalars[first...last]))
    }

    static func trimEnd(_ text: String) -> String {
        let scalars = text.unicodeScalars
        guard let last = scalars.lastIndex(where: { !isWhitespace($0) }) else { return "" }
        return String(Substring(scalars[...last]))
    }

    /// Every run of white space as one space: `replace(/\s+/g, ' ')`.
    static func collapsingWhitespace(_ text: String) -> String {
        var result = String.UnicodeScalarView()
        var inRun = false
        for scalar in text.unicodeScalars {
            if isWhitespace(scalar) {
                if !inRun { result.append(" ") }
                inRun = true
            } else {
                result.append(scalar)
                inRun = false
            }
        }
        return String(result)
    }

    /// JavaScript's `split`: every piece, empty ones included.
    static func split(_ text: String, on separator: Unicode.Scalar) -> [String] {
        split(text) { $0 == separator }
    }

    static func split(_ text: String, where isSeparator: (Unicode.Scalar) -> Bool) -> [String] {
        text.unicodeScalars.split(omittingEmptySubsequences: false, whereSeparator: isSeparator).map { String(Substring($0)) }
    }

    static func removing(_ unwanted: Set<Unicode.Scalar>, from text: String) -> String {
        var kept = String.UnicodeScalarView()
        kept.append(contentsOf: text.unicodeScalars.filter { !unwanted.contains($0) })
        return String(kept)
    }

    /// The first `limit` UTF-16 units: `slice(0, limit)`.
    static func prefix(_ text: String, utf16 limit: Int) -> String {
        text.utf16.count > limit ? String(decoding: Array(text.utf16.prefix(limit)), as: UTF16.self) : text
    }

    /// The text after its first `count` UTF-16 units: `slice(count)`.
    static func dropping(utf16 count: Int, from text: String) -> String {
        let source = text as NSString
        return count < source.length ? source.substring(from: count) : ""
    }

    private static let uriComponentCharacters = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()")

    static func encodeURIComponent(_ text: String) -> String {
        text.addingPercentEncoding(withAllowedCharacters: uriComponentCharacters) ?? text
    }

    /// `parseInt(text, 10)`: the whole number a text starts with, whatever follows it.
    static func leadingInteger(_ text: String) -> Int? {
        var rest = text.unicodeScalars.drop(while: isWhitespace)
        var sign = ""
        if let first = rest.first, first == "-" || first == "+" {
            sign = first == "-" ? "-" : ""
            rest = rest.dropFirst()
        }
        let digits = rest.prefix { ("0"..."9").contains($0) }
        return digits.isEmpty ? nil : Int(sign + String(Substring(digits)))
    }
}
