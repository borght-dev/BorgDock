import Foundation
import Observation

/// What a pull request's E2E report says, and which of its failed checks it speaks for.
struct E2eRead: Equatable {
    let verdict: E2eVerdict
    let covers: Set<String>
}

/// Where a pull request's E2E evidence stands.
enum E2eLookup: Equatable {
    /// No E2E check failed: nothing to read.
    case none
    /// The report is still being read.
    case reading
    case read(E2eRead)
}

/// The desktop's `services/e2e/load.ts`: the E2E report and changed files of pull requests with a failed E2E check,
/// read on demand (an author run, the end card) and kept per pull request until its head or its E2E run changes. Other
/// pull requests' reports in the same repository tell whether a failing test is shared. The server only fetches: the
/// report is a comment (`/comments`), the changed files come from `/files`.
@MainActor
@Observable
final class E2eReports {
    struct Entry: Equatable, Sendable {
        /// The head and E2E run the entry was read for; a different key reads again.
        let key: String
        var status: Status
        var report: E2eReport?
        /// Nil until read: a neighbour only needs its report.
        var files: [String]?
        let workItemIds: [Int]

        enum Status: Equatable, Sendable { case loading, ready, error }
    }

    /// Reads one pull request: the comments since `since`, and its changed files when asked.
    struct Reader: Sendable {
        var comments: @Sendable (PrKey) async throws -> [PrComment]
        var files: @Sendable (PrKey) async throws -> [String]
    }

    private(set) var entries: [String: Entry] = [:]
    @ObservationIgnored var reader: Reader?

    /// How many other pull requests of the repository are read for shared failures.
    nonisolated static let neighbourLimit = 12
    private nonisolated static let concurrency = 3
    /// Comments a little older than the failed jobs still count: GitHub's clocks are not one.
    private nonisolated static let sinceSlack: TimeInterval = 60

    init(reader: Reader? = nil) {
        self.reader = reader
    }

    nonisolated static func hasFailedE2e(_ pr: PrSummary) -> Bool { pr.failedCheckNames.contains(where: E2eReport.isE2eCheck) }

    /// The report is posted after every shard finished, so a report for the current run is never older than its first
    /// failed E2E job; an older one belongs to an earlier push.
    nonisolated static func since(_ pr: PrSummary) -> Date? {
        let times = (pr.failedChecks ?? [])
            .filter { E2eReport.isE2eCheck($0.name) }
            .compactMap { $0.completedAt.flatMap(ISODate.parse) }
        return times.min().map { $0.addingTimeInterval(-sinceSlack) }
    }

    /// The head and E2E run `pr`'s entry is for.
    nonisolated static func entryKey(_ pr: PrSummary) -> String {
        "\(pr.headSha)|\(since(pr).map { $0.formatted(.iso8601) } ?? "")"
    }

    /// Open pull requests of `pr`'s repository with a failed E2E check, newest first, `pr` itself left out.
    nonisolated static func neighbours(_ pr: PrSummary, _ prs: [PrSummary]) -> [PrSummary] {
        Array(prs
            .filter { $0.owner == pr.owner && $0.repo == pr.repo && $0.number != pr.number && $0.state == .open && hasFailedE2e($0) }
            .sorted { $0.createdAt.sortDate > $1.createdAt.sortDate }
            .prefix(neighbourLimit))
    }

    /// The verdict on `pr`'s failed E2E tests from what has been read.
    nonisolated static func lookup(_ pr: PrSummary, entries: [String: Entry], prs: [PrSummary]) -> E2eLookup {
        guard hasFailedE2e(pr) else { return .none }
        guard let entry = entries[pr.key], entry.key == entryKey(pr), entry.status != .loading else { return .reading }
        var otherReports: [Int: E2eReport] = [:]
        for other in neighbours(pr, prs) {
            if let read = entries[other.key], read.status == .ready, let report = read.report, read.key == entryKey(other) {
                otherReports[other.number] = report
            }
        }
        let verdict = E2eVerdict.of(entry.report, E2eEvidence(changedFiles: entry.files ?? [], workItemIds: entry.workItemIds, otherReports: otherReports))
        let covers = E2eReport.coveredChecks(failedNames: pr.failedCheckNames, failedJobs: pr.failedChecks ?? [], report: entry.report)
        return .read(E2eRead(verdict: verdict, covers: covers))
    }

