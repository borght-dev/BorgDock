import Foundation

// The desktop's `services/e2e/report.ts`, one to one: the "E2E Test Results" comment a repository's E2E workflow posts
// on a pull request, and what it says about whether the pull request broke the failing tests. Pure: `E2eReports` reads
// the comment and the changed files. Change a rule on both sides together.

struct E2eFailedTest: Equatable, Sendable {
    /// The spec as the report names it, relative to the E2E test folder: `assets/calendar-dates.spec.ts`.
    let file: String
    let test: String
    let error: String
}

struct E2eReport: Equatable, Sendable {
    let commentId: String
    let url: String
    let createdAt: String
    var failed: [E2eFailedTest]
    /// False when a shard never reported: the failed list may be missing tests.
    var complete: Bool
    var smokeFailed: Bool
    /// The workflow run it reports on (`**Run:** #15274`, `actions/runs/<id>`), when it says.
    var runNumber: Int?
    var runId: Int?

    /// The report in a comment body, or nil when the comment is something else.
    static func parse(_ body: String, commentId: String, url: String, createdAt: String) -> E2eReport? {
        guard body.contains(#/(?im)^\#{1,3}\s*E2E Test Results\s*$/#) else { return nil }
        let status = body.firstMatch(of: #/(?i)\*\*E2E:\*\*\s*([^|\n]+)/#).map { String($0.output.1) } ?? ""
        return E2eReport(
            commentId: commentId,
            url: url,
            createdAt: createdAt,
            failed: failedTests(body),
            complete: !status.contains(#/(?i)incomplete|did not complete|timed out/#),
            smokeFailed: body.contains(#/(?i)\*\*Smoke:\*\*\s*Failed/#),
            runNumber: body.firstMatch(of: #/(?i)\*\*Run:\*\*\s*#(\d+)/#).flatMap { Int($0.output.1) },
            runId: body.firstMatch(of: #/\/actions\/runs\/(\d+)/#).flatMap { Int($0.output.1) }
        )
    }

    /// The failed tests table under "Failed Tests", by its File / Test / Error header.
    private static func failedTests(_ body: String) -> [E2eFailedTest] {
        guard let section = body.firstMatch(of: #/(?im)^\#{2,4}\s*Failed Tests\s*$/#) else { return [] }
        var table: [[String]] = []
        for line in body[section.range.upperBound...].split(separator: "\n", omittingEmptySubsequences: false) {
            if line.trimmingCharacters(in: .whitespaces).hasPrefix("|") {
                table.append(cells(String(line)))
            } else if !table.isEmpty || line.firstMatch(of: #/^\#{1,4}\s/#) != nil {
                break
            }
        }
        let header = (table.first ?? []).map { $0.lowercased() }
        guard let file = header.firstIndex(of: "file"), let test = header.firstIndex(of: "test") else { return [] }
        let error = header.firstIndex(of: "error")
        func cell(_ cells: [String], _ index: Int?) -> String {
            guard let index, cells.indices.contains(index) else { return "" }
            return unquote(cells[index])
        }
        return table.dropFirst()
            .filter { cells in !cells.allSatisfy { $0.wholeMatch(of: #/:?-+:?/#) != nil } }
            .map { E2eFailedTest(file: cell($0, file), test: cell($0, test), error: cell($0, error)) }
            .filter { !$0.file.isEmpty && !$0.test.isEmpty }
    }

    /// A table row's cells; `\|` is a pipe inside a cell.
    private static func cells(_ row: String) -> [String] {
        var text = row.trimmingCharacters(in: .whitespaces)
        if text.hasPrefix("|") { text.removeFirst() }
        if text.hasSuffix("|") { text.removeLast() }
        var cells: [String] = []
        var current = ""
        var previous: Character?
        for character in text {
            if character == "|", previous != "\\" {
                cells.append(current)
                current = ""
            } else {
                current.append(character)
            }
            previous = character
        }
        cells.append(current)
        return cells.map { $0.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "\\|", with: "|") }
    }

    private static func unquote(_ cell: String) -> String {
        cell.replacing(#/^`+|`+$/#, with: "").trimmingCharacters(in: .whitespaces)
    }

    /// A check that may have an E2E report: `Deploy & Test (staging-7) / E2E Shard 4/4`, but also `E2E reproducer
    /// advisory`. Only a reason to read the report; which checks it covers comes from its run (`coveredChecks`).
    static func isE2eCheck(_ name: String) -> Bool {
        let characters = Array(name.lowercased())
        let isWord = { (c: Character) in c.isASCII && (c.isLetter || c.isNumber || c == "_") }
        guard characters.count >= 3 else { return false }
        for start in 0...(characters.count - 3) where characters[start] == "e" && characters[start + 1] == "2" && characters[start + 2] == "e" {
            let before = start == 0 || !isWord(characters[start - 1])
            let after = start + 3 == characters.count || !isWord(characters[start + 3])
            if before, after { return true }
        }
        return false
    }

    /// The failed checks the report speaks for: the jobs of the workflow run it reports on, by run id, else by run
    /// number. Without a report, or without run details on either side, every failed check that looks like E2E.
    static func coveredChecks(failedNames: [String], failedJobs: [FailedCheck], report: E2eReport?) -> Set<String> {
        let byName = Set(failedNames.filter(isE2eCheck))
        guard let report else { return byName }
        guard failedJobs.contains(where: { $0.runId != nil || $0.runNumber != nil }) else { return byName }
        guard report.runId != nil || report.runNumber != nil else { return byName }
        func ofRun(_ job: FailedCheck) -> Bool {
            if let runId = report.runId, let jobRun = job.runId { return jobRun == runId }
            return report.runNumber != nil && job.runNumber == report.runNumber
        }
        return Set(failedJobs.filter(ofRun).map(\.name))
    }
}

/// Why one failed test is, or is not, the pull request's doing.
enum E2eTestCause: Equatable, Sendable {
    /// The pull request changes the spec.
    case changed
    /// The test is tagged with one of its work items (`@AB61142`).
    case tagged
    /// The same test fails on another open pull request too.
    case shared
    /// Neither: the pull request leaves the spec alone, and nothing else is known.
    case untouched
}

struct JudgedE2eTest: Equatable, Sendable {
    let test: E2eFailedTest
    let cause: E2eTestCause
    /// Other open pull requests whose latest report fails the same test.
    let alsoFailsOn: [Int]

    var isOwn: Bool { cause == .changed || cause == .tagged }
}

enum E2eUnclearReason: Equatable, Sendable { case noReport, smokeFailed, noFailedTests, incomplete, helpersChanged }

enum E2eVerdict: Equatable, Sendable {
    /// At least one failed test is the pull request's own.
    case introduced(tests: [JudgedE2eTest], report: E2eReport)
    /// Every failed test is outside the pull request. `shared` when each also fails on another pull request.
    case outside(tests: [JudgedE2eTest], shared: Bool, report: E2eReport)
    /// The report can't say. `helpers`: E2E support files the pull request changes.
    case unclear(reason: E2eUnclearReason, tests: [JudgedE2eTest], report: E2eReport?, helpers: [String])

    var tests: [JudgedE2eTest] {
        switch self {
        case .introduced(let tests, _), .outside(let tests, _, _), .unclear(_, let tests, _, _): tests
        }
    }

    var isOutside: Bool {
        if case .outside = self { return true }
        return false
    }

    /// One line on what the verdict means for merging.
    var text: String {
        func count(_ n: Int) -> String { "\(n) E2E test\(n == 1 ? "" : "s")" }
        switch self {
        case .introduced(let tests, _):
            let own = tests.filter(\.isOwn).count
            return "Fails \(own == 1 ? "its own E2E test" : "\(count(own)) of its own")"
        case .outside(let tests, let shared, _):
            return shared ? "\(count(tests.count)) failed, all also failing on other PRs" : "\(count(tests.count)) failed, none in specs this PR touches"
        case .unclear(let reason, _, _, _):
            switch reason {
            case .noReport: return "E2E failed; no report for this run yet"
            case .smokeFailed: return "Smoke tests failed: the deployment may be broken"
            case .noFailedTests: return "E2E failed, but the report lists no failed tests"
            case .incomplete: return "E2E run incomplete: not every shard reported"
            case .helpersChanged: return "E2E failed and this PR changes E2E helpers"
            }
        }
    }
}

struct E2eEvidence {
    /// Every path the pull request changes.
    var changedFiles: [String]
    /// Its work item ids.
    var workItemIds: [Int]
    /// The latest reports of other open pull requests in the same repository, by number.
    var otherReports: [Int: E2eReport]
}

extension E2eVerdict {
    /// Whether the pull request broke its failing E2E tests, first rule that matches: no report, a failed smoke run or
    /// a report without failed tests can't say; a test whose spec it changes or that carries one of its work items is
    /// its own; a partial report can't clear it; changed E2E helpers can't be cleared by tests nobody else fails;
    /// otherwise every failure is outside it.
    static func of(_ report: E2eReport?, _ evidence: E2eEvidence) -> E2eVerdict {
        let helpers = helpersOf(evidence.changedFiles)
        func unclear(_ reason: E2eUnclearReason, _ tests: [JudgedE2eTest] = []) -> E2eVerdict {
            .unclear(reason: reason, tests: tests, report: report, helpers: helpers)
        }
        guard let report else { return unclear(.noReport) }
        if report.smokeFailed { return unclear(.smokeFailed) }
        if report.failed.isEmpty { return unclear(report.complete ? .noFailedTests : .incomplete) }
        var failingElsewhere: [String: [Int]] = [:]
        for (number, other) in evidence.otherReports {
            for test in other.failed { failingElsewhere[key(test), default: []].append(number) }
        }
        let ids = Set(evidence.workItemIds)
        let tests = report.failed.map { test in
            let alsoFailsOn = Array(Set(failingElsewhere[key(test)] ?? [])).sorted()
            let cause: E2eTestCause = if specChanged(test.file, evidence.changedFiles) {
                .changed
            } else if tags(test.test).contains(where: ids.contains) {
                .tagged
            } else if !alsoFailsOn.isEmpty {
                .shared
            } else {
                .untouched
            }
            return JudgedE2eTest(test: test, cause: cause, alsoFailsOn: alsoFailsOn)
        }
        if tests.contains(where: \.isOwn) { return .introduced(tests: tests, report: report) }
        if !report.complete { return unclear(.incomplete, tests) }
        let shared = tests.allSatisfy { $0.cause == .shared }
        if !shared, !helpers.isEmpty { return unclear(.helpersChanged, tests) }
        return .outside(tests: tests, shared: shared, report: report)
    }

    /// Changed files under an `e2e/` folder that are not specs: fixtures, helpers, config.
    static func helpersOf(_ changed: [String]) -> [String] {
        changed.filter { path in
            path.contains(#/(?i)(^|\/)e2e\//#) && !path.contains(#/(?i)\.(spec|test)\.[cm]?[jt]sx?$/#)
        }
    }

    private static func tags(_ title: String) -> [Int] {
        title.matches(of: #/(?i)@AB#?(\d+)\b/#).compactMap { Int($0.output.1) }
    }

    private static func specChanged(_ file: String, _ changed: [String]) -> Bool {
        let spec = file.replacingOccurrences(of: "\\", with: "/").replacing(#/^\.?\//#, with: "")
        return changed.contains { $0 == spec || $0.hasSuffix("/" + spec) }
    }

    private static func key(_ test: E2eFailedTest) -> String {
        test.file + "\n" + test.test.trimmingCharacters(in: .whitespacesAndNewlines)
    }
}
