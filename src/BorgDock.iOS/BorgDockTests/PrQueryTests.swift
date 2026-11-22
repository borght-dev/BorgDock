import XCTest
@testable import BorgDock

/// The desktop's `services/pr-list/__tests__/query.test.ts`, with the same query strings: a query must match the same
/// pull requests on both.
final class PrQueryTests: XCTestCase {
    private let ctx = PrQuery.Context(logins: [listMe], now: samplePRNow)

    private func matches(_ query: String, _ f: PrFacts) -> Bool { PrQuery.matches(f, ParsedQuery(parsing: query), ctx) }

    // MARK: - Parsing

    func testParsingSplitsQualifiersFromText() {
        XCTAssertEqual(ParsedQuery(parsing: "results grid"), ParsedQuery(terms: [], text: "results grid"))
        XCTAssertEqual(ParsedQuery(parsing: ""), ParsedQuery())
        XCTAssertEqual(
            ParsedQuery(parsing: "  results   author:me  grid is:failing "),
            ParsedQuery(terms: [QueryTerm(.author, ["me"]), QueryTerm(.is, ["failing"])], text: "results grid")
        )
        XCTAssertEqual(ParsedQuery(parsing: "Author:Mira").terms, [QueryTerm(.author, ["mira"])], "fields and values lower-case")
        XCTAssertEqual(ParsedQuery(parsing: "repo:web,,api,").terms.first?.values, ["web", "api"], "commas are any of")
        XCTAssertEqual(ParsedQuery(parsing: "-label:wip").terms, [QueryTerm(.label, ["wip"], negate: true)])
        XCTAssertEqual(ParsedQuery(parsing: "label:\"needs review\",bug grid"), ParsedQuery(terms: [QueryTerm(.label, ["needs review", "bug"])], text: "grid"))
        XCTAssertEqual(ParsedQuery(parsing: "label:\"a, b\"").terms.first?.values, ["a, b"])
        XCTAssertEqual(ParsedQuery(parsing: "foo:bar -foo:baz https://example.com"), ParsedQuery(terms: [], text: "foo:bar -foo:baz https://example.com"))
        XCTAssertEqual(ParsedQuery(parsing: "author: label:\"\" repo:,"), ParsedQuery(terms: [], text: "author: label: repo:,"))
        XCTAssertEqual(ParsedQuery(parsing: "age:>7d size:<100 updated:>=2w").terms.map { $0.values[0] }, [">7d", "<100", ">=2w"])
    }

    func testFormattingWritesQualifiersFirstAndRoundTrips() {
        XCTAssertEqual(ParsedQuery(parsing: "grid author:me fix -is:draft").formatted, "author:me -is:draft grid fix")
        XCTAssertEqual(QueryTerm(.label, ["needs review", "a,b", "bug"], negate: true).text, "-label:\"needs review\",\"a,b\",bug")
        for query in [
            "author:me is:failing repo:a,b -label:x age:>7d size:<100 ab:123 waiting:ci review:me",
            "label:\"needs review\",bug grid fix",
            "grid -author:dependabot \"quoted words\" foo:bar",
            "base:release:1.2 updated:<12h",
            "",
        ] {
            let parsed = ParsedQuery(parsing: query)
            XCTAssertEqual(ParsedQuery(parsing: parsed.formatted), parsed, query)
            XCTAssertEqual(ParsedQuery(parsing: parsed.formatted).formatted, parsed.formatted, query)
        }
    }

    func testSetTermRemoveTermAndClearTerms() {
        XCTAssertEqual(PrQuery.setTerm("author:me grid", .repo, ["Shop"]), "author:me repo:shop grid")
        XCTAssertEqual(PrQuery.setTerm("author:me repo:a is:draft", .repo, ["b", "c"]), "author:me repo:b,c is:draft")
        XCTAssertEqual(PrQuery.setTerm("repo:a author:me -repo:b", .repo, ["c"]), "repo:c author:me")
        XCTAssertEqual(PrQuery.setTerm("-label:wip", .label, ["wip"]), "label:wip")
        XCTAssertEqual(PrQuery.setTerm("label:wip grid", .label, ["wip"], negate: true), "-label:wip grid")
        XCTAssertEqual(PrQuery.setTerm("repo:a author:me -repo:b grid", .repo, []), "author:me grid")
        XCTAssertEqual(PrQuery.setTerm("author:me grid", .repo, []), "author:me grid")
        XCTAssertEqual(PrQuery.setTerm("", .label, ["Needs review"]), "label:\"needs review\"")
        XCTAssertEqual(PrQuery.removeTerm("author:me grid repo:a -is:draft", at: 1), "author:me -is:draft grid")
        XCTAssertEqual(PrQuery.removeTerm("author:me grid", at: 5), "author:me grid")
        XCTAssertEqual(PrQuery.clearTerms("author:me grid -repo:a fix"), "grid fix")
        XCTAssertEqual(PrQuery.clearTerms("is:failing"), "")
    }

