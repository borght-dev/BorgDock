import Foundation
import Observation

/// What opens Quick Review: pull requests in order, or an author's run.
struct ReviewRequest: Hashable {
    var keys: [PrKey]
    /// An author run: Quick Review adds this author's other pull requests once their E2E reports are read.
    var author: String?
}

/// How a pull request left Quick Review, as the end card counts it (the desktop's `ReviewDecision`). Request changes
/// counts as commented, as on the desktop.
enum ReviewOutcome: Equatable {
    case approved, commented, skipped
    /// One of your own pull requests read through: nothing went to GitHub.
    case walked
}

/// One Quick Review from opening to Done: the queue it walks, an author run's left-out pull requests and why a red one
/// was let in, and what it handled before, for the end card. The desktop's run in `quick-review-store.ts` and
/// `author-run-session.ts`.
@MainActor
@Observable
final class ReviewRun {
    private(set) var queue: [PrKey]
    /// An author run's author (login): the end card offers their next pull request.
    private(set) var author: String?
    /// The author's pull requests the run leaves out, and why.
    private(set) var held: [HeldPr] = []
    /// The rest of an author run is still being worked out.
    private(set) var filling = false
    /// Why a red pull request in the run may be merged anyway: failures that are not its doing.
    private(set) var bypass: [String: String] = [:]
    /// The queues before this one, from Review next and Next from: the end card lists them too.
    private(set) var earlier: [PrKey] = []
    /// Your own pull requests you walked through.
    var walked: Set<String> = []

    @ObservationIgnored private var generation = 0

    init(_ request: ReviewRequest) {
        queue = request.keys
        author = request.author
        filling = request.author != nil
    }

    /// Every pull request this Quick Review has shown, in order.
    var shown: [PrKey] {
        var seen: Set<String> = []
        return (earlier + queue).filter { seen.insert($0.key).inserted }
    }

    /// The author whose next pull request the end card offers: the run's, or a lone pull request's.
    func continuingAuthor(summary: (PrKey) -> PrSummary?) -> String? {
        author ?? (queue.count == 1 ? summary(queue[0])?.author.login : nil)
    }

    func outcome(_ key: PrKey, decisions: [String: ReviewDecisionRecord]) -> ReviewOutcome {
        if walked.contains(key.key) { return .walked }
        guard let decision = decisions[key.key] else { return .skipped }
        return decision.event == .approve ? .approved : .commented
    }

    /// Review next: this pull request alone.
    func startSingle(_ key: PrKey) {
        moveOn()
        queue = [key]
    }

    /// Next from the author: `first` at once; `fill` adds the rest of their run.
    func startAuthorRun(first: PrSummary) {
        moveOn()
        queue = [first.prKey]
        author = first.author.login
        filling = true
    }

    private func moveOn() {
        earlier = shown
        author = nil
        held = []
        bypass = [:]
        filling = false
        generation += 1
    }

    /// Reads the E2E reports the author's pull requests need, then adds the ones you can merge, oldest first, and lists
    /// the ones left out with the reason. Pull requests already shown stay out.
    func fill(focus: FocusStore) async {
        guard let author else { return }
        let run = generation
        filling = true
        let prs = focus.focus?.pullRequests ?? []
        let handled = Set(shown.map(\.key))
        let candidates = AuthorRun.candidates(prs, author: author, myLogins: focus.myLogins).filter { !handled.contains($0.key) }
        let firsts = queue.compactMap { key in prs.first { $0.key == key.key } }
        await focus.readE2eReports(candidates: candidates + firsts, prs: prs)
        guard run == generation else { return }
        let world = focus.runWorld
        let plan = AuthorRun.plan(candidates, fit: world.fit)
        let unread = plan.checking.map { HeldPr(pr: $0, reason: .e2e, why: "E2E report not read") }
        queue += plan.queue.map(\.prKey)
        held = plan.held + unread
        for pr in firsts + plan.queue {
            if case .ready(let reason?) = world.fit(pr) { bypass[pr.key] = reason }
        }
        filling = false
    }
}

extension FocusStore {
    /// What run fits are judged by now.
    var runWorld: RunWorld {
        RunWorld(prs: focus?.pullRequests ?? [], e2e: e2e.entries, groups: ciGroups)
    }

    /// Reads the E2E reports `candidates` need.
    func readE2eReports(candidates: [PrSummary], prs: [PrSummary]) async {
        guard let backend else { return }
        e2e.reader = E2eReports.Reader(
            comments: { try await backend.conversation($0).comments },
            files: { try await backend.pullRequestFiles($0).files.map(\.path) }
        )
        await e2e.ensure(candidates: candidates, prs: prs)
    }

    /// The end card's two offers: the same author's next pull request, and the next by priority from anyone else.
    func nextReviews(after run: ReviewRun) -> (author: PrSummary?, next: PrSummary?) {
        let prs = focus?.pullRequests ?? []
        let handled = Set(run.shown.map(\.key))
        let continuing = run.continuingAuthor(summary: summary)
        let author = continuing.flatMap { AuthorRun.nextFromAuthor(prs, author: $0, myLogins: myLogins, handled: handled) }
        let reviews = FocusBoard(pullRequests: prs, threads: [], myLogins: myLogins).reviews
        let next = AuthorRun.nextByPriority(reviews: reviews, prs: prs, except: continuing, myLogins: myLogins, handled: handled)
        return (author, next)
    }
}
