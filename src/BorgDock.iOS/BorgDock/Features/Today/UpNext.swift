import Foundation

/// One thing to do next on Today: a verb, what it is about, and where tapping it goes.
struct UpNextEntry: Identifiable, Hashable {
    enum Target: Hashable {
        case pullRequest(PrSummary)
        case thread(String)
    }

    /// The one-tap button some rows carry.
    enum Shortcut: Hashable {
        case review, merge
    }

    let id: String
    /// "Review", "Approve plan", "Fix checks", "Merge".
    let verb: String
    let title: String
    /// What follows the verb: "#482 · Mara asked you 2 h ago."
    let detail: String
    let tone: Tone
    /// Reviews use the accent rather than a status tone.
    var accent = false
    let systemImage: String
    let target: Target
    var shortcut: Shortcut?
}

/// Today's "Up next": pull requests and agents that wait on you, ranked by who is blocked on you.
/// 1. reviews people asked of you, 2. agents with a question, a plan or an approval, 3. your pull requests that
/// need something and agents whose turn ended, 4. your pull requests ready to merge. Within a rank the server's order holds.
enum UpNext {
    static let limit = 6
    /// The thread statuses the server's Focus counts as waiting on you.
    private static let waitingStatuses: Set<ThreadStatus> = [.question, .plan, .approval, .yourTurn, .failed]

    static func entries(focus: Focus?, overview: Overview?, now: Date = .now) -> [UpNextEntry] {
        var ranked: [(rank: Int, entry: UpNextEntry)] = []
        ranked += (focus?.pullRequests ?? []).compactMap(pullRequest)
        ranked += (overview?.items ?? []).filter { $0.bay == .waiting }.compactMap { agent($0, now: now) }
        return ranked.enumerated()
            .sorted { a, b in a.element.rank != b.element.rank ? a.element.rank < b.element.rank : a.offset < b.offset }
            .prefix(limit)
            .map(\.element.entry)
    }

    private static func pullRequest(_ pr: PrSummary) -> (rank: Int, entry: UpNextEntry)? {
        let detail = "#\(pr.number) · \(pr.reason.text)"
        func entry(_ verb: String, _ tone: Tone, _ image: String, accent: Bool = false, shortcut: UpNextEntry.Shortcut? = nil) -> UpNextEntry {
            UpNextEntry(id: "pr:\(pr.key)", verb: verb, title: pr.title, detail: detail, tone: tone, accent: accent, systemImage: image, target: .pullRequest(pr), shortcut: shortcut)
        }
        switch pr.bucket {
        case .you:
            switch pr.reason.icon {
            case .review, .rerun: return (0, entry("Review", .run, "eye", accent: true, shortcut: .review))
            case .failing: return (2, entry("Fix checks", .bad, "xmark.circle"))
            case .comment: return (2, entry("Reply", .warn, "text.bubble"))
            case .conflict: return (2, entry("Resolve conflicts", .bad, "arrow.triangle.branch"))
            case .approved, .merge: return (2, entry("Merge", .ok, "arrow.triangle.merge", shortcut: pr.canMerge ? .merge : nil))
            case .clock: return (2, entry("Follow up", .mute, "clock"))
            }
        case .ready where pr.isMine && pr.canMerge:
            return (3, entry("Merge", .ok, "arrow.triangle.merge", shortcut: .merge))
        default:
            return nil
        }
    }

    private static func agent(_ item: ItemOverview, now: Date) -> (rank: Int, entry: UpNextEntry)? {
        guard let thread = item.threads.first(where: { Self.waitingStatuses.contains($0.status) }) else { return nil }
        let age = ShortTime.age(thread.lastActivityAt, now: now)
        let detail = "AB#\(item.item.id)" + (age.isEmpty ? "" : " · \(age)")
        func entry(_ verb: String, _ tone: Tone, _ image: String) -> UpNextEntry {
            UpNextEntry(id: "thread:\(thread.id)", verb: verb, title: item.item.title, detail: detail, tone: tone, systemImage: image, target: .thread(thread.id))
        }
        switch thread.status {
        case .question: return (1, entry("Answer", .warn, "questionmark.bubble"))
        case .plan: return (1, entry("Approve plan", .warn, "list.bullet.clipboard"))
        case .approval: return (1, entry("Approve", .warn, "checkmark.shield"))
        case .yourTurn: return (2, entry("Your turn", .ok, "bubble.left.and.text.bubble.right"))
        case .failed: return (2, entry("Restart", .bad, "exclamationmark.triangle"))
        default: return nil
        }
    }
}
