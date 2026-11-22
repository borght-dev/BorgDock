import Foundation

/// The desktop's `services/pr-list/query.ts`, one to one: free text plus `field:value` qualifiers, the shape of
/// GitHub's search (`author:vera is:failing repo:shop-web`). The chips are a view of the qualifiers; adding or removing
/// one rewrites the query, so the query string is the only filter state and a saved view stores just that string.
///
/// - Values separated by commas match any of them: `repo:web,api`.
/// - A leading minus leaves out: `-author:dependabot`.
/// - Quotes keep spaces: `label:"needs review"`.
/// - `me` stands for you in `author:` and `reviewer:`.
/// - `age:`, `updated:` take `<` / `>` and a duration (`>7d`, `<12h`, `>=2w`); `size:` takes changed lines (`<100`) or a
///   bucket (`xs` … `xl`).
/// - A word with an unknown field stays free text.
enum QueryField: String, CaseIterable, Sendable {
    case `is`, status, author, review, reviewer, checks, waiting, repo, label, base, ab, age, updated, size
}

struct QueryTerm: Equatable, Hashable, Sendable {
    let field: QueryField
    /// Lower-cased; any of them matches.
    let values: [String]
    let negate: Bool

    init(_ field: QueryField, _ values: [String], negate: Bool = false) {
        self.field = field
        self.values = values
        self.negate = negate
    }

    /// `-author:priya,tom`, `label:"needs qa"`.
    var text: String {
        (negate ? "-" : "") + field.rawValue + ":" + values.map(Self.quote).joined(separator: ",")
    }

    private static func quote(_ value: String) -> String {
        value.contains(where: { $0.isWhitespace || $0 == "," || $0 == "\"" }) ? "\"\(value.replacingOccurrences(of: "\"", with: ""))\"" : value
    }
}

struct ParsedQuery: Equatable, Sendable {
    var terms: [QueryTerm]
    /// Everything that is not a qualifier, joined by single spaces.
    var text: String

    init(terms: [QueryTerm] = [], text: String = "") {
        self.terms = terms
        self.text = text
    }

    init(parsing query: String) {
        var terms: [QueryTerm] = []
        var text: [String] = []
        for token in Self.tokens(query) {
            if let term = Self.term(token) {
                terms.append(term)
            } else {
                text.append(token.replacingOccurrences(of: "\"", with: ""))
            }
        }
        self.init(terms: terms, text: text.joined(separator: " "))
    }

    var formatted: String {
        (terms.map(\.text) + [text]).filter { !$0.isEmpty }.joined(separator: " ")
    }

    /// Split on whitespace outside double quotes.
    private static func tokens(_ query: String) -> [String] {
        var out: [String] = []
        var current = ""
        var quoted = false
        for ch in query {
            if ch == "\"" {
                quoted.toggle()
                current.append(ch)
            } else if !quoted, ch.isWhitespace {
                if !current.isEmpty { out.append(current) }
                current = ""
            } else {
                current.append(ch)
            }
        }
        if !current.isEmpty { out.append(current) }
        return out
    }

    /// `-?field:values` with a known field, else nil.
    static func term(_ token: String) -> QueryTerm? {
        guard let colon = token.firstIndex(of: ":") else { return nil }
        var name = token[..<colon]
        let negate = name.hasPrefix("-")
        if negate { name = name.dropFirst() }
        let rest = token[token.index(after: colon)...]
        guard !name.isEmpty, !rest.isEmpty, name.allSatisfy({ $0.isASCII && $0.isLetter }),
              let field = QueryField(rawValue: name.lowercased()) else { return nil }
        let values = splitValues(String(rest))
        return values.isEmpty ? nil : QueryTerm(field, values, negate: negate)
    }

    private static func splitValues(_ raw: String) -> [String] {
        var values: [String] = []
        var current = ""
        var quoted = false
        func flush() {
            let value = current.trimmingCharacters(in: .whitespaces)
            if !value.isEmpty { values.append(value.lowercased()) }
            current = ""
        }
        for ch in raw {
            if ch == "\"" { quoted.toggle() } else if ch == ",", !quoted { flush() } else { current.append(ch) }
        }
        flush()
        return values
    }
}