    // MARK: - Matching

    func testIsValues() throws {
        let asked = try listFacts(author: "mira", requested: [listMe])
        XCTAssertTrue(matches("is:yourturn", asked))
        XCTAssertTrue(matches("is:turn", asked))
        XCTAssertTrue(matches("is:needsyou", asked))
        XCTAssertFalse(matches("is:yourTurn", try listFacts(author: "mira")))
        XCTAssertTrue(matches("is:mine", try listFacts()))
        XCTAssertFalse(matches("is:mine", try listFacts(author: "mira")))
        XCTAssertTrue(matches("is:failing", try listFacts(checks: listRed)))
        XCTAssertTrue(matches("is:red", try listFacts(checks: listRed)))
        XCTAssertFalse(matches("is:failing", try listFacts(checks: listRunning)))
        XCTAssertTrue(matches("is:running", try listFacts(checks: listRunning)))
        XCTAssertTrue(matches("is:pending", try listFacts(checks: listRunning)))
        XCTAssertTrue(matches("is:passing", try listFacts()))
        XCTAssertFalse(matches("is:green", try listFacts(checks: listRunning)))
        XCTAssertFalse(matches("is:passing", try listFacts(checks: listRed)))
        XCTAssertTrue(matches("is:ready", try listFacts(reviews: [("jules", "approved")])))
        XCTAssertFalse(matches("is:ready", try listFacts()))
        XCTAssertTrue(matches("is:draft", try listFacts(draft: true)))
        XCTAssertTrue(matches("is:conflicts", try listFacts(extra: ["mergeable": "conflicting"])))
        XCTAssertTrue(matches("is:conflict", try listFacts(extra: ["mergeable": "conflicting"])))
        XCTAssertTrue(matches("is:stale", try listFacts(updatedHoursAgo: 8 * 24)))
        XCTAssertFalse(matches("is:stale", try listFacts()))
        XCTAssertFalse(matches("is:shared", try listFacts(checks: listRed)), "the phone has no shared failures yet")
        XCTAssertTrue(matches("is:automerge", try listFacts(extra: ["autoMerge": true])))
        XCTAssertFalse(matches("is:automerge", try listFacts()))
        XCTAssertTrue(matches("is:open", try listFacts(draft: true, checks: listRed)))
        XCTAssertFalse(matches("is:whatever", try listFacts()))
    }

    func testStatusReviewChecksAndWaiting() throws {
        let asked = try listFacts(author: "mira", requested: [listMe])
        XCTAssertTrue(matches("status:yourturn", asked))
        XCTAssertTrue(matches("status:turn", try listFacts(checks: listRed)))
        XCTAssertTrue(matches("status:failing", try listFacts(author: "mira", checks: listRed)))
        XCTAssertTrue(matches("status:waiting", try listFacts(author: "mira")))
        XCTAssertTrue(matches("status:ready", try listFacts(author: "mira", reviews: [("jules", "approved")])))
        XCTAssertTrue(matches("status:draft", try listFacts(draft: true)))
        XCTAssertFalse(matches("status:ready", try listFacts(author: "mira")))

        XCTAssertTrue(matches("review:me", asked))
        XCTAssertTrue(matches("review:pending", asked))
        XCTAssertTrue(matches("review:pending", try listFacts(author: "mira", requested: ["jules"])))
        XCTAssertTrue(matches("review:others", try listFacts(author: "mira", requested: ["jules"])))
        XCTAssertFalse(matches("review:others", asked))
        XCTAssertTrue(matches("review:approved", try listFacts(reviews: [("jules", "approved")])))
        XCTAssertTrue(matches("review:changes", try listFacts(reviews: [("jules", "changes_requested")])))
        XCTAssertTrue(matches("review:commented", try listFacts(reviews: [("jules", "commented")])))
        XCTAssertTrue(matches("review:none", try listFacts()))
        XCTAssertFalse(matches("review:none", try listFacts(reviews: [("jules", "approved")])))

        XCTAssertTrue(matches("checks:failing", try listFacts(checks: listRed)))
        XCTAssertTrue(matches("checks:running", try listFacts(checks: listRunning)))
        XCTAssertTrue(matches("checks:passing", try listFacts()))
        XCTAssertFalse(matches("checks:passing", try listFacts(checks: listNone)))
        XCTAssertTrue(matches("checks:none", try listFacts(checks: listNone)))
        XCTAssertFalse(matches("checks:none", try listFacts()))

        XCTAssertTrue(matches("waiting:me", asked))
        XCTAssertTrue(matches("waiting:author", try listFacts(author: "mira", checks: listRed)))
        XCTAssertTrue(matches("waiting:reviewers", try listFacts(author: "mira", requested: ["jules"])))
        XCTAssertTrue(matches("waiting:ci", try listFacts(author: "mira", checks: listRunning)))
        XCTAssertFalse(matches("waiting:ci", asked))
    }

