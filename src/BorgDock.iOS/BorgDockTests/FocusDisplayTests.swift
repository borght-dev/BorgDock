import XCTest
@testable import BorgDock

/// Focus's wording and chips, and the GitHub models decoding the contract's JSON.
final class FocusDisplayTests: XCTestCase {
    private let now = Date(timeIntervalSince1970: 1_800_000_000)
    private func iso(minutesAgo: Double) -> String { now.addingTimeInterval(-minutesAgo * 60).formatted(.iso8601) }

    func testShortAges() {
        XCTAssertEqual(ShortTime.age(iso(minutesAgo: 0.2), now: now), "now")
        XCTAssertEqual(ShortTime.age(iso(minutesAgo: 40), now: now), "40 min")
        XCTAssertEqual(ShortTime.age(iso(minutesAgo: 125), now: now), "2 h")
        XCTAssertEqual(ShortTime.age(iso(minutesAgo: 60 * 30), now: now), "1 d")
        XCTAssertEqual(ShortTime.age(nil, now: now), "")
    }

    func testDurations() {
        XCTAssertEqual(ShortTime.duration(252), "4 m 12 s")
        XCTAssertEqual(ShortTime.duration(100), "1 m 40 s")
        XCTAssertEqual(ShortTime.duration(120), "2 m")
        XCTAssertEqual(ShortTime.duration(42), "42 s")
        XCTAssertEqual(ShortTime.duration(nil), "")
    }

    private func pr(_ json: [String: Any] = [:]) throws -> PrSummary {
        var base: [String: Any] = [
            "owner": "acme", "repo": "shop", "number": 3712, "key": "acme/shop#3712", "account": "koen", "title": "Checkout",
            "url": "https://github.com/acme/shop/pull/3712", "author": ["login": "sanne", "name": "Sanne de Vries", "avatarUrl": NSNull()],
            "isMine": false, "isDraft": false, "state": "open", "headRef": "basket-timeout", "baseRef": "master", "headSha": "4f2a91c",
            "createdAt": iso(minutesAgo: 600), "updatedAt": iso(minutesAgo: 120), "mergedAt": NSNull(), "additions": 412, "deletions": 88,
            "changedFiles": 14, "labels": [["name": "bug", "color": "e5484d"]],
            "checks": ["total": 8, "passed": 6, "failed": 2, "pending": 0, "skipped": 0, "segments": ["failure", "failure", "success"]],
            "reviewDecision": "approved", "approvedBy": ["tom"], "mergeable": "mergeable", "bucket": "you",
            "reason": ["text": "Sanne asked for your review", "tone": "run", "icon": "review"], "workItemIds": [61021],
            "snoozedUntil": NSNull(), "autoMerge": false, "reviewedHeadSha": NSNull(),
        ]
        base.merge(json) { $1 }
        return try JSONDecoder().decode(PrSummary.self, from: JSONSerialization.data(withJSONObject: base))
    }

    func testCardChipsMatchTheMockups() throws {
        XCTAssertEqual(try pr().cardChips.map(\.text), ["2 failing", "AB#61021"])
        let passing: [String: Any] = ["checks": ["total": 6, "passed": 6, "failed": 0, "pending": 0, "skipped": 0, "segments": []]]
        XCTAssertEqual(try pr(passing.merging(["workItemIds": []]) { $1 }).cardChips.map(\.text), ["Checks pass", "1 approval"])
        XCTAssertEqual(try pr(passing.merging(["workItemIds": [], "approvedBy": [], "mergeable": "conflicting"]) { $1 }).cardChips.map(\.text), ["Conflicts"])
        XCTAssertEqual(try pr(passing.merging(["bucket": "ready", "workItemIds": []]) { $1 }).cardChips.map(\.text), ["6 pass"])
        let running: [String: Any] = ["checks": ["total": 5, "passed": 4, "failed": 0, "pending": 1, "skipped": 0, "segments": []], "autoMerge": true, "workItemIds": [], "bucket": "ready"]
        XCTAssertEqual(try pr(running).cardChips.map(\.text), ["1 running", "Auto-merge"])
    }

    func testMergeNeedsGreenChecksAndNoConflicts() throws {
        XCTAssertFalse(try pr().canMerge, "failing checks")
        let green: [String: Any] = ["checks": ["total": 6, "passed": 6, "failed": 0, "pending": 0, "skipped": 0, "segments": []]]
        XCTAssertTrue(try pr(green).canMerge)
        XCTAssertFalse(try pr(green.merging(["mergeable": "conflicting"]) { $1 }).canMerge)
        XCTAssertFalse(try pr(green.merging(["isDraft": true]) { $1 }).canMerge)
    }

    func testRepoLabelAndUnknownEnums() throws {
        XCTAssertEqual(try pr(["isMine": true]).repoLabel, "#3712 · yours")
        let odd = try pr(["bucket": "someday", "mergeable": "maybe", "reason": ["text": "x", "tone": "ok", "icon": "sparkles"]])
        XCTAssertEqual(odd.bucket, .wait)
        XCTAssertEqual(odd.mergeable, .unknown)
        XCTAssertEqual(odd.reason.icon, .clock)
    }

    func testPrDetailDecodesTheSummaryFromTheSameObject() throws {
        let summary = try JSONSerialization.jsonObject(with: JSONEncoder().encode(try pr())) as! [String: Any]
        let extra: [String: Any] = [
            "body": "Text", "commits": 6, "reviews": [], "requestedReviewers": [], "requestedFromYou": true, "checkRuns": [],
            "proofImages": [["url": "https://x/1.png", "alt": "Banner"]], "allowedMergeMethods": ["squash", "merge"],
            "defaultMergeMethod": "squash", "deleteBranchOnMerge": true, "viewerCanMerge": true, "workItems": [], "threads": [],
        ]
        let detail = try JSONDecoder().decode(PrDetail.self, from: JSONSerialization.data(withJSONObject: summary.merging(extra) { $1 }))
        XCTAssertEqual(detail.number, 3712)
        XCTAssertEqual(detail.commits, 6)
        XCTAssertEqual(detail.allowedMergeMethods, [.squash, .merge])
        let roundTrip = try JSONDecoder().decode(PrDetail.self, from: JSONEncoder().encode(detail))
        XCTAssertEqual(roundTrip, detail)
    }

    func testDescriptionExcerptSkipsImagesCommentsAndHeadings() {
        let body = "<!-- template -->\n## Why\n\nWhen the provider times out we cleared the basket. ![shot](https://x/y.png)\n\nSecond paragraph."
        XCTAssertEqual(DescriptionExcerpt.excerpt(body), "When the provider times out we cleared the basket.")
    }

    func testSnoozeSendsAnExplicitNull() throws {
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(SnoozeRequest(until: nil))) as! [String: Any]
        XCTAssertTrue(json["until"] is NSNull)
    }

    func testADiffStatStaysShortForBigChanges() {
        XCTAssertEqual([0, 842, 1000, 4250, 9999, 15_976, 198_437, 1_340_000].map(DiffStat.compact),
                       ["0", "842", "1k", "4.2k", "9.9k", "15k", "198k", "1.3M"])
    }
}
