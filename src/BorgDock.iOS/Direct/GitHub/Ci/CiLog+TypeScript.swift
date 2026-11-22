import Foundation

// TypeScript compile errors and ESLint errors.

enum TypeScriptLog {
    private nonisolated(unsafe) static let tsc = #/^(.+?)\((\d+),(\d+)\):\s*error\s+(TS\d+):\s*(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let tscPretty = #/^(.+?):(\d+):(\d+)\s+-\s+error\s+(TS\d+):\s*(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let eslintInline = #/^(.+?):(\d+):(\d+)\s+-\s+error\s+(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let eslintStylish = #/^\s+(\d+):(\d+)\s+error\s+(.+?)\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let stylishFile = #/^\S*[\\/]\S*\.[A-Za-z]+$/#.asInJavaScript
    private nonisolated(unsafe) static let ruleId = #/^(?:@[\w-]+\/)?(?:[\w-]+\/)?[a-z][\w-]*$/#.asInJavaScript

    static func signals(in lines: [String]) -> [CiSignal] { compileErrors(in: lines) + lintErrors(in: lines) }

    private static func compileErrors(in lines: [String]) -> [CiSignal] {
        lines.compactMap { line in
            guard let match = line.wholeMatch(of: tsc) ?? line.wholeMatch(of: tscPretty) else { return nil }
            return CiSignal(
                kind: .compile, parser: "typescript", message: match.5.trimmed, path: CiLog.withoutAnnotation(match.1),
                line: Int(match.2), column: Int(match.3), code: String(match.4)
            )
        }
    }

    /// ESLint's one-line errors, and its stylish report: a file on a line of its own, then an indented
    /// `line:column  error  message  rule` line per error.
    private static func lintErrors(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var file: String?
        for line in lines {
            if let inline = line.wholeMatch(of: eslintInline) {
                if line.wholeMatch(of: tscPretty) == nil { signals.append(lint(path: inline.1.trimmed, line: inline.2, column: inline.3, text: inline.4)) }
            } else if let stylish = line.wholeMatch(of: eslintStylish) {
                if let file { signals.append(lint(path: file, line: stylish.1, column: stylish.2, text: stylish.3)) }
            } else if !line.hasPrefix(" "), !line.hasPrefix("\t") {
                file = line.wholeMatch(of: stylishFile) == nil ? nil : line
            }
        }
        return signals
    }

    private static func lint(path: String, line: Substring, column: Substring, text: Substring) -> CiSignal {
        let message = text.trimmed
        return CiSignal(kind: .lint, parser: "eslint", message: message, path: path, line: Int(line), column: Int(column), code: rule(in: message))
    }

    /// The rule ESLint names after the message: behind two spaces, or a last word with a slash in it.
    private static func rule(in message: String) -> String? {
        let candidate: String
        if let gap = message.range(of: "  ", options: .backwards) {
            candidate = message[gap.upperBound...].trimmed
        } else if let space = message.lastIndex(of: " ") {
            let last = message[message.index(after: space)...]
            guard last.contains("/") else { return nil }
            candidate = String(last)
        } else {
            candidate = message
        }
        return candidate.wholeMatch(of: ruleId) == nil ? nil : candidate
    }
}