enum PrQuery {
    /// The query with `field`'s term replaced: the first term on that field takes the new values and sign in place,
    /// later ones on the same field go. No values removes the term.
    static func setTerm(_ query: String, _ field: QueryField, _ values: [String], negate: Bool = false) -> String {
        var parsed = ParsedQuery(parsing: query)
        let next = QueryTerm(field, values.map { $0.lowercased() }, negate: negate)
        let index = parsed.terms.firstIndex { $0.field == field }
        let kept = parsed.terms.enumerated().filter { $0.element.field != field || $0.offset == index }.map(\.element)
        if index == nil {
            parsed.terms = values.isEmpty ? kept : kept + [next]
        } else {
            parsed.terms = kept.flatMap { $0.field != field ? [$0] : values.isEmpty ? [] : [next] }
        }
        return parsed.formatted
    }

    /// The query without the term at `index` of its parsed terms.
    static func removeTerm(_ query: String, at index: Int) -> String {
        var parsed = ParsedQuery(parsing: query)
        guard parsed.terms.indices.contains(index) else { return query }
        parsed.terms.remove(at: index)
        return parsed.formatted
    }

    /// The query with only its free text: every qualifier gone.
    static func clearTerms(_ query: String) -> String { ParsedQuery(parsing: query).text }

    /// The free text replaced, the qualifiers kept.
    static func setText(_ query: String, _ text: String) -> String {
        var parsed = ParsedQuery(parsing: query)
        parsed.text = text
        return parsed.formatted
    }

    // MARK: - Matching

    struct Context {
        /// Your logins, lower-cased, for `me`.
        var logins: Set<String>
        /// Clock for `age:` and `updated:`.
        var now: Date
    }

    /// Every qualifier matches (AND), and the free text matches as one phrase.
    static func matches(_ f: PrFacts, _ parsed: ParsedQuery, _ ctx: Context) -> Bool {
        parsed.terms.allSatisfy { matches(f, $0, ctx) } && matchesSearch(f.pr, parsed.text)
    }

    static func matches(_ f: PrFacts, _ term: QueryTerm, _ ctx: Context) -> Bool {
        let hit = term.values.contains { matches(f, term.field, $0, ctx) }
        return term.negate ? !hit : hit
    }

    /// The desktop's `matchesSearch`, plus the author's name: the phone shows names, not logins.
    static func matchesSearch(_ pr: PrSummary, _ query: String) -> Bool {
        guard !query.isEmpty else { return true }
        let q = query.lowercased()
        return pr.title.lowercased().contains(q)
            || pr.author.login.lowercased().contains(q)
            || (pr.author.name?.lowercased().contains(q) ?? false)
            || pr.headRef.lowercased().contains(q)
            || "\(pr.owner)/\(pr.repo)".lowercased().contains(q)
            || String(pr.number).contains(q)
            || pr.labels.contains { $0.name.lowercased().contains(q) }
    }

    private static func matches(_ f: PrFacts, _ field: QueryField, _ value: String, _ ctx: Context) -> Bool {
        let pr = f.pr
        switch field {
        case .is: return isValue(f, value)
        case .status: return statusAliases[value] == f.bucket
        case .author: return isMe(value) ? ctx.logins.contains(pr.author.login.lowercased()) : pr.author.login.lowercased() == bare(value)
        case .review: return reviewAliases[value]?.contains(f.review) ?? false
        case .reviewer:
            if isMe(value) { return f.waitingOnMe }
            let who = bare(value)
            return (pr.requestedReviewerLogins ?? []).contains { $0.lowercased() == who } || (pr.requestedTeams ?? []).contains { $0.lowercased() == who }
        case .checks: return checksValue(f, value)
        case .waiting: return waitingAliases[value] == f.next.waitingOn
        case .repo: return pr.repo.lowercased() == value || "\(pr.owner)/\(pr.repo)".lowercased() == value
        case .label: return pr.labels.contains { $0.name.lowercased() == value }
        case .base: return pr.baseRef.lowercased() == value
        case .ab:
            var id = Substring(value)
            if id.hasPrefix("ab") { id = id.dropFirst(2) }
            if id.hasPrefix("#") { id = id.dropFirst() }
            return Int(id).map(f.workItems.contains) ?? false
        case .age:
            if value == f.age.rawValue { return true }
            return comparison(value, unitless: PrTime.day).map { compare(ctx.now.timeIntervalSince(f.createdAt), $0) } ?? false
        case .updated:
            return comparison(value, unitless: PrTime.day).map { compare(ctx.now.timeIntervalSince(f.updatedAt), $0) } ?? false
        case .size:
            if value == f.size.rawValue { return true }
            return comparison(value, unitless: 1).map { compare(Double(f.lines), $0) } ?? false
        }
    }

