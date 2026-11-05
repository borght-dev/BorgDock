import Foundation
@testable import BorgDock

/// A pull request as /api/focus sends it, for the list, Today and track tests. `extra` overrides any field.
let samplePRNow = Date(timeIntervalSince1970: 1_800_000_000)
func sampleISO(hoursAgo: Double) -> String { samplePRNow.addingTimeInterval(-hoursAgo * 3600).formatted(.iso8601) }

func samplePR(
    _ number: Int,
    repo: String = "shop",
    author: String = "sanne",
    mine: Bool = false,
    draft: Bool = false,
    bucket: String = "wait",
    failed: Int = 0,
    updatedHoursAgo: Double = 1,
    title: String? = nil,
    extra: [String: Any] = [:]
) throws -> PrSummary {
    var json: [String: Any] = [
        "owner": "acme", "repo": repo, "number": number, "key": "acme/\(repo)#\(number)", "account": "koen",
        "title": title ?? "Change \(number)", "url": "https://github.com/acme/\(repo)/pull/\(number)",
        "author": ["login": author, "name": author.capitalized + " Example", "avatarUrl": NSNull()],
        "isMine": mine, "isDraft": draft, "state": "open", "headRef": "feature-\(number)", "baseRef": "master", "headSha": "abc",
        "createdAt": sampleISO(hoursAgo: 48), "updatedAt": sampleISO(hoursAgo: updatedHoursAgo), "mergedAt": NSNull(),
        "additions": 10, "deletions": 2, "changedFiles": 1, "labels": [],
        "checks": ["total": 2, "passed": 2 - failed, "failed": failed, "pending": 0, "skipped": 0, "segments": []],
        "reviewDecision": NSNull(), "approvedBy": [], "mergeable": "mergeable", "bucket": bucket,
        "reason": ["text": "", "tone": "mute", "icon": "review"], "workItemIds": [61000 + number],
        "snoozedUntil": NSNull(), "autoMerge": false, "reviewedHeadSha": NSNull(),
    ]
    json.merge(extra) { _, new in new }
    return try JSONDecoder().decode(PrSummary.self, from: JSONSerialization.data(withJSONObject: json))
}
