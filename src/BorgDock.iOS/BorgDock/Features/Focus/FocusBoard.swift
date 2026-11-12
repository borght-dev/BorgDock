import Foundation

/// What Focus shows, top to bottom: the review queue, the agents, your turn, ready to merge and what waits on others.
/// Pure: the stores' data in, the sections out. Mockup: design/ios-flow/mockups.html, section 02.
struct FocusBoard {
    /// Others' pull requests that ask for your review, the one that has waited longest first: Start review's queue.
    let reviews: [PrSummary]
    /// The reviews, then your own pull requests that need you.
    let yourTurn: [PrSummary]
    let readyToMerge: [PrSummary]
    let waitingOnOthers: [PrSummary]
    /// Agents that run or ask you something, the latest active first. What else agents need from you is on the Work tab.
    let agents: [ThreadSummary]

    init(pullRequests: [PrSummary], threads: [ThreadSummary], myLogins: Set<String>) {
        let needYou = pullRequests.filter { $0.bucket == .you }
        reviews = needYou.filter { !$0.isMine }.sorted { $0.waitingSince.sortDate < $1.waitingSince.sortDate }
        yourTurn = reviews + needYou.filter(\.isMine)
        readyToMerge = pullRequests.filter { $0.bucket == .ready }
        waitingOnOthers = pullRequests.filter { $0.isWaitingOnOthers(myLogins: myLogins) }
        agents = threads
            .filter { $0.status == .running || Self.asksYou($0) }
            .sorted { $0.lastActivityAt.sortDate > $1.lastActivityAt.sortDate }
    }

    static func asksYou(_ thread: ThreadSummary) -> Bool {
        [.question, .plan, .approval].contains(thread.status)
    }

    // MARK: - Review queue

    /// "6 reviews wait for you".
    var reviewsTitle: String {
        switch reviews.count {
        case 0: "No reviews wait for you"
        case 1: "1 review waits for you"
        default: "\(reviews.count) reviews wait for you"
        }
    }

    /// "Oldest 3 days · 94 files, 4 small PRs": how long the queue has waited and how much reading it is. A pull
    /// request of at most 60 changed lines counts as small, the desktop's bar for a guide.
    func reviewsDetail(now: Date = .now) -> String {
        guard let oldest = reviews.first else { return "" }
        let small = reviews.filter { $0.size <= Self.smallPullRequest }
        let files = reviews.filter { $0.size > Self.smallPullRequest }.reduce(0) { $0 + $1.changedFiles }
        var work: [String] = []
        if files > 0 { work.append(files == 1 ? "1 file" : "\(files) files") }
        if !small.isEmpty { work.append(small.count == 1 ? "1 small PR" : "\(small.count) small PRs") }
        return (["Oldest \(LongAge.text(oldest.waitingSince, now: now))"] + [work.joined(separator: ", ")])
            .filter { !$0.isEmpty }
            .joined(separator: " · ")
    }

    static let smallPullRequest = 60

    /// The authors in the queue, in queue order, each once: the card's stacked avatars.
    var reviewAuthors: [Person] {
        var seen: Set<String> = []
        return reviews.map(\.author).filter { seen.insert($0.login.lowercased()).inserted }
    }

    // MARK: - Agents

    /// "2 running · 1 asks you".
    var agentsSummary: String {
        let running = agents.filter { $0.status == .running }.count
        let asking = agents.filter(Self.asksYou).count
        var parts: [String] = []
        if running > 0 { parts.append("\(running) running") }
        if asking > 0 { parts.append(asking == 1 ? "1 asks you" : "\(asking) ask you") }
        return parts.joined(separator: " · ")
    }

    /// What an agent row names as its work: "#412 Round totals per line", "AB#61021 Basket empties…". Only the number
    /// when the agent is already titled after it.
    static func subject(of thread: ThreadSummary, pullRequest: PrSummary?, item: WorkItemSummary?) -> String? {
        func named(_ reference: String, _ title: String) -> String {
            thread.title.localizedCaseInsensitiveContains(title) ? reference : "\(reference) \(title)"
        }
        if let pullRequest { return named("#\(pullRequest.number)", pullRequest.title) }
        if let item { return named("AB#\(item.id)", item.title) }
        return nil
    }

    // MARK: - Waiting on others

    /// "5 pull requests · oldest 4 days".
    func waitingDetail(now: Date = .now) -> String {
        guard let oldest = waitingOnOthers.map(\.waitingSince).min(by: { $0.sortDate < $1.sortDate }) else { return "Nothing waits on anyone" }
        let count = waitingOnOthers.count == 1 ? "1 pull request" : "\(waitingOnOthers.count) pull requests"
        return "\(count) · oldest \(LongAge.text(oldest, now: now))"
    }
}

