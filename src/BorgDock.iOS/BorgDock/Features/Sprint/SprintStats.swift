import Foundation

/// Whose items the Sprint tab counts.
enum SprintScope: String, CaseIterable, Identifiable {
    case team, mine

    var id: String { rawValue }
    var title: String { self == .team ? "Team" : "Mine" }
}

/// Where an item is, in the order the progress bar draws them: finished first.
enum SprintStage: Int, CaseIterable, Comparable, Hashable {
    case done, qa, review, active, new

    init(_ item: WorkItemSummary) {
        if item.stateCategory == .completed {
            self = .done
        } else if item.state.localizedCaseInsensitiveContains("QA") {
            self = .qa
        } else if item.state.localizedCaseInsensitiveContains("Review") {
            self = .review
        } else if item.stateCategory == .proposed {
            self = .new
        } else {
            self = .active
        }
    }

    var title: String {
        switch self {
        case .done: "Done"
        case .qa: "QA"
        case .review: "Review"
        case .active: "Active"
        case .new: "New"
        }
    }

    static func < (a: SprintStage, b: SprintStage) -> Bool { a.rawValue < b.rawValue }
}

/// The sprint lists the watch card and the people rows open.
enum SprintList: Hashable {
    case longInReview, blocked, unassigned
    /// Nil is the unassigned row.
    case person(String?)

    var title: String {
        switch self {
        case .longInReview: "In review 2+ days"
        case .blocked: "Blocked"
        case .unassigned: "Unassigned"
        case .person(let name): name ?? "Unassigned"
        }
    }
}

/// Calendar days as UTC midnights, so ADO's sprint dates ("2026-11-02T00:00:00Z") and a local today compare by date.
enum SprintCalendar {
    static let utc: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        return calendar
    }()

    /// ADO stores a sprint date as midnight UTC of that day.
    static func day(ofSprintDate iso: String?) -> Date? {
        ISODate.parse(iso).map { utc.startOfDay(for: $0) }
    }

    /// The day `date` falls on where the phone is.
    static func day(ofLocal date: Date, calendar: Calendar) -> Date {
        let parts = calendar.dateComponents([.year, .month, .day], from: date)
        return utc.date(from: parts) ?? utc.startOfDay(for: date)
    }

    /// Monday to Friday from `start` through `finish`.
    static func workingDays(from start: Date, through finish: Date) -> [Date] {
        guard start <= finish else { return [] }
        var days: [Date] = []
        var day = start
        while day <= finish {
            if !utc.isDateInWeekend(day) { days.append(day) }
            guard let next = utc.date(byAdding: .day, value: 1, to: day) else { break }
            day = next
        }
        return days
    }
}

/// What the Sprint tab and Today's sprint tile show, worked out from the items and today's date.
struct SprintStats: Equatable {
    struct Point: Equatable, Identifiable {
        /// 0 is the start, 1 the end of the first working day.
        let day: Int
        let remaining: Int
        var id: Int { day }
    }

    struct Person: Equatable, Identifiable {
        /// Nil for unassigned items.
        let name: String?
        let isMe: Bool
        let done: Int
        let total: Int
        var id: String { name ?? "" }
    }

    let total: Int
    let done: Int
    let count: [SprintStage: Int]
    /// The sprint's working days, as UTC midnights; empty when ADO gives the sprint no dates.
    let days: [Date]
    /// Working days in the sprint; nil when ADO gives the sprint no dates.
    let workingDays: Int?
    /// Working days so far, today included: "day 4 of 10". 0 before the sprint starts.
    let today: Int?
    /// Items left at the start and at the end of every working day so far.
    let burndown: [Point]
    /// Items left over the ideal line today: positive is behind, negative ahead.
    let behindIdeal: Int?
    /// Items still open at the finish if the pace so far holds.
    let forecastLeft: Int?
    let longInReview: [SprintItem]
    let blocked: [SprintItem]
    let unassigned: [SprintItem]
    /// Me first, unassigned last, then whoever has the most.
    let people: [Person]

    var remaining: Int { total - done }
    var percentDone: Int { total == 0 ? 0 : Int((Double(done) / Double(total) * 100).rounded()) }
    var daysLeft: Int? {
        guard let workingDays, let today else { return nil }
        return max(0, workingDays - today)
    }

