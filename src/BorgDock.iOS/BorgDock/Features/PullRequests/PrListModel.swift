import Foundation

/// The desktop's `services/pr-list/model.ts` and `facets.ts`: the list as data. Every open pull request's facts, the
/// rows the tab, the query and Hide failing leave, in the chosen order, grouped; each tab's count; the Filter sheet's
/// values with their counts and the chips' wording. Mockup: design/ios-pr-list/mockups.html.

/// The built-in tabs. Saved views add their own after these.
enum PrViewKey: String, CaseIterable, Identifiable, Codable, Sendable {
    case all, needsYou, mine, failing, ready, stale

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: "All"
        case .needsYou: "Your turn"
        case .mine: "Mine"
        case .failing: "Failing"
        case .ready: "Ready to merge"
        case .stale: "Stale"
        }
    }

    /// The pill's word: "Ready" fits where "Ready to merge" doesn't.
    var pillLabel: String { self == .ready ? "Ready" : label }

    func contains(_ f: PrFacts) -> Bool {
        switch self {
        case .all: true
        case .needsYou: f.yourTurn
        case .mine: f.mine
        case .failing: f.failing
        case .ready: f.ready
        case .stale: f.stale
        }
    }

    init(from decoder: Decoder) throws {
        self = PrViewKey(rawValue: try decoder.singleValueContainer().decode(String.self)) ?? .all
    }
}

struct PrListModel {
    /// Filtered and sorted.
    let rows: [PrFacts]
    let groups: [PrGroupNode]
    let parsed: ParsedQuery
    /// Each built-in tab's count, ignoring the query (under Hide failing, but Failing).
    let counts: [PrViewKey: Int]
    /// Each saved view's count with its own tab and query.
    let savedCounts: [String: Int]

    struct Input {
        var facts: [PrFacts]
        var logins: Set<String>
        var now: Date
        var view: PrViewKey
        var query: String
        /// Leaves failing pull requests out of every tab but Failing.
        var hideFailing = false
        var display: PrDisplay
        var savedViews: [SavedPrView] = []
    }

    init(_ input: Input) {
        let ctx = PrQuery.Context(logins: input.logins, now: input.now)
        parsed = ParsedQuery(parsing: input.query)
        rows = PrGroups.sort(Self.filter(input.facts, input.view, parsed, input.hideFailing, ctx), by: input.display.sortBy, input.display.sortDir)
        groups = PrGroups.build(rows, display: input.display, pin: input.display.pinsYourTurn && input.view == .all)

        let visible = input.hideFailing ? input.facts.filter { !$0.failing } : input.facts
        var counts: [PrViewKey: Int] = [:]
        for key in PrViewKey.allCases { counts[key] = (key == .failing ? input.facts : visible).filter(key.contains).count }
        self.counts = counts
        var savedCounts: [String: Int] = [:]
        for view in input.savedViews {
            savedCounts[view.id] = Self.filter(input.facts, view.filter, ParsedQuery(parsing: view.query), input.hideFailing, ctx).count
        }
        self.savedCounts = savedCounts
    }

    private static func filter(_ facts: [PrFacts], _ view: PrViewKey, _ parsed: ParsedQuery, _ hideFailing: Bool, _ ctx: PrQuery.Context) -> [PrFacts] {
        let hides = hideFailing && view != .failing
        return facts.filter { view.contains($0) && !(hides && $0.failing) && PrQuery.matches($0, parsed, ctx) }
    }

    /// The pull requests a tab and query leave, optionally ignoring one field's filters: a Filter sheet field counts
    /// its values within your other filters.
    static func matching(_ facts: [PrFacts], view: PrViewKey, query: String, hideFailing: Bool, ctx: PrQuery.Context, except field: QueryField? = nil) -> [PrFacts] {
        var parsed = ParsedQuery(parsing: query)
        if let field { parsed.terms.removeAll { $0.field == field } }
        return filter(facts, view, parsed, hideFailing, ctx)
    }

