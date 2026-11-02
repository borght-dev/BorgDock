import SwiftUI

/// A light, line-at-a-time highlighter for diffs: keywords, strings, comments, calls and type names.
/// Diff lines arrive one by one without their surroundings, so this stays lexical on purpose.
enum SyntaxHighlighter {
    enum Kind: Hashable, Sendable { case keyword, string, comment, function, type, number }

    struct Segment: Hashable, Sendable {
        let text: String
        let kind: Kind?
    }

    enum Language: Hashable, Sendable {
        case cLike(Set<String>)
        case hash(Set<String>)
        case plain

        /// `//` comments for C-like languages, `#` for scripts and config.
        var lineComment: String? {
            switch self {
            case .cLike: "//"
            case .hash: "#"
            case .plain: nil
            }
        }

        var keywords: Set<String> {
            switch self {
            case .cLike(let words), .hash(let words): words
            case .plain: []
            }
        }
    }

    static func language(for path: String) -> Language {
        let ext = (path as NSString).pathExtension.lowercased()
        switch ext {
        case "ts", "tsx", "js", "jsx", "mjs", "cjs", "mts", "cts": return .cLike(typescript)
        case "swift": return .cLike(swift)
        case "rs": return .cLike(rust)
        case "cs", "java", "kt", "go", "c", "h", "cpp", "hpp", "m", "scss", "css": return .cLike(csharp)
        case "py", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml", "ps1": return .hash(script)
        case "sql": return .cLike(sql)
        case "json": return .cLike(["true", "false", "null"])
        default: return .plain
        }
    }

    static func segments(_ line: String, language: Language) -> [Segment] {
        if case .plain = language { return [Segment(text: line, kind: nil)] }
        let chars = Array(line)
        var result: [Segment] = []
        var plain = ""
        var i = 0

        func flush() {
            if !plain.isEmpty { result.append(Segment(text: plain, kind: nil)) }
            plain = ""
        }
        func emit(_ kind: Kind, _ end: Int) {
            flush()
            result.append(Segment(text: String(chars[i..<end]), kind: kind))
            i = end
        }
        func starts(with token: String, at index: Int) -> Bool {
            let token = Array(token)
            guard index + token.count <= chars.count else { return false }
            return Array(chars[index..<index + token.count]) == token
        }

        while i < chars.count {
            let c = chars[i]
            if let comment = language.lineComment, starts(with: comment, at: i) {
                emit(.comment, chars.count)
            } else if starts(with: "/*", at: i), case .cLike = language {
                var end = i + 2
                while end < chars.count, !starts(with: "*/", at: end) { end += 1 }
                emit(.comment, min(chars.count, end + 2))
            } else if c == "\"" || c == "'" || c == "`" {
                var end = i + 1
                while end < chars.count, chars[end] != c {
                    end += chars[end] == "\\" ? 2 : 1
                }
                emit(.string, min(chars.count, end + 1))
            } else if c.isNumber, !(plain.last?.isLetter ?? false), !(plain.last == "_") {
                var end = i + 1
                while end < chars.count, chars[end].isNumber || chars[end] == "." || chars[end] == "_" || chars[end].isHexDigit { end += 1 }
                emit(.number, end)
            } else if c.isLetter || c == "_" || c == "$" {
                var end = i + 1
                while end < chars.count, chars[end].isLetter || chars[end].isNumber || chars[end] == "_" || chars[end] == "$" { end += 1 }
                let word = String(chars[i..<end])
                var next = end
                while next < chars.count, chars[next] == " " { next += 1 }
                if language.keywords.contains(word) {
                    emit(.keyword, end)
                } else if next < chars.count, chars[next] == "(" {
                    emit(.function, end)
                } else if let first = word.first, first.isUppercase, word.count > 1 {
                    emit(.type, end)
                } else {
                    plain += word
                    i = end
                }
            } else {
                plain.append(c)
                i += 1
            }
        }
        flush()
        return result
    }

    static func attributed(_ line: String, language: Language) -> AttributedString {
        var text = AttributedString()
        for segment in segments(line, language: language) {
            var part = AttributedString(segment.text)
            if let kind = segment.kind { part.foregroundColor = color(kind) }
            text += part
        }
        return text
    }

    static func color(_ kind: Kind) -> Color {
        switch kind {
        case .keyword: BD.Syntax.keyword
        case .string: BD.Syntax.string
        case .comment: BD.Syntax.comment
        case .function: BD.Syntax.function
        case .type: BD.Syntax.type
        case .number: BD.Syntax.string
        }
    }

    private static let typescript: Set<String> = [
        "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue", "default", "delete",
        "do", "else", "enum", "export", "extends", "false", "finally", "for", "from", "function", "if", "implements",
        "import", "in", "instanceof", "interface", "let", "new", "null", "of", "private", "protected", "public",
        "readonly", "return", "static", "super", "switch", "this", "throw", "true", "try", "type", "typeof",
        "undefined", "var", "void", "while", "yield",
    ]
    private static let swift: Set<String> = [
        "actor", "as", "async", "await", "break", "case", "catch", "class", "continue", "default", "defer", "do", "else",
        "enum", "extension", "false", "fileprivate", "for", "func", "guard", "if", "import", "in", "init", "internal",
        "is", "let", "nil", "private", "protocol", "public", "return", "self", "Self", "static", "struct", "super",
        "switch", "throw", "throws", "true", "try", "var", "where", "while",
    ]
    private static let rust: Set<String> = [
        "as", "async", "await", "break", "const", "continue", "crate", "else", "enum", "false", "fn", "for", "if", "impl",
        "in", "let", "loop", "match", "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static", "struct",
        "super", "trait", "true", "type", "unsafe", "use", "where", "while",
    ]
    private static let csharp: Set<String> = [
        "abstract", "async", "await", "base", "bool", "break", "case", "catch", "class", "const", "continue", "default",
        "do", "else", "enum", "false", "finally", "for", "foreach", "func", "go", "if", "import", "in", "int",
        "interface", "internal", "namespace", "new", "null", "override", "package", "private", "protected", "public",
        "readonly", "return", "static", "string", "struct", "switch", "this", "throw", "true", "try", "using", "var",
        "void", "while",
    ]
    private static let script: Set<String> = [
        "and", "as", "class", "def", "do", "elif", "else", "end", "except", "export", "false", "fi", "for", "from",
        "function", "if", "import", "in", "is", "lambda", "local", "None", "not", "or", "pass", "raise", "return",
        "then", "true", "True", "False", "try", "while", "with", "yield",
    ]
    private static let sql: Set<String> = [
        "SELECT", "FROM", "WHERE", "AND", "OR", "INSERT", "INTO", "UPDATE", "DELETE", "SET", "JOIN", "LEFT", "INNER",
        "ON", "AS", "GROUP", "BY", "ORDER", "CREATE", "TABLE", "ALTER", "NOT", "NULL", "VALUES", "select", "from",
        "where", "and", "or", "join", "on", "as",
    ]
}