    func testPeopleRepositoriesLabelsAndWorkItems() throws {
        XCTAssertTrue(matches("author:me", try listFacts()))
        XCTAssertTrue(matches("author:@me", try listFacts()))
        XCTAssertFalse(matches("author:me", try listFacts(author: "mira")))
        XCTAssertTrue(matches("author:Mira", try listFacts(author: "mira")))
        XCTAssertTrue(matches("author:mira,jules", try listFacts(author: "jules")))
        XCTAssertTrue(matches("-author:mira,jules", try listFacts(author: "sasha")))
        XCTAssertFalse(matches("-author:mira,jules", try listFacts(author: "jules")))

        let team = try listFacts(author: "mira", teams: ["platform"])
        XCTAssertTrue(PrQuery.matches(PrFacts(team.pr, PrFactsContext(logins: [listMe], teams: ["acme/platform"], now: samplePRNow)), QueryTerm(.reviewer, ["me"]), ctx), "a team request through your team")
        XCTAssertFalse(matches("reviewer:me", team))
        let named = try listFacts(author: "mira", requested: ["Jules"], teams: ["Platform"])
        XCTAssertTrue(matches("reviewer:jules", named))
        XCTAssertTrue(matches("reviewer:@platform", named))
        XCTAssertFalse(matches("reviewer:sasha", named))

        XCTAssertTrue(matches("repo:shop", try listFacts()))
        XCTAssertTrue(matches("repo:ACME/Shop", try listFacts()))
        XCTAssertFalse(matches("repo:api", try listFacts()))
        XCTAssertTrue(matches("repo:api,shop", try listFacts()))

        let labelled = try listFacts(extra: ["labels": [["name": "Needs Review", "color": "fff"]], "baseRef": "Release/1.2"])
        XCTAssertTrue(matches("label:\"needs review\"", labelled))
        XCTAssertFalse(matches("label:bug", labelled))
        XCTAssertTrue(matches("-label:bug", labelled))
        XCTAssertTrue(matches("base:release/1.2", labelled))
        XCTAssertFalse(matches("base:main", labelled))

        let item = try listFacts(extra: ["workItemIds": [123]])
        XCTAssertTrue(matches("ab:123", item))
        XCTAssertTrue(matches("ab:AB#123", item))
        XCTAssertTrue(matches("ab:ab123", item))
        XCTAssertFalse(matches("ab:124", item))
    }

    func testAgeUpdatedAndSize() throws {
        let tenDays = try listFacts(extra: ["createdAt": sampleISO(hoursAgo: 240)])
        for (query, expected) in [("age:>7d", true), ("age:<7d", false), ("age:>=1w", true), ("age:<240h", false), ("age:<=240h", true),
                                  ("age:>9", true), ("age:>11", false), ("age:month", true), ("age:week", false), ("age:soon", false)] {
            XCTAssertEqual(matches(query, tenDays), expected, query)
        }
        let fiveHours = try listFacts(updatedHoursAgo: 5)
        for (query, expected) in [("updated:<6h", true), ("updated:>6h", false), ("updated:<1", true), ("updated:>=300m", true), ("updated:>300m", false), ("updated:recently", false)] {
            XCTAssertEqual(matches(query, fiveHours), expected, query)
        }
        let lines150 = try listFacts(extra: ["additions": 120, "deletions": 30])
        for (query, expected) in [("size:m", true), ("size:s", false), ("size:<100", false), ("size:>100", true), ("size:<=150", true),
                                  ("size:<150", false), ("size:150", true), ("size:=150", true), ("size:huge", false)] {
            XCTAssertEqual(matches(query, lines150), expected, query)
        }
    }

    func testFreeTextIsOnePhraseAndEveryQualifierMustMatch() throws {
        let f = try listFacts(number: 471, author: "mira", title: "Virtualize the results grid", checks: listRed)
        XCTAssertTrue(matches("", f))
        XCTAssertTrue(matches("author:mira is:failing", f))
        XCTAssertFalse(matches("author:mira is:draft", f))
        XCTAssertTrue(matches("results grid", f))
        XCTAssertFalse(matches("grid results", f))
        XCTAssertTrue(matches("471", f))
        XCTAssertTrue(matches("Mira Example", f), "the phone also searches the author's name")
        XCTAssertTrue(matches("foo:bar", try listFacts(title: "Parse foo:bar pairs")))
        XCTAssertFalse(matches("foo:bar", f))
    }

    // MARK: - Typing in the search field

