import Foundation

/// The desktop's Pull requests list (`pr-store.ts`, `pr-grouping.ts`): every open pull request the server reads,
/// filtered, searched, sorted with yours first and drafts last, and grouped by author or repository.
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
    case author, repository, flat

    var id: String { rawValue }

    var title: String {
        switch self {
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

    /// The desktop pins "Needs you" above the groups when the filter shows everything.
    func groups(_ prs: [PrSummary]) -> [PrListGroup] {
        let shown = sorted(visible(prs))
        guard filter == .all, grouping != .flat else { return group(shown) }
        let needsYou = shown.filter { $0.bucket == .you }
        guard !needsYou.isEmpty else { return group(shown) }
        let pinned = PrListGroup(id: Self.needsYouGroupId, title: "Needs you", pullRequests: needsYou)
        return [pinned] + group(shown.filter { $0.bucket != .you })
    }

    private func group(_ prs: [PrSummary]) -> [PrListGroup] {
        switch grouping {
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

extension PrSummary {
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
