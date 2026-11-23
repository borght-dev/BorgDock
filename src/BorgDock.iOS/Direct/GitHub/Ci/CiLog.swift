import Foundation

// Failure signals from a GitHub Actions job log. The port of the server's `ci/extract.ts`, itself the desktop's
// src-tauri/src/ci_failures/extract/: the same parsers, matches and order, so a log reads the same on the phone as on
// the server and in BorgDock. The parsers are in the `CiLog+….swift` files next to this one.

enum CiLog {
    struct Extraction: Sendable {
        var signals: [CiSignal]
        /// The failed step's own lines were found, so only they were read.
        var stepFound: Bool
    }

    /// How the runner reports the command that failed the step.
    static let exitCode = "Process completed with exit code"
    private static let annotation = "##[error]"
    private static let group = "##[group]"

    private nonisolated(unsafe) static let timestamp = #/^\d{4}-\d{2}-\d{2}T[\d:.]+Z ?/#.asInJavaScript
    private nonisolated(unsafe) static let terminalEscape = #/\x1b(?:\[[0-?]*[ -/]*[@-~]|\][^\x07\x1b]*(?:\x07|\x1b\\))/#.asInJavaScript
    private nonisolated(unsafe) static let compilerError = #/\(\d+,\d+\):\s*error\s+[A-Z]+\d+:/#.asInJavaScript
    private nonisolated(unsafe) static let expectedOrReceived = #/^(Expected|Received)(?: [a-z]+)?:\s+(.+)$/#.asInJavaScript
    private nonisolated(unsafe) static let failureWord = #/(?:^|[^\w/.-])(?:error|failed|fatal)(?:$|[^\w/-])|exception/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let totals = #/^\s*\d+\s+(?:error|warning)|\b(?:failed|errors?)\s*[:=]\s*0\b/#.ignoresCase().asInJavaScript
    private nonisolated(unsafe) static let testChatter = #/^\s*(?:[✓✔√]|(?:stdout|stderr)\s*\|)/#.asInJavaScript

    /// An annotation shorter than this is too little to say a parsed failure restates it.
    private static let minRestatedCharacters = 12

    /// `log` is sanitized already. `failedStep` is the job step that failed, when known: only its lines are read,
    /// because an error in an earlier step did not fail the job.
    static func extract(_ log: String, failedStep: String?) -> Extraction {
        let all = lines(of: log)
        let header = failedStep.flatMap { stepHeader(of: $0.trimmed, in: all) }
        let start = header ?? 0
        let exit = all[start...].firstIndex { $0.trimmedStart.hasPrefix(annotation + exitCode) }
        let lines = Array(all[start..<(exit.map { $0 + 1 } ?? all.count)])
        var signals = [
            MsbuildLog.signals(in: lines), DotnetTestLog.signals(in: lines), TypeScriptLog.signals(in: lines), PlaywrightLog.signals(in: lines),
            annotations(in: lines), VitestLog.signals(in: lines), CargoLog.signals(in: lines), PackageManagerLog.signals(in: lines),
            DockerLog.signals(in: lines),
        ].flatMap { $0 }
        if signals.allSatisfy({ $0.kind == .summary }) { signals += generic(lines, firstLine: start) }
        return Extraction(signals: finish(signals), stepFound: header != nil)
    }

    /// The log's lines without the runner's timestamps and terminal escapes; indentation stays.
    private static func lines(of log: String) -> [String] {
        log.utf8.split(separator: UInt8(ascii: "\n"), omittingEmptySubsequences: false).map { bytes in
            let line = String(Substring(bytes.last == UInt8(ascii: "\r") ? bytes.dropLast() : bytes))
            return String(line.trimmingPrefix(timestamp).replacing(terminalEscape, with: ""))
        }
    }

    /// Where the failed step starts: the last `##[group]Run …` line that names it.
    private static func stepHeader(of step: String, in lines: [String]) -> Int? {
        lines.lastIndex { line in
            let trimmed = line.trimmed
            guard trimmed.hasPrefix(group) else { return false }
            let header = trimmed.dropFirst(group.count)
            return header.hasPrefix("Run ") && (header == step || header.dropFirst(4) == step)
        }
    }