    func testAQualifierTypedToTheEndBecomesAFilter() {
        let typed = PrSearchTyping.absorb("grid author:priya ")
        XCTAssertEqual(typed.terms, [QueryTerm(.author, ["priya"])])
        XCTAssertEqual(typed.field, "grid ")
        XCTAssertEqual(typed.text, "grid")

        let pending = PrSearchTyping.absorb("grid author:pri")
        XCTAssertEqual(pending.terms, [])
        XCTAssertEqual(pending.field, "grid author:pri", "the field keeps what you are typing")
        XCTAssertEqual(pending.text, "grid", "a qualifier being typed doesn't filter yet")

        XCTAssertEqual(PrSearchTyping.absorb("grid author:").text, "grid", "nor does a field with no value yet")
        XCTAssertEqual(PrSearchTyping.absorb("grid foo:").text, "grid foo:", "an unknown field is text")
        let quoted = PrSearchTyping.absorb("label:\"needs qa")
        XCTAssertEqual(quoted.terms, [], "a space inside quotes doesn't end the word")
        XCTAssertEqual(PrSearchTyping.absorb("label:\"needs qa\" ").terms, [QueryTerm(.label, ["needs qa"])])
        XCTAssertEqual(PrSearchTyping.absorb("foo:bar ").terms, [], "an unknown field stays text")
    }

    func testSuggestionsOfferFieldsThenValuesWithCounts() throws {
        let facts = [try listFacts(number: 1, author: "priya"), try listFacts(number: 2, author: "priya"), try listFacts(number: 3, author: "tom")]
        XCTAssertEqual(PrSearchTyping.suggestions("aut", facts: facts, ctx: ctx).map(\.completion), ["author:"])
        let authors = PrSearchTyping.suggestions("grid author:", facts: facts, ctx: ctx)
        XCTAssertEqual(authors.map(\.label), ["Priya Example", "Tom Example"])
        XCTAssertEqual(authors.map(\.count), [2, 1])
        XCTAssertEqual(authors.first?.completion, "grid author:priya ")
        XCTAssertEqual(PrSearchTyping.suggestions("-author:priya,t", facts: facts, ctx: ctx).map(\.completion), ["-author:priya,tom "])
        XCTAssertEqual(PrSearchTyping.suggestions("checks:", facts: facts, ctx: ctx).map(\.label), ["Failing", "Shared failure", "Running", "Passing", "No checks"])
        XCTAssertTrue(PrSearchTyping.suggestions("grid ", facts: facts, ctx: ctx).isEmpty)
    }
}

// MARK: - Fixtures

let listMe = "koen"
nonisolated(unsafe) let listRed: [String: Any] = ["total": 4, "passed": 3, "failed": 1, "pending": 0, "skipped": 0, "segments": []]
nonisolated(unsafe) let listRunning: [String: Any] = ["total": 4, "passed": 2, "failed": 0, "pending": 2, "skipped": 0, "segments": []]
nonisolated(unsafe) let listNone: [String: Any] = ["total": 0, "passed": 0, "failed": 0, "pending": 0, "skipped": 0, "segments": []]

/// A pull request at `samplePRNow` as the list sees it: yours unless `author` says otherwise, green, no reviews.
func listPR(
    number: Int = 1, repo: String = "shop", author: String = listMe, title: String? = nil, draft: Bool = false,
    checks: [String: Any]? = nil, requested: [String] = [], teams: [String] = [], reviews: [(String, String)] = [],
    updatedHoursAgo: Double = 1, extra: [String: Any] = [:]
) throws -> PrSummary {
    var fields: [String: Any] = [
        "requestedReviewerLogins": requested, "requestedTeams": teams,
        "latestReviews": reviews.map { ["login": $0.0, "state": $0.1, "commitSha": NSNull()] },
        "priorityScore": 0,
    ]
    if let checks { fields["checks"] = checks }
    fields.merge(extra) { _, new in new }
    return try samplePR(number, repo: repo, author: author, mine: author == listMe, draft: draft, updatedHoursAgo: updatedHoursAgo, title: title, extra: fields)
}

func listFacts(
    number: Int = 1, repo: String = "shop", author: String = listMe, title: String? = nil, draft: Bool = false,
    checks: [String: Any]? = nil, requested: [String] = [], teams: [String] = [], reviews: [(String, String)] = [],
    updatedHoursAgo: Double = 1, extra: [String: Any] = [:]
) throws -> PrFacts {
    let pr = try listPR(number: number, repo: repo, author: author, title: title, draft: draft, checks: checks, requested: requested, teams: teams,
                        reviews: reviews, updatedHoursAgo: updatedHoursAgo, extra: extra)
    return PrFacts(pr, PrFactsContext(logins: [listMe], now: samplePRNow))
}