/// The line under a pull request's title on Focus: why it is your turn.
struct FocusWhy: Equatable {
    enum Emphasis: Equatable {
        case accent
        case tone(Tone)
    }

    let text: String
    let systemImage: String
    let emphasis: Emphasis

    /// "Review requested · 8 files", "Re-review · 3 files", else the server's reason: "Your PR, 2 checks failing".
    init(_ pr: PrSummary) {
        let files = pr.changedFiles == 1 ? "1 file" : "\(pr.changedFiles) files"
        switch pr.reason.icon {
        case .review where !pr.isMine:
            self.init(text: "Review requested · \(files)", systemImage: "eye", emphasis: .accent)
        case .rerun where !pr.isMine:
            self.init(text: "Re-review · \(files)", systemImage: "arrow.counterclockwise", emphasis: .tone(.warn))
        default:
            let text = pr.reason.text.hasSuffix(".") ? String(pr.reason.text.dropLast()) : pr.reason.text
            self.init(text: text, systemImage: pr.reason.systemImage, emphasis: pr.reason.tone == .run ? .accent : .tone(pr.reason.tone))
        }
    }

    init(text: String, systemImage: String, emphasis: Emphasis) {
        self.text = text
        self.systemImage = systemImage
        self.emphasis = emphasis
    }
}

/// A Ready to merge row's line: "shop #401 · approved by Tom · checks pass".
enum ReadyLine {
    /// `firstNames` maps logins to first names (from the authors BorgDock knows); approvals carry only logins.
    static func text(_ pr: PrSummary, firstNames: [String: String], myLogins: Set<String>) -> String {
        let mine = Set(myLogins.map { $0.lowercased() })
        let approvers = pr.approvedBy.map { login in
            mine.contains(login.lowercased()) ? "you" : firstNames[login.lowercased()] ?? login
        }
        let approved = switch approvers.count {
        case 0: "approved"
        case 1: "approved by \(approvers[0])"
        case 2: "approved by \(approvers[0]) and \(approvers[1])"
        default: "approved by \(approvers[0]) and \(approvers.count - 1) others"
        }
        var parts = ["\(pr.repo) #\(pr.number)", approved, checks(pr)]
        if pr.autoMerge { parts.append("auto-merge on") }
        return parts.joined(separator: " · ")
    }

    static func firstNames(_ prs: [PrSummary]) -> [String: String] {
        Dictionary(prs.map { ($0.author.login.lowercased(), $0.author.firstName) }) { first, _ in first }
    }

    private static func checks(_ pr: PrSummary) -> String {
        if pr.checks.failed > 0 { return "\(pr.checks.failed) failing" }
        if pr.checks.pending > 0 { return "checks running" }
        return pr.checks.total == 0 ? "no checks" : "checks pass"
    }
}

/// Ages in words, as Focus writes them: "3 days", "5 hours", "12 minutes".
enum LongAge {
    static func text(_ iso: String?, now: Date = .now) -> String {
        guard let date = ISODate.parse(iso) else { return "" }
        let minutes = Int(max(0, now.timeIntervalSince(date)) / 60)
        func count(_ n: Int, _ unit: String) -> String { n == 1 ? "1 \(unit)" : "\(n) \(unit)s" }
        if minutes < 60 { return count(max(1, minutes), "minute") }
        if minutes < 60 * 24 { return count(minutes / 60, "hour") }
        return count(minutes / 1440, "day")
    }
}

/// Focus's subtitle: "Thursday 12 November · synced just now".
enum FocusSubtitle {
    static func text(syncedAt: Date?, isLoading: Bool, failed: Bool, now: Date = .now) -> String {
        let day = now.formatted(.dateTime.weekday(.wide).day().month(.wide))
        return "\(day) · \(sync(syncedAt: syncedAt, isLoading: isLoading, failed: failed, now: now))"
    }

    static func sync(syncedAt: Date?, isLoading: Bool, failed: Bool, now: Date) -> String {
        guard let syncedAt else { return failed ? "not synced" : "syncing…" }
        let seconds = Int(max(0, now.timeIntervalSince(syncedAt)))
        if seconds < 60 { return "synced just now" }
        if seconds < 3600 { return "synced \(seconds / 60) min ago" }
        return "synced \(seconds / 3600) h ago"
    }
}