    /// Every open pull request's facts, with Focus's teams and stale threshold, and the related CI failures that clear a
    /// red pull request.
    static func facts(_ focus: Focus, logins: Set<String>, now: Date, ciGroups: [CiFailureGroup] = []) -> [PrFacts] {
        let ctx = PrFactsContext(
            logins: Set(logins.map { $0.lowercased() }),
            teams: Array(Set((focus.teams ?? [:]).values.flatMap { $0 })).sorted(),
            now: now,
            staleAfterDays: focus.staleAfterDays ?? 7,
            ciOf: CiLens.lookup(ciGroups, focus.pullRequests)
        )
        return focus.pullRequests.map { PrFacts($0, ctx) }
    }
}

// MARK: - Filter sheet and chips

enum PrFacets {
    /// The Filter sheet's fields, in the desktop's order.
    static let fields: [(field: QueryField, label: String, hint: String?)] = [
        (.repo, "Repository", nil), (.author, "Author", nil), (.reviewer, "Requested reviewer", nil), (.review, "Review state", nil),
        (.checks, "Checks", nil), (.waiting, "Waiting on", nil), (.status, "Status", nil), (.label, "Label", nil), (.base, "Base branch", nil),
        (.ab, "Work item", nil), (.age, "Age", nil), (.size, "Size", nil), (.is, "State", "Draft, conflicts, stale, auto-merge"),
    ]

    static func label(_ field: QueryField) -> String {
        field == .updated ? "Updated" : fields.first { $0.field == field }?.label ?? field.rawValue
    }

    struct Value: Identifiable, Equatable {
        let value: String
        let label: String
        let count: Int
        /// Author values: who, for the avatar.
        var person: Person?
        var id: String { value }
    }

    static func fixedValues(_ field: QueryField) -> [(String, String)]? {
        switch field {
        case .review:
            [("me", ReviewKey.awaitingYou.label), ("changes", ReviewKey.changes.label), ("commented", ReviewKey.commented.label),
             ("others", ReviewKey.awaitingOthers.label), ("approved", ReviewKey.approved.label), ("none", ReviewKey.none.label)]
        case .checks:
            [("failing", "Failing"), ("shared", "Shared failure"), ("running", "Running"), ("passing", "Passing"), ("none", "No checks")]
        case .waiting: WaitingOn.allCases.map { ($0.rawValue, $0.label) }
        case .status: PrStatusBucket.allCases.map { ($0.rawValue.lowercased(), $0.label) }
        case .age: AgeBucket.allCases.map { ($0.rawValue, $0.label) }
        case .size: SizeBucket.allCases.map { ($0.rawValue, $0.groupLabel) }
        case .is: [("draft", "Draft"), ("conflicts", "Has conflicts"), ("stale", "Stale"), ("automerge", "Auto-merge on"), ("mine", "Mine")]
        default: nil
        }
    }

    /// The values to offer for `field` with their counts in `facts`: the fixed list for the fields that have one, else
    /// every value the pull requests carry, most common first.
    static func values(_ field: QueryField, in facts: [PrFacts], ctx: PrQuery.Context) -> [Value] {
        let count = { (value: String) in facts.filter { PrQuery.matches($0, QueryTerm(field, [value]), ctx) }.count }
        if let fixed = fixedValues(field) { return fixed.map { Value(value: $0.0, label: $0.1, count: count($0.0)) } }

        // A repository is named by its name alone unless two owners share it.
        var owners: [String: Set<String>] = [:]
        for f in facts { owners[f.pr.repo.lowercased(), default: []].insert(f.pr.owner.lowercased()) }
        func repoKey(_ pr: PrSummary) -> String { (owners[pr.repo.lowercased()]?.count ?? 0) > 1 ? "\(pr.owner)/\(pr.repo)" : pr.repo }

        var labels: [String: String] = [:]
        var people: [String: Person] = [:]
        var order: [String] = []
        for f in facts {
            let pr = f.pr
            let carried: [String] = switch field {
            case .repo: [repoKey(pr)]
            case .author: [pr.author.login]
            case .reviewer: (pr.requestedReviewerLogins ?? []) + (pr.requestedTeams ?? [])
            case .label: pr.labels.map(\.name)
            case .base: pr.baseRef.isEmpty ? [] : [pr.baseRef]
            case .ab: f.workItems.map(String.init)
            default: []
            }
            for value in carried where labels[value.lowercased()] == nil {
                labels[value.lowercased()] = value
                order.append(value.lowercased())
            }
            if field == .author { people[pr.author.login.lowercased()] = pr.author }
        }
        return order.map { value in
            let person = people[value]
            let label = switch field {
            case .ab: "AB#\(labels[value]!)"
            case .author: ctx.logins.contains(value) ? "You" : person?.displayName ?? labels[value]!
            default: labels[value]!
            }
            return Value(value: value, label: label, count: count(value), person: person)
        }
        .sorted { a, b in a.count != b.count ? a.count > b.count : a.label.localizedCompare(b.label) == .orderedAscending }
    }

