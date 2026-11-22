import Foundation

/// The desktop's `services/pr-list/groups.ts`, one to one: the list's order, its groups and their groups.

struct PrGroupStats: Equatable, Sendable {
    var yourTurn = 0, failing = 0, waiting = 0, ready = 0, draft = 0
    var additions = 0, deletions = 0

    init(_ facts: [PrFacts]) {
        for f in facts {
            switch f.bucket {
            case .yourTurn: yourTurn += 1
            case .failing: failing += 1
            case .waiting: waiting += 1
            case .ready: ready += 1
            case .draft: draft += 1
            }
            additions += f.pr.additions
            deletions += f.pr.deletions
        }
    }
}

struct PrGroupNode: Identifiable, Equatable {
    /// Stable identity: folds, list identity.
    let key: String
    let kind: PrGroupBy
    let label: String
    let facts: [PrFacts]
    /// Author groups: who.
    var author: Person?
    var authorIsMe = false
    /// Status groups: which bucket.
    var bucket: PrStatusBucket?
    /// One line on what puts a pull request in this group.
    var hint: String?
    /// The pinned "Your turn" group.
    var pinned = false
    /// Nothing in it is your turn.
    let quiet: Bool
    let stats: PrGroupStats
    /// Groups by the display's `subGroupBy` inside this one; empty for one level.
    var subgroups: [PrGroupNode] = []

    var id: String { key }
}

enum PrGroups {
    /// Key of the pinned "Your turn" group above the other groups.
    static let yourTurnKey = "your-turn"

    /// The value a pull request is grouped under; "" is the "no value" group (no label, no work item).
    static func value(_ f: PrFacts, _ by: PrGroupBy) -> String {
        let pr = f.pr
        switch by {
        case .none: return "all"
        case .status: return f.bucket.rawValue
        case .author: return pr.author.login.lowercased()
        case .repo: return "\(pr.owner)/\(pr.repo)"
        case .review: return f.review.rawValue
        case .waiting: return f.next.waitingOn.rawValue
        case .workItem: return f.workItems.min().map(String.init) ?? ""
        case .label: return pr.labels.map(\.name).sorted { $0.localizedCompare($1) == .orderedAscending }.first ?? ""
        case .base: return pr.baseRef
        case .age: return f.age.rawValue
        case .size: return f.size.rawValue
        }
    }

    private static func fixedOrder(_ by: PrGroupBy) -> [String]? {
        switch by {
        case .status: PrStatusBucket.allCases.map(\.rawValue)
        case .review: ReviewKey.allCases.map(\.rawValue)
        case .waiting: WaitingOn.allCases.map(\.rawValue)
        case .age: AgeBucket.allCases.map(\.rawValue)
        case .size: SizeBucket.allCases.map(\.rawValue)
        default: nil
        }
    }

    private static func label(_ by: PrGroupBy, _ value: String, sample: PrFacts?) -> String {
        switch by {
        case .none: "All pull requests"
        case .status: PrStatusBucket(rawValue: value)?.label ?? value
        case .author: sample?.pr.author.login ?? value
        case .repo: value
        case .review: ReviewKey(rawValue: value)?.label ?? value
        case .waiting: WaitingOn(rawValue: value)?.label ?? value
        case .workItem: value.isEmpty ? "No work item" : "AB#\(value)"
        case .label: value.isEmpty ? "No label" : value
        case .base: value.isEmpty ? "Unknown base" : value
        case .age: AgeBucket(rawValue: value)?.label ?? value
        case .size: SizeBucket(rawValue: value)?.groupLabel ?? value
        }
    }

