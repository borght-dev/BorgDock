import XCTest
@testable import BorgDock

/// The Sprint tab's numbers: burndown, ideal line, pace, stages, what looks stuck and who has what.
final class SprintStatsTests: XCTestCase {
    /// Thursday of the sprint's first week, noon.
    private let thursday = ISODate.parse("2026-11-05T12:00:00Z")!
    private let utc = SprintCalendar.utc
    private let me = "Koen van der Borght"

    private func item(
        _ id: Int, state: String, category: String, assignedTo: String? = "Mara Visser", tags: [String] = [],
        changed: String? = "2026-11-03T10:00:00Z", finished: String? = nil
    ) -> [String: Any] {
        [
            "id": id, "type": "PBI", "typeName": "Product Backlog Item", "title": "Item \(id)", "state": state, "stateCategory": category,
            "workflow": ["New", "Development In Progress", "Code Review", "Ready For QA", "Done"], "sprint": "5.2.8", "dueDate": NSNull(),
            "priority": 2, "tags": tags, "assignedTo": assignedTo ?? NSNull(), "assignedToMe": assignedTo == me,
            "url": "https://dev.azure.com/acme/Shop/_workitems/edit/\(id)", "stateChangedAt": changed ?? NSNull(), "finishedAt": finished ?? NSNull(),
        ]
    }

    private func sprint(_ items: [[String: Any]], start: Any = "2026-11-02T00:00:00Z", finish: Any = "2026-11-13T00:00:00Z") throws -> Sprint {
        let json: [String: Any] = ["name": "5.2.8", "path": "Shop\\5.2.8", "startDate": start, "finishDate": finish, "items": items, "generatedAt": "2026-11-05T12:00:00Z"]
        return try JSONDecoder().decode(Sprint.self, from: JSONSerialization.data(withJSONObject: json))
    }

    /// 42 items: 2, 3, 4 and 5 finished Monday to Thursday, then 5 in QA, 4 in review (3 of them since Monday),
    /// 12 active (one blocked, two mine) and 7 new (two unassigned).
    private func teamItems() -> [[String: Any]] {
        var items: [[String: Any]] = []
        var id = 1
        func add(_ count: Int, _ make: (Int, Int) -> [String: Any]) {
            for index in 0..<count {
                items.append(make(id, index))
                id += 1
            }
        }
        for (day, count) in [(2, 2), (3, 3), (4, 4), (5, 5)] {
            add(count) { id, _ in self.item(id, state: "Done", category: "Completed", assignedTo: id == 1 ? self.me : "Lena Brandt", finished: "2026-11-0\(day)T15:00:00Z") }
        }
        add(5) { id, _ in self.item(id, state: "Ready For QA", category: "Resolved") }
        add(4) { id, index in self.item(id, state: "Code Review", category: "Resolved", changed: index < 3 ? "2026-11-02T10:00:00Z" : "2026-11-05T09:00:00Z") }
        add(12) { id, index in
            self.item(id, state: "Development In Progress", category: "InProgress", assignedTo: index < 2 ? self.me : "Ravi Patel", tags: index == 5 ? ["Blocked"] : [])
        }
        add(7) { id, index in self.item(id, state: "New", category: "Proposed", assignedTo: index < 2 ? nil : "Sam Okafor") }
        return items
    }

    private func stats(_ scope: SprintScope = .team, now: Date? = nil, items: [[String: Any]]? = nil) throws -> SprintStats {
        SprintStats(sprint: try sprint(items ?? teamItems()), scope: scope, now: now ?? thursday, calendar: utc)
    }

    func testTheBurndownCountsWhatIsLeftAtTheEndOfEachWorkingDay() throws {
        let stats = try stats()
        XCTAssertEqual(stats.total, 42)
        XCTAssertEqual(stats.done, 14)
        XCTAssertEqual(stats.percentDone, 33)
        XCTAssertEqual(stats.workingDays, 10)
        XCTAssertEqual(stats.today, 4)
        XCTAssertEqual(stats.daysLeft, 6)
        XCTAssertEqual(stats.burndown.map(\.remaining), [42, 40, 37, 33, 28])
        XCTAssertEqual(stats.behindIdeal, 3, "28 left where the ideal line is at 25.2")
        XCTAssertEqual(stats.forecastLeft, 7, "3.5 a day for six more days")
        XCTAssertEqual(stats.ideal(atDay: 10), 0)
        XCTAssertEqual(stats.days.count, 10)
    }