    private static func isMe(_ value: String) -> Bool { value == "me" || value == "@me" }
    private static func bare(_ value: String) -> String { value.hasPrefix("@") ? String(value.dropFirst()) : value }

    private static func isValue(_ f: PrFacts, _ value: String) -> Bool {
        switch value {
        case "yourturn", "turn", "needsyou": f.yourTurn
        case "mine": f.mine
        case "failing", "red": f.failing
        case "running", "pending": f.running
        case "passing", "green": !f.failing && !f.running && f.pr.overallStatus == .green
        case "ready": f.ready
        case "draft": f.draft
        case "conflicts", "conflict": f.conflicts
        case "stale": f.stale
        case "shared": f.ci != nil
        case "automerge": f.pr.autoMerge
        case "open": true
        default: false
        }
    }

    private static func checksValue(_ f: PrFacts, _ value: String) -> Bool {
        switch value {
        case "failing": f.failing
        case "running": f.running
        case "passing": !f.failing && !f.running && f.pr.checks.total > 0
        case "none": f.pr.checks.total == 0
        case "shared": f.ci != nil
        default: false
        }
    }

    private static let reviewAliases: [String: [ReviewKey]] = [
        "me": [.awaitingYou], "you": [.awaitingYou], "approved": [.approved], "changes": [.changes], "commented": [.commented],
        "pending": [.awaitingOthers, .awaitingYou], "others": [.awaitingOthers], "none": [.none],
    ]

    private static let statusAliases: [String: PrStatusBucket] = [
        "yourturn": .yourTurn, "turn": .yourTurn, "failing": .failing, "waiting": .waiting, "ready": .ready, "draft": .draft,
    ]

    private static let waitingAliases: [String: WaitingOn] = [
        "you": .you, "me": .you, "author": .author, "reviewer": .reviewers, "reviewers": .reviewers, "ci": .ci,
    ]

    private enum Op { case lt, le, gt, ge, eq }

    /// `>7d` → (>, 7 days in seconds); `unitless` multiplies a bare number (days for ages, 1 for lines).
    private static func comparison(_ value: String, unitless: Double) -> (Op, Double)? {
        var rest = Substring(value)
        var op = Op.eq
        for (prefix, candidate) in [("<=", Op.le), (">=", .ge), ("<", .lt), (">", .gt), ("=", .eq)] where rest.hasPrefix(prefix) {
            op = candidate
            rest = rest.dropFirst(prefix.count)
            break
        }
        let units: [Character: Double] = ["m": PrTime.minute, "h": PrTime.hour, "d": PrTime.day, "w": PrTime.week]
        var unit = unitless
        if let last = rest.last, let scale = units[last] {
            unit = scale
            rest = rest.dropLast()
        }
        let parts = rest.split(separator: ".", omittingEmptySubsequences: false)
        guard !rest.isEmpty, parts.count <= 2, parts.allSatisfy({ !$0.isEmpty && $0.allSatisfy(\.isASCII) && $0.allSatisfy(\.isNumber) }),
              let amount = Double(rest) else { return nil }
        return (op, amount * unit)
    }

    private static func compare(_ actual: Double, _ c: (Op, Double)) -> Bool {
        switch c.0 {
        case .lt: actual < c.1
        case .le: actual <= c.1
        case .gt: actual > c.1
        case .ge: actual >= c.1
        case .eq: actual == c.1
        }
    }
}

/// Typing a filter in the search field: `author:priya` followed by a space becomes a filter (a chip), the rest stays
/// text, and the word being typed gets suggestions. Mockup: design/ios-pr-list/mockups.html, "Typing a filter".
enum PrSearchTyping {
    struct Absorbed: Equatable {
        /// Qualifiers typed to the end (a space after them): they move to the query's terms.
        var terms: [QueryTerm]
        /// What stays in the field.
        var field: String
        /// The free text for the query: the field without a qualifier still being typed.
        var text: String
    }