    /// Bucket `facts` (already filtered and sorted; the order inside each group is kept) by `by`. Group order:
    /// fixed groupings their own order; author you first, then most pull requests, then login; repository the ones
    /// with yours first, then by name; work item, label, base branch most pull requests first, the "none" group last.
    static func group(_ facts: [PrFacts], by: PrGroupBy, showEmpty: Bool, parentKey: String? = nil) -> [PrGroupNode] {
        var buckets: [String: [PrFacts]] = [:]
        var firstSeen: [String] = []
        for f in facts {
            let value = value(f, by)
            if buckets[value] == nil { firstSeen.append(value) }
            buckets[value, default: []].append(f)
        }
        let count = { (value: String) in buckets[value]?.count ?? 0 }
        let values: [String]
        if let fixed = fixedOrder(by) {
            values = fixed.filter { showEmpty || buckets[$0] != nil }
        } else if by == .author {
            values = firstSeen.sorted { a, b in
                let aMine = buckets[a]![0].mine, bMine = buckets[b]![0].mine
                if aMine != bMine { return aMine }
                if count(a) != count(b) { return count(a) > count(b) }
                return a.localizedCompare(b) == .orderedAscending
            }
        } else if by == .repo {
            values = firstSeen.sorted { a, b in
                let aMine = buckets[a]!.contains(where: \.mine), bMine = buckets[b]!.contains(where: \.mine)
                if aMine != bMine { return aMine }
                return a.localizedCompare(b) == .orderedAscending
            }
        } else {
            values = firstSeen.sorted { a, b in
                if a.isEmpty != b.isEmpty { return !a.isEmpty }
                if count(a) != count(b) { return count(a) > count(b) }
                return a.localizedCompare(b) == .orderedAscending
            }
        }

        let prefix = parentKey.map { "\($0)/" } ?? ""
        return values.map { value in
            let items = buckets[value] ?? []
            let sample = items.first
            let stats = PrGroupStats(items)
            var node = PrGroupNode(key: "\(prefix)\(by.rawValue):\(value)", kind: by, label: label(by, value, sample: sample), facts: items, quiet: stats.yourTurn == 0, stats: stats)
            if by == .author, let sample {
                node.author = sample.pr.author
                node.authorIsMe = sample.mine
            }
            if by == .status, let bucket = PrStatusBucket(rawValue: value) {
                node.bucket = bucket
                node.hint = bucket.hint
            }
            return node
        }
    }

    /// The list's groups: an optional pinned "Your turn" group, then `display.groupBy`, each with its sub-groups.
    static func build(_ facts: [PrFacts], display: PrDisplay, pin: Bool) -> [PrGroupNode] {
        let pinned = pin ? facts.filter(\.yourTurn) : []
        let rest = pinned.isEmpty ? facts : facts.filter { !$0.yourTurn }
        var all = group(rest, by: display.groupBy, showEmpty: display.showEmptyGroups)
        if !pinned.isEmpty {
            let stats = PrGroupStats(pinned)
            var node = PrGroupNode(key: yourTurnKey, kind: display.groupBy, label: "Your turn", facts: pinned, quiet: false, stats: stats)
            node.pinned = true
            node.hint = PrStatusBucket.yourTurn.hint
            all.insert(node, at: 0)
        }
        let sub = display.subGroupBy
        guard sub != .none, sub != display.groupBy else { return all }
        return all.map { group in
            var group = group
            group.subgroups = Self.group(group.facts, by: sub, showEmpty: false, parentKey: group.key)
            return group
        }
    }

    /// The desktop's `isGroupCollapsed`: you folded it, or it is quiet under "fold groups with nothing for you" and you
    /// didn't open it.
    static func isFolded(_ group: PrGroupNode, folds: GroupFolds, collapseQuiet: Bool) -> Bool {
        folds.isFolded(group.key, byDefault: collapseQuiet && group.quiet)
    }

    // MARK: - Order

    private static func rank(_ bucket: PrStatusBucket) -> Int {
        switch bucket {
        case .yourTurn: 4
        case .ready: 3
        case .failing: 2
        case .waiting: 1
        case .draft: 0
        }
    }

    private static func sortValue(_ f: PrFacts, _ sortBy: PrSortBy) -> Double {
        switch sortBy {
        case .priority: Double(rank(f.bucket) * 1000 + min(999, f.pr.priorityScore ?? 0))
        case .updated: f.updatedAt.timeIntervalSince1970
        case .created: f.createdAt.timeIntervalSince1970
        case .size: Double(f.lines)
        case .title: 0
        }
    }

    /// `facts` in the chosen order. Ties: under Priority the pull request waiting longest (oldest) first, else the
    /// higher number first, so the order never jumps between polls.
    static func sort(_ facts: [PrFacts], by sortBy: PrSortBy, _ dir: SortDir) -> [PrFacts] {
        let ascending = dir == .asc
        let values = Dictionary(facts.map { ($0.key, sortValue($0, sortBy)) }, uniquingKeysWith: { a, _ in a })
        return facts.sorted { a, b in
            if sortBy == .title {
                let order = a.pr.title.compare(b.pr.title, options: [.caseInsensitive, .diacriticInsensitive], locale: .current)
                if order != .orderedSame { return ascending ? order == .orderedAscending : order == .orderedDescending }
            } else {
                let va = values[a.key]!, vb = values[b.key]!
                if va != vb { return ascending ? va < vb : va > vb }
                if sortBy == .priority, a.createdAt != b.createdAt { return a.createdAt < b.createdAt }
            }
            return a.pr.number > b.pr.number
        }
    }
}
