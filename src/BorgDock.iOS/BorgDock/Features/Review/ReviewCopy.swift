import Foundation

/// The words around the walk: the caption under Mark reviewed, the progress bar's segments and the Files sheet's
/// summaries. Pure, so the rules are tested without a screen.
extension ReviewWalk {
    /// "File 4 of 12" and "· then tests and generated, one step each" under Mark reviewed.
    struct Caption: Equatable {
        let lead: String
        let rest: String
    }

    func caption(at position: Position, reviewed: Set<String>) -> Caption {
        switch position {
        case .file(let path):
            if let group = group(of: path) {
                let members = members(of: group)
                let number = (members.firstIndex { $0.path == path } ?? 0) + 1
                return Caption(lead: "\(group.memberTitle) \(number) of \(members.count)", rest: "· part of the \(group.stepName) step")
            }
            let number = (files.firstIndex { $0.path == path } ?? 0) + 1
            return Caption(lead: "File \(number) of \(files.count)", rest: stepsAhead)
        case .step:
            let number = (steps.firstIndex(of: position) ?? 0) + 1
            let done = reviewedFileCount(reviewed)
            let rest = files.isEmpty ? "" : done == files.count ? "· all \(files.count) source files reviewed" : "· \(done) of \(files.count) source files reviewed"
            return Caption(lead: "Step \(number) of \(steps.count)", rest: rest)
        }
    }

    /// Which steps follow the files.
    private var stepsAhead: String {
        switch groups {
        case [.tests, .generated]: "· then tests and generated, one step each"
        case [.tests]: "· then tests, one step"
        case [.generated]: "· then generated files, one step"
        default: ""
        }
    }

    /// "Reviewed · 12 of 12 files and both steps" under Next on a decided pull request.
    func reviewedSummary(_ reviewed: Set<String>) -> String {
        let doneSteps = groups.filter { isReviewed(.step($0), in: reviewed) }
        let stepsPart: String = switch (groups.count, doneSteps.count) {
        case (2, 2): "both steps"
        case (_, 1): "the \(doneSteps[0].stepName) step"
        default: ""
        }
        let filesPart = files.isEmpty ? "" : "\(reviewedFileCount(reviewed)) of \(files.count) files"
        return [filesPart, stepsPart].filter { !$0.isEmpty }.joined(separator: " and ")
    }

    // MARK: - Progress bar

    /// One stretch of the bar in the navigation bar, `weight` files wide.
    struct Segment: Hashable {
        enum Fill: Hashable { case reviewed, open, current, step }
        let weight: Int
        let fill: Fill
    }

    /// Green for the files reviewed, grey for the rest, then one stretch per step: green once reviewed, blue while
    /// you're on it.
    func progress(at position: Position?, reviewed: Set<String>) -> [Segment] {
        let done = reviewedFileCount(reviewed)
        var segments: [Segment] = []
        if done > 0 { segments.append(Segment(weight: done, fill: .reviewed)) }
        if files.count > done { segments.append(Segment(weight: files.count - done, fill: .open)) }
        let current = position.map(anchor(of:))
        for group in groups {
            let fill: Segment.Fill = isReviewed(.step(group), in: reviewed) ? .reviewed : current == .step(group) ? .current : .step
            segments.append(Segment(weight: 1, fill: fill))
        }
        return segments
    }

    // MARK: - Steps

    /// "9 files · bun.lock, snapshots, src/generated": what a generated step holds, lockfiles first.
    static func describeGenerated(_ paths: [String]) -> String {
        var lockfiles: [String] = []
        var snapshots = false
        var folders: [String] = []
        var others: [String] = []
        for path in paths {
            let (folder, name) = path.splitPath
            if isLockfile(name) {
                lockfiles.append(name)
            } else if name.hasSuffix(".snap") || path.contains("__snapshots__/") || path.contains("-snapshots/") {
                snapshots = true
            } else if let range = path.range(of: "generated/") {
                folders.append(String(path[..<range.upperBound].dropLast()))
            } else {
                others.append(folder.isEmpty ? name : String(folder.dropLast()))
            }
        }
        let parts = lockfiles + (snapshots ? ["snapshots"] : []) + folders + others
        var seen = Set<String>()
        return parts.filter { seen.insert($0).inserted }.prefix(3).joined(separator: ", ")
    }

    private static func isLockfile(_ name: String) -> Bool {
        ["bun.lock", "bun.lockb", "package-lock.json", "pnpm-lock.yaml", "yarn.lock", "Cargo.lock", "Package.resolved", "Podfile.lock"].contains(name)
            || name.hasSuffix(".lock.json")
    }
}

extension ReviewWalk.Group {
    /// "Test 3 of 31": one file of the step.
    var memberTitle: String {
        switch self {
        case .tests: "Test"
        case .generated: "Generated file"
        }
    }

    /// "tests", "generated": the step in a sentence.
    var stepName: String {
        switch self {
        case .tests: "tests"
        case .generated: "generated"
        }
    }

