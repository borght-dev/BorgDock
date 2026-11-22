import Foundation

// `cargo test` failures and rustc's compile errors.

enum CargoLog {
    private nonisolated(unsafe) static let testOutput = #/^---- (.+) stdout ----$/#.asInJavaScript
    private nonisolated(unsafe) static let panic = #/^thread '([^']*)'(?: \(\d+\))? panicked at (?:'(.*)', )?(.+?):(\d+):(\d+):?$/#.asInJavaScript
    private nonisolated(unsafe) static let side = #/^\s*(left|right): (.*)$/#.asInJavaScript
    private nonisolated(unsafe) static let frame = #/^\s*\d+: (\S+)/#.asInJavaScript
    /// The hash rustc appends to a symbol: `::h0123456789abcdef`.
    private nonisolated(unsafe) static let symbolHash = #/::h[0-9a-f]{16}$/#.asInJavaScript
    private nonisolated(unsafe) static let unwrapCall = #/^called `(\w+::\w+)\(\)`/#.asInJavaScript
    private nonisolated(unsafe) static let compileError = #/^error(?:\[(E\d+)\])?: (.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let compileLocation = #/^\s*--> (.+?):(\d+):(\d+)$/#.asInJavaScript
    private static let runtimeFrames = ["std::", "core::", "alloc::", "test::", "<", "rust_", "__rust"]
    /// A panic printed outside a test's own output is read this many lines down at most.
    private static let loosePanicLines = 20

    static func signals(in lines: [String]) -> [CiSignal] { failedTests(in: lines) + compileErrors(in: lines) }

    /// `---- name stdout ----` blocks, and panics of test threads printed outside one.
    private static func failedTests(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var index = 0
        while index < lines.count {
            if let header = lines[index].wholeMatch(of: testOutput) {
                let end = lines[(index + 1)...].firstIndex(where: endsTestOutput) ?? lines.count
                signals.append(test(String(header.1), block: lines[(index + 1)..<end]))
                index = end
            } else if let loose = lines[index].wholeMatch(of: panic), loose.1 != "main", loose.1 != "<unnamed>" {
                let block = lines[index...].prefix(loosePanicLines).prefix { !$0.trimmed.isEmpty }
                signals.append(test(String(loose.1), block: block))
                index = block.endIndex
            } else {
                index += 1
            }
        }
        return signals
    }

    /// The next test's output, the list of failures or the run's result.
    private static func endsTestOutput(_ line: String) -> Bool {
        line.wholeMatch(of: testOutput) != nil || line.trimmed == "failures:" || line.hasPrefix("test result:")
    }

    private static func test(_ testId: String, block: ArraySlice<String>) -> CiSignal {
        let lines = block.filter { !$0.trimmed.isEmpty && !$0.hasPrefix("note: run with `RUST_BACKTRACE") }
        let panicIndex = lines.firstIndex { $0.wholeMatch(of: panic) != nil }
        let panicked = panicIndex.flatMap { lines[$0].wholeMatch(of: panic) }
        let message: String? = if let panicIndex, let panicked {
            // Rust 1.73 and later print the message on the line under the location.
            panicked.2.map { String($0) } ?? (panicIndex + 1 < lines.count ? lines[panicIndex + 1].trimmed : nil)
        } else {
            lines.first?.trimmed
        }
        let (left, right) = sides(in: lines)
        let frames = lines.compactMap { $0.prefixMatch(of: frame).map { String($0.1).replacing(symbolHash, with: "") } }
            .filter { symbol in !runtimeFrames.contains { symbol.hasPrefix($0) } }
            .prefix(CiSignal.maxFrames)
        return CiSignal(
            kind: .test, parser: "cargo-test", message: message ?? "Test failed: \(testId)", testId: testId,
            path: panicked.map { String($0.3) }, line: panicked.flatMap { Int($0.4) }, column: panicked.flatMap { Int($0.5) },
            errorClass: message.flatMap(errorClass(of:)), expected: right, actual: left,
            excerpt: CiLog.excerpt(of: lines.prefix(CiSignal.maxExcerptLines)), frames: Array(frames)
        )
    }

    /// The two values of a failed `assert_eq!`, without the backticks older Rust wraps them in.
    private static func sides(in lines: [String]) -> (left: String?, right: String?) {
        var left: String?
        var right: String?
        for line in lines {
            guard let match = line.wholeMatch(of: side) else { continue }
            var value = match.2.trimmed
            if value.hasSuffix(",") { value.removeLast() }
            value = value.trimmingCharacters(in: CharacterSet(charactersIn: "`"))
            if match.1 == "left" {
                left = left ?? value
            } else {
                right = right ?? value
            }
        }
        return (left, right)
    }

    /// Which assertion failed, or the call that unwrapped an error (`Result::unwrap`).
    private static func errorClass(of message: String) -> String? {
        if message.contains("left == right") { return "assert_eq" }
        if message.contains("left != right") { return "assert_ne" }
        if message.hasPrefix("assertion failed") { return "assert" }
        return message.prefixMatch(of: unwrapCall).map { String($0.1) }
    }

    /// `error[E0308]: mismatched types` with the `--> file:line:column` under it.
    private static func compileErrors(in lines: [String]) -> [CiSignal] {
        lines.indices.compactMap { index in
            guard let error = lines[index].wholeMatch(of: compileError),
                  let place = lines[(index + 1)...].prefix(3).lazy.compactMap({ $0.wholeMatch(of: compileLocation) }).first
            else { return nil }
            let report = lines[index...].prefix(CiSignal.maxExcerptLines).prefix { !$0.trimmed.isEmpty }
            return CiSignal(
                kind: .compile, parser: "rustc", message: error.2.trimmed, path: String(place.1), line: Int(place.2), column: Int(place.3),
                code: error.1.map { String($0) }, excerpt: CiLog.excerpt(of: report)
            )
        }
    }
}
