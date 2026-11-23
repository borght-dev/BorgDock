import Foundation

// Playwright's report: each failed test once, with its retries, and the run's totals.

enum PlaywrightLog {
    private nonisolated(unsafe) static let failure = #/\d+\)\s*\[(\w+)\]\s*›\s*(.+?):(\d+):\d+\s*›\s*(.+?)\s*$/#.asInJavaScript
    private nonisolated(unsafe) static let summary = #/^\s*(\d+)\s+(failed|flaky|skipped|did not run|passed)/#.asInJavaScript
    private nonisolated(unsafe) static let errorName = #/^(\w*Error):/#.asInJavaScript
    /// The rule Playwright draws behind a failure's title.
    private nonisolated(unsafe) static let trailingRule = #/[─\s]+$/#.asInJavaScript
    private static let browsers = ["[chromium]", "[firefox]", "[webkit]"]
    private static let contextEnds = ["Retry #", "attachment #", "Error Context:"]

    /// `1) [chromium] › tests/cart.spec.ts:18:5 › Cart › removes an item`
    static func isFailureHeader(_ text: String) -> Bool { text.contains(failure) }

    private static func isSummary(_ line: String) -> Bool { line.prefixMatch(of: summary) != nil }

    private static func namesBrowser(_ line: String) -> Bool { browsers.contains { line.contains($0) } }

    static func signals(in lines: [String]) -> [CiSignal] {
        guard lines.contains(where: isSummary), lines.contains(where: namesBrowser) else { return [] }
        var signals = [totals(in: lines)].compactMap { $0 }
        var seen: Set<String> = []
        for (index, line) in lines.enumerated() {
            guard let match = line.firstMatch(of: failure) else { continue }
            let title = String(match.4).replacing(trailingRule, with: "")
            guard seen.insert("[\(match.1)] \(title)").inserted else { continue }
            let block = lines[(index + 1)...].prefix { !isFailureHeader($0) && !isSummary($0) }
            // The first attempt's error; retries and attachments follow it.
            let context = block.prefix { line in !contextEnds.contains { line.trimmed.hasPrefix($0) } }
                .filter { !$0.trimmed.isEmpty }
                .prefix(CiSignal.maxExcerptLines)
            let path = match.2.trimmed
            let (expected, actual) = CiLog.expectedReceived(in: context)
            signals.append(CiSignal(
                kind: .test, parser: "playwright", message: context.first?.trimmed ?? "Test failed: \(title)",
                testId: "\(path) › \(title)", params: String(match.1), path: path, line: Int(match.3),
                errorClass: context.lazy.compactMap { $0.trimmed.prefixMatch(of: errorName).map { String($0.1) } }.first,
                expected: expected, actual: actual, excerpt: CiLog.excerpt(of: context),
                repeats: block.count { $0.trimmed.hasPrefix("Retry #") } + 1
            ))
        }
        return signals
    }

    /// The totals Playwright prints last (`1 failed`, `24 passed`), with the tests it lists under each.
    private static func totals(in lines: [String]) -> CiSignal? {
        var start: Int?
        var end: Int?
        for index in lines.indices.reversed() {
            let trimmed = lines[index].trimmed
            if trimmed.isEmpty {
                if start != nil { break }
            } else if isSummary(trimmed) {
                start = index
                end = end ?? index
            } else if start != nil {
                guard trimmed.contains("] ›"), namesBrowser(trimmed) else { break }
                start = index
            }
        }
        guard let start, let end else { return nil }
        let block = lines[start...end]
        return CiSignal(kind: .summary, parser: "playwright", message: block[start].trimmed, excerpt: CiLog.excerpt(of: block))
    }
}
