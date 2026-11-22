import Foundation

// msbuild errors and `dotnet test` failures (xUnit, NUnit, MSTest).

enum MsbuildLog {
    private nonisolated(unsafe) static let located = #/^(.+?)\((\d+),(\d+)\):\s*error\s+([A-Z]+\d+):\s*(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let unlocated = #/^(\S.*?)\s+:\s+error\s+([A-Z]+\d+):\s*(.+)$/#.asInJavaScript
    /// The project msbuild names after a message: ` [/src/Shop.Orders/Shop.Orders.csproj]`.
    private nonisolated(unsafe) static let projectSuffix = #/\s+\[[^\]]*\.(?:[a-z]*proj|slnx?)(?:::[^\]]*)?\]$/#.asInJavaScript

    /// Where an error is; msbuild prints the same one once per project that builds the file.
    private struct Place: Hashable {
        let path: String?
        let line: Int?
        let code: String?
    }

    static func signals(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var seen: [Place: Int] = [:]
        for line in lines where line.contains("error") {
            guard let found = signal(in: line) else { continue }
            let place = Place(path: found.path, line: found.line, code: found.code)
            if let index = seen[place] {
                signals[index].repeats += 1
            } else {
                seen[place] = signals.count
                signals.append(found)
            }
        }
        return signals
    }

    private static func signal(in line: String) -> CiSignal? {
        if let match = line.wholeMatch(of: located) {
            guard !isTypeScript(match.4) else { return nil }
            return CiSignal(
                kind: .compile, parser: "msbuild", message: message(match.5), path: CiLog.withoutAnnotation(match.1),
                line: Int(match.2), column: Int(match.3), code: String(match.4)
            )
        }
        guard let match = line.wholeMatch(of: unlocated), !isTypeScript(match.2) else { return nil }
        return CiSignal(kind: .compile, parser: "msbuild", message: message(match.3), path: CiLog.withoutAnnotation(match.1), code: String(match.2))
    }

    /// TypeScript prints its errors in msbuild's shape; they are the TypeScript parser's.
    private static func isTypeScript(_ code: Substring) -> Bool { code.hasPrefix("TS") && code.count >= 5 }

    private static func message(_ text: Substring) -> String { text.trimmed.replacing(projectSuffix, with: "") }
}

enum DotnetTestLog {
    private nonisolated(unsafe) static let failed = #/^\s*Failed\s+(\S+?(?:\(.*\))?)(?:\s+\[[^\]]*\])?\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let otherResult = #/^\s*(?:Passed|Skipped)\s/#.asInJavaScript
    private nonisolated(unsafe) static let frame = #/^at (.+?)(?: in (.+):line (\d+))?$/#.asInJavaScript
    private nonisolated(unsafe) static let exception = #/^((?:[A-Za-z_]\w*\.)+[A-Za-z_]\w*(?:Exception|Error))\b/#.asInJavaScript
    private nonisolated(unsafe) static let assertion = #/^(Assert\.\w+)(?:\(\))? (?:Failure|failed)\b/#.asInJavaScript
    private nonisolated(unsafe) static let nunitOneLine = #/^Expected:\s*(.*?)\s+But was:\s*(.*)$/#.asInJavaScript
    private nonisolated(unsafe) static let mstestValues = #/Expected:<(.*?)>\.?\s*Actual:<(.*?)>/#.asInJavaScript
    private static let sectionHeaders = ["Error Message:", "Stack Trace:", "Standard Output Messages:", "Standard Error Messages:"]
    private static let frameworkFrames = ["System.", "Microsoft.", "Xunit.", "NUnit."]

    static func signals(in lines: [String]) -> [CiSignal] {
        lines.indices.compactMap { index in
            lines[index].wholeMatch(of: failed).map { failure(of: String($0.1), block: block(after: index, in: lines)) }
        }
    }

    /// The lines under a `Failed …` line: its message and stack, up to the next test's result.
    private static func block(after index: Int, in lines: [String]) -> [String] {
        var block: [String] = []
        var next = index + 1
        while next < lines.count {
            let trimmed = lines[next].trimmed
            if block.count == CiSignal.maxExcerptLines || trimmed.hasPrefix("Failed ") || lines[next].prefixMatch(of: otherResult) != nil { break }
            if trimmed.isEmpty {
                // A blank line ends the block, unless the stack trace follows it.
                guard next + 1 < lines.count, lines[next + 1].trimmed == "Stack Trace:" else { break }
            } else {
                block.append(trimmed)
            }
            next += 1
        }
        return block
    }

    private static func failure(of name: String, block: [String]) -> CiSignal {
        let (testId, params) = split(name)
        let (expected, actual) = values(in: block)
        let frames = block.compactMap { $0.wholeMatch(of: frame) }
            .filter { match in !frameworkFrames.contains { match.1.hasPrefix($0) } }
            .prefix(CiSignal.maxFrames)
        let located = frames.first { $0.2?.isEmpty == false }
        let named = block.lazy.compactMap(errorClass(in:)).first
        let nunit = block.contains { $0.hasPrefix("But was:") || $0.wholeMatch(of: nunitOneLine) != nil }
        return CiSignal(
            kind: .test, parser: "dotnet-test", message: block.first { !sectionHeaders.contains($0) } ?? "Test failed: \(name)",
            testId: testId, params: params, path: located?.2.map { String($0) }, line: located?.3.flatMap { Int($0) },
            errorClass: named ?? (nunit ? "NUnit.Framework.AssertionException" : nil), expected: expected, actual: actual,
            excerpt: Array(block.prefix(10)), frames: frames.map { String($0.1) }
        )
    }

    /// `Pays_with_card(card: "visa")` → the test and its parameters.
    private static func split(_ name: String) -> (testId: String, params: String?) {
        guard let open = name.firstIndex(of: "("), open > name.startIndex, name.hasSuffix(")") else { return (name, nil) }
        return (String(name[..<open]), String(name[name.index(after: open)...].dropLast()))
    }

    /// What the assertion expected and what it got, in xUnit's, NUnit's or MSTest's wording.
    private static func values(in block: [String]) -> (expected: String?, actual: String?) {
        var expected: String?
        var actual: String?
        for line in block {
            if let pair = line.wholeMatch(of: nunitOneLine) ?? line.firstMatch(of: mstestValues) {
                expected = expected ?? pair.1.trimmed
                actual = actual ?? pair.2.trimmed
            } else if line.hasPrefix("Expected:") {
                expected = expected ?? line.dropFirst(9).trimmed
            } else if line.hasPrefix("Actual:") {
                actual = actual ?? line.dropFirst(7).trimmed
            } else if line.hasPrefix("But was:") {
                actual = actual ?? line.dropFirst(8).trimmed
            }
        }
        return (expected, actual)
    }

    /// The exception's type, or the assertion that failed (`Assert.Equal`).
    private static func errorClass(in line: String) -> String? {
        if let match = line.prefixMatch(of: exception) { return String(match.1) }
        return line.prefixMatch(of: assertion).map { String($0.1) }
    }
}
