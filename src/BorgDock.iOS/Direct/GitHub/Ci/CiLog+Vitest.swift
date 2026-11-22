import Foundation

// Vitest's report: the "Failed Tests" section, and the run's own list for what that section leaves out.

enum VitestLog {
    private nonisolated(unsafe) static let failHeader = #/^\s*FAIL\s+(?:\|[^|]+\|\s+|[A-Za-z][\w.-]*\s{2,})?(\S+)(?:\s+>\s+(.+?)|\s+\[[^\]]*\])\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let crossedTest = #/^\s*[×✗]\s+(.+?)(?:\s+\(retry x\d+\))?(?:\s+\d+(?:\.\d+)?m?s)?\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let fileLine = #/^\s*❯\s+(\S+)\s+\(\d+ tests?\b/#.asInJavaScript
    private nonisolated(unsafe) static let reasonLine = #/^\s*→\s+(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let frameLine = #/^\s*❯\s+(.+?)\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let sourceLocation = #/(\S+):(\d+):(\d+)\)?$/#.asInJavaScript
    private nonisolated(unsafe) static let errorName = #/^(\w*(?:Error|Exception))(?:\s*\[[^\]]*\])?:/#.asInJavaScript
    /// An error's lines are looked for this far under its headers.
    private static let blockLines = 60

    static func signals(in lines: [String]) -> [CiSignal] {
        let reported = failureReports(in: lines)
        return reported + crossedOut(in: lines, besides: Set(reported.compactMap(\.testId)))
    }

    private static func isFailHeader(_ line: String) -> Bool { line.wholeMatch(of: failHeader) != nil }

    /// The "Failed Tests" section: `FAIL file > test` headers, each run of them followed by the one error they
    /// share, with its diff and code frame.
    private static func failureReports(in lines: [String]) -> [CiSignal] {
        var signals: [CiSignal] = []
        var index = 0
        while index < lines.count {
            guard isFailHeader(lines[index]) else {
                index += 1
                continue
            }
            let headers = index
            while index < lines.count, isFailHeader(lines[index]) { index += 1 }
            let limit = min(index + blockLines, lines.count)
            let end = (index..<limit).first { endsBlock(lines[$0]) } ?? limit
            signals += failures(headers: lines[headers..<index], block: Array(lines[index..<end]))
            index = end
        }
        return signals
    }

    /// The rule under an error, the run's totals or the next failure.
    private static func endsBlock(_ line: String) -> Bool {
        let trimmed = line.trimmed
        return trimmed.hasPrefix("⎯") || trimmed.hasPrefix("Test Files ") || isFailHeader(line)
    }

    private static func failures(headers: ArraySlice<String>, block: [String]) -> [CiSignal] {
        let first = block.lazy.map(\.trimmed).first { !$0.isEmpty }
        let frames = block.compactMap { $0.wholeMatch(of: frameLine).map { String($0.1) } }.filter { !$0.contains("node_modules") }
        let place = frames.lazy.compactMap { $0.firstMatch(of: sourceLocation) }.first
        let (expected, actual) = diff(in: block) ?? CiLog.expectedReceived(in: block)
        let errorClass = first.flatMap { $0.prefixMatch(of: errorName) }.map { String($0.1) }
        let excerpt = CiLog.excerpt(of: block)
        return headers.compactMap { header in
            guard let match = header.wholeMatch(of: failHeader) else { return nil }
            let file = String(match.1)
            let testId = match.2.map { "\(file) > \($0)" } ?? file
            return CiSignal(
                kind: .test, parser: "vitest", message: first ?? "Test failed: \(testId)", testId: testId,
                path: place.map { String($0.1) } ?? file, line: place.flatMap { Int($0.2) }, column: place.flatMap { Int($0.3) },
                errorClass: errorClass, expected: expected, actual: actual, excerpt: excerpt, frames: frames
            )
        }
    }

    /// The values under `- Expected` / `+ Received`: the `-` lines and the `+` lines of the diff that follows.
    private static func diff(in block: [String]) -> (expected: String?, received: String?)? {
        let header = block.indices.first { index in
            block[index].trimmed.hasPrefix("- Expected") && index + 1 < block.count && block[index + 1].trimmed.hasPrefix("+ Received")
        }
        guard let header else { return nil }
        var body: [String] = []
        for line in block[(header + 2)...] {
            if line.trimmed.isEmpty {
                if body.isEmpty { continue }
                break
            }
            body.append(line)
        }
        func side(_ sign: Character) -> String? {
            let values = body.map(\.trimmedStart).filter { $0.first == sign }.map { line in
                let value = line.dropFirst()
                return (value.first == " " ? value.dropFirst() : value).trimmedEnd
            }
            return values.isEmpty ? nil : values.joined(separator: "\n")
        }
        return (side("-"), side("+"))
    }

    /// The run's own list: a file line (`❯ src/cart.test.ts (3 tests | 1 failed)`), then a `×` line per failed
    /// test with its reason on `→` lines. Only for tests the failure reports left out.
    private static func crossedOut(in lines: [String], besides reported: Set<String>) -> [CiSignal] {
        var signals: [CiSignal] = []
        var file: String?
        for (index, line) in lines.enumerated() {
            if let match = line.prefixMatch(of: fileLine) {
                file = String(match.1)
                continue
            }
            guard let file, let match = line.wholeMatch(of: crossedTest) else { continue }
            let testId = "\(file) > \(match.1)"
            guard !reported.contains(testId) else { continue }
            var reasons: [String] = []
            for next in lines[(index + 1)...] {
                guard let reason = next.wholeMatch(of: reasonLine) else { break }
                reasons.append(String(reason.1))
            }
            signals.append(CiSignal(kind: .test, parser: "vitest", message: reasons.first ?? "Test failed: \(testId)", testId: testId, path: file, excerpt: reasons))
        }
        return signals
    }
}