    static func absorb(_ typed: String) -> Absorbed {
        let words = words(typed)
        var terms: [QueryTerm] = []
        var kept: [String] = []
        for word in words.complete {
            if let term = ParsedQuery.term(word) { terms.append(term) } else { kept.append(word) }
        }
        let pending = words.pending.flatMap { startsQualifier($0) ? nil : $0 }
        let text = (kept + [pending].compactMap { $0 }).map { $0.replacingOccurrences(of: "\"", with: "") }.joined(separator: " ")
        guard !terms.isEmpty else { return Absorbed(terms: [], field: typed, text: text) }
        var field = (kept + [words.pending].compactMap { $0 }).joined(separator: " ")
        if words.pending == nil, !field.isEmpty { field += " " }
        return Absorbed(terms: terms, field: field, text: text)
    }

    /// `author:`, `-repo:sh`: a known field and its colon, the value maybe not typed yet.
    static func startsQualifier(_ word: String) -> Bool {
        var word = Substring(word)
        if word.hasPrefix("-") { word = word.dropFirst() }
        guard let colon = word.firstIndex(of: ":") else { return false }
        return QueryField(rawValue: word[..<colon].lowercased()) != nil
    }

    /// Words followed by a space outside quotes, and the one still being typed.
    static func words(_ typed: String) -> (complete: [String], pending: String?) {
        var complete: [String] = []
        var current = ""
        var quoted = false
        for ch in typed {
            if ch == "\"" { quoted.toggle() }
            if !quoted, ch.isWhitespace {
                if !current.isEmpty { complete.append(current) }
                current = ""
            } else {
                current.append(ch)
            }
        }
        return (complete, current.isEmpty ? nil : current)
    }

    struct Suggestion: Identifiable, Equatable {
        let label: String
        /// `checks:`, `author:priya`: what it writes.
        let detail: String
        var count: Int?
        /// The field's text after picking it.
        let completion: String
        var id: String { completion }
    }

    /// For the word being typed: fields whose name it starts (`aut` → `author:`), or after `field:` that field's values
    /// with how many pull requests each matches within `facts`.
    static func suggestions(_ typed: String, facts: [PrFacts], ctx: PrQuery.Context, limit: Int = 8) -> [Suggestion] {
        let words = words(typed)
        guard let pending = words.pending else { return [] }
        let before = words.complete.isEmpty ? "" : words.complete.joined(separator: " ") + " "
        var word = Substring(pending)
        let negate = word.hasPrefix("-")
        if negate { word = word.dropFirst() }
        let sign = negate ? "-" : ""
        guard let colon = word.firstIndex(of: ":") else {
            let start = word.lowercased()
            guard !start.isEmpty else { return [] }
            return PrFacets.fields.filter { $0.field.rawValue.hasPrefix(start) }.prefix(limit).map { field in
                Suggestion(label: field.label, detail: "\(sign)\(field.field.rawValue):", completion: "\(before)\(sign)\(field.field.rawValue):")
            }
        }
        guard let field = QueryField(rawValue: word[..<colon].lowercased()) else { return [] }
        let typedValues = word[word.index(after: colon)...].split(separator: ",", omittingEmptySubsequences: false).map(String.init)
        let partial = (typedValues.last ?? "").replacingOccurrences(of: "\"", with: "").lowercased()
        let earlier = typedValues.dropLast().filter { !$0.isEmpty }
        let prefix = "\(sign)\(field.rawValue):" + earlier.map { "\($0)," }.joined()
        return PrFacets.values(field, in: facts, ctx: ctx)
            .filter { value in
                !earlier.contains(value.value)
                    && (partial.isEmpty || value.value.lowercased().contains(partial) || value.label.lowercased().contains(partial))
            }
            .prefix(limit)
            .map { value in
                let written = QueryTerm(field, [value.value]).text.dropFirst(field.rawValue.count + 1)
                return Suggestion(label: value.label, detail: prefix + written, count: value.count, completion: "\(before)\(prefix)\(written) ")
            }
    }
}