    /// The card at the top of the step page.
    var heading: String {
        switch self {
        case .tests: "Tests, in one step"
        case .generated: "Generated files, in one step"
        }
    }

    func explanation(count: Int) -> String {
        switch self {
        case .tests: "Test folders and targets, `e2e/`, fixtures, mocks and stories. Open one to read it. Mark reviewed covers all \(count)."
        case .generated: "Lockfiles, snapshots and generated code. Open one to read it. Mark reviewed covers all \(count)."
        }
    }

    /// "Mark 31 tests reviewed"
    func markTitle(count: Int) -> String {
        switch self {
        case .tests: count == 1 ? "Mark the test reviewed" : "Mark \(count) tests reviewed"
        case .generated: count == 1 ? "Mark the generated file reviewed" : "Mark \(count) generated files reviewed"
        }
    }
}

// MARK: - Decisions

/// What you decided on a pull request in this review: kept so going back shows it, not the state from before it.
struct ReviewDecisionRecord: Hashable, Sendable {
    enum Status: Hashable, Sendable {
        /// Waiting out its Undo.
        case held
        case posted
        case failed(String)
    }

    let event: ReviewEvent
    let body: String
    let lineComments: [ReviewLineComment]
    let headSha: String
    let at: Date
    /// Approve & auto-merge.
    let autoMerge: Bool
    var status: Status

    /// "You approved this" and "at 4f2c1a9, 1 minute ago. Auto-merge is on: GitHub merges when e2e passes."
    func banner(detail: PrDetail?, now: Date = .now) -> (title: String, text: String) {
        if case .failed(let message) = status { return ("Not submitted.", message) }
        let title = switch event {
        case .approve: "You approved this"
        case .requestChanges: "You asked for changes"
        case .comment: "You commented"
        }
        var text = "at \(headSha.shortSha), \(ReviewDecisionRecord.ago(at, now: now))."
        if event == .approve, let merge = ReviewDecisionRecord.mergeSentence(detail: detail, requested: autoMerge) { text += " " + merge }
        return (title, text)
    }

    /// "1 line comment · total.ts:14"
    var lineCommentSummary: String? {
        guard !lineComments.isEmpty else { return nil }
        let places = lineComments.prefix(3).map { "\($0.path.splitPath.name):\($0.line)" }.joined(separator: ", ")
        let count = lineComments.count == 1 ? "1 line comment" : "\(lineComments.count) line comments"
        return "\(count) · \(places)\(lineComments.count > 3 ? ", …" : "")"
    }

    static func ago(_ date: Date, now: Date) -> String {
        let seconds = Int(max(0, now.timeIntervalSince(date)))
        switch seconds {
        case ..<45: return "just now"
        case ..<90: return "1 minute ago"
        case ..<3600: return "\((seconds + 30) / 60) minutes ago"
        case ..<7200: return "1 hour ago"
        case ..<86400: return "\(seconds / 3600) hours ago"
        default: return seconds < 2 * 86400 ? "yesterday" : "\(seconds / 86400) days ago"
        }
    }

    /// "Auto-merge is on: GitHub merges when e2e passes." when auto-merge is on or was asked for.
    static func mergeSentence(detail: PrDetail?, requested: Bool) -> String? {
        if detail?.state == .merged { return "It's merged." }
        guard requested || detail?.autoMerge == true else { return nil }
        let waiting = (detail?.checkRuns ?? []).filter { $0.state == .failure || $0.state == .pending }
        var names: [String] = []
        for run in waiting {
            let name = run.workflow ?? run.name
            if !names.contains(name) { names.append(name) }
        }
        switch names.count {
        case 0: return "Auto-merge is on."
        case 1: return "Auto-merge is on: GitHub merges when \(names[0]) passes."
        default: return "Auto-merge is on: GitHub merges when \(names.dropLast().joined(separator: ", ")) and \(names.last!) pass."
        }
    }
}

// MARK: - Loading

/// Why a pull request didn't load, after its automatic retry: "GitHub took longer than 30 seconds, twice."
enum ReviewLoadFailure {
    static func message(_ error: Error, attempts: Int, approvalElsewhere: Int?) -> String {
        var reason = (error as? APIError)?.message ?? error.localizedDescription
        if reason.localizedCaseInsensitiveContains("timed out") { reason = "BorgDock took longer than 30 seconds to answer" }
        while reason.hasSuffix(".") { reason.removeLast() }
        var text = attempts > 1 ? "\(reason), twice." : "\(reason)."
        if let approvalElsewhere { text += " Your approval of #\(approvalElsewhere) isn't affected." }
        return text
    }
}

/// Runs a read, and once more after a pause when it fails: a slow GitHub usually answers the second time.
@MainActor
enum RetryOnce {
    static func run<T>(pause: Duration = .seconds(1), sleep: (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
                       _ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch is CancellationError {
            throw CancellationError()
        } catch {
            try await sleep(pause)
            return try await work()
        }
    }
}