    func testStagesAndWhatLooksStuck() throws {
        let stats = try stats()
        XCTAssertEqual(stats.count, [.done: 14, .qa: 5, .review: 4, .active: 12, .new: 7])
        XCTAssertEqual(stats.longInReview.count, 3, "in review since Monday; the one moved today is not")
        XCTAssertEqual(stats.blocked.count, 1)
        XCTAssertEqual(stats.unassigned.count, 2)
    }

    func testPeoplePutMeFirstAndUnassignedLast() throws {
        let people = try stats().people
        XCTAssertEqual(people.first, SprintStats.Person(name: me, isMe: true, done: 1, total: 3))
        XCTAssertNil(people.last?.name)
        XCTAssertEqual(people.map(\.name), [me, "Lena Brandt", "Ravi Patel", "Mara Visser", "Sam Okafor", nil], "then whoever has the most")
    }

    func testMineCountsOnlyMyItemsAndHasNoPeople() throws {
        let mine = try stats(.mine)
        XCTAssertEqual(mine.total, 3)
        XCTAssertEqual(mine.done, 1)
        XCTAssertTrue(mine.people.isEmpty)
        XCTAssertEqual(mine.burndown.map(\.remaining), [3, 2, 2, 2, 2])
    }

    func testWeekendsAreNoWorkingDays() throws {
        let sunday = ISODate.parse("2026-11-08T12:00:00Z")!
        let stats = try stats(now: sunday)
        XCTAssertEqual(stats.today, 5)
        XCTAssertEqual(stats.burndown.count, 6)
    }

    func testBeforeTheStartThereIsNoPaceYet() throws {
        let planned = teamItems().filter { $0["state"] as? String != "Done" }
        let stats = try stats(now: ISODate.parse("2026-10-30T12:00:00Z")!, items: planned)
        XCTAssertEqual(stats.today, 0)
        XCTAssertEqual(stats.burndown.map(\.remaining), [28])
        XCTAssertNil(stats.behindIdeal)
        XCTAssertNil(stats.forecastLeft)
        XCTAssertEqual(SprintDisplay.progress(stats), "starts soon · 10 days")
    }

    func testAFinishedItemWithoutADateCountsFromTheStart() throws {
        var items = teamItems()
        items[0]["finishedAt"] = NSNull()
        XCTAssertEqual(try stats(items: items).burndown.map(\.remaining), [41, 40, 37, 33, 28])
    }

    func testASprintWithoutDatesHasCountsButNoBurndown() throws {
        let stats = SprintStats(sprint: try sprint(teamItems(), start: NSNull(), finish: NSNull()), scope: .team, now: thursday, calendar: utc)
        XCTAssertEqual(stats.done, 14)
        XCTAssertNil(stats.workingDays)
        XCTAssertTrue(stats.burndown.isEmpty)
        XCTAssertNil(stats.behindIdeal)
        XCTAssertNil(SprintDisplay.progress(stats))
    }

    func testTheWordsUnderTheTitle() throws {
        let stats = try stats()
        XCTAssertEqual(SprintDisplay.progress(stats), "day 4 of 10 · 6 days left")
        XCTAssertEqual(SprintDisplay.pace(stats)?.text, "3 behind ideal")
        XCTAssertEqual(SprintDisplay.pace(stats)?.tone, .warn)
    }

    func testTheWatchListsAndAPersonOpenTheirItems() throws {
        let sprint = try sprint(teamItems())
        let stats = SprintStats(sprint: sprint, scope: .team, now: thursday, calendar: utc)
        XCTAssertEqual(stats.items(.person(me), in: sprint).count, 3)
        XCTAssertEqual(stats.items(.person(nil), in: sprint).count, 2)
        XCTAssertEqual(stats.items(.blocked, in: sprint).map(\.item.tags), [["Blocked"]])
    }

    func testDecodesTheServersSprintItem() throws {
        let decoded = try sprint([item(7, state: "Done", category: "Completed", finished: "2026-11-04T15:00:00Z")])
        XCTAssertEqual(decoded.items.first?.item.title, "Item 7")
        XCTAssertEqual(decoded.items.first?.finishedAt, "2026-11-04T15:00:00Z")
        XCTAssertEqual(decoded.items.first?.stateChangedAt, "2026-11-03T10:00:00Z")
    }
}
