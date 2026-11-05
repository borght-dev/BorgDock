import XCTest
@testable import BorgDock

/// Today's "Up next": who is blocked on you comes first, and only pull requests and agents that wait on you appear.
final class UpNextTests: XCTestCase {
    private func overview(planFor itemId: Int? = nil) throws -> Overview {
        let url = try XCTUnwrap(Bundle(for: Self.self).url(forResource: "overview", withExtension: "json"))
        var json = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        if let itemId, var items = json["items"] as? [[String: Any]],
           let index = items.firstIndex(where: { ($0["item"] as? [String: Any])?["id"] as? Int == itemId }),
           var threads = items[index]["threads"] as? [[String: Any]] {
            threads[0]["status"] = "plan"
            items[index]["threads"] = threads
            json["items"] = items
        }
        return try JSONDecoder().decode(Overview.self, from: JSONSerialization.data(withJSONObject: json))
    }

    private func reason(_ icon: String, _ text: String = "") -> [String: Any] {
        ["reason": ["text": text, "tone": "warn", "icon": icon]]
    }

    private func focus(_ prs: [PrSummary]) -> Focus {
        Focus(generatedAt: sampleISO(hoursAgo: 0), counts: [:], pullRequests: prs, agentsWaiting: [])
    }

    func testReviewsFirstThenWhatIsYoursThenMerges() throws {
        let prs = [
            try samplePR(1, mine: true, bucket: "you", failed: 1, extra: reason("failing")),
            try samplePR(2, bucket: "you", extra: reason("review", "Sanne asked you 2 h ago.")),
            try samplePR(3, mine: true, bucket: "ready", extra: reason("approved")),
            try samplePR(4, bucket: "wait"),
            try samplePR(5, bucket: "ready", extra: reason("approved")),
        ]
        let entries = UpNext.entries(focus: focus(prs), overview: try overview(), now: samplePRNow)
        XCTAssertEqual(entries.map(\.verb), ["Review", "Fix checks", "Your turn", "Your turn", "Merge"])
        XCTAssertEqual(entries.first?.detail, "#2 · Sanne asked you 2 h ago.")
        XCTAssertEqual(entries.first?.shortcut, .review)
        XCTAssertEqual(entries.last?.shortcut, .merge)
        XCTAssertNil(entries[1].shortcut, "a failing pull request has no one-tap action")
        XCTAssertEqual(entries[2].target, .thread("00000000-0000-4000-8000-000000000003"))
        XCTAssertTrue(entries[2].detail.hasPrefix("AB#59657"))
    }

    func testAPlanToApproveComesRightAfterReviews() throws {
        let prs = [try samplePR(1, mine: true, bucket: "you", failed: 1, extra: reason("failing")), try samplePR(2, bucket: "you")]
        let entries = UpNext.entries(focus: focus(prs), overview: try overview(planFor: 59463), now: samplePRNow)
        XCTAssertEqual(entries.map(\.verb), ["Review", "Approve plan", "Fix checks", "Your turn"])
    }

    func testAReadyPullRequestThatCannotMergeIsLeftOut() throws {
        let blocked = try samplePR(1, mine: true, bucket: "ready", extra: ["mergeable": "conflicting"])
        XCTAssertTrue(UpNext.entries(focus: focus([blocked]), overview: nil).isEmpty)
    }

    func testShowsAtMostSix() throws {
        let prs = try (1...9).map { try samplePR($0, bucket: "you") }
        XCTAssertEqual(UpNext.entries(focus: focus(prs), overview: nil).count, UpNext.limit)
    }
}