    /// "Author", "is any of", "Priya Shah, Tom Berg"; "Checks", "is not", "failing" for a chip. `name` turns a login into
    /// a name where it can.
    static func chip(_ term: QueryTerm, name: (String) -> String? = { _ in nil }) -> (field: String, op: String, values: String) {
        let fixed = fixedValues(term.field)
        let many = term.values.count > 1
        let values = term.values.map { value in
            if let label = fixed?.first(where: { $0.0 == value })?.1 { return label.lowercased() }
            switch term.field {
            case .ab: return "AB#\(value)"
            case .author, .reviewer: return name(value) ?? value
            default: return value
            }
        }
        return (label(term.field), term.negate ? (many ? "is none of" : "is not") : (many ? "is any of" : "is"), values.joined(separator: ", "))
    }
}

// MARK: - Saved views

/// A tab that remembers its base tab, query and display (the desktop's `SavedPrView`), shared with the desktop.
struct SavedPrView: Codable, Equatable, Identifiable, Sendable {
    let id: String
    var name: String
    var filter: PrViewKey
    var query: String
    var display: PrDisplay

    static func newId(now: Date = .now) -> String {
        let alphabet = Array("abcdefghijklmnopqrstuvwxyz0123456789")
        let millis = UInt64(now.timeIntervalSince1970 * 1000)
        return "view-\(String(millis, radix: 36))-\(String((0..<5).map { _ in alphabet.randomElement()! }))"
    }

    /// The list differs from what the view saved.
    func isEdited(filter: PrViewKey, query: String, display: PrDisplay) -> Bool {
        let normalize = { (q: String) in q.split(whereSeparator: \.isWhitespace).joined(separator: " ") }
        return self.filter != filter || normalize(self.query) != normalize(query) || self.display != display
    }
}

/// GET /api/pr-views: the list both apps share, at a revision.
struct PrViews: Codable, Equatable, Sendable {
    let revision: Int
    let views: [SavedPrView]
    let updatedAt: String?

    static let empty = PrViews(revision: 0, views: [], updatedAt: nil)
}

struct PutPrViewsRequest: Encodable {
    let baseRevision: Int
    let views: [SavedPrView]
}

/// The three-way merge of saved views (spec 2026-11-22-ios-pr-list.md, "Merge"; the desktop has the same rules).
/// `base` is what this device last read from or wrote to the server, `mine` what it holds now, `theirs` the server's.
enum PrViewMerge {
    static func merge(base: [SavedPrView], mine: [SavedPrView], theirs: [SavedPrView]) -> [SavedPrView] {
        let baseById = Dictionary(base.map { ($0.id, $0) }, uniquingKeysWith: { a, _ in a })
        let mineIds = Set(mine.map(\.id))
        // 1. Theirs, in its order; 3. without what was deleted here.
        var result = theirs.filter { baseById[$0.id] == nil || mineIds.contains($0.id) }
        for view in mine {
            let original = baseById[view.id]
            // 2. Added here, or 4. edited here: replaces their copy, or comes back at the end.
            guard original == nil || original != view else { continue }
            if let index = result.firstIndex(where: { $0.id == view.id }) {
                result[index] = view
            } else {
                result.append(view)
            }
        }
        return result
    }
}
