import Foundation

/// The line a folded group shows: at most two facts, what needs attention first, else how long the oldest waited.
/// "2 failing · 1 ready to merge", "1 asks you · oldest 2 d".
enum PrGroupSummary {
    struct Part: Equatable {
        let text: String
        var alert = false
    }

    static func parts(_ facts: [PrFacts], now: Date = .now) -> [Part] {
        let failing = facts.filter(\.failing).count
        let asks = facts.filter(\.waitingOnMe).count
        let ready = facts.filter(\.ready).count
        var parts: [Part] = []
        if failing > 0 { parts.append(Part(text: "\(failing) failing", alert: true)) }
        if asks > 0 { parts.append(Part(text: asks == 1 ? "1 asks you" : "\(asks) ask you")) }
        if ready > 0 { parts.append(Part(text: "\(ready) ready to merge")) }
        if parts.count < 2, let oldest = facts.map(\.pr.waitingSince).min(by: { $0.sortDate < $1.sortDate }) {
            let age = ShortTime.age(oldest, now: now)
            if !age.isEmpty { parts.append(Part(text: "oldest \(age)")) }
        }
        return Array(parts.prefix(2))
    }
}

/// Review all: one author's pull requests in Quick Review, oldest first, without the ones you can't approve and merge
/// yet. The desktop's `services/author-run.ts`; the phone has no E2E report or shared CI failures, so any failing check
/// holds a pull request.
enum AuthorRun {
    static func queue(_ prs: [PrSummary], author login: String, myLogins: Set<String>) -> [PrSummary] {
        let author = login.lowercased()
        let mine = Set(myLogins.map { $0.lowercased() })
        guard !mine.contains(author) else { return [] }
        return prs
            .filter { pr in
                pr.author.login.lowercased() == author && pr.state == .open && !pr.isDraft && !pr.isMine
                    && !pr.isApprovedAtHead(by: mine)
                    && pr.mergeable != .conflicting && pr.reviewDecision != .changesRequested && pr.checks.failed == 0
            }
            .sorted { $0.createdAt.sortDate < $1.createdAt.sortDate }
    }
}

/// One step of a pull request's way in: Checks, Review, Merge.
struct PrTrackStep: Hashable {
    enum Mark: Hashable {
        /// Done and fine.
        case done
        case failed
        /// Needs the author: changes requested.
        case attention
        case running
        /// Waits on you.
        case yours
        /// Not there yet.
        case open
    }

    let label: String
    let mark: Mark
}

extension PrSummary {
    /// When the pull request started waiting. The summary carries no review-request time, so this is when it opened.
    var waitingSince: String { createdAt }

    /// Lines added and removed, for Smallest first.
    var size: Int { additions + deletions }

    /// It involves you and waits on someone else: yours under review, or one you reviewed. Drafts wait on their author.
    func isWaitingOnOthers(myLogins: Set<String>) -> Bool {
        guard bucket == .wait, !isDraft else { return false }
        let mine = Set(myLogins.map { $0.lowercased() })
        return isMine || reviewedHeadSha != nil || approvedBy.contains { mine.contains($0.lowercased()) }
    }

    /// You approved it and nothing was pushed since. Without the commit of your review an approval counts.
    func isApprovedAtHead(by myLogins: Set<String>) -> Bool {
        guard approvedBy.contains(where: { myLogins.contains($0.lowercased()) }) else { return false }
        return reviewedHeadSha == nil || reviewedHeadSha == headSha
    }

    /// Where the pull request is stuck, as three steps.
    var track: [PrTrackStep] {
        let checks: PrTrackStep = if self.checks.failed > 0 {
            PrTrackStep(label: "\(self.checks.failed) failing", mark: .failed)
        } else if self.checks.pending > 0 {
            PrTrackStep(label: "Running", mark: .running)
        } else if self.checks.total == 0 {
            PrTrackStep(label: "No checks", mark: .open)
        } else {
            PrTrackStep(label: "Checks", mark: .done)
        }
        let approved = reviewDecision == .approved || (reviewDecision == nil && !approvedBy.isEmpty)
        let review: PrTrackStep = if reviewDecision == .changesRequested {
            PrTrackStep(label: "Changes", mark: .attention)
        } else if approved {
            PrTrackStep(label: approvedBy.count > 1 ? "\(approvedBy.count) approvals" : "Approved", mark: .done)
        } else if bucket == .you, !isMine {
            PrTrackStep(label: "Your review", mark: .yours)
        } else {
            PrTrackStep(label: "Review", mark: .open)
        }
        let merge: PrTrackStep = if isDraft {
            PrTrackStep(label: "Draft", mark: .open)
        } else if mergeable == .conflicting {
            PrTrackStep(label: "Conflicts", mark: .failed)
        } else if autoMerge {
            PrTrackStep(label: "Auto-merge", mark: .running)
        } else if canMerge, approved {
            PrTrackStep(label: "Ready", mark: .done)
        } else {
            PrTrackStep(label: "Merge", mark: .open)
        }
        return [checks, review, merge]
    }
}

extension String {
    /// ISO 8601 from the server; unparsable dates sort last.
    var sortDate: Date { ISODate.parse(self) ?? .distantPast }
}

/// The list in runs: an open group on its own, folded groups next to each other together in one card.
enum GroupRun: Identifiable, Equatable {
    case open(PrGroupNode)
    case folded([PrGroupNode])

    var id: String {
        switch self {
        case .open(let group): group.id
        case .folded(let groups): "folded:" + groups.map(\.id).joined(separator: ",")
        }
    }

    static func runs(_ groups: [PrGroupNode], isFolded: (PrGroupNode) -> Bool) -> [GroupRun] {
        var runs: [GroupRun] = []
        for group in groups {
            if !isFolded(group) {
                runs.append(.open(group))
            } else if case .folded(let earlier)? = runs.last {
                runs[runs.count - 1] = .folded(earlier + [group])
            } else {
                runs.append(.folded([group]))
            }
        }
        return runs
    }
}
