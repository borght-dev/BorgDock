import Foundation

// `Ci/` is the server's `server/src/github/ci/` in Swift, pattern for pattern. What is here makes Swift read text the
// way that JavaScript does, so one log gives the same signals and fingerprints on the phone as on the server.

extension Regex {
    /// Matches as JavaScript does: `\w`, `\d` and `\b` know ASCII only, and a word ends where `\w` ends. It still
    /// steps by whole character where JavaScript steps by code unit: matching by Unicode scalar would be closer,
    /// but with it `\w` and `\b` no longer count digits as part of a word (Swift 6.4).
    var asInJavaScript: Regex<Output> {
        asciiOnlyWordCharacters().asciiOnlyDigits().wordBoundaryKind(.simple)
    }
}

extension StringProtocol {
    /// JavaScript's `trim()`.
    var trimmed: String { String(trimmedStart).trimmedEnd }

    /// JavaScript's `trimStart()`.
    var trimmedStart: SubSequence { drop(while: \.isWhitespace) }

    /// JavaScript's `trimEnd()`.
    var trimmedEnd: String {
        var end = endIndex
        while end > startIndex, self[index(before: end)].isWhitespace { end = index(before: end) }
        return String(self[..<end])
    }
}

extension String {
    /// At most `limit` code points; an ellipsis takes the last place when something was cut.
    func clipped(to limit: Int) -> String {
        guard unicodeScalars.count > limit else { return self }
        return String(unicodeScalars.prefix(limit - 1)) + "…"
    }
}

extension Optional where Wrapped == String {
    /// Nil for an empty string too: what JavaScript's `value ? … : …` takes for missing.
    var nonEmpty: String? { self?.isEmpty == false ? self : nil }
}
