import Foundation

/// The desktop's Pull requests list (`pr-store.ts`, `pr-grouping.ts`): every open pull request the server reads,
/// filtered, searched, sorted with yours first and drafts last, and grouped by status, author or repository.
enum PrListFilter: String, CaseIterable, Identifiable {
    case all, needsYou, mine, failing

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .needsYou: "Needs you"
        case .mine: "Mine"
        case .failing: "Failing"
        }
    }

    func matches(_ pr: PrSummary) -> Bool {
        switch self {
        case .all: true
        case .needsYou: pr.bucket == .you
        case .mine: pr.isMine
        case .failing: pr.checks.failed > 0
        }
    }
}

enum PrListGrouping: String, CaseIterable, Identifiable {
    case status, author, repository, flat

    var id: String { rawValue }

    var title: String {
        switch self {
        case .status: "Status"
        case .author: "Author"
        case .repository: "Repository"
        case .flat: "None"
        }
    }
}

enum PrListSort: String, CaseIterable, Identifiable {
    case updated, created, title

    var id: String { rawValue }

    var title: String {
        switch self {
        case .updated: "Recently updated"
        case .created: "Newest"
        case .title: "Title"
        }
    }
}

struct PrListGroup: Identifiable, Equatable {
    let id: String
    let title: String
    /// The author a group by author stands for, for its avatar.
    var author: Person?
    let pullRequests: [PrSummary]
}

struct PrListQuery: Equatable {
    var filter: PrListFilter = .all
    var grouping: PrListGrouping = .author
    var sort: PrListSort = .updated
    var search = ""
    var hideDrafts = false

    static let needsYouGroupId = "needs-you"

    func visible(_ prs: [PrSummary]) -> [PrSummary] {
        let terms = search.lowercased().split(separator: " ").map(String.init)
        return prs.filter { pr in
            filter.matches(pr) && (!hideDrafts || !pr.isDraft) && terms.allSatisfy { pr.searchText.contains($0) }
        }
    }

    func sorted(_ prs: [PrSummary]) -> [PrSummary] {
        prs.sorted { a, b in
            if a.isMine != b.isMine { return a.isMine }
            if a.isDraft != b.isDraft { return !a.isDraft }
            switch sort {
            case .updated: return a.updatedAt.sortDate > b.updatedAt.sortDate
            case .created: return a.createdAt.sortDate > b.createdAt.sortDate
            case .title: return a.title.localizedStandardCompare(b.title) == .orderedAscending
            }
        }
    }

    /// The desktop pins "Needs you" above the groups when the filter shows everything; by status it is the first group.
    func groups(_ prs: [PrSummary]) -> [PrListGroup] {
        let shown = sorted(visible(prs))
        guard filter == .all, grouping != .flat, grouping != .status else { return group(shown) }
        let needsYou = shown.filter { $0.bucket == .you }
        guard !needsYou.isEmpty else { return group(shown) }
        let pinned = PrListGroup(id: Self.needsYouGroupId, title: "Needs you", pullRequests: needsYou)
        return [pinned] + group(shown.filter { $0.bucket != .you })
    }

    private func group(_ prs: [PrSummary]) -> [PrListGroup] {
        switch grouping {
        case .status:
            return [FocusBucket.you, .ready, .wait, .stale].compactMap { bucket in
                let inBucket = prs.filter { $0.bucket == bucket }
                guard !inBucket.isEmpty else { return nil }
                return PrListGroup(id: bucket == .you ? Self.needsYouGroupId : "status:\(bucket.rawValue)", title: bucket.groupTitle, pullRequests: inBucket)
            }
        case .flat:
            return prs.isEmpty ? [] : [PrListGroup(id: "all", title: "Pull requests", pullRequests: prs)]
        case .repository:
            return Dictionary(grouping: prs) { "\($0.owner)/\($0.repo)" }
                .sorted { a, b in
                    let aMine = a.value.contains(where: \.isMine), bMine = b.value.contains(where: \.isMine)
                    if aMine != bMine { return aMine }
                    return a.key.localizedStandardCompare(b.key) == .orderedAscending
                }
                .map { PrListGroup(id: "repo:\($0.key)", title: $0.key, pullRequests: $0.value) }
        case .author:
            return Dictionary(grouping: prs) { $0.author.login.lowercased() }
                .sorted { a, b in
                    let aMine = a.value[0].isMine, bMine = b.value[0].isMine
                    if aMine != bMine { return aMine }
                    if a.value.count != b.value.count { return a.value.count > b.value.count }
                    return a.key < b.key
                }
                .map { login, prs in
                    let author = prs[0].author
                    return PrListGroup(id: "author:\(login)", title: prs[0].isMine ? "You" : author.displayName, author: author, pullRequests: prs)
                }
        }
    }

    func count(_ filter: PrListFilter, in prs: [PrSummary]) -> Int {
        prs.filter { filter.matches($0) && (!hideDrafts || !$0.isDraft) }.count
    }
}

extension FocusBucket {
    /// A status group's header in the pull request list.
    var groupTitle: String {
        switch self {
        case .you: "Needs you"
        case .ready: "Ready to merge"
        case .wait: "Waiting on others"
        case .stale: "Stale"
        }
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

    /// Title, number, repository, branch and author, lower-cased, for the search field.
    var searchText: String {
        [title, "#\(number)", "\(owner)/\(repo)", headRef, author.login, author.name ?? "", workItemIds.map { "ab#\($0)" }.joined(separator: " ")]
            .joined(separator: " ")
            .lowercased()
    }
}

private extension String {
    /// ISO 8601 from the server; unparsable dates sort last.
    var sortDate: Date { ISODate.parse(self) ?? .distantPast }
}