    /// `##[error]` lines no parser reads better: not the exit code, a compiler error or a Playwright header.
    private static func annotations(in lines: [String]) -> [CiSignal] {
        lines.filter { $0.hasPrefix(annotation) }
            .map { $0.dropFirst(annotation.count).trimmed }
            .filter { !$0.isEmpty && !$0.hasPrefix(exitCode) && !$0.contains(compilerError) && !PlaywrightLog.isFailureHeader($0) }
            .map { CiSignal(kind: .annotation, parser: "actions-annotation", message: $0) }
    }

    /// For a log no parser knows: the lines that say error, failed, fatal or exception. `firstLine` is where `lines`
    /// starts in the log.
    private static func generic(_ lines: [String], firstLine: Int) -> [CiSignal] {
        var signals: [CiSignal] = []
        var index = 0
        while index < lines.count {
            let line = lines[index]
            if line.contains(failureWord), !line.contains(totals), !line.contains(testChatter), !line.trimmedStart.hasPrefix("##[") {
                signals.append(CiSignal(kind: .generic, parser: "generic", message: line.trimmed, line: firstLine + index + 1))
                // The three lines under it are skipped: more often its details than failures of their own.
                index += 3
            }
            index += 1
        }
        return signals
    }

    /// Drops annotations that restate a parsed failure, folds repeats into one signal, puts the totals first and
    /// caps the rest.
    private static func finish(_ signals: [CiSignal]) -> [CiSignal] {
        struct Identity: Hashable {
            let kind: CiSignal.Kind
            let parser: String
            let testId: String?
            let path: String?
            let line: Int?
            let code: String?
            let message: String
        }
        let stated = signals
            .filter { $0.kind != .annotation && $0.kind != .summary && $0.message.unicodeScalars.count >= minRestatedCharacters }
            .map(\.message)
        let kept = signals.filter { signal in signal.kind != .annotation || !stated.contains { signal.message.contains($0) } }
        var collapsed: [CiSignal] = []
        var seen: [Identity: Int] = [:]
        for signal in kept {
            let identity = Identity(
                kind: signal.kind, parser: signal.parser, testId: signal.testId, path: signal.path, line: signal.line, code: signal.code, message: signal.message
            )
            if let index = seen[identity] {
                collapsed[index].repeats += signal.repeats
            } else {
                seen[identity] = collapsed.count
                collapsed.append(signal)
            }
        }
        let ordered = collapsed.filter { $0.kind == .summary } + collapsed.filter { $0.kind != .summary }
        return ordered.prefix(CiSignal.maxPerJob).map(\.capped)
    }
}

// MARK: - What the parsers share

extension CiLog {
    /// `##[error]src/app.ts` → `src/app.ts`
    static func withoutAnnotation(_ text: Substring) -> String {
        (text.hasPrefix(annotation) ? text.dropFirst(annotation.count) : text).trimmed
    }

    /// The non-blank lines with their common indentation removed, so code frames and diffs keep their shape.
    static func excerpt(of lines: some Sequence<String>) -> [String] {
        func indent(_ line: String) -> Int { line.prefix { $0 == " " || $0 == "\t" }.count }
        let kept = lines.filter { !$0.trimmed.isEmpty }
        let common = kept.map(indent).min() ?? 0
        return kept.map { $0.dropFirst(common).trimmedEnd }
    }

    /// The first `Expected:` and the first `Received:` value among `lines`, as Jest and Playwright print them.
    static func expectedReceived(in lines: some Sequence<String>) -> (expected: String?, received: String?) {
        var expected: String?
        var received: String?
        for line in lines {
            guard let match = line.trimmed.wholeMatch(of: expectedOrReceived) else { continue }
            if match.1 == "Expected" {
                expected = expected ?? match.2.trimmed
            } else {
                received = received ?? match.2.trimmed
            }
        }
        return (expected, received)
    }
}