    /// The newest report among comments made since `since`.
    nonisolated static func latestReport(_ comments: [PrComment], url: String, since: Date?) -> E2eReport? {
        comments
            .filter { comment in since.map { (ISODate.parse(comment.at) ?? .distantPast) >= $0 } ?? true }
            .compactMap { E2eReport.parse($0.body, commentId: $0.id, url: url, createdAt: $0.at) }
            .max { $0.createdAt.sortDate < $1.createdAt.sortDate }
    }

    func lookup(_ pr: PrSummary, prs: [PrSummary]) -> E2eLookup { Self.lookup(pr, entries: entries, prs: prs) }

    /// Reads the reports `candidates` need, with their neighbours' for shared failures. Candidates also get their
    /// changed files; neighbours only their report.
    func ensure(candidates: [PrSummary], prs: [PrSummary]) async {
        let withE2e = candidates.filter(Self.hasFailedE2e)
        let own = Set(withE2e.map(\.key))
        var wanted: [String: (pr: PrSummary, files: Bool)] = [:]
        for pr in withE2e { wanted[pr.key] = (pr, true) }
        for pr in withE2e.flatMap({ Self.neighbours($0, prs) }) where wanted[pr.key] == nil { wanted[pr.key] = (pr, own.contains(pr.key)) }
        let due = wanted.values.filter { item in
            guard let entry = entries[item.pr.key], entry.key == Self.entryKey(item.pr) else { return true }
            return item.files && entry.files == nil && entry.status != .loading
        }
        guard !due.isEmpty else { return }
        var reads: [(pr: PrSummary, files: Bool, kept: Entry?)] = []
        for item in due {
            let key = Self.entryKey(item.pr)
            let kept = entries[item.pr.key].flatMap { $0.key == key ? $0 : nil }
            entries[item.pr.key] = Entry(key: key, status: .loading, report: kept?.report, files: kept?.files, workItemIds: item.pr.workItemIds)
            reads.append((item.pr, item.files, kept))
        }
        let reader = reader
        await withTaskGroup(of: (prKey: String, entry: Entry).self) { group in
            var next = 0
            func start(_ read: (pr: PrSummary, files: Bool, kept: Entry?)) {
                group.addTask { (read.pr.key, await Self.read(read.pr, withFiles: read.files, kept: read.kept, reader: reader)) }
            }
            while next < min(Self.concurrency, reads.count) {
                start(reads[next])
                next += 1
            }
            while let done = await group.next() {
                if entries[done.prKey]?.key == done.entry.key { entries[done.prKey] = done.entry }
                if next < reads.count {
                    start(reads[next])
                    next += 1
                }
            }
        }
    }

    private nonisolated static func read(_ pr: PrSummary, withFiles: Bool, kept: Entry?, reader: Reader?) async -> Entry {
        let key = entryKey(pr)
        guard let reader else { return Entry(key: key, status: .error, report: nil, files: nil, workItemIds: pr.workItemIds) }
        do {
            async let comments = reader.comments(pr.prKey)
            let changed = withFiles ? try await reader.files(pr.prKey) : nil
            let report = latestReport(try await comments, url: pr.url, since: since(pr))
            return Entry(key: key, status: .ready, report: report, files: changed ?? kept?.files, workItemIds: pr.workItemIds)
        } catch {
            return Entry(key: key, status: .error, report: nil, files: nil, workItemIds: pr.workItemIds)
        }
    }
}