    /// The straight line from everything open at the start to nothing open at the finish.
    func ideal(atDay day: Int) -> Double? {
        guard let workingDays, workingDays > 0, let start = burndown.first?.remaining else { return nil }
        return Double(start) * (1 - Double(day) / Double(workingDays))
    }

    func items(_ list: SprintList, in sprint: Sprint) -> [SprintItem] {
        switch list {
        case .longInReview: longInReview
        case .blocked: blocked
        case .unassigned: unassigned
        case .person(let name): sprint.items.filter { $0.item.assignedTo == name }
        }
    }

    static let longReview: TimeInterval = 2 * 86400

    init(sprint: Sprint, scope: SprintScope, now: Date = .now, calendar: Calendar = .current) {
        let items = scope == .mine ? sprint.items.filter(\.item.assignedToMe) : sprint.items
        let stages = items.map { SprintStage($0.item) }
        let itemCount = items.count
        total = itemCount
        done = stages.filter { $0 == .done }.count
        count = Dictionary(grouping: stages, by: { $0 }).mapValues(\.count)

        let open = zip(items, stages).filter { $0.1 != .done }
        longInReview = open.filter { item, stage in
            stage == .review && ISODate.parse(item.stateChangedAt).map { now.timeIntervalSince($0) >= Self.longReview } == true
        }.map(\.0)
        blocked = open.filter { item, _ in item.item.tags.contains { $0.caseInsensitiveCompare("Blocked") == .orderedSame } }.map(\.0)
        unassigned = open.filter { item, _ in item.item.assignedTo == nil }.map(\.0)
        people = scope == .mine ? [] : Self.people(items, stages)

        guard let start = SprintCalendar.day(ofSprintDate: sprint.startDate),
              let finish = SprintCalendar.day(ofSprintDate: sprint.finishDate) else {
            self.days = []
            workingDays = nil
            today = nil
            burndown = []
            behindIdeal = nil
            forecastLeft = nil
            return
        }
        let days = SprintCalendar.workingDays(from: start, through: finish)
        let todayDay = SprintCalendar.day(ofLocal: now, calendar: calendar)
        let daysSoFar = days.filter { $0 <= todayDay }.count
        self.days = days
        workingDays = days.count
        today = daysSoFar

        // A finished item without a date counts as finished before the sprint; one dated after today counts today.
        let finishedOn = zip(items, stages).filter { $0.1 == .done }.map { item, _ in
            ISODate.parse(item.finishedAt).map { min(SprintCalendar.day(ofLocal: $0, calendar: calendar), todayDay) } ?? .distantPast
        }
        let left = { (end: Date) in itemCount - finishedOn.filter { $0 <= end }.count }
        let startLeft = itemCount - finishedOn.filter { $0 < start }.count
        let points = [Point(day: 0, remaining: startLeft)] + days.prefix(daysSoFar).enumerated().map { Point(day: $0.offset + 1, remaining: left($0.element)) }
        burndown = points

        guard daysSoFar > 0, !days.isEmpty else {
            behindIdeal = nil
            forecastLeft = nil
            return
        }
        let leftToday = points.last!.remaining
        let ideal = Double(startLeft) * (1 - Double(daysSoFar) / Double(days.count))
        behindIdeal = Int((Double(leftToday) - ideal).rounded())
        let pace = Double(startLeft - leftToday) / Double(daysSoFar)
        forecastLeft = max(0, Int((Double(leftToday) - pace * Double(days.count - daysSoFar)).rounded()))
    }

    private static func people(_ items: [SprintItem], _ stages: [SprintStage]) -> [Person] {
        Dictionary(grouping: zip(items, stages), by: { $0.0.item.assignedTo })
            .map { name, entries in
                Person(name: name, isMe: entries.contains { $0.0.item.assignedToMe }, done: entries.filter { $0.1 == .done }.count, total: entries.count)
            }
            .sorted { a, b in
                if a.isMe != b.isMe { return a.isMe }
                if (a.name == nil) != (b.name == nil) { return b.name == nil }
                if a.total != b.total { return a.total > b.total }
                return (a.name ?? "") < (b.name ?? "")
            }
    }
}
